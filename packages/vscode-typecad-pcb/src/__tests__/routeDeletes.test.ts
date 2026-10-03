// Source deletion planning: deleted segments remove .to() runs, middle
// breaks split the route, emptied routes vanish with their create() arg —
// and the source that comes out still parses (see expectValidTs).
import { describe, expect, it } from 'vitest';
import { planRouteDeletes, planRouteEdits } from '../routeEdits.js';
import { expectValidTs } from './helpers/valid_source.js';

const src = () => `
import { PCB, Component, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const route1 = new TrackBuilder(typecad, {  })
  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })
  .to({ x: 3, y: 1, layer: 'F.Cu', width: 0.3 })
  .to({ x: 4, y: 1, layer: 'F.Cu', width: 0.3 });
typecad.create(
  r1,
  route1,
);`;

const nettedSrc = () => `
const route1 = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })
  .to({ x: 3, y: 1, layer: 'F.Cu', width: 0.3 })
  .to({ x: 4, y: 1, layer: 'F.Cu', width: 0.3 });
typecad.create(
  r1,
  route1,
);`;

const viaSrc = () => `
const route1 = new TrackBuilder(typecad, { net: 'GND', })
  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })
  .via({ size: 0.6, drill: 0.3 })
  .to({ x: 2, y: 4, layer: 'B.Cu', width: 0.3 })
  .to({ x: 3, y: 4, layer: 'B.Cu', width: 0.3 });
typecad.create(
  route1,
);`;

const apply = (text: string, edits: Array<{ start: number; end: number; line: string }>): string => {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.line + out.slice(e.end);
  }
  return out;
};

describe('planRouteDeletes', () => {
  it('shortens the route when an END segment is deleted', () => {
    const { edits, applied } = planRouteDeletes(src(), [
      { net: null, x1: 3, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(1);
    const out = apply(src(), edits);
    expectValidTs(out);
    expect(out).toContain(".to({ x: 3, y: 1, layer: 'F.Cu', width: 0.3 });");
    expect(out).not.toContain('{ x: 4, y: 1');
    expect(out).toContain('route1,');
  });

  it('splits the route when a MIDDLE segment is deleted (real gap, no bridge)', () => {
    const { edits, applied } = planRouteDeletes(src(), [
      { net: null, x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(1);
    const out = apply(src(), edits);
    expectValidTs(out);
    expect(out).toContain('const route1 = new TrackBuilder');
    expect(out).toContain('const route1a = new TrackBuilder');
    // the split variable rides into create() — with ONE comma, not a double
    expect(out).toMatch(/route1,\s*route1a/);
    expect(out).not.toMatch(/,\s*,/);
    // first run: 1,1 -> 2,1; second: 3,1 -> 4,1
    expect(out).toContain(".from({ x: 1, y: 1 }, 'F.Cu', 0.3)");
    expect(out).toContain(".to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 });");
    expect(out).toContain(".from({ x: 3, y: 1 }, 'F.Cu', 0.3)");
    expect(out).toContain(".to({ x: 4, y: 1, layer: 'F.Cu', width: 0.3 });");
  });

  it('removes the route and its create() argument when everything is deleted', () => {
    const { edits, applied } = planRouteDeletes(src(), [
      { net: null, x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' },
      { net: null, x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
      { net: null, x1: 3, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(3);
    const out = apply(src(), edits);
    expectValidTs(out);
    expect(out).not.toContain('const route1');
    expect(out).not.toMatch(/route1/);
    // the argument slot is gone entirely — no emptied `()` expression left behind
    expect(out).not.toContain('()');
  });

  it('reports unmatched segments instead of mangling the source', () => {
    const { edits, applied, skipped } = planRouteDeletes(src(), [
      { net: null, x1: 100, y1: 100, x2: 101, y2: 100, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(0);
    expect(edits).toHaveLength(0);
    expect(skipped.join(' ')).toContain('matched no source route');
  });

  it('truncates the chain after a via when kind:via deletes its point', () => {
    // via sits at the piece boundary (2,1): the segment LEAVING it is cut.
    // The regenerated runs carry no vias, so the barrel is gone from
    // source; the far side survives as its own dangling route
    const { edits, applied } = planRouteDeletes(src(), [
      { kind: 'via', net: null, x1: 2, y1: 1, x2: 2, y2: 1, layer: null },
    ]);
    expect(applied).toBe(1);
    const out = apply(src(), edits);
    expectValidTs(out);
    expect(out).toContain(".to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 });");
    expect(out).toContain('const route1a = new TrackBuilder');
    expect(out).toContain(".from({ x: 3, y: 1 }, 'F.Cu', 0.3)");
    expect(out).toContain(".to({ x: 4, y: 1, layer: 'F.Cu', width: 0.3 });");
  });

  it('keeps a .powerInfo contract through a delete-regenerated chain', () => {
    const src = () =>
      "const pwr = new TrackBuilder(typecad, { net: 'VCC', })\n" +
      '  .powerInfo({ current: 1.5, maxTempRise: 10 })\n' +
      "  .from({ x: 0, y: 0 }, 'F.Cu', 0.55)\n" +
      "  .to({ x: 4, y: 0, layer: 'F.Cu', width: 0.55 })\n" +
      "  .to({ x: 8, y: 0, layer: 'F.Cu', width: 0.55 });\n" +
      'typecad.create(pwr);\n';
    const del = { net: 'VCC', x1: 4, y1: 0, x2: 8, y2: 0, layer: 'F.Cu' }; // end delete
    const { applied } = planRouteDeletes(src(), [del]);
    expect(applied).toBe(1); // the powerInfo line must not have truncated the chain
    const out = apply(src(), planRouteDeletes(src(), [del]).edits);
    expectValidTs(out);
    expect(out).toContain('.powerInfo({ current: 1.5, maxTempRise: 10 })');
  });

  it('drops the last segment when the via is the chain tail', () => {
    const { edits, applied } = planRouteDeletes(src(), [
      { kind: 'via', net: null, x1: 4, y1: 1, x2: 4, y2: 1, layer: null },
    ]);
    expect(applied).toBe(1);
    const out = apply(src(), edits);
    expectValidTs(out);
    expect(out).toContain(".to({ x: 3, y: 1, layer: 'F.Cu', width: 0.3 });");
    expect(out).not.toContain('{ x: 4, y: 1');
  });

  it('preserves the route net when a segment delete splits it', () => {
    const { edits } = planRouteDeletes(nettedSrc(), [
      { net: 'VCC', x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
    ]);
    const out = apply(nettedSrc(), edits);
    expectValidTs(out);
    // BOTH surviving halves keep the net — netless copper would disconnect
    // the route on rebuild
    expect(out.match(/new TrackBuilder\(typecad, \{ net: 'VCC', \}\)/g)).toHaveLength(2);
  });

  it('preserves an untouched via and its per-point layer when another segment is deleted', () => {
    // delete the LAST segment (2,4)->(3,4): the via at (2,1) and the B.Cu
    // run leading to it survive intact
    const { edits } = planRouteDeletes(viaSrc(), [
      { net: 'GND', x1: 2, y1: 4, x2: 3, y2: 4, layer: 'B.Cu' },
    ]);
    const out = apply(viaSrc(), edits);
    expectValidTs(out);
    expect(out).toContain('.via({ size: 0.6, drill: 0.3 })');
    expect(out).toContain(".to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })");
    expect(out).toContain(".to({ x: 2, y: 4, layer: 'B.Cu', width: 0.3 });");
    expect(out).toContain("{ net: 'GND', }");
  });

  it('keeps the far side of a split on its own layer', () => {
    // cut the B.Cu segment past the via: the far run (route1a) rebuilds as
    // its own B.Cu chain — not flattened onto whichever layer was parsed last
    const { edits } = planRouteDeletes(viaSrc(), [
      { net: 'GND', x1: 2, y1: 1, x2: 2, y2: 4, layer: 'B.Cu' },
    ]);
    const out = apply(viaSrc(), edits);
    expectValidTs(out);
    expect(out).toMatch(/const route1a = new TrackBuilder[\s\S]*?\.from\(\{ x: 2, y: 4 \}, 'B\.Cu'/);
    expect(out).toContain(".to({ x: 3, y: 4, layer: 'B.Cu', width: 0.3 });");
  });

  it('rides split names into create() even when another route was emptied in the same apply', () => {
    const both = () => `
const route1 = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 });
const route2 = new TrackBuilder(typecad, {  })
  .from({ x: 10, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 11, y: 1, layer: 'F.Cu', width: 0.3 })
  .to({ x: 12, y: 1, layer: 'F.Cu', width: 0.3 })
  .to({ x: 13, y: 1, layer: 'F.Cu', width: 0.3 });
typecad.create(
  route1,
  route2,
);`;
    const { edits } = planRouteDeletes(both(), [
      { net: 'VCC', x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' }, // empties route1
      { net: null, x1: 11, y1: 1, x2: 12, y2: 1, layer: 'F.Cu' }, // splits route2
    ]);
    const out = apply(both(), edits);
    expectValidTs(out);
    expect(out).toContain('const route2a = new TrackBuilder');
    expect(out).toMatch(/create\(\s*route2,\s*route2a/);
    expect(out).not.toContain('()');
    expect(out).not.toContain('route1');
  });

  it('emits a width-only run head in the object form (width must not land in the layer slot)', () => {
    // (5,0) carries a width but no layer: cutting the segment BEFORE it
    // makes that point the surviving run's .from — .from()'s second
    // parameter is the layer STRING, so a positional 0.5 would not compile
    const widthed = () => `
const route1 = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 0, y: 0 }, 'F.Cu', 0.3)
  .to({ x: 5, y: 0, width: 0.5 })
  .to({ x: 10, y: 0 })
  .to({ x: 15, y: 0 });
typecad.create(route1);`;
    const { edits } = planRouteDeletes(widthed(), [
      { net: 'VCC', x1: 0, y1: 0, x2: 5, y2: 0, layer: 'F.Cu' },
    ]);
    const out = apply(widthed(), edits);
    expectValidTs(out);
    expect(out).toContain('.from({ x: 5, y: 0, width: 0.5 })');
    expect(out).not.toContain('}, 0.5)');
  });

  it('keeps an indented route declaration indented through regeneration', () => {
    const indented = () => `
function build() {
  const route1 = new TrackBuilder(typecad, { net: 'VCC', })
    .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
    .to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })
    .to({ x: 3, y: 1, layer: 'F.Cu', width: 0.3 });
  typecad.create(route1);
}`;
    const { edits } = planRouteDeletes(indented(), [
      { net: 'VCC', x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' },
    ]);
    const out = apply(indented(), edits);
    expectValidTs(out);
    // the head line keeps the declaration's own indent (a column-0 rewrite
    // would still compile but silently reformat the user's code)
    expect(out).toContain('  const route1 = new TrackBuilder');
  });

  it('sees and regenerates chains authored with a width constant', () => {
    // the demo project's own style: .to({ x, y }, 'F.Cu', VCCW) — an
    // identifier width. Those chains must be deletable, and the constant
    // must survive regeneration instead of being flattened to its value
    const widthed = () => `
const VCCW = 0.3;
const trunk = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 1, y: 1 }, 'F.Cu', VCCW)
  .to({ x: 2, y: 1 }, 'F.Cu', VCCW)
  .to({ x: 3, y: 1 }, 'F.Cu', VCCW); // tail comment rides outside the chain
typecad.create(trunk);`;
    const { edits, applied } = planRouteDeletes(widthed(), [
      { net: 'VCC', x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(1);
    const out = apply(widthed(), edits);
    expectValidTs(out);
    expect(out).toContain(".from({ x: 2, y: 1 }, 'F.Cu', VCCW)");
    // .to points regenerate in the object form — the constant rides along
    expect(out).toContain(".to({ x: 3, y: 1, layer: 'F.Cu', width: VCCW })");
  });

  it('keeps end-of-line and in-chain comments through regeneration', () => {
    // the demo project's style: a `// R3 pin 1` note on the chain's final
    // line. Deleting an EARLIER segment must not eat it; the ';' rides
    // before the comment, not after it
    const noted = () => `
const trunk = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 1, y: 1 }, 'F.Cu', 0.3) // from the reg
  .to({ x: 2, y: 1 }, 'F.Cu', 0.3)
  // mid-chain note; even one with a ; inside
  .to({ x: 3, y: 1 }, 'F.Cu', 0.3); // R3 pin 1
typecad.create(trunk);`;
    const { edits } = planRouteDeletes(noted(), [
      { net: 'VCC', x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' },
    ]);
    const out = apply(noted(), edits);
    expectValidTs(out);
    // the deleted from-point's comment died with it; the run starts clean
    expect(out).toContain(".from({ x: 2, y: 1 }, 'F.Cu', 0.3)\n");
    expect(out).not.toContain('from the reg');
    expect(out).toContain('// mid-chain note; even one with a ; inside');
    // the terminator sits BEFORE the tail comment — after it, the ';' would
    // be swallowed into the comment
    expect(out).toMatch(/\.to\(\{ x: 3, y: 1[^)]*\}\); \/\/ R3 pin 1/);
  });

  it('drops a comment with the point it described (deleted copper)', () => {
    // both segments past point 3 die, so point 3 itself vanishes — its
    // comment describes copper that no longer exists and goes with it
    const noted = () => `
const trunk = new TrackBuilder(typecad, { net: 'VCC', })
  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 2, y: 1 }, 'F.Cu', 0.3)
  .to({ x: 3, y: 1 }, 'F.Cu', 0.3) // this run goes away
  .to({ x: 4, y: 1 }, 'F.Cu', 0.3);
typecad.create(trunk);`;
    const { edits } = planRouteDeletes(noted(), [
      { net: 'VCC', x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
      { net: 'VCC', x1: 3, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    const out = apply(noted(), edits);
    expectValidTs(out);
    expect(out).toContain(".to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 });");
    expect(out).not.toContain('this run goes away');
    expect(out).not.toContain('x: 3');
    expect(out).not.toContain('x: 4');
  });
});

describe('planRouteDeletes: push dialect (import-written copper)', () => {
  // the board import's form — one line per chain, per-net arrays, spread
  // into create(); this is what rd_skeleton's mod-ec.ts carries
  const pushSrc = (via = false) => `
import { PCB, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const track_VCC: TrackBuilder[] = [];
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 1, y: 1 }, "F.Cu", 0.3).to({ x: 2, y: 1, layer: "F.Cu", width: 0.3 }).to({ x: 3, y: 1, layer: "F.Cu", width: 0.3 }).to({ x: 4, y: 1, layer: "F.Cu", width: 0.3 })${via ? '.via({ size: 0.6, drill: 0.3 })' : ''});
typecad.create(
  ...track_VCC
);`;

  it('shortens a push chain when an END segment is deleted', () => {
    const { edits, applied, unmatched } = planRouteDeletes(pushSrc(), [
      { net: 'VCC', x1: 3, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(1);
    expect(unmatched).toEqual([]);
    const out = apply(pushSrc(), edits);
    expectValidTs(out);
    expect(out).toContain('.to({ x: 3, y: 1, layer: "F.Cu", width: 0.3 }));');
    expect(out).not.toContain('{ x: 4, y: 1');
    // the array and its spread stay — an emptied array contributes nothing
    expect(out).toContain('const track_VCC: TrackBuilder[] = [];');
    expect(out).toContain('...track_VCC');
  });

  it('splits a push chain when a MIDDLE segment is deleted', () => {
    const { edits, applied } = planRouteDeletes(pushSrc(), [
      { net: 'VCC', x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(1);
    const out = apply(pushSrc(), edits);
    expectValidTs(out);
    expect(out.match(/track_VCC\.push/g)).toHaveLength(2);
    expect(out).toContain('.to({ x: 2, y: 1, layer: "F.Cu", width: 0.3 }));');
    expect(out).toContain('track_VCC.push(typecad.track({ net: \'VCC\' }).from({ x: 3, y: 1 }, "F.Cu", 0.3).to({ x: 4, y: 1, layer: "F.Cu", width: 0.3 }));');
  });

  it('removes the whole statement when every segment is deleted', () => {
    const { edits, applied } = planRouteDeletes(pushSrc(), [
      { net: 'VCC', x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' },
      { net: 'VCC', x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
      { net: 'VCC', x1: 3, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(3);
    const out = apply(pushSrc(), edits);
    expectValidTs(out);
    expect(out).not.toContain('track_VCC.push');
    expect(out).toContain('const track_VCC: TrackBuilder[] = [];');
  });

  it('drops the trailing via when the tail segment dies, keeps it otherwise', () => {
    const tailGone = planRouteDeletes(pushSrc(true), [
      { net: 'VCC', x1: 3, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    const out1 = apply(pushSrc(true), tailGone.edits);
    expectValidTs(out1);
    expect(out1).not.toContain('.via(');
    const middleGone = planRouteDeletes(pushSrc(true), [
      { net: 'VCC', x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
    ]);
    const out2 = apply(pushSrc(true), middleGone.edits);
    expectValidTs(out2);
    expect(out2.match(/\.via\(/g)).toHaveLength(1);
    // the via rides only the statement that still ends at the chain's end
    expect(out2).toContain('.to({ x: 4, y: 1, layer: "F.Cu", width: 0.3 }).via({ size: 0.6, drill: 0.3 }));');
  });

  it('a via-kind delete at the chain tail drops the segment leading into it', () => {
    const { edits } = planRouteDeletes(pushSrc(), [
      { kind: 'via', net: 'VCC', x1: 4, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    const out = apply(pushSrc(), edits);
    expectValidTs(out);
    expect(out).toContain('.to({ x: 3, y: 1, layer: "F.Cu", width: 0.3 }));');
    expect(out).not.toContain('{ x: 4, y: 1');
  });

  it('tags an unmatched delete near push copper as near-source (stale-view drift)', () => {
    const { unmatched } = planRouteDeletes(pushSrc(), [
      { net: 'VCC', x1: 10, y1: 10, x2: 20, y2: 10, layer: 'F.Cu' },
      // an endpoint ON the push chain's copper — near, though no segment matches
      { net: 'VCC', x1: 2.05, y1: 1, x2: 20, y2: 10, layer: 'F.Cu' },
    ]);
    expect(unmatched).toHaveLength(2);
    expect((unmatched[0] as { nearSource?: boolean }).nearSource).toBe(false);
    expect((unmatched[1] as { nearSource?: boolean }).nearSource).toBe(true);
  });

  it('an unmatched delete far from any push copper is not near-source', () => {
    const { unmatched } = planRouteDeletes(pushSrc(), [
      { net: 'GND', x1: 50, y1: 50, x2: 60, y2: 50, layer: 'F.Cu' },
    ]);
    expect((unmatched[0] as { nearSource?: boolean }).nearSource).toBe(false);
  });
});

describe('corridor idempotency across dialects', () => {
  it('treats an import-written push chain as an existing corridor on its net', () => {
    const src = `
import { PCB, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const track_VCC: TrackBuilder[] = [];
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 1, y: 1 }, "F.Cu", 0.3).to({ x: 4, y: 1, layer: "F.Cu", width: 0.3 }));
typecad.create(
  ...track_VCC
);`;
    const { edits, applied, skipped } = planRouteEdits(src, [
      {
        net: 'VCC',
        w: 0.3,
        pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 4, y: 1 }] }],
        vias: [],
        from: { ref: 'U1', pin: '1' },
        to: null,
      },
    ]);
    expect(applied).toBe(0);
    expect(edits).toEqual([]);
    expect(skipped.some((s) => s.includes('already connects those endpoints'))).toBe(true);
  });
});

describe('push dialect: unnamed chains', () => {
  it('matches and deletes copper on a no-options typecad.track() chain', () => {
    // the import writes unnamed-nets copper with an empty options list —
    // exactly the form rd_skeleton's mod-ec.ts carries
    const src = `
import { PCB, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const unnamed_Track: TrackBuilder[] = [];
unnamed_Track.push(typecad.track().from({ x: 133.6, y: 80.025 }, "F.Cu", 0.15).to({ x: 134.425, y: 79.2, layer: "F.Cu", width: 0.15 }));
typecad.create(
  ...unnamed_Track
);`;
    const { edits, applied, unmatched } = planRouteDeletes(src, [
      { net: null, x1: 133.6, y1: 80.025, x2: 134.425, y2: 79.2, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(1);
    expect(unmatched).toEqual([]);
    const out = apply(src, edits);
    expectValidTs(out);
    expect(out).not.toContain('unnamed_Track.push');
    expect(out).toContain('const unnamed_Track: TrackBuilder[] = [];');
    expect(out).toContain('...unnamed_Track');
  });
});
