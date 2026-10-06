// Applied-artwork source edits: the E panel / Del on a placed image ride
// the apply here — rewrites and removals of the canonical syncArt statement.
import { describe, expect, it } from 'vitest';
import { planImageSourceEdits } from '../imageEdits.js';
import { expectValidTs } from './helpers/valid_source.js';

const applyEdits = (
  text: string,
  plan: ReturnType<typeof planImageSourceEdits>,
): string => {
  let out = text;
  const all = [...plan.edits, ...plan.deletes].sort((a, b) => b.start - a.start);
  for (const e of all) out = out.slice(0, e.start) + e.line + out.slice(e.end);
  return out;
};

const sidecar = (stmts: string[]): string =>
  `import { Image, TrackBuilder } from '@typecad/pcb';
import type { Component, PCB } from '@typecad/pcb';

export const syncTracks: TrackBuilder[] = [];
export const syncArt: Image[] = [];

export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {
  syncTracks.length = 0;

${stmts.map((s) => '  ' + s).join('\n')}
}
`;

describe('planImageSourceEdits', () => {
  it('rewrites the matched statement (position, size, side, replacement file)', () => {
    const text = sidecar([
      "syncArt.push(new Image({ file: 'art/logo.png', at: { x: 10, y: 20 }, size: [12, 12] }));",
      "syncArt.push(new Image({ file: 'art/other.png', at: { x: 10, y: 20 }, size: [4, 4], side: 'back' }));",
    ]);
    const plan = planImageSourceEdits(
      text,
      [
        {
          match: { file: 'art/logo.png', x: 10, y: 20 },
          x: 42.5,
          y: 17,
          w: 20,
          h: 8,
          side: 'back',
          newFile: 'art/badge.png',
        },
      ],
      [],
    );
    expect(plan.skipped).toEqual([]);
    expect(new Set(plan.edits.map((e) => e.ref)).size).toBe(1); // one input, surgical spans
    const out = applyEdits(text, plan);
    expect(out).toContain(
      "syncArt.push(new Image({ file: 'art/badge.png', at: { x: 42.5, y: 17 }, size: [20, 8], side: 'back' }));",
    );
    // the other same-center image is untouched (file is part of the key)
    expect(out).toContain("file: 'art/other.png'");
    expectValidTs(out);
  });

  it('matches within tolerance and keeps front statements front', () => {
    const text = sidecar(["syncArt.push(new Image({ file: 'art/logo.png', at: { x: 10, y: 20 }, size: [12, 12] }));"]);
    const plan = planImageSourceEdits(
      text,
      [{ match: { file: 'art/logo.png', x: 10.02, y: 19.98 }, x: 11, y: 21, w: 12, h: 12, side: 'front' }],
      [],
    );
    const out = applyEdits(text, plan);
    expect(out).toContain("at: { x: 11, y: 21 }, size: [12, 12] }));");
    expect(out).not.toContain("side: 'front'"); // front is the default — omitted
    expectValidTs(out);
  });

  it('removes the whole deleted statement line', () => {
    const text = sidecar([
      "syncArt.push(new Image({ file: 'art/a.png', at: { x: 1, y: 2 }, size: [3, 4] }));",
      "syncArt.push(new Image({ file: 'art/b.png', at: { x: 5, y: 6 }, size: [7, 8] }));",
    ]);
    const plan = planImageSourceEdits(text, [], [{ file: 'art/a.png', x: 1, y: 2 }]);
    const out = applyEdits(text, plan);
    expect(out).not.toContain('art/a.png');
    expect(out).toContain('art/b.png');
    expect(out).not.toMatch(/\n\s*\n\s*\}/); // no blank line left at the removal
    expectValidTs(out);
  });

  it('reports honest skips when nothing matches', () => {
    const text = sidecar(["syncArt.push(new Image({ file: 'art/a.png', at: { x: 1, y: 2 }, size: [3, 4] }));"]);
    const plan = planImageSourceEdits(
      text,
      [{ match: { file: 'art/missing.png', x: 1, y: 2 }, x: 0, y: 0, w: 1, h: 1, side: 'front' }],
      [{ file: 'art/gone.png', x: 9, y: 9 }],
    );
    expect(plan.edits).toHaveLength(0);
    expect(plan.deletes).toHaveLength(0);
    expect(plan.skipped.join(' ')).toContain('art/missing.png');
    expect(plan.skipped.join(' ')).toContain('art/gone.png');
  });
});

describe('planLayoutApply artwork edit stage', () => {
  const entry = (sync: string) => `import { PCB } from '@typecad/pcb';
import { syncBoard } from './_sync.js';
const typecad = new PCB('demo');
syncBoard(typecad, {});
typecad.create(r1);
`;
  const ENTRY_URI = 'file:///src/board.ts';
  const SYNC_URI = 'file:///src/_sync.ts';

  it('routes edits through the apply into the sidecar', async () => {
    const { planLayoutApply } = await import('../layoutApply.js');
    const sync = sidecar(["syncArt.push(new Image({ file: 'art/logo.png', at: { x: 10, y: 20 }, size: [12, 12] }));"]);
    const files = [
      { uri: ENTRY_URI, text: entry(sync) },
      { uri: SYNC_URI, text: sync },
    ];
    const plan = planLayoutApply(files, {
      moves: [],
      variableOf: () => undefined,
      allRefs: new Set(),
      imageEdits: [
        { match: { file: 'art/logo.png', x: 10, y: 20 }, x: 30, y: 40, w: 12, h: 12, side: 'front', newFile: 'art/new.png' },
      ],
      imageDeletes: [{ file: 'art/logo.png', x: 10, y: 20 }],
    });
    // an edit and a delete on the SAME key: the delete wins the statement
    // (planned per file in one pass — first come, first served)
    const texts = new Map(files.map((f) => [f.uri, f.text]));
    for (const stage of plan.stages)
      for (const batch of stage) {
        let out = texts.get(batch.uri)!;
        for (const e of [...batch.edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.line + out.slice(e.end);
        texts.set(batch.uri, out);
      }
    const syncOut = texts.get(SYNC_URI)!;
    expectValidTs(syncOut);
    expect(plan.counts.imageEdits + plan.counts.imageDeletes).toBe(1);
  });
});

describe('planImageSourceEdits hand-written statements', () => {
  // rd_skeleton's exact shape: bare declaration, tuple at, nested inks,
  // comments inside the options object
  const modEc = (atValue: string) => `import { PCB, Component, Image } from '@typecad/pcb';
const typecad = new PCB('mod-ec');
let art = new Image({
  file: './assets/favicon.png',
  // board center — the outline is 130..155 x 78..93
  at: ${atValue},
  size: [12, 12],          // mm bounding box, aspect preserved
  side: 'front',           // 'back' mirrors X and flips layers
  resolution: 0.1,         // mm per pixel grid
  inks: { silk: '#02B388' },
});

typecad.create(
  art,
  j1,
);
`;

  it('edits a tuple-at declaration in place (the reported bug)', () => {
    const text = modEc('[142.5, 85.5]');
    const plan = planImageSourceEdits(
      text,
      [{ match: { file: './assets/favicon.png', x: 142.5, y: 85.5 }, x: 60, y: 40, w: 12, h: 12, side: 'front' }],
      [],
    );
    expect(plan.skipped).toEqual([]);
    const out = applyEdits(text, plan);
    expect(out).toContain('at: { x: 60, y: 40 }');
    expect(out).not.toContain('at: [142.5, 85.5]');
    // everything else survives verbatim: nested inks, comments, side
    expect(out).toContain("inks: { silk: '#02B388' }");
    expect(out).toContain("side: 'front'");
    expect(out).toContain("file: './assets/favicon.png'");
    expectValidTs(out);
  });

  it('rewrites size, flips side to back (inserting it is already present here), and replaces the file', () => {
    const text = modEc('{ x: 142.5, y: 85.5 }');
    const plan = planImageSourceEdits(
      text,
      [
        {
          match: { file: './assets/favicon.png', x: 142.5, y: 85.5 },
          x: 10,
          y: 20,
          w: 30,
          h: 25,
          side: 'back',
          newFile: 'art/badge.png',
        },
      ],
      [],
    );
    const out = applyEdits(text, plan);
    expect(out).toContain('at: { x: 10, y: 20 }');
    expect(out).toContain('size: [30, 25]');
    expect(out).toContain("side: 'back'");
    expect(out).toContain("file: 'art/badge.png'");
    expectValidTs(out);
  });

  it('inserts side: back when the statement carries none', () => {
    const text = `const a = new Image({ file: 'x.png', at: [1, 2], size: [3, 4] });`;
    const plan = planImageSourceEdits(
      text,
      [{ match: { file: 'x.png', x: 1, y: 2 }, x: 5, y: 6, w: 3, h: 4, side: 'back' }],
      [],
    );
    const out = applyEdits(text, plan);
    expect(out).toContain("side: 'back'");
    expectValidTs(out);
  });

  it('deletes a declared image wholesale, including its create() argument', () => {
    const text = modEc('[142.5, 85.5]');
    const plan = planImageSourceEdits(text, [], [{ file: './assets/favicon.png', x: 142.5, y: 85.5 }]);
    const out = applyEdits(text, plan);
    expect(out).not.toContain('new Image');
    expect(out).not.toContain('art');
    expect(out).toContain('j1');
    expectValidTs(out);
  });

  it('edits work when the manifest center matches within tolerance', () => {
    const text = modEc('[142.5, 85.5]');
    const plan = planImageSourceEdits(
      text,
      [{ match: { file: './assets/favicon.png', x: 142.52, y: 85.48 }, x: 1, y: 2, w: 3, h: 4, side: 'front' }],
      [],
    );
    expect(plan.edits.length).toBeGreaterThan(0);
    const out = applyEdits(text, plan);
    expect(out).toContain('at: { x: 1, y: 2 }');
    expectValidTs(out);
  });
});
