// Board discovery (vscode-free): the project's own board (hw package name →
// stem) wins over strays touched later; newest remains the fallback.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listBoardFiles, mtimeOf, newestBoardFile, entrySourceFile, pageGeneratorVersion, projectToolchainVersion } from '../boardFile.js';

let folder: string;

function setMtime(file: string, agoMs: number): void {
  const at = new Date(Date.now() - agoMs);
  fs.utimesSync(file, at, at);
}

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-viewer-'));
  fs.mkdirSync(path.join(folder, 'build'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe('newestBoardFile', () => {
  it('the build manifest wins: a renamed board is found despite a stale name-match', () => {
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'rd-skeleton-hw' }));
    // the stale board under the OLD name (what the package stem still
    // matches) plus the genuinely new, renamed board
    const stale = path.join(folder, 'build', 'rd_skeleton.kicad_pcb');
    const fresh = path.join(folder, 'build', 'typecad_project.kicad_pcb');
    fs.writeFileSync(stale, '(kicad_pcb)');
    fs.writeFileSync(fresh, '(kicad_pcb)');
    setMtime(stale, 300_000);
    setMtime(fresh, 0);
    fs.writeFileSync(
      path.join(folder, 'build', '.typecad-board.json'),
      JSON.stringify({ board: 'typecad_project.kicad_pcb' }),
    );
    expect(newestBoardFile(folder)).toBe(fresh);
  });

  it('a manifest naming a deleted board falls back to the heuristics', () => {
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'rd-skeleton-hw' }));
    const own = path.join(folder, 'build', 'rd_skeleton.kicad_pcb');
    fs.writeFileSync(own, '(kicad_pcb)');
    fs.writeFileSync(
      path.join(folder, 'build', '.typecad-board.json'),
      JSON.stringify({ board: 'renamed_away.kicad_pcb' }),
    );
    expect(newestBoardFile(folder)).toBe(own);
  });

  it('an invalid manifest is ignored, not fatal', () => {
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'rd-skeleton-hw' }));
    const own = path.join(folder, 'build', 'rd_skeleton.kicad_pcb');
    fs.writeFileSync(own, '(kicad_pcb)');
    fs.writeFileSync(path.join(folder, 'build', '.typecad-board.json'), 'not json{');
    expect(newestBoardFile(folder)).toBe(own);
  });

  it('prefers the package-named board over a newer stray (rd-skeleton-hw → rd_skeleton)', () => {
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'rd-skeleton-hw' }));
    const own = path.join(folder, 'build', 'rd_skeleton.kicad_pcb');
    const stray = path.join(folder, 'build', 'rd_filled.kicad_pcb');
    fs.writeFileSync(own, '(kicad_pcb)');
    fs.writeFileSync(stray, '(kicad_pcb)');
    setMtime(own, 60_000);
    setMtime(stray, 0);
    expect(newestBoardFile(folder)).toBe(own);
  });

  it('falls back to the newest board when no name matches', () => {
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'something-else-hw' }));
    const a = path.join(folder, 'build', 'alpha.kicad_pcb');
    const b = path.join(folder, 'build', 'beta.kicad_pcb');
    fs.writeFileSync(a, '(kicad_pcb)');
    fs.writeFileSync(b, '(kicad_pcb)');
    setMtime(a, 0);
    setMtime(b, 60_000);
    expect(newestBoardFile(folder)).toBe(a);
  });

  it('returns null with no build dir or no boards', () => {
    expect(newestBoardFile(folder)).toBeNull();
    fs.mkdirSync(path.join(folder, 'build2'));
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: 'x-hw' }));
    expect(newestBoardFile(folder)).toBeNull();
  });

  it('mtimeOf is 0 for a vanished file, not a throw', () => {
    expect(mtimeOf(path.join(folder, 'nope'))).toBe(0);
  });
});

describe('entrySourceFile', () => {
  it("resolves the build's entry from typecad.conf.ts against the hw folder", () => {
    fs.writeFileSync(path.join(folder, 'typecad.conf.ts'), `import { defineConfig } from '@typecad/pcb';
export default defineConfig({
  entry: './src/rd_skeleton.ts',
});
`);
    expect(entrySourceFile(folder)).toBe(path.join(folder, 'src', 'rd_skeleton.ts'));
  });

  it('null for a missing conf or one without an entry', () => {
    expect(entrySourceFile(folder)).toBeNull();
    fs.writeFileSync(path.join(folder, 'typecad.conf.ts'), `export default defineConfig({});`);
    expect(entrySourceFile(folder)).toBeNull();
  });
});

describe('multi-board discovery', () => {
  it('lists manifest boards and selects one by stem, falling back to the active board', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-mb-'));
    try {
      fs.mkdirSync(path.join(folder, 'build'));
      for (const b of ['mother.kicad_pcb', 'daughter.kicad_pcb']) {
        fs.writeFileSync(path.join(folder, 'build', b), '(kicad_pcb)');
      }
      fs.writeFileSync(
        path.join(folder, 'build', '.typecad-board.json'),
        JSON.stringify({ board: 'daughter.kicad_pcb', boards: ['mother.kicad_pcb', 'daughter.kicad_pcb'] }),
      );
      expect(listBoardFiles(folder).map((f) => path.basename(f))).toEqual([
        'mother.kicad_pcb',
        'daughter.kicad_pcb',
      ]);
      // stem selection is case/underscore-insensitive
      expect(path.basename(newestBoardFile(folder, 'MOTHER') ?? '', '.kicad_pcb')).toBe('mother');
      // unknown stems fall back to the manifest's active board
      expect(path.basename(newestBoardFile(folder, 'jig') ?? '', '.kicad_pcb')).toBe('daughter');
      // no stem = the active board
      expect(path.basename(newestBoardFile(folder) ?? '', '.kicad_pcb')).toBe('daughter');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('projectToolchainVersion (npx-style upward resolution)', () => {
  it('resolves node_modules/@typecad/pcb walking up from the hw folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-tool-'));
    try {
      const hw = path.join(root, 'hw');
      fs.mkdirSync(path.join(root, 'node_modules', '@typecad', 'pcb'), { recursive: true });
      fs.mkdirSync(hw, { recursive: true });
      fs.writeFileSync(path.join(root, 'node_modules', '@typecad', 'pcb', 'package.json'), JSON.stringify({ version: '1.2.3' }));
      expect(projectToolchainVersion(hw)).toBe('1.2.3');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers the NEAREST node_modules (nested installs shadow the workspace)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-tool-'));
    try {
      const hw = path.join(root, 'hw');
      fs.mkdirSync(path.join(root, 'node_modules', '@typecad', 'pcb'), { recursive: true });
      fs.mkdirSync(path.join(hw, 'node_modules', '@typecad', 'pcb'), { recursive: true });
      fs.writeFileSync(path.join(root, 'node_modules', '@typecad', 'pcb', 'package.json'), JSON.stringify({ version: '1.0.0' }));
      fs.writeFileSync(path.join(hw, 'node_modules', '@typecad', 'pcb', 'package.json'), JSON.stringify({ version: '2.0.0' }));
      expect(projectToolchainVersion(hw)).toBe('2.0.0');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null when nothing resolves', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-tool-'));
    try {
      expect(projectToolchainVersion(root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('pageGeneratorVersion', () => {
  it('extracts the tc-viewer-generator meta', () => {
    expect(pageGeneratorVersion('<html><meta name="tc-viewer-generator" content="1.2.3"><body>')).toBe('1.2.3');
  });

  it('returns null on pre-stamp pages', () => {
    expect(pageGeneratorVersion('<html><meta name="tc-viewer-build" content="x"></html>')).toBeNull();
  });
});
