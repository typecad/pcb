import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildViewerFromFiles } from '../src/gerber_viewer/build.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const board = path.join(repoRoot, 'rd_isl9120_demo', 'build', 'isl9120_demo.kicad_pcb');

function findKicadCli(): string | null {
  const candidates = [
    process.env.KICAD_CLI,
    'C:/Program Files/KiCad/10.0/bin/kicad-cli.exe',
    'C:/Program Files/KiCad/9.0/bin/kicad-cli.exe',
    'C:/Program Files/KiCad/8.0/bin/kicad-cli.exe',
    '/usr/bin/kicad-cli',
    '/usr/local/bin/kicad-cli',
    '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli',
  ].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const kicadCli = findKicadCli();
const hasBoard = fs.existsSync(board);

describe.runIf(kicadCli && hasBoard)('real kicad-cli gerbers (rd_isl9120_demo)', () => {
  it('parses and renders a full KiCad fab output set', { timeout: 120_000 }, () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gerview-kicad-'));
    execFileSync(kicadCli!, ['pcb', 'export', 'gerbers', '--output', outDir, board], {
      stdio: 'pipe',
    });
    execFileSync(kicadCli!, ['pcb', 'export', 'drill', '--output', outDir, board], {
      stdio: 'pipe',
    });

    const result = buildViewerFromFiles([outDir], { title: 'isl9120_demo' });
    const names = result.layers.map((l) => l.fullName ?? l.name);

    expect(names.some((n) => /f_cu/i.test(n))).toBe(true);
    expect(names.some((n) => /b_cu/i.test(n))).toBe(true);
    expect(names.some((n) => /edge_cuts/i.test(n))).toBe(true);
    expect(names.some((n) => /\.drl$/i.test(n))).toBe(true);
    expect(result.layers.length).toBeGreaterThanOrEqual(6);

    // real geometry made it through
    expect(result.svg).toContain('<path');
    expect(result.svg).toMatch(/viewBox="/);
    expect(result.html).toContain('isl9120_demo');

    fs.rmSync(outDir, { recursive: true, force: true });
  });
});

it.skipIf(kicadCli && hasBoard)('kicad integration test skipped (no kicad-cli or board)', () => {
  expect(true).toBe(true);
});
