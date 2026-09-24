// Source deletion planning: deleted segments remove .to() runs, middle
// breaks split the route, emptied routes vanish with their create() arg.
import { describe, expect, it } from 'vitest';
import { planRouteDeletes } from '../routeEdits.js';

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
    expect(out).toContain('.to({ x: 3, y: 1, layer: \'F.Cu\', width: 0.3 });');
    expect(out).not.toContain('{ x: 4, y: 1');
    expect(out).toContain('route1,');
  });

  it('splits the route when a MIDDLE segment is deleted (real gap, no bridge)', () => {
    const { edits, applied } = planRouteDeletes(src(), [
      { net: null, x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(1);
    const out = apply(src(), edits);
    expect(out).toContain('const route1 = new TrackBuilder');
    expect(out).toContain('const route1a = new TrackBuilder');
    expect(out).toMatch(/route1,\s*,\s*route1a/);
    // first run: 1,1 -> 2,1; second: 3,1 -> 4,1
    expect(out).toContain('.from({ x: 1, y: 1 }, \'F.Cu\', 0.3)');
    expect(out).toContain('.to({ x: 2, y: 1, layer: \'F.Cu\', width: 0.3 });');
    expect(out).toContain('.from({ x: 3, y: 1 }, \'F.Cu\', 0.3)');
    expect(out).toContain('.to({ x: 4, y: 1, layer: \'F.Cu\', width: 0.3 });');
  });

  it('removes the route and its create() argument when everything is deleted', () => {
    const { edits, applied } = planRouteDeletes(src(), [
      { net: null, x1: 1, y1: 1, x2: 2, y2: 1, layer: 'F.Cu' },
      { net: null, x1: 2, y1: 1, x2: 3, y2: 1, layer: 'F.Cu' },
      { net: null, x1: 3, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' },
    ]);
    expect(applied).toBe(3);
    const out = apply(src(), edits);
    expect(out).not.toContain('const route1');
    expect(out).not.toMatch(/route1/);
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
    expect(out).toContain('.to({ x: 2, y: 1, layer: \'F.Cu\', width: 0.3 });');
    expect(out).toContain('const route1a = new TrackBuilder');
    expect(out).toContain('.from({ x: 3, y: 1 }, \'F.Cu\', 0.3)');
    expect(out).toContain('.to({ x: 4, y: 1, layer: \'F.Cu\', width: 0.3 });');
  });

  it('drops the last segment when the via is the chain tail', () => {
    const { edits, applied } = planRouteDeletes(src(), [
      { kind: 'via', net: null, x1: 4, y1: 1, x2: 4, y2: 1, layer: null },
    ]);
    expect(applied).toBe(1);
    const out = apply(src(), edits);
    expect(out).toContain('.to({ x: 3, y: 1, layer: \'F.Cu\', width: 0.3 });');
    expect(out).not.toContain('{ x: 4, y: 1');
  });
});
