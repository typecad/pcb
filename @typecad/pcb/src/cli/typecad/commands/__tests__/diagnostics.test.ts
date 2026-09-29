import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ParsedArgs } from '../../parser.js';

const runBuildStepMock = vi.fn();
const findBuildFilesMock = vi.fn();
const findBuildFileMock = vi.fn();
const detectEntryFileMock = vi.fn();
const runErcStepMock = vi.fn();
const runDrcStepMock = vi.fn();

vi.mock('../../pipeline.js', () => ({
  runBuildStep: (...args: unknown[]) => runBuildStepMock(...args),
  findBuildFiles: (...args: unknown[]) => findBuildFilesMock(...args),
  findBuildFile: (...args: unknown[]) => findBuildFileMock(...args),
  findBoardFile: () => null,
  detectEntryFile: (...args: unknown[]) => detectEntryFileMock(...args),
  runErcStep: (...args: unknown[]) => runErcStepMock(...args),
  runDrcStep: (...args: unknown[]) => runDrcStepMock(...args),
  buildDirPath: () => 'C:\\mock\\build',
}));

const { run } = await import('../diagnostics.js');

function parsedWith(args: ParsedArgs['args']): ParsedArgs {
  return {
    command: 'diagnostics',
    subcommand: '',
    args,
    positional: [],
    passthrough: [],
    json: false,
    help: false,
    version: false,
  };
}

const NETLIST = `(export (version "E")
  (design (tool "typeCAD"))
  (components
    (comp (ref "R1") (value "10k") (footprint "Resistor_SMD:R_0603") (fields))
    (comp (ref "U1") (value "MCU") (footprint "lib:QFP32") (fields (field (name "MPN") "STM32F103"))))
  (nets
    (net (code "1") (name "GND")
      (node (ref "R1") (pin "1") (pintype "passive"))
      (node (ref "U1") (pin "5") (pintype "power_in")))))`;

let tmpDir: string;
let netPath: string;
let entryPath: string;
let schPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-diag-'));
  netPath = path.join(tmpDir, 'board.net');
  fs.writeFileSync(netPath, NETLIST, 'utf8');
  entryPath = path.join(tmpDir, 'board.ts');
  fs.writeFileSync(entryPath, '// entry\n', 'utf8');
  schPath = path.join(tmpDir, 'board.kicad_sch');
  fs.writeFileSync(schPath, '(kicad_sch)\n', 'utf8');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  runBuildStepMock.mockReset();
  findBuildFilesMock.mockReset().mockReturnValue([]);
  findBuildFileMock
    .mockReset()
    .mockImplementation((ext: string) => (ext === '.net' || ext === '.kicad_sch' ? (ext === '.net' ? netPath : schPath) : null));
  detectEntryFileMock.mockReset().mockReturnValue(entryPath);
  runErcStepMock.mockReset();
  runDrcStepMock.mockReset();
});

/** native ERC report fixture next to the schematic, newer than it */
function writeNativeErcReport(violations: unknown[]): string {
  const reportPath = path.join(tmpDir, 'board_erc.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ engine: 'typecad-native', source: 'board.kicad_sch', sheets: [{ path: '/', violations }] }),
    'utf8',
  );
  // the schematic must predate the report or it reads as stale
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(schPath, past, past);
  return reportPath;
}

describe('diagnostics command', () => {
  it('writes markdown + JSON next to --out without building when --skip-build', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-diag-out-'));
    const mdPath = path.join(outDir, 'report.md');
    await run(parsedWith({ 'skip-build': true, 'skip-erc': true, 'skip-drc': true, out: mdPath }));

    expect(runBuildStepMock).not.toHaveBeenCalled();
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'report.json'))).toBe(true);

    const md = fs.readFileSync(mdPath, 'utf8');
    expect(md).toContain('# PCB Diagnostics — board');
    expect(md).toContain('## Components (BOM)');
    expect(md).toContain('## ERC Report');

    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8'));
    expect(data.summary.components).toBe(2);
    expect(data.metadata.netlistFile).toBe(netPath);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('runs the build step when --skip-build is absent', async () => {
    runBuildStepMock.mockResolvedValue({ passed: true, outputs: [] });
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-diag-out-'));
    await run(parsedWith({ 'skip-erc': true, 'skip-drc': true, out: path.join(outDir, 'r.md') }));
    expect(runBuildStepMock).toHaveBeenCalledWith(entryPath, expect.anything());
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('fails hard when no artifacts exist anywhere', async () => {
    findBuildFileMock.mockReturnValue(null);
    await expect(run(parsedWith({ 'skip-build': true }))).rejects.toThrow(/No build artifacts/i);
  });

  it('fails hard when no entry file can be found for a build', async () => {
    detectEntryFileMock.mockReturnValue(null);
    await expect(run(parsedWith({}))).rejects.toThrow(/No entry file found/i);
  });

  it('fails hard when the build itself fails', async () => {
    runBuildStepMock.mockResolvedValue({ passed: false, reason: 'syntax error', outputs: [] });
    await expect(run(parsedWith({}))).rejects.toThrow(/Build failed: syntax error/i);
  });

  it('asks for an explicit board when multiple .kicad_pcb files exist', async () => {
    findBuildFilesMock.mockReturnValue(['a.kicad_pcb', 'b.kicad_pcb']);
    await expect(run(parsedWith({ 'skip-build': true }))).rejects.toThrow(/Multiple \.kicad_pcb/i);
  });

  it('reads the native ERC report from the build by default (no kicad-cli)', async () => {
    writeNativeErcReport([
      { type: 'pin_not_connected', severity: 'error', description: 'Pin not connected', items: [] },
    ]);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-diag-out-'));
    await run(parsedWith({ 'skip-build': true, 'skip-drc': true, out: path.join(outDir, 'r.md') }));

    expect(runErcStepMock).not.toHaveBeenCalled();
    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'r.json'), 'utf8'));
    expect(data.erc.ran).toBe(true);
    expect(data.erc.errors).toBe(1);
    expect(data.erc.violations[0].type).toBe('pin_not_connected');
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('does not trust a native ERC report older than the schematic', async () => {
    writeNativeErcReport([]);
    const reportPath = path.join(tmpDir, 'board_erc.json');
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(reportPath, past, past); // now older than the .kicad_sch
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-diag-out-'));
    await run(parsedWith({ 'skip-build': true, 'skip-drc': true, out: path.join(outDir, 'r.md') }));

    const data = JSON.parse(fs.readFileSync(path.join(outDir, 'r.json'), 'utf8'));
    expect(data.erc.ran).toBe(false);
    expect(data.erc.reason).toMatch(/current build/i);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('runs ERC through kicad-cli when --kicad is passed', async () => {
    runErcStepMock.mockResolvedValue({ ran: true, passed: true, errors: 0, warnings: 0, violations: [] });
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-diag-out-'));
    await run(parsedWith({ 'skip-build': true, 'skip-drc': true, kicad: true, out: path.join(outDir, 'r.md') }));

    expect(runErcStepMock).toHaveBeenCalledWith(schPath);
    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
