// Layout-apply orchestration: the full "apply & rebuild" gesture (moves,
// text/value/label edits, routes, deletes) planned as sequential stages —
// no overlapping edits, deferral across files, honest skip reports, and
// output that still parses.
import { describe, expect, it } from 'vitest';
import { planLayoutApply } from '../layoutApply.js';
import { expectValidTs } from './helpers/valid_source.js';

const project = () => `import { PCB, Component, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const r1 = new Component({ reference: 'R1', value: '1k' });
r1.pcb = { x: 10, y: 10 };
const c1 = new Component({ reference: 'C1' });
c1.pcb = { x: 30, y: 10 };
const vcc = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 10.5, y: 10 }, 'F.Cu', 0.3)
  .to({ x: 20, y: 10, layer: 'F.Cu', width: 0.3 })
  .to({ x: 25, y: 10, layer: 'F.Cu', width: 0.3 })
  .to({ x: 30, y: 10, layer: 'F.Cu', width: 0.3 });
typecad.text({ text: 'hello', x: 5, y: 5, layer: 'F.SilkS' });
typecad.create(
  r1,
  c1,
  vcc,
);
`;

const run = (files: Array<{ uri: string; text: string }>, input: Parameters<typeof planLayoutApply>[1]) => {
  const plan = planLayoutApply(files, input);
  // apply stage by stage, exactly like the viewer's WorkspaceEdit loop
  const texts = new Map(files.map((f) => [f.uri, f.text]));
  for (const stage of plan.stages) {
    for (const batch of stage) {
      let out = texts.get(batch.uri)!;
      for (const e of [...batch.edits].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, e.start) + e.line + out.slice(e.end);
      }
      texts.set(batch.uri, out);
    }
  }
  return { plan, texts };
};

const baseInput = (over: Partial<Parameters<typeof planLayoutApply>[1]> = {}) => ({
  moves: [],
  variableOf: (ref: string) => ({ R1: 'r1', C1: 'c1' })[ref],
  allRefs: new Set(['R1', 'C1']),
  ...over,
});

describe('planLayoutApply', () => {
  it('applies a whole gesture in one pass: move, delete, add, value, text', () => {
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: project() }],
      baseInput({
        moves: [{ ref: 'R1', dx: 2, dy: 1, pads: [{ x: 10.5, y: 10 }] }],
        values: [{ ref: 'R1', value: '2k' }],
        texts: [{ text0: 'hello', x0: 5, y0: 5, text: 'hello', x: 6, y: 6, rot: 0 }],
        deletes: [{ net: 'VCC', x1: 20, y1: 10, x2: 25, y2: 10, layer: 'F.Cu' }],
        routes: [
          {
            net: 'GND',
            w: 0.25,
            pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 1 }] }],
            vias: [],
            from: { ref: 'R1', pin: '2' },
            to: null,
          },
        ],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    // placement moved by the delta
    expect(out).toContain('r1.pcb = { x: 12, y: 11 }');
    // sticky endpoint followed the part
    expect(out).toContain('.from({ x: 12.5, y: 11 }');
    // the split halves keep the net, and neither the old name nor an
    // emptied () survives in create()
    expect(out.match(/new TrackBuilder\(typecad, \{ net: 'VCC', \}\)/g)).toHaveLength(2);
    expect(out).not.toContain('()');
    // new route declared before create() and passed to it
    expect(out).toContain('const route1 = new TrackBuilder');
    expect(out).toMatch(/create\([\s\S]*vcc,[\s\S]*route1/);
    // value + text edits landed
    expect(out).toContain("value: '2k'");
    expect(out).toContain("text: 'hello', x: 6, y: 6");
    expect(plan.counts).toMatchObject({ moves: 1, endpoints: 1, texts: 1, values: 1, routes: 1, deletes: 1 });
    expect(plan.skipped).toEqual([]);
  });

  it('defers literal searches across files; unplaced parts get literals inserted, undeclared ones skip once', () => {
    const fileA = "const a = new Component({ reference: 'C9' });\n";
    const fileB = "const b = new Component({ reference: 'U2' });\nu2.pcb = { x: 3, y: 4 };\n";
    const { plan, texts } = run(
      [
        { uri: 'file:///src/a.ts', text: fileA },
        { uri: 'file:///src/b.ts', text: fileB },
      ],
      baseInput({
        moves: [
          { ref: 'U2', dx: 1, dy: 1 }, // literal lives in file B (rewrite)
          { ref: 'C9', dx: 1, dy: 1 }, // declared in file A, never placed (INSERT)
          { ref: 'ZZ', dx: 1, dy: 1 }, // no variable declared anywhere (skip)
        ],
        variableOf: (ref) => ({ U2: 'u2', C9: 'a', ZZ: 'zz' })[ref],
      }),
    );
    expect(plan.counts.moves).toBe(2);
    expect(texts.get('file:///src/b.ts')).toContain('u2.pcb = { x: 4, y: 5 }');
    expect(texts.get('file:///src/a.ts')).toContain('a.pcb = { x: 1, y: 1 };');
    expect(plan.skipped).toEqual(['ZZ (no `zz.pcb = {…}` literal found)']);
  });

  it('matches texts per file and reports unmatched ones even with several files', () => {
    const fileA = "typecad.text({ text: 'a', x: 1, y: 1 });\n";
    const fileB = "typecad.text({ text: 'b', x: 2, y: 2 });\n";
    const { plan, texts } = run(
      [
        { uri: 'file:///src/a.ts', text: fileA },
        { uri: 'file:///src/b.ts', text: fileB },
      ],
      baseInput({
        texts: [
          { text0: 'a', x0: 1, y0: 1, text: 'A!', x: 1, y: 1, rot: 0 },
          { text0: 'b', x0: 2, y0: 2, text: 'B!', x: 2, y: 2, rot: 0 },
          { text0: 'missing', x0: 9, y0: 9, text: 'x', x: 9, y: 9, rot: 0 },
        ],
      }),
    );
    expect(texts.get('file:///src/a.ts')).toContain("text: 'A!'");
    expect(texts.get('file:///src/b.ts')).toContain("text: 'B!'");
    expect(plan.counts.texts).toBe(2);
    expect(plan.skipped).toEqual(['text "missing" (no .text({…}) literal matches its authored value/anchor)']);
  });

  it('converts labels against the already-applied placement (no double delta)', () => {
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: project() }],
      baseInput({
        moves: [{ ref: 'R1', dx: 2, dy: 0 }],
        labels: [{ ref: 'R1', kind: 'reference', x: 13, y: 11, rot: 0 }],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    // part ends at (12, 10): the label is +1,+1 in footprint-local space
    expect(out).toContain('referenceLayout: { x: 1, y: 1, rotation: 0 }');
    expect(plan.counts).toMatchObject({ moves: 1, labels: 1 });
  });

  it('moves a sticky endpoint inside a route block the delete stage rewrote', () => {
    // the delete rewrites vcc's block; the endpoint edit must land on the
    // REGENERATED .from literal — sequential stages keep the offsets honest
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: project() }],
      baseInput({
        moves: [{ ref: 'R1', dx: 2, dy: 1, pads: [{ x: 10.5, y: 10 }] }],
        deletes: [{ net: 'VCC', x1: 25, y1: 10, x2: 30, y2: 10, layer: 'F.Cu' }],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    expect(out).toContain('.from({ x: 12.5, y: 11 }');
    expect(out).not.toContain('.to({ x: 30, y: 10');
    expect(plan.counts).toMatchObject({ moves: 1, endpoints: 1, deletes: 1 });
  });

  it('plans nothing (and reports why) when nothing matches', () => {
    const { plan } = run([{ uri: 'file:///src/board.ts', text: project() }], baseInput());
    expect(plan.stages).toEqual([]);
    expect(plan.touched).toEqual([]);
    expect(plan.counts).toMatchObject({ moves: 0, endpoints: 0, texts: 0, values: 0, labels: 0, renames: 0, routes: 0, deletes: 0 });
  });

  it('re-creates a declared route the argument rewrite dropped', () => {
    // regression: a multi-route rewrite once dropped an UNTOUCHED route's
    // name from create() while its declaration survived — the route built
    // nothing and its copper silently vanished from the board. Any
    // route/delete apply must heal that drift.
    const src = `import { PCB, Component, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const vcc = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 10.5, y: 10 }, 'F.Cu', 0.3)
  .to({ x: 20, y: 10, layer: 'F.Cu', width: 0.3 });
const gnd = new TrackBuilder(typecad, { net: 'GND', })
  .from({ x: 30, y: 10 }, 'F.Cu', 0.3)
  .to({ x: 35, y: 10, layer: 'F.Cu', width: 0.3 });
typecad.create(vcc);
`;
    const { plan, texts } = run(
      [{ uri: 'file:///src/board.ts', text: src }],
      baseInput({
        deletes: [{ net: 'VCC', x1: 10.5, y1: 10, x2: 20, y2: 10, layer: 'F.Cu' }],
      }),
    );
    const out = texts.get('file:///src/board.ts')!;
    expectValidTs(out);
    // vcc emptied out of the delete — but gnd, untouched, must end up (or
    // stay) in create(): the guard re-adds what the rewrite dropped
    expect(out).toMatch(/typecad\.create\((?:[^)]*\b)?gnd\b/);
    expect(out).not.toMatch(/typecad\.create\([^)]*\bvcc\b/);
    expect(plan.counts.deletes).toBe(1);
  });
});
