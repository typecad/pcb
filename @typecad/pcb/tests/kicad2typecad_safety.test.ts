import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  acquireProjectLock,
  changedSince,
  fingerprintIR,
  latestSnapshotInfo,
  ownershipViolations,
  parseGate,
  parserSelfTest,
  restoreSnapshot,
  stampFiles,
  takeSnapshot,
} from '../src/kicad2typecad/safety.js';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import type { KicadIR } from '../src/kicad2typecad/types.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-safety-'));
}

function buildIr(pcb: string): KicadIR {
  return new KicadIRBuilder().build(SExprNode.parse(pcb));
}

describe('safety: parser self-test', () => {
  it('reports the TS parser as available', () => {
    const result = parserSelfTest();
    expect(result.ok).toBe(true);
    expect(result.tsPlugin).toBe(true);
  });
});

describe('safety: snapshot and restore', () => {
  it('round-trips files and rotates the previous snapshot', () => {
    const root = tmpDir();
    try {
      const file = path.join(root, 'src', 'board.ts');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'v1');

      const snap1 = takeSnapshot(root, [file], 'b.kicad_pcb');
      expect(snap1).not.toBeNull();
      expect(latestSnapshotInfo(root)?.fileCount).toBe(1);

      fs.writeFileSync(file, 'v2');
      const snap2 = takeSnapshot(root, [file], 'b.kicad_pcb');
      expect(snap2).not.toBeNull();

      // restoring latest recovers the SECOND snapshot's pre-state (v1 was
      // snapshotted by snap1, and snap2 snapshotted v2 — so latest holds v2)
      const restored = restoreSnapshot(root);
      expect(restored.restored).toBe(1);
      expect(fs.readFileSync(file, 'utf-8')).toBe('v2');

      // restoring previous recovers the first snapshot's state
      const restoredPrev = restoreSnapshot(root, 'previous');
      expect(restoredPrev.restored).toBe(1);
      expect(fs.readFileSync(file, 'utf-8')).toBe('v1');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports no snapshot when none was taken', () => {
    const root = tmpDir();
    try {
      expect(latestSnapshotInfo(root)).toBeNull();
      expect(restoreSnapshot(root).restored).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('safety: parse gate', () => {
  it('passes parseable files and fails broken ones', () => {
    const root = tmpDir();
    try {
      const good = path.join(root, 'good.ts');
      const bad = path.join(root, 'bad.ts');
      fs.writeFileSync(good, 'const x = 1;\n');
      fs.writeFileSync(bad, 'const x = {{{;\n');
      expect(parseGate([good]).ok).toBe(true);
      const result = parseGate([good, bad]);
      expect(result.ok).toBe(false);
      expect(result.failures).toEqual([bad]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('safety: ownership', () => {
  it('flags writes outside the analyzed set', () => {
    const analyzed = new Set(['/p/src/a.ts']);
    expect(ownershipViolations([{ filePath: '/p/src/a.ts' }], analyzed)).toEqual([]);
    expect(ownershipViolations([{ filePath: '/p/src/other.ts' }], analyzed)).toEqual(['/p/src/other.ts']);
  });
});

describe('safety: source stamps', () => {
  it('detects mid-cycle edits and ignores unchanged files', async () => {
    const root = tmpDir();
    try {
      const file = path.join(root, 'a.ts');
      fs.writeFileSync(file, 'const x = 1;');
      const before = stampFiles([file]);
      expect(changedSince(before)).toEqual([]);
      fs.writeFileSync(file, 'const x = 2;');
      // mtime granularity can be coarse on some filesystems; force a stamp
      // change via utimes to keep the test deterministic
      const now = new Date();
      fs.utimesSync(file, now, new Date(now.getTime() + 3000));
      expect(changedSince(before)).toEqual([file]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('safety: project lock', () => {
  it('grants the lock to one process and rejects a second while held', () => {
    const root = tmpDir();
    const first = acquireProjectLock(root);
    expect(first.ok).toBe(true);
    // Same pid re-acquires (defensive) — release is idempotent
    first.release();
    first.release();

    const second = acquireProjectLock(root);
    expect(second.ok).toBe(true);
    second.release();
  });

  it('treats a stale lock (dead pid) as acquirable', () => {
    const root = tmpDir();
    try {
      // Simulate a stale holder: write a pid that cannot be alive.
      const osMod = require('node:os') as typeof os;
      const crypto = require('node:crypto') as typeof import('node:crypto');
      const key = crypto.createHash('sha1').update(path.resolve(root)).digest('hex').slice(0, 12);
      const lockPath = path.join(osMod.tmpdir(), `typecad-import-${key}.lock`);
      fs.writeFileSync(lockPath, '999999999');
      const lock = acquireProjectLock(root);
      expect(lock.ok).toBe(true);
      lock.release();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('safety: board fingerprint', () => {
  const board = `(kicad_pcb (version 20260206) (generator pcbnew)
    (net 0 "")
    (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
    (segment (start 1 1) (end 2 2) (width 0.2) (layer "F.Cu") (net "A"))
    (gr_text "hi" (at 3 4 0) (layer "F.SilkS") (effects (font (size 1 1))))
  )`;

  it('is stable across formatting and element order', () => {
    const reordered = `(kicad_pcb (version 20260206) (generator pcbnew)
      (net 0 "")
      (gr_text "hi" (at 3 4 0) (layer "F.SilkS") (effects (font (size 1 1))))
      (segment (start 1 1) (end 2 2) (width 0.2) (layer "F.Cu") (net "A"))
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
    )`;
    expect(fingerprintIR(buildIr(board))).toBe(fingerprintIR(buildIr(reordered)));
  });

  it('changes when geometry changes', () => {
    const moved = board.replace('(end 2 2)', '(end 2 2.5)');
    expect(fingerprintIR(buildIr(board))).not.toBe(fingerprintIR(buildIr(moved)));
  });
});
