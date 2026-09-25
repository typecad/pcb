// Board discovery: the project's own board (hw package name → stem) wins
// over strays touched later; newest remains the fallback.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBoardFile } from '../../pipeline.js';

const realCwd = process.cwd();
let project: string;

function setMtime(file: string, agoMs: number): void {
  const at = new Date(Date.now() - agoMs);
  fs.utimesSync(file, at, at);
}

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-board-'));
  fs.mkdirSync(path.join(project, 'build'), { recursive: true });
  process.chdir(project);
  process.env.TYPECAD_BUILD_DIR = path.join(project, 'build');
});

afterEach(() => {
  process.chdir(realCwd);
  delete process.env.TYPECAD_BUILD_DIR;
  fs.rmSync(project, { recursive: true, force: true });
});

describe('findBoardFile', () => {
  it('prefers the package-named board over a newer stray (rd-skeleton-hw → rd_skeleton)', () => {
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'rd-skeleton-hw' }));
    const own = path.join(project, 'build', 'rd_skeleton.kicad_pcb');
    const stray = path.join(project, 'build', 'rd_filled.kicad_pcb');
    fs.writeFileSync(own, '(kicad_pcb)');
    fs.writeFileSync(stray, '(kicad_pcb)');
    setMtime(own, 60_000); // a minute old
    setMtime(stray, 0); // just touched — would win on newest alone
    expect(path.basename(findBoardFile()!)).toBe('rd_skeleton.kicad_pcb');
  });

  it('falls back to the newest board when no name matches', () => {
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'something-else-hw' }));
    const a = path.join(project, 'build', 'alpha.kicad_pcb');
    const b = path.join(project, 'build', 'beta.kicad_pcb');
    fs.writeFileSync(a, '(kicad_pcb)');
    fs.writeFileSync(b, '(kicad_pcb)');
    setMtime(a, 0);
    setMtime(b, 60_000);
    expect(path.basename(findBoardFile()!)).toBe('alpha.kicad_pcb');
  });

  it('returns null with no boards', () => {
    expect(findBoardFile()).toBeNull();
  });
});
