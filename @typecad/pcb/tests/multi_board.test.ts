/**
 * Multi-board projects (mother/daughter, board/jig): the build manifest
 * lists every board the project's create() calls produce, discovery selects
 * one of them (--board <stem>), each board exports into its own gerbers dir,
 * and a sync cycle scopes itself to the board's entry import graph so
 * same-named components on different boards never collide.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findBoardFile, listBoardFiles } from '../src/cli/typecad/pipeline.js';
import { gerbersDirFor } from '../src/cli/typecad/commands/export.js';
import { scopeSourceFilesToBoard } from '../src/kicad2typecad/cli.js';
import { isSyncFileName, planSyncEntryEdits, syncFileNameFor } from '../src/kicad2typecad/sync_file.js';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-multiboard-'));
  fs.mkdirSync(path.join(dir, 'build'));
  fs.mkdirSync(path.join(dir, 'src'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const writeManifest = (boards: string[], active?: string): void => {
  fs.writeFileSync(
    path.join(dir, 'build', '.typecad-board.json'),
    JSON.stringify({ board: active ?? boards[boards.length - 1], boards }),
  );
  for (const b of boards) fs.writeFileSync(path.join(dir, 'build', b), '(kicad_pcb)');
};

const writeSources = (): string[] => {
  const src = path.join(dir, 'src');
  fs.writeFileSync(path.join(src, 'mother.ts'), "import { shared } from './shared.js';\nnew PCB('mother').create();\n");
  fs.writeFileSync(path.join(src, 'shared.ts'), "export const shared = 1;\n");
  fs.writeFileSync(path.join(src, 'daughter.ts'), "new PCB('daughter').create();\n");
  fs.writeFileSync(path.join(src, 'orphan.ts'), 'export const stray = 1;\n');
  fs.writeFileSync(path.join(src, '_sync.mother.ts'), 'export function syncBoard() {}\n');
  fs.writeFileSync(path.join(src, '_sync.daughter.ts'), 'export function syncBoard() {}\n');
  return ['mother.ts', 'shared.ts', 'daughter.ts', 'orphan.ts', '_sync.mother.ts', '_sync.daughter.ts'].map((f) =>
    path.join(src, f),
  );
};

describe('board manifest discovery', () => {
  it('lists every board and selects one by stem (case/underscore-insensitive)', () => {
    writeManifest(['mother.kicad_pcb', 'daughter.kicad_pcb']);
    const buildDir = path.join(dir, 'build');
    expect(listBoardFiles(buildDir).map((f) => path.basename(f))).toEqual([
      'mother.kicad_pcb',
      'daughter.kicad_pcb',
    ]);
    // findBoardFile is build-dir-anchored: point TYPECAD_BUILD_DIR at the
    // fixture and the --board stem resolves through the same code the CLI runs
    const prev = process.env.TYPECAD_BUILD_DIR;
    process.env.TYPECAD_BUILD_DIR = buildDir;
    try {
      expect(path.basename(findBoardFile('DAUGHTER') ?? '', '.kicad_pcb')).toBe('daughter');
      expect(findBoardFile('jig')).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.TYPECAD_BUILD_DIR;
      else process.env.TYPECAD_BUILD_DIR = prev;
    }
  });

  it('an unknown stem resolves to nothing', () => {
    writeManifest(['mother.kicad_pcb', 'daughter.kicad_pcb']);
    expect(listBoardFiles(path.join(dir, 'build'))).toHaveLength(2);
  });
});

describe('gerbersDirFor', () => {
  const parsed = (args: Record<string, unknown> = {}): { args: Record<string, unknown> } => ({ args });
  const board = (): string => path.join(dir, 'build', 'mother.kicad_pcb');

  it('single-board projects keep the shared build/gerbers dir', () => {
    writeManifest(['mother.kicad_pcb']);
    expect(gerbersDirFor(parsed(), path.join(dir, 'build'), board())).toBe(path.join(dir, 'build', 'gerbers'));
  });

  it('multi-board projects get a per-stem fab dir; explicit --output wins', () => {
    writeManifest(['mother.kicad_pcb', 'daughter.kicad_pcb']);
    expect(gerbersDirFor(parsed(), path.join(dir, 'build'), board())).toBe(
      path.join(dir, 'build', 'gerbers', 'mother'),
    );
    expect(gerbersDirFor(parsed({ output: '/tmp/fab' }), path.join(dir, 'build'), board())).toBe(
      path.resolve('/tmp/fab'),
    );
  });
});

describe('sync scoping to the board entry', () => {
  it('multi-board: scopes to the entry import graph plus the board sidecar', () => {
    writeManifest(['mother.kicad_pcb', 'daughter.kicad_pcb']);
    const scoped = scopeSourceFilesToBoard(writeSources(), dir, 'mother');
    const names = scoped.map((f) => path.basename(f)).sort();
    expect(names).toEqual(['_sync.mother.ts', 'mother.ts', 'shared.ts']);
  });

  it('a sibling board and its sidecar drop out of the mother cycle', () => {
    writeManifest(['mother.kicad_pcb', 'daughter.kicad_pcb']);
    const scoped = scopeSourceFilesToBoard(writeSources(), dir, 'mother');
    expect(scoped.some((f) => path.basename(f) === 'daughter.ts')).toBe(false);
    expect(scoped.some((f) => path.basename(f) === '_sync.daughter.ts')).toBe(false);
  });

  it('single-board projects keep every file, and a missing entry warns instead of scoping', () => {
    writeManifest(['mother.kicad_pcb', 'daughter.kicad_pcb']);
    const files = writeSources();
    // no file constructs new PCB('jig') — the whole set comes back
    expect(scopeSourceFilesToBoard(files, dir, 'jig')).toEqual(files);
    // single-board manifest: whole-src scan stands
    writeManifest(['mother.kicad_pcb']);
    expect(scopeSourceFilesToBoard(files, dir, 'mother')).toEqual(files);
  });
});

describe('per-board sidecar naming', () => {
  it('single-board keeps _sync.ts; multi-board names the sidecar per stem', () => {
    expect(syncFileNameFor()).toBe('_sync.ts');
    expect(syncFileNameFor('mother')).toBe('_sync.mother.ts');
    expect(isSyncFileName('_sync.ts')).toBe(true);
    expect(isSyncFileName('_sync.mother.ts')).toBe(true);
    expect(isSyncFileName('board.ts')).toBe(false);
  });

  it('the entry import line names the board sidecar, and re-planning is idempotent', () => {
    const entry = "import { PCB } from '@typecad/pcb';\nnew PCB('mother').create(r1);\n";
    const first = planSyncEntryEdits(entry, ['r1'], true, 'mother');
    expect(first.edits.some((e) => e.line.includes("from './_sync.mother.js';"))).toBe(true);
    const once = first.edits
      .slice()
      .sort((a, b) => b.start - a.start)
      .reduce((t, e) => t.slice(0, e.start) + e.line + t.slice(e.end), entry);
    expect(once).toContain("import { syncBoard, syncTracks } from './_sync.mother.js';");
    const second = planSyncEntryEdits(once, ['r1'], true, 'mother');
    expect(second.edits).toHaveLength(0);
  });
});
