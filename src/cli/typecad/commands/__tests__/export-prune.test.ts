// Fab-dir hygiene: export prunes other board stems' artifacts so
// gerber-viewer never stacks two boards (duplicated footprints/traces).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruneForeignStemArtifacts } from '../export.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-prune-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('pruneForeignStemArtifacts', () => {
  it('removes other stems’ gerber/drill artifacts, keeps the board’s own and non-fab files', () => {
    for (const f of [
      'rd_skeleton-F_Cu.gtl',
      'rd_skeleton-B_Cu.gbl',
      'rd_skeleton-F_Paste.gtp',
      'rd_skeleton-B_Paste.gbp',
      'rd_skeleton-Edge_Cuts.gm1',
      'rd_skeleton-job.gbrjob',
      'rd_skeleton.drl',
      'rd_filled-F_Cu.gtl',
      'rd_filled-F_Paste.gtp',
      'rd_filled.drl',
      'upgrade_test-F_Cu.gtl',
      'notes.txt',
      'fab-review.md',
    ]) {
      fs.writeFileSync(path.join(dir, f), 'x');
    }
    const removed = pruneForeignStemArtifacts(dir, 'C:/proj/hw/build/rd_skeleton.kicad_pcb');
    expect(removed.sort()).toEqual(['rd_filled-F_Cu.gtl', 'rd_filled-F_Paste.gtp', 'rd_filled.drl', 'upgrade_test-F_Cu.gtl'].sort());
    const left = fs.readdirSync(dir).sort();
    expect(left).toContain('rd_skeleton-F_Cu.gtl');
    expect(left).toContain('rd_skeleton.drl');
    expect(left).toContain('notes.txt');
    expect(left).toContain('fab-review.md');
    expect(left.filter((f) => f.startsWith('rd_filled') || f.startsWith('upgrade_test'))).toHaveLength(0);
  });

  it('is a no-op when only the exported board’s artifacts exist', () => {
    for (const f of ['a-F_Cu.gtl', 'a.drl', 'a-job.gbrjob']) fs.writeFileSync(path.join(dir, f), 'x');
    expect(pruneForeignStemArtifacts(dir, 'x/a.kicad_pcb')).toEqual([]);
    expect(fs.readdirSync(dir)).toHaveLength(3);
  });

  it('treats a stem that prefixes another stem as foreign (rd vs rd_v2)', () => {
    for (const f of ['rd-F_Cu.gtl', 'rd_v2-F_Cu.gtl']) fs.writeFileSync(path.join(dir, f), 'x');
    const removed = pruneForeignStemArtifacts(dir, 'x/rd.kicad_pcb');
    expect(removed).toEqual(['rd_v2-F_Cu.gtl']);
    expect(fs.readdirSync(dir)).toEqual(['rd-F_Cu.gtl']);
  });
});
