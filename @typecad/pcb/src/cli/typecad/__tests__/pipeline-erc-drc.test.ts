import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const executeKiCADCommandMock = vi.fn();

vi.mock('../../../kicad_commands.js', () => ({
  executeKiCADCommand: (...args: unknown[]) => executeKiCADCommandMock(...args),
}));

const { runErcStep, runDrcStep } = await import('../pipeline.js');

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-stale-report-'));
  executeKiCADCommandMock.mockReset();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ERC/DRC steps vs reports from previous runs', () => {
  it('does not read a report left by a previous run when kicad-cli fails', async () => {
    const schPath = path.join(dir, 'board.kicad_sch');
    const staleReport = path.join(dir, 'board_erc.json');
    fs.writeFileSync(schPath, '(kicad_sch)', 'utf8');
    fs.writeFileSync(staleReport, JSON.stringify({ violations: [{ type: 'stale', severity: 'error' }] }), 'utf8');

    executeKiCADCommandMock.mockRejectedValue(new Error('kicad-cli not found'));

    const result = await runErcStep(schPath);
    expect(result.ran).toBe(false);
    expect(result.violations).toEqual([]);
    expect(fs.existsSync(staleReport)).toBe(false); // removed, not trusted
  });

  it('reads the report this run wrote', async () => {
    const schPath = path.join(dir, 'board.kicad_sch');
    fs.writeFileSync(schPath, '(kicad_sch)', 'utf8');

    executeKiCADCommandMock.mockImplementation(async (_kind: string, args: string[]) => {
      const output = args[args.indexOf('--output') + 1]!;
      fs.writeFileSync(output, JSON.stringify({ violations: [{ type: 'lib_check', severity: 'warning', description: 'fresh' }] }), 'utf8');
    });

    const result = await runErcStep(schPath);
    expect(result.ran).toBe(true);
    expect(result.warnings).toBe(1);
    expect(result.violations[0]?.description).toBe('fresh');
  });

  it('applies the same stale-report guard to DRC', async () => {
    const pcbPath = path.join(dir, 'board.kicad_pcb');
    const staleReport = path.join(dir, 'board_drc.json');
    fs.writeFileSync(pcbPath, '(kicad_pcb)', 'utf8');
    fs.writeFileSync(staleReport, JSON.stringify({ violations: [], unconnected_items: [{}] }), 'utf8');

    executeKiCADCommandMock.mockRejectedValue(new Error('kicad-cli not found'));

    const result = await runDrcStep(pcbPath);
    expect(result.ran).toBe(false);
    expect(fs.existsSync(staleReport)).toBe(false);
  });
});
