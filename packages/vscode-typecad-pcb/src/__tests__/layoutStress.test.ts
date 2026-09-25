// Stress coverage for the layout→code sync: adversarial source shapes and
// gesture combos that historically corrupted output or silently no-opped —
// CRLF checkouts, exported route modules, comments in create() args and
// inside chains, mid-piece vias, many-way splits, overlapping routes, and
// the cross-file routes/create split. Every scenario must leave source that
// still parses (expectValidTs).
import { describe, expect, it } from 'vitest';
import { planRouteDeletes, planRouteEdits, type RouteInput } from '../routeEdits.js';
import { planLayoutApply } from '../layoutApply.js';
import { expectValidTs } from './helpers/valid_source.js';

const apply = (text: string, edits: Array<{ start: number; end: number; line: string }>): string => {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.line + out.slice(e.end);
  return out;
};

const runApply = (files: Array<{ uri: string; text: string }>, input: Parameters<typeof planLayoutApply>[1]) => {
  const plan = planLayoutApply(files, input);
  const texts = new Map(files.map((f) => [f.uri, f.text]));
  for (const stage of plan.stages) {
    for (const b of stage) {
      texts.set(b.uri, apply(texts.get(b.uri)!, b.edits));
    }
  }
  return { plan, texts };
};

describe('layout→code sync stress', () => {
  it('deletes segments from a CRLF source (Windows autocrlf checkout)', () => {
    const crlf =
      "import { TrackBuilder } from '@typecad/pcb';\r\n" +
      'const route1 = new TrackBuilder(typecad, {  })\r\n' +
      "  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)\r\n" +
      "  .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })\r\n" +
      "  .to({ x: 3, y: 1, layer: 'F.Cu', width: 0.3 });\r\n" +
      'typecad.create(\r\n' +
      '  route1,\r\n' +
      ');\r\n';
    const { edits, applied } = planRouteDeletes(crlf, [{ net: null, x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' }]);
    expect(applied).toBe(1);
    const out = apply(crlf, edits);
    expectValidTs(out);
    expect(out).toContain(".to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 });");
    expect(out).not.toContain('{ x: 3, y: 1');
  });

  it('adds a route without doubling commas past a trailing comment in create()', () => {
    const src =
      "import { TrackBuilder } from '@typecad/pcb';\n" +
      "const r1 = new Component({ reference: 'R1' });\n" +
      'typecad.create(\n  r1, // main part\n);\n';
    const { edits } = planRouteEdits(src, [
      { net: 'GND', w: 0.3, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], vias: [], from: { ref: 'R1', pin: '1' }, to: null },
    ]);
    const out = apply(src, edits);
    expectValidTs(out);
    expect(out).toMatch(/r1, route1 \/\/ main part/);
    expect(out).not.toMatch(/,\s*,/);
  });

  it('keeps its chain through comments and blank lines, then deletes cleanly', () => {
    const noisy =
      "const bus = new TrackBuilder(typecad, { net: 'D0', })\n" +
      "  .from({ x: 0, y: 0 }, 'F.Cu', 0.2)\n" +
      '  // data lines; keep tight\n' +
      "  .to({ x: 1, y: 0, layer: 'F.Cu', width: 0.2 })\n" +
      '\n' +
      '  /* clock stretch */\n' +
      "  .to({ x: 2, y: 0, layer: 'F.Cu', width: 0.2 });\n" +
      'typecad.create(bus);\n';
    const { applied } = planRouteDeletes(noisy, [{ net: 'D0', x1: 1, y1: 0, x2: 2, y2: 0, layer: 'F.Cu' }]);
    expect(applied).toBe(1); // the ';' inside the comment must not have truncated the chain
    const out = apply(noisy, planRouteDeletes(noisy, [{ net: 'D0', x1: 1, y1: 0, x2: 2, y2: 0, layer: 'F.Cu' }]).edits);
    expectValidTs(out);
    expect(out).toContain(".to({ x: 1, y: 0, layer: 'F.Cu', width: 0.2 });");
  });

  it('emits a via recorded mid-piece (not only at piece boundaries)', () => {
    const src = "import { TrackBuilder } from '@typecad/pcb';\ntypecad.create(r1);\n";
    const { edits } = planRouteEdits(src, [
      { net: null, w: 0.3, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }], vias: [{ x: 1, y: 0 }], from: { ref: 'R1', pin: '1' }, to: null },
    ]);
    const out = apply(src, edits);
    expectValidTs(out);
    expect(out).toContain('.via({ size: 0.6, drill: 0.3 })');
  });

  it('parses exported route declarations and keeps splits exported', () => {
    const src = () =>
      "export const pwr = new TrackBuilder(typecad, { net: 'VCC', })\n" +
      "  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)\n" +
      "  .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })\n" +
      "  .to({ x: 3, y: 1, layer: 'F.Cu', width: 0.3 })\n" +
      "  .to({ x: 4, y: 1, layer: 'F.Cu', width: 0.3 });\n" +
      'typecad.create(pwr);\n';
    const del = { net: 'VCC', x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' }; // middle segment
    const { applied } = planRouteDeletes(src(), [del]);
    expect(applied).toBe(1);
    const out = apply(src(), planRouteDeletes(src(), [del]).edits);
    expectValidTs(out);
    expect(out.match(/export const/g)).toHaveLength(2);
    expect(out).toContain('export const pwra = new TrackBuilder');
  });

  it('maintains create() across files: emptied route drops out, split half rides in', () => {
    const routesTs = () =>
      "import { TrackBuilder } from '@typecad/pcb';\n" +
      "export const pwr = new TrackBuilder(typecad, { net: 'VCC', })\n" +
      "  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)\n" +
      "  .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 });\n" +
      "export const gnd = new TrackBuilder(typecad, { net: 'GND', })\n" +
      "  .from({ x: 5, y: 5 }, 'F.Cu', 0.3)\n" +
      "  .to({ x: 6, y: 5, layer: 'F.Cu', width: 0.3 })\n" +
      "  .to({ x: 7, y: 5, layer: 'F.Cu', width: 0.3 })\n" +
      "  .to({ x: 8, y: 5, layer: 'F.Cu', width: 0.3 });\n";
    const mainTs = () => "import { pwr, gnd } from './routes.js';\ntypecad.create(\n  pwr,\n  gnd,\n);\n";
    const { plan, texts } = runApply(
      [
        { uri: 'file:///src/routes.ts', text: routesTs() },
        { uri: 'file:///src/main.ts', text: mainTs() },
      ],
      {
        moves: [],
        variableOf: () => undefined,
        allRefs: new Set(),
        deletes: [
          { net: 'VCC', x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' }, // empties pwr
          { net: 'GND', x1: 6, y1: 5, x2: 7, y2: 5, layer: 'F.Cu' }, // splits gnd
        ],
      },
    );
    const routes = texts.get('file:///src/routes.ts')!;
    const main = texts.get('file:///src/main.ts')!;
    expectValidTs(routes);
    expectValidTs(main);
    expect(routes).not.toContain('const pwr');
    expect(routes).toContain('export const gnd');
    expect(routes).toContain('export const gnda');
    // create() AND the import in the other file: pwr gone everywhere, gnda in
    expect(main).not.toContain('pwr');
    expect(main).toMatch(/import \{ gnd, gnda \} from '\.\/routes\.js';/);
    expect(main).toMatch(/create\(\s*gnd,\s*gnda/);
    expect(plan.counts.deletes).toBe(2);
    expect(plan.skipped).toEqual([]);
  });

  it('splits one route into five runs with unique, sequential names', () => {
    const pts = Array.from({ length: 9 }, (_, i) => `  .to({ x: ${i}, y: 1, layer: 'F.Cu', width: 0.3 })`).join('\n');
    const many = `const route1 = new TrackBuilder(typecad, {  })\n  .from({ x: -1, y: 1 }, 'F.Cu', 0.3)\n${pts};\ntypecad.create(route1);\n`;
    const dels = [0, 2, 4, 6].map((i) => ({ net: null, x1: i, y1: 1, x2: i + 1, y2: 1, layer: 'F.Cu' }));
    const { applied } = planRouteDeletes(many, dels);
    expect(applied).toBe(4);
    const out = apply(many, planRouteDeletes(many, dels).edits);
    expectValidTs(out);
    expect(out).toMatch(/create\(route1, route1a, route1b, route1c, route1d\)/);
  });

  it('matches diagonal segments in either orientation', () => {
    const src =
      "const d = new TrackBuilder(typecad, {  })\n" +
      "  .from({ x: 0, y: 0 }, 'F.Cu', 0.3)\n" +
      "  .to({ x: 1, y: 1, layer: 'F.Cu', width: 0.3 });\n" +
      'typecad.create(d);\n';
    // reversed orientation: the page reports the segment b->a
    const { applied, edits } = planRouteDeletes(src, [{ net: null, x1: 1, y1: 1, x2: 0, y2: 0, layer: 'F.Cu' }]);
    expect(applied).toBe(1);
    const out = apply(src, edits);
    expectValidTs(out);
    expect(out).not.toContain('{ x: 1, y: 1');
  });

  it('truncates BOTH routes when two overlap the deleted coordinates (no corruption)', () => {
    const src = () =>
      "const a = new TrackBuilder(typecad, { net: 'A', })\n" +
      "  .from({ x: 0, y: 0 }, 'F.Cu', 0.3)\n" +
      "  .to({ x: 1, y: 0, layer: 'F.Cu', width: 0.3 });\n" +
      "const b = new TrackBuilder(typecad, { net: 'B', })\n" +
      "  .from({ x: 0, y: 0 }, 'B.Cu', 0.3)\n" +
      "  .to({ x: 1, y: 0, layer: 'B.Cu', width: 0.3 });\n" +
      'typecad.create(a, b);\n';
    const { applied } = planRouteDeletes(src(), [{ net: 'A', x1: 0, y1: 0, x2: 1, y2: 0, layer: 'F.Cu' }]);
    expect(applied).toBe(1);
    const out = apply(src(), planRouteDeletes(src(), [{ net: 'A', x1: 0, y1: 0, x2: 1, y2: 0, layer: 'F.Cu' }]).edits);
    expectValidTs(out);
    expect(out).not.toContain('typecad.create(a, b)'); // both emptied routes left create()
  });

  it('preserves custom via args through a delete not adjacent to the via', () => {
    const src = () =>
      "const g = new TrackBuilder(typecad, { net: 'GND', })\n" +
      "  .from({ x: 0, y: 0 }, 'F.Cu', 0.3)\n" +
      "  .to({ x: 1, y: 0, layer: 'F.Cu', width: 0.3 })\n" +
      "  .via({ size: 0.8, drill: 0.4, layers: ['F.Cu','B.Cu'] })\n" +
      "  .to({ x: 1, y: 3, layer: 'B.Cu', width: 0.3 })\n" +
      "  .to({ x: 2, y: 3, layer: 'B.Cu', width: 0.3 });\n" +
      'typecad.create(g);\n';
    // deleting the last segment leaves the via INTERIOR to the surviving run
    const out = apply(src(), planRouteDeletes(src(), [{ net: 'GND', x1: 1, y1: 3, x2: 2, y2: 3, layer: 'B.Cu' }]).edits);
    expectValidTs(out);
    expect(out).toContain(".via({ size: 0.8, drill: 0.4, layers: ['F.Cu','B.Cu'] })");
    expect(out).toContain(".to({ x: 1, y: 3, layer: 'B.Cu', width: 0.3 });");
  });

  it('skips (and says why) when the create()-owning file has no TrackBuilder in scope', () => {
    const src = "const r1 = new Component({ reference: 'R1' });\ntypecad.create(r1);\n";
    const { edits, skipped } = planRouteEdits(src, [
      { net: null, w: 0.3, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }], vias: [], from: { ref: 'R1', pin: '1' }, to: null },
    ]);
    expect(edits).toHaveLength(0);
    expect(skipped.join(' ')).toContain('TrackBuilder is not in scope');
    expect(src).toBe("const r1 = new Component({ reference: 'R1' });\ntypecad.create(r1);\n");
  });

  it('round-trips: a route added by apply is deletable by the next apply', () => {
    const base = "import { TrackBuilder } from '@typecad/pcb';\nconst r1 = new Component({ reference: 'R1' });\ntypecad.create(r1);\n";
    const route: RouteInput = {
      net: 'VCC',
      w: 0.3,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] }],
      vias: [],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const added = apply(base, planRouteEdits(base, [route]).edits);
    expectValidTs(added);
    // delete a MIDDLE segment of exactly what was generated
    const del = { net: 'VCC', x1: 1, y1: 0, x2: 2, y2: 0, layer: 'F.Cu' };
    const { applied } = planRouteDeletes(added, [del]);
    expect(applied).toBe(1);
    const split = apply(added, planRouteDeletes(added, [del]).edits);
    expectValidTs(split);
    expect(split.match(/net: 'VCC'/g)).toHaveLength(2); // both halves keep the net
    expect(split).toMatch(/create\(\s*r1,\s*route1,?\s*route1a/);
  });
});
