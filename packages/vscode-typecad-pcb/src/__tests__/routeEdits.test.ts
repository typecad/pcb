// Route apply: committed interactive routes plan TrackBuilder source edits.
import { describe, expect, it } from 'vitest';
import { planRouteEdits, type RouteInput } from '../routeEdits.js';

const src = (tail = '') => `
import { PCB, Component, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const r1 = new Component({ reference: 'R1' });
r1.pcb = { x: 10, y: 10 };
typecad.create(
  r1,
);${tail}`;

describe('planRouteEdits', () => {
  it('plans a declaration + create()-arg insertion for a single-layer route', () => {
    const route: RouteInput = {
      net: 'VCC',
      w: 0.3,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 5 }] }],
      vias: [],
      from: { ref: 'R1', pin: '1' },
      to: { ref: 'C1', pin: '1' },
    };
    const { edits, skipped } = planRouteEdits(src(), [route]);
    expect(skipped).toEqual([]);
    expect(edits).toHaveLength(2);
    // apply the edits to the text (start order: later first)
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expect(text).toContain("const route1 = new TrackBuilder(typecad, { net: 'VCC',  })");
    expect(text).toContain('.from({ x: 1, y: 2, layer: \'F.Cu\' }, 0.3)');
    expect(text).toContain(".to({ x: 3, y: 2 }, 'F.Cu', 0.3)");
    expect(text).toContain(".to({ x: 3, y: 5 }, 'F.Cu', 0.3);");
    // the variable rides into create()
    expect(text).toMatch(/typecad\.create\(\s*r1,\s*route1,?\s*\);/);
    expect(text.indexOf('const route1')).toBeLessThan(text.indexOf('typecad.create('));
  });

  it('drops a via between layers', () => {
    const route: RouteInput = {
      net: null,
      w: 0.3,
      pieces: [
        { layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 1 }] },
        { layer: 'B.Cu', pts: [{ x: 2, y: 1 }, { x: 2, y: 4 }] },
      ],
      vias: [{ x: 2, y: 1 }],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const { edits, skipped } = planRouteEdits(src(), [route]);
    expect(skipped).toEqual([]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expect(text).toContain(".to({ x: 2, y: 1 }, 'F.Cu', 0.3)");
    expect(text).toContain('.via({ size: 0.6, drill: 0.3 })');
    expect(text).toContain(".to({ x: 2, y: 4 }, 'B.Cu', 0.3);");
  });

  it('numbers new routes past existing ones and skips empty geometry', () => {
    const route2: RouteInput = { net: 'GND', w: 0.55, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], vias: [], from: { ref: 'A', pin: '1' }, to: null };
    const empty: RouteInput = { net: 'X', w: 0.3, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }] }], vias: [], from: { ref: 'B', pin: '1' }, to: null };
    const pre = src().replace('typecad.create(', 'const route1 = 0;\ntypecad.create(');
    const { edits, skipped } = planRouteEdits(pre, [empty, route2]);
    expect(skipped).toEqual(['B.1 (no geometry)']);
    let text = pre;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expect(text).toContain('const route2 = new TrackBuilder');
    expect(text).not.toContain('const route3');
  });

  it('reports a skip when there is no create() call', () => {
    const { edits, skipped } = planRouteEdits('const x = 1;', [
      { net: 'A', w: 0.3, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }], vias: [], from: { ref: 'A', pin: '1' }, to: null },
    ]);
    expect(edits).toHaveLength(0);
    expect(skipped[0]).toContain('no typecad.create(');
  });
});
