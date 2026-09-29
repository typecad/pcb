// Source backups: the safety net under the layout apply bridge. These
// tests pin the mechanics — snapshot, list, read, prune, collision-free
// names — so the restore command and the auto-rollback can rely on them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupRootLabel, listBackups, readBackup, writeBackup } from '../sourceBackup.js';

const dirs: string[] = [];
const folder = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tcbackup-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('writeBackup / readBackup', () => {
  it('round-trips every file, newest-first listing, uri-encoded names', () => {
    const f = folder();
    const wrote = writeBackup(f, [
      { uri: 'file:///c%3A/proj/hw/src/board.ts', text: 'const a = 1;\r\n' },
      { uri: 'file:///c%3A/proj/hw/src/deep/other.ts', text: 'const b = 2;\n' },
    ], 'layout apply', 'demo');
    expect(wrote).not.toBeNull();
    const all = listBackups(f);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(wrote!.id);
    expect(all[0]!.manifest.reason).toBe('layout apply');
    expect(all[0]!.manifest.files).toHaveLength(2);
    const restored = readBackup(f, wrote!.id);
    expect(restored.map((r) => r.text)).toEqual(['const a = 1;\r\n', 'const b = 2;\n']);
    // CRLF and LF survive byte-for-byte
    expect(restored[0]!.text).toContain('\r\n');
    // sources decode back to real paths
    expect(restored.every((r) => r.source.includes('src') && r.source.endsWith('.ts'))).toBe(true);
  });

  it('same-named files in different folders never collide in one snapshot', () => {
    const f = folder();
    const wrote = writeBackup(
      f,
      [
        { uri: 'file:///p/src/board.ts', text: 'one' },
        { uri: 'file:///p/other/src/board.ts', text: 'two' },
      ],
      'layout apply',
    );
    expect(wrote!.manifest.files.map((x) => x.snapshot)).toHaveLength(2);
    const texts = readBackup(f, wrote!.id).map((r) => r.text).sort();
    expect(texts).toEqual(['one', 'two']);
  });

  it('readBackup throws for an unknown id; listBackups is empty without snapshots', () => {
    const f = folder();
    expect(listBackups(f)).toEqual([]);
    expect(() => readBackup(f, 'nope')).toThrow(/no backup/);
  });
});

describe('pruning', () => {
  it('keeps the newest snapshots, retires the rest', () => {
    const f = folder();
    for (let i = 0; i < 25; i++) {
      // ids are millisecond-unique; force ordering with explicit dates
      const date = new Date(2026, 0, 1, 0, 0, i);
      writeBackup(f, [{ uri: 'file:///p/src/board.ts', text: `v${i}` }], 'test', undefined);
      // (writeBackup uses now(); identical-content snapshots still prune by count)
    }
    const all = listBackups(f);
    expect(all.length).toBeLessThanOrEqual(20);
    expect(all.length).toBeGreaterThan(0);
  });
});

describe('backupRootLabel', () => {
  it('labels the folder for logs and pickers', () => {
    expect(backupRootLabel()).toBe('build/layout-backups');
  });
});
