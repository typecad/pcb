// Route apply: committed interactive routes plan TrackBuilder source edits.
import { describe, expect, it } from 'vitest';
import { planRouteEdits, type RouteInput } from '../routeEdits.js';
import { expectValidTs } from './helpers/valid_source.js';

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
    const { edits, skipped, applied } = planRouteEdits(src(), [route]);
    expect(skipped).toEqual([]);
    expect(applied).toBe(1);
    // create( sits at column 0 here: the declaration insert and the args
    // rewrite fold into ONE edit so they can never overlap
    expect(edits).toHaveLength(1);
    // apply the edits to the text (start order: later first)
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).toContain("const route1 = new TrackBuilder(typecad, { net: 'VCC',  })");
    expect(text).toContain(".from({ x: 1, y: 2 }, 'F.Cu', 0.3)");
    expect(text).toContain(".to({ x: 3, y: 2, layer: 'F.Cu', width: 0.3 })");
    expect(text).toContain(".to({ x: 3, y: 5, layer: 'F.Cu', width: 0.3 });");
    // the variable rides into create()
    expect(text).toMatch(/typecad\.create\(\s*r1,\s*route1,?\s*\);/);
    expect(text.indexOf('const route1')).toBeLessThan(text.indexOf('typecad.create('));
  });

  it('escapes an apostrophe in the net name instead of breaking the literal', () => {
    const route: RouteInput = {
      net: "VCC'",
      w: 0.3,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 2 }, { x: 3, y: 2 }] }],
      vias: [],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const { edits } = planRouteEdits(src(), [route]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).toContain("net: 'VCC\\''");
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
    expectValidTs(text);
    expect(text).toContain(".to({ x: 2, y: 1, layer: 'F.Cu', width: 0.3 })");
    expect(text).toContain('.via({ size: 0.6, drill: 0.3 })');
    expect(text).toContain(".to({ x: 2, y: 4, layer: 'B.Cu', width: 0.3 });");
  });

  it('emits no via at a piece boundary the route data has no via for', () => {
    const route: RouteInput = {
      net: null,
      w: 0.3,
      pieces: [
        { layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 1 }] },
        { layer: 'B.Cu', pts: [{ x: 2, y: 1 }, { x: 2, y: 4 }] },
      ],
      vias: [],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const { edits } = planRouteEdits(src(), [route]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).not.toContain('.via(');
  });

  it('carries the route\u2019s own via sizing through to the source', () => {
    const route: RouteInput = {
      net: 'GND',
      w: 0.8,
      pieces: [
        { layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 1 }] },
        { layer: 'B.Cu', pts: [{ x: 2, y: 1 }, { x: 2, y: 4 }] },
      ],
      vias: [{ x: 2, y: 1, size: 1.1, drill: 0.8 }],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const { edits } = planRouteEdits(src(), [route]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).toContain('.via({ size: 1.1, drill: 0.8 })');
  });

  it('notes the Z-key impedance solve in a comment above the declaration', () => {
    const route: RouteInput = {
      net: 'USB_DP',
      w: 0.36,
      pieces: [{ layer: 'F.Cu', w: 0.36, pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }] }],
      vias: [],
      impedance: { z0: 50 },
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const { edits } = planRouteEdits(src(), [route]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).toContain('// \u224850 \u03a9 controlled impedance (stackup solve)');
    // the comment rides above the declaration, not inside it
    const cAt = text.indexOf('// \u224850');
    const hAt = text.indexOf('new TrackBuilder');
    expect(cAt).toBeLessThan(hAt);
  });

  it('emits via layer spans for blind/buried vias, plain through stays bare', () => {
    const blind: RouteInput = {
      net: 'CLK',
      w: 0.3,
      pieces: [
        { layer: 'F.Cu', w: 0.3, pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
        { layer: 'In2.Cu', w: 0.3, pts: [{ x: 4, y: 0 }, { x: 4, y: 6 }] },
      ],
      vias: [{ x: 4, y: 0, layers: ['F.Cu', 'In2.Cu'] }],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const through: RouteInput = {
      net: 'CLK',
      w: 0.3,
      pieces: [
        { layer: 'F.Cu', w: 0.3, pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
        { layer: 'B.Cu', w: 0.3, pts: [{ x: 4, y: 0 }, { x: 4, y: 6 }] },
      ],
      vias: [{ x: 4, y: 0, layers: ['F.Cu', 'B.Cu'] }],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    let text = src();
    for (const e of [...planRouteEdits(src(), [blind]).edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).toContain(".via({ size: 0.6, drill: 0.3, layers: ['F.Cu', 'In2.Cu'] })");
    let text2 = src();
    for (const e of [...planRouteEdits(src(), [through]).edits].sort((a, b) => b.start - a.start)) {
      text2 = text2.slice(0, e.start) + e.line + text2.slice(e.end);
    }
    expectValidTs(text2);
    expect(text2).toContain('.via({ size: 0.6, drill: 0.3 })');
    expect(text2).not.toContain('layers:');
  });

  it('emits the P-key power contract as .powerInfo before the chain', () => {    const route: RouteInput = {
      net: 'VCC',
      w: 0.55,
      pieces: [{ layer: 'F.Cu', w: 0.55, pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }] }],
      vias: [],
      power: { current: 1.5012, maxTempRise: 10 },
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const { edits } = planRouteEdits(src(), [route]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).toContain('.powerInfo({ current: 1.5012, maxTempRise: 10 })');
    // the contract rides between the head and the geometry
    const headAt = text.indexOf('new TrackBuilder');
    const powerAt = text.indexOf('.powerInfo(');
    const fromAt = text.indexOf('.from(');
    expect(headAt).toBeLessThan(powerAt);
    expect(powerAt).toBeLessThan(fromAt);
  });

  it('emits per-piece widths for a tapered route (segment-by-segment sizing)', () => {
    const route: RouteInput = {
      net: 'VCC',
      w: 0.3, // chain default — every piece here overrides it
      pieces: [
        { layer: 'F.Cu', w: 0.3, pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
        { layer: 'F.Cu', w: 0.55, pts: [{ x: 5, y: 0 }, { x: 5, y: 8 }, { x: 9, y: 8 }] },
        { layer: 'F.Cu', pts: [{ x: 9, y: 8 }, { x: 12, y: 8 }] }, // falls back to r.w
      ],
      vias: [],
      from: { ref: 'R1', pin: '1' },
      to: null,
    };
    const { edits, applied } = planRouteEdits(src(), [route]);
    expect(applied).toBe(1);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    // the .from and every .to carry the width of the run they belong to
    expect(text).toContain(".from({ x: 0, y: 0 }, 'F.Cu', 0.3)");
    expect(text).toContain(".to({ x: 5, y: 0, layer: 'F.Cu', width: 0.3 })");
    expect(text).toContain(".to({ x: 5, y: 8, layer: 'F.Cu', width: 0.55 })");
    expect(text).toContain(".to({ x: 9, y: 8, layer: 'F.Cu', width: 0.55 })");
    expect(text).toContain(".to({ x: 12, y: 8, layer: 'F.Cu', width: 0.3 });"); // fallback
  });

  it('numbers new routes past existing ones and skips empty geometry', () => {
    const route2: RouteInput = { net: 'GND', w: 0.55, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], vias: [], from: { ref: 'A', pin: '1' }, to: null };
    const empty: RouteInput = { net: 'X', w: 0.3, pieces: [{ layer: 'F.Cu', pts: [{ x: 0, y: 0 }] }], vias: [], from: { ref: 'B', pin: '1' }, to: null };
    const pre = src().replace('typecad.create(', 'const route1 = 0;\ntypecad.create(');
    const { edits, skipped, applied } = planRouteEdits(pre, [empty, route2]);
    expect(skipped).toEqual(['B.1 (no geometry)']);
    expect(applied).toBe(1);
    let text = pre;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
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

  it('emits a via at the chain head — the resized far half starting at the barrel', () => {
    const route: RouteInput = {
      net: 'GND',
      w: 0.5,
      pieces: [{ layer: 'B.Cu', w: 0.5, pts: [{ x: 5, y: 5 }, { x: 8, y: 5 }] }],
      vias: [{ x: 5, y: 5, size: 0.9, drill: 0.5 }],
      from: { ref: '(resize)', pin: '' },
      to: null,
    };
    const { edits } = planRouteEdits(src(), [route]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    const fAt = text.indexOf('.from(');
    const vAt = text.indexOf('.via(');
    const tAt = text.indexOf('.to(');
    expect(vAt).toBeGreaterThan(fAt);
    expect(vAt).toBeLessThan(tAt);
    expect(text).toContain('.via({ size: 0.9, drill: 0.5 })');
  });

  it('emits a tail via and lands the terminating semicolon on it', () => {
    const route: RouteInput = {
      net: null,
      w: 0.3,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 4, y: 1 }] }],
      vias: [{ x: 4, y: 1, size: 0.6, drill: 0.3 }],
      from: { ref: '(resize)', pin: '' },
      to: null,
    };
    const { edits } = planRouteEdits(src(), [route]);
    let text = src();
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.line + text.slice(e.end);
    }
    expectValidTs(text);
    expect(text).toContain('.to({ x: 4, y: 1, layer: \'F.Cu\', width: 0.3 })\n  .via({ size: 0.6, drill: 0.3 });');
  });
});

describe('planRouteEdits idempotency across line endings', () => {
  const route: RouteInput = {
    net: 'led_a',
    w: 0.55,
    from: { ref: 'D1', pin: '1' },
    to: null,
    vias: [],
    pieces: [{ layer: 'In1.Cu', w: 0.55, pts: [{ x: 7.526, y: -0.009 }, { x: 9.48, y: -0.009 }] }],
  };

  it('recognizes an identical chain in an LF file (no duplicate insert)', () => {
    const text = src().replace(
      'typecad.create(',
      `const route1 = new TrackBuilder(typecad, { net: 'led_a',  })
  .from({ x: 7.526, y: -0.009 }, 'In1.Cu', 0.55)
  .to({ x: 9.48, y: -0.009, layer: 'In1.Cu', width: 0.55 });

typecad.create(`,
    );
    const plan = planRouteEdits(text, [route]);
    expect(plan.applied).toBe(0);
    expect(plan.skipped[0]).toContain('identical route already in source');
  });

  it('recognizes an identical chain in a CRLF file — the retry must not duplicate it', () => {
    const text = src().replace(
      'typecad.create(',
      `const route1 = new TrackBuilder(typecad, { net: 'led_a',  })
  .from({ x: 7.526, y: -0.009 }, 'In1.Cu', 0.55)
  .to({ x: 9.48, y: -0.009, layer: 'In1.Cu', width: 0.55 });

typecad.create(`,
    ).replace(/\n/g, '\r\n');
    const plan = planRouteEdits(text, [route]);
    expect(plan.applied).toBe(0);
    expect(plan.skipped[0]).toContain('identical route already in source');
  });
});

describe('corridor idempotency — retries never stack parallel routes', () => {
  // the delete/retry loop piled five near-duplicate R1→D1 corridors: each
  // failed apply left its route pending, and byte idempotency missed the
  // reversed/jittered variants. Same endpoints (either direction) on the
  // same net = already connected = skip
  const corridorSrc = () => `import { PCB, LED, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const led = new LED({ value: 'red' });
led.pcb = { x: 17.5, y: -5.5 };
const route18 = new TrackBuilder(typecad, { net: 'led_a',  })
  .from({ x: 18.288, y: -5.5 }, 'F.Cu', 0.3)
  .to({ x: 1.325, y: 0, layer: 'F.Cu', width: 0.3 });
typecad.create(led, route18);
`;

  it('same endpoints, reversed direction → skipped as duplicate', () => {
    const plan = planRouteEdits(
      corridorSrc(),
      [{ net: 'led_a', w: 0.3, from: { ref: 'R1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 1.325, y: 0 }, { x: 18.288, y: -5.5 }] }] }],
    );
    expect(plan.applied).toBe(0);
    expect(plan.skipped[0]).toContain('already connects those endpoints');
  });

  it('same endpoints with mid-route bends → still the same corridor, skipped', () => {
    const plan = planRouteEdits(
      corridorSrc(),
      [{ net: 'led_a', w: 0.3, from: { ref: 'R1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 18.288, y: -5.5 }, { x: 15.37, y: 0 }, { x: 1.325, y: 0 }] }] }],
    );
    expect(plan.applied).toBe(0);
    expect(plan.skipped[0]).toContain('already connects those endpoints');
  });

  it('a different net between the same points is NOT a duplicate', () => {
    const plan = planRouteEdits(
      corridorSrc(),
      [{ net: 'gnd', w: 0.3, from: { ref: 'R1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 1.325, y: 0 }, { x: 18.288, y: -5.5 }] }] }],
    );
    expect(plan.applied).toBe(1);
  });

  it('different endpoints on the same net still apply (a branch, not a retry)', () => {
    const plan = planRouteEdits(
      corridorSrc(),
      [{ net: 'led_a', w: 0.3, from: { ref: 'R1', pin: '1' }, to: null, vias: [], pieces: [{ layer: 'F.Cu', w: 0.3, pts: [{ x: 1.325, y: 0 }, { x: 5, y: 5 }] }] }],
    );
    expect(plan.applied).toBe(1);
  });
});
