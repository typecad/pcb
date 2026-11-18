import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from '../src/utils/atomic_write.js';

describe('writeFileAtomic', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('replaces the target and leaves no temp file behind', () => {
    const target = path.join(dir, 'b.kicad_pcb');
    fs.writeFileSync(target, 'old');
    writeFileAtomic(target, 'new');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.readdirSync(dir)).toEqual(['b.kicad_pcb']);
  });

  it('creates a missing target', () => {
    const target = path.join(dir, 'x.json');
    writeFileAtomic(target, '{}');
    expect(fs.readFileSync(target, 'utf8')).toBe('{}');
  });

  it('never stages through a name an extension glob would match', () => {
    // the vscode board watcher globs build/**/*.kicad_pcb — the temp file
    // must not look like a board while it is being written
    const seen: string[] = [];
    const orig = fs.renameSync;
    (fs as { renameSync: typeof fs.renameSync }).renameSync = ((from: fs.PathLike, to: fs.PathLike) => {
      seen.push(String(from));
      return orig(from, to);
    }) as typeof fs.renameSync;
    try {
      writeFileAtomic(path.join(dir, 'b.kicad_pcb'), 'x');
    } finally {
      (fs as { renameSync: typeof fs.renameSync }).renameSync = orig;
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]!.endsWith('.kicad_pcb')).toBe(false);
  });
});
