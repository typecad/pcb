// The `viewer` command is the extension's whole render pipeline composed
// into one process — the fab export and the page build must agree on the
// same board, and the overlays the build produced must ride along.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../../../utils/logging.js', () => ({
  default: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import logger from '../../../../utils/logging.js';
import { run } from '../viewer.js';
import type { ParsedArgs } from '../../parser.js';

const fixtureBoard = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../tests/docgen/fixtures/one_hz.kicad_pcb',
);

describe('typecad-pcb viewer', () => {
  let root: string;
  let buildDir: string;
  let boardPath: string;

  function makeParsed(overrides: { args?: Record<string, string | boolean>; positional?: string[]; json?: boolean } = {}): ParsedArgs {
    return {
      command: 'viewer',
      subcommand: '',
      args: overrides.args ?? {},
      positional: overrides.positional ?? [boardPath],
      passthrough: [],
      json: overrides.json ?? false,
      help: false,
      version: false,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-viewer-'));
    buildDir = path.join(root, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    boardPath = path.join(buildDir, 'one_hz.kicad_pcb');
    fs.copyFileSync(fixtureBoard, boardPath);
    // buildDirPath() honors this — keep every write inside the temp dir
    process.env.TYPECAD_BUILD_DIR = buildDir;
  });

  afterEach(() => {
    delete process.env.TYPECAD_BUILD_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exports the fab set and builds the self-contained page in one pass', async () => {
    await run(makeParsed());

    const page = fs.readFileSync(path.join(buildDir, 'serve', 'viewer.html'), 'utf8');
    expect(page).toContain('<script>');
    expect(page).toMatch(/<meta name="tc-viewer-generator" content="\d+\.\d+/);

    // the page embeds a full fab set: copper plots and drill together
    const gerbers = fs.readdirSync(path.join(buildDir, 'gerbers'));
    expect(gerbers.some((f) => f.endsWith('.gtl'))).toBe(true);
    expect(gerbers.some((f) => f.endsWith('.gbl'))).toBe(true);
    expect(gerbers.some((f) => f.endsWith('.drl'))).toBe(true);
    expect(gerbers.some((f) => f.endsWith('.gbrjob'))).toBe(true);
  });

  it('-o places the page elsewhere and --json reports the overlays', async () => {
    fs.writeFileSync(path.join(buildDir, 'one_hz_rules.json'), JSON.stringify({ minTraceWidth: 0.2 }));
    const out = path.join(root, 'out', 'v.html');
    await run(
      makeParsed({
        args: { out, rules: path.join(buildDir, 'one_hz_rules.json') },
        json: true,
      }),
    );
    expect(fs.existsSync(out)).toBe(true);

    const logged = (logger.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    const summary = JSON.parse(logged.find((s) => s.trimStart().startsWith('{'))!) as { overlays: string[]; layers: number };
    expect(summary.overlays).toContain('rules');
    expect(summary.layers).toBeGreaterThan(0);
  });

  it('auto-discovers the build artifacts the page knows how to consume', async () => {
    fs.writeFileSync(path.join(buildDir, 'one_hz_rules.json'), JSON.stringify({ minTraceWidth: 0.2 }));
    await run(makeParsed({ json: true }));
    const logged = (logger.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    const summary = JSON.parse(logged.find((s) => s.trimStart().startsWith('{'))!) as { overlays: string[] };
    expect(summary.overlays).toContain('rules');
  });

  it('rejects a missing board with the named path', async () => {
    await expect(run(makeParsed({ positional: [path.join(root, 'nope.kicad_pcb')] }))).rejects.toThrow(/PCB file not found/);
  });
});
