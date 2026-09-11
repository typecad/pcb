import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBoardFile } from '../pipeline.js';

let tmp: string;
let previousBuildDir: string | undefined;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'find-board-'));
  previousBuildDir = process.env.TYPECAD_BUILD_DIR;
  process.env.TYPECAD_BUILD_DIR = tmp;
});

afterEach(() => {
  if (previousBuildDir === undefined) delete process.env.TYPECAD_BUILD_DIR;
  else process.env.TYPECAD_BUILD_DIR = previousBuildDir;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('findBoardFile', () => {
  it('returns the single board', () => {
    fs.writeFileSync(path.join(tmp, 'board.kicad_pcb'), '(kicad_pcb)');
    expect(findBoardFile()).toBe(path.join(tmp, 'board.kicad_pcb'));
  });

  it('picks the newest board when strays share build/ (fp upgrade tests, imports)', async () => {
    const old = path.join(tmp, 'board.kicad_pcb');
    const stray = path.join(tmp, 'upgrade_test.kicad_pcb');
    fs.writeFileSync(old, '(kicad_pcb)');
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(stray, '(kicad_pcb)');
    expect(findBoardFile()).toBe(stray);

    // a fresh build rewrites the project board — it wins again
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(old, '(kicad_pcb)');
    expect(findBoardFile()).toBe(old);
  });

  it('returns null when the build dir has no boards', () => {
    expect(findBoardFile()).toBeNull();
  });
});
