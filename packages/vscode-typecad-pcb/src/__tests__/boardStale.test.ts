// Source↔board staleness: the mtime comparison that decides whether a
// build is owed — vscode-free (pure fs), so the auto-build watcher and the
// status indicator build on tested ground.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { boardStale, invalidateSourceMtime, newestSourceMtime, newestSourceMtimeCached, oldestBoardMtime } from '../boardFile.js';

const dirs: string[] = [];
const folder = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tcstale-'));
  dirs.push(d);
  fs.mkdirSync(path.join(d, 'src'));
  fs.mkdirSync(path.join(d, 'build'));
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// force distinct mtimes (same-ms writes would tie and read as synced)
const touch = (file: string, ms: number): void => {
  fs.writeFileSync(file, 'x');
  fs.utimesSync(file, new Date(ms), new Date(ms));
};

describe('newestSourceMtime', () => {
  it('takes the newest of src/**/*.ts and the conf, ignoring other files', () => {
    const f = folder();
    touch(path.join(f, 'src', 'a.ts'), 1000);
    fs.mkdirSync(path.join(f, 'src', 'nested'), { recursive: true });
    touch(path.join(f, 'src', 'nested', 'b.ts'), 3000);
    touch(path.join(f, 'typecad.conf.ts'), 2000);
    touch(path.join(f, 'build', 'noise.ts'), 9999); // build/ is not scanned
    expect(newestSourceMtime(f)).toBe(3000);
  });
});

describe('boardStale', () => {
  it('null without a board, false when the board is current, true when sources are newer', () => {
    const f = folder();
    expect(boardStale(f)).toBeNull();
    touch(path.join(f, 'src', 'a.ts'), 1000);
    touch(path.join(f, 'build', 'demo.kicad_pcb'), 2000);
    expect(boardStale(f)).toBe(false);
    touch(path.join(f, 'src', 'a.ts'), 3000);
    expect(boardStale(f)).toBe(true);
  });
});

describe('multi-board staleness', () => {
  const manifest = (f: string, boards: string[]) =>
    fs.writeFileSync(path.join(f, 'build', '.typecad-board.json'), JSON.stringify({ board: boards[boards.length - 1], boards }));

  it('a sibling the build never reached keeps the project stale', () => {
    const f = folder();
    touch(path.join(f, 'src', 'a.ts'), 3000);
    // the build died after writing mother, before daughter
    touch(path.join(f, 'build', 'mother.kicad_pcb'), 4000);
    touch(path.join(f, 'build', 'daughter.kicad_pcb'), 1000);
    manifest(f, ['daughter.kicad_pcb', 'mother.kicad_pcb']); // active = mother (newest, current)
    expect(oldestBoardMtime(f)).toBe(1000);
    expect(boardStale(f)).toBe(true);
  });

  it('all boards current → not stale', () => {
    const f = folder();
    touch(path.join(f, 'src', 'a.ts'), 1000);
    touch(path.join(f, 'build', 'mother.kicad_pcb'), 4000);
    touch(path.join(f, 'build', 'daughter.kicad_pcb'), 3000);
    manifest(f, ['daughter.kicad_pcb', 'mother.kicad_pcb']);
    expect(boardStale(f)).toBe(false);
  });
});

describe('newestSourceMtimeCached', () => {
  it('reuses the scan until invalidated, then sees the edit', () => {
    const f = folder();
    touch(path.join(f, 'src', 'a.ts'), 1000);
    invalidateSourceMtime();
    expect(newestSourceMtimeCached(f)).toBe(1000);
    touch(path.join(f, 'src', 'a.ts'), 5000);
    expect(newestSourceMtimeCached(f)).toBe(1000); // memoized — no re-walk
    invalidateSourceMtime();
    expect(newestSourceMtimeCached(f)).toBe(5000);
  });
  it('is keyed on the folder', () => {
    const a = folder();
    const b = folder();
    touch(path.join(a, 'src', 'a.ts'), 1000);
    touch(path.join(b, 'src', 'b.ts'), 2000);
    invalidateSourceMtime();
    expect(newestSourceMtimeCached(a)).toBe(1000);
    expect(newestSourceMtimeCached(b)).toBe(2000);
  });
});
