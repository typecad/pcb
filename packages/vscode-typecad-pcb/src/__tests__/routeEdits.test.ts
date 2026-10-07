// Route apply: committed interactive routes plan TrackBuilder source edits.
import { describe, expect, it } from 'vitest';
import { planRouteEdits, planSectionRouteEdits, hasTrackSection, type RouteInput } from '../routeEdits.js';
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

// ---------------------------------------------------------------------------
// The per-net track section dialect — byte-canonical with the kicad2typecad
// write-back (its oracle compares section text exactly, so anything less
// canonical reads as drift). The golden statements below are the ones the
// live rd_skeleton board round-tripped through build → check-sync clean.
// ---------------------------------------------------------------------------
const sectionSrc = `import { PCB, Component, TrackBuilder } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const r1 = new Component({ reference: 'R1' });
r1.pcb = { x: 10, y: 10 };

// Net: VCC
const track_VCC: TrackBuilder[] = [];
track_VCC.push(typecad.track({ net: 'VCC' }).from({ x: 1, y: 2 }, "F.Cu", 0.3).to({ x: 3, y: 2, layer: "F.Cu", width: 0.3 }));

// Net: MID
const track_MID: TrackBuilder[] = [];
track_MID.push(typecad.track({ net: 'MID' }).from({ x: 5, y: 5 }, "F.Cu", 0.2).to({ x: 6, y: 5, layer: "F.Cu", width: 0.2 }));

typecad.create(
  r1,
  ...track_VCC,
  ...track_MID
);
`;

const applyEdits = (text: string, edits: Array<{ start: number; end: number; line: string }>): string => {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.line + out.slice(e.end);
  return out;
};

describe('planSectionRouteEdits (the canonical section dialect)', () => {
  it('detects the section grammar', () => {
    expect(hasTrackSection(sectionSrc)).toBe(true);
    expect(hasTrackSection(src())).toBe(false);
  });

  it('appends to an existing net as its last statement, byte-canonical', () => {
    const route: RouteInput = {
      net: 'MID', w: 0.2,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 137.175, y: 88.5 }, { x: 136, y: 88.5 }] }],
      vias: [], from: { ref: 'R4', pin: '2' }, to: null,
    };
    const plan = planSectionRouteEdits(sectionSrc, [route]);
    expect(plan.applied).toBe(1);
    expect(plan.skipped).toEqual([]);
    const out = applyEdits(sectionSrc, plan.edits);
    // the exact statement the oracle accepts (verified live: build →
    // check-sync "in sync — the source regenerates this board exactly")
    expect(out).toContain(
      'track_MID.push(typecad.track({ net: \'MID\' }).from({ x: 137.175, y: 88.5 }, "F.Cu", 0.2).to({ x: 136, y: 88.5, layer: "F.Cu", width: 0.2 }));',
    );
    // appended AFTER the existing MID statement, before the blank line
    const mid = out.indexOf('track_MID.push');
    const added = out.indexOf('track_MID.push(typecad.track({ net: \'MID\' }).from({ x: 137.175');
    expect(added).toBeGreaterThan(mid);
    expectValidTs(out);
  });

  it('a new net gains a whole block plus the create() spread', () => {
    const route: RouteInput = {
      net: 'SWD', w: 0.127,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }],
      vias: [], from: { ref: 'U1', pin: '5' }, to: null,
    };
    const plan = planSectionRouteEdits(sectionSrc, [route]);
    expect(plan.applied).toBe(1);
    const out = applyEdits(sectionSrc, plan.edits);
    expect(out).toContain('// Net: SWD\nconst track_SWD: TrackBuilder[] = [];');
    // per-leg widths and the spread in create()
    expect(out).toContain('.to({ x: 3, y: 3, layer: "F.Cu", width: 0.127 })');
    expect(out).toContain('...track_MID,\n  ...track_SWD');
    expectValidTs(out);
  });

  it('an identical statement already in the section is skipped, not duplicated', () => {
    const route: RouteInput = {
      net: 'VCC', w: 0.3,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 2 }, { x: 3, y: 2 }] }],
      vias: [], from: { ref: 'R1', pin: '1' }, to: null,
    };
    const plan = planSectionRouteEdits(sectionSrc, [route]);
    expect(plan.applied).toBe(0);
    expect(plan.skipped.join(' ')).toContain('identical statement');
  });

  it('net-less routes cannot land in the section and are skipped honestly', () => {
    const route = {
      net: null, w: 0.2,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }],
      vias: [], from: { ref: 'R1', pin: '1' }, to: null,
    } as unknown as RouteInput;
    const plan = planSectionRouteEdits(sectionSrc, [route]);
    expect(plan.applied).toBe(0);
    expect(plan.skipped.join(' ')).toContain('net-less');
  });
});

describe('planSectionRouteEdits orphaned declarations', () => {
  it('a net whose pushes were all deleted gets its push back — no re-declaration, no re-spread', () => {
    // live defect: a segment delete emptied track_DRIVE's last push; the
    // orphaned `const track_DRIVE: TrackBuilder[] = [];` was invisible to
    // the push-only detection, so the new-net path re-DECLARED it beside
    // the survivor (duplicate symbol, build failure) and re-SPREAD it into
    // create() (which would double the copper).
    const orphanSrc = [
      '// Net: VCC',
      'const track_VCC: TrackBuilder[] = [];',
      'track_VCC.push(typecad.track({ net: \'VCC\' }).from({ x: 1, y: 2 }, "F.Cu", 0.3).to({ x: 3, y: 2, layer: "F.Cu", width: 0.3 }));',
      '',
      '// Net: DRIVE',
      'const track_DRIVE: TrackBuilder[] = [];',
      '',
      'typecad.create(',
      '  ...track_VCC,',
      '  ...track_DRIVE',
      ');',
      '',
    ].join('\n');
    const route: RouteInput = {
      net: 'DRIVE', w: 0.2,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 130.04, y: 81.7 }, { x: 132.675, y: 81.7 }] }],
      vias: [], from: { ref: 'J1', pin: '2' }, to: null,
    };
    const plan = planSectionRouteEdits(orphanSrc, [route]);
    expect(plan.applied).toBe(1);
    expect(plan.skipped).toEqual([]);
    const out = applyEdits(orphanSrc, plan.edits);
    expect((out.match(/const track_DRIVE/g) ?? []).length).toBe(1);
    expect((out.match(/\.\.\.track_DRIVE/g) ?? []).length).toBe(1);
    // the push lands directly after the surviving declaration
    expect(out).toContain('const track_DRIVE: TrackBuilder[] = [];\ntrack_DRIVE.push(');
    expectValidTs(out);
  });
});

describe('planSectionRouteEdits vias + contiguous continuation', () => {
  it('mid-chain layer-transition vias land as canonical standalone statements', () => {
    // live defect: a drawn route jumping F.Cu → B.Cu → F.Cu needs vias at
    // the transitions; the writer only attached CHAIN-END vias inline, so
    // both AMP_OUT transition vias vanished from the rebuilt board
    const viaSectionSrc = [
      '// Net: PROBE_1',
      'const track_PROBE_1: TrackBuilder[] = [];',
      'track_PROBE_1.push(typecad.track({ net: \'PROBE_1\' }).from({ x: 1, y: 2 }, "F.Cu", 0.15).to({ x: 3, y: 4, layer: "F.Cu", width: 0.15 }));',
      '',
      'typecad.via({ at: { x: 5, y: 6 }, net: \'PROBE_1\', size: 0.6, drill: 0.3 });',
      '',
      'typecad.create(',
      '  ...track_PROBE_1',
      ');',
      '',
    ].join('\n');
    const route: RouteInput = {
      net: 'AMP_OUT', w: 0.3,
      pieces: [
        { layer: 'F.Cu', pts: [{ x: 134.422, y: 81.72 }, { x: 135.708, y: 81.814 }] },
        { layer: 'B.Cu', pts: [{ x: 135.708, y: 81.814 }, { x: 139.538, y: 81.814 }, { x: 145.579, y: 87.855 }] },
        { layer: 'F.Cu', pts: [{ x: 145.579, y: 87.855 }, { x: 145.579, y: 89.512 }] },
      ],
      vias: [
        { x: 135.708, y: 81.814 },
        { x: 145.579, y: 87.855 },
      ],
      from: { ref: 'U1', pin: '11' }, to: null,
    };
    const plan = planSectionRouteEdits(viaSectionSrc, [route]);
    expect(plan.applied).toBe(1);
    expect(plan.skipped).toEqual([]);
    const out = applyEdits(viaSectionSrc, plan.edits);
    // the two transition vias, canonical standalone form, appended after
    // the existing standalone via (the write-back's column-0 layout)
    expect(out).toContain("typecad.via({ at: { x: 5, y: 6 }, net: 'PROBE_1', size: 0.6, drill: 0.3 });");
    expect(out).toContain("typecad.via({ at: { x: 135.708, y: 81.814 }, net: 'AMP_OUT', size: 0.6, drill: 0.3 });");
    expect(out).toContain("typecad.via({ at: { x: 145.579, y: 87.855 }, net: 'AMP_OUT', size: 0.6, drill: 0.3 });");
    expectValidTs(out);
  });

  it('a route continuing the last statement extends it — one statement per contiguous run', () => {
    // the oracle chains positionally-contiguous segments into ONE
    // statement; two strokes drawn end-to-start of each other must not
    // become sibling statements (seen live: CH2_COM and DRIVE redraws
    // read as drift until the write-back re-chained them)
    const contSrc = [
      '// Net: CH2_COM',
      'const track_CH2_COM: TrackBuilder[] = [];',
      'track_CH2_COM.push(typecad.track({ net: \'CH2_COM\' }).from({ x: 134.425, y: 79.2 }, "F.Cu", 0.127).to({ x: 137.1, y: 81.875, layer: "F.Cu", width: 0.127 }));',
      '',
      'typecad.create(',
      '  ...track_CH2_COM',
      ');',
      '',
    ].join('\n');
    const route: RouteInput = {
      net: 'CH2_COM', w: 0.127,
      pieces: [{ layer: 'F.Cu', pts: [{ x: 137.1, y: 81.875 }, { x: 137.1, y: 83.04 }] }],
      vias: [], from: { ref: 'J1', pin: '3' }, to: null,
    };
    const plan = planSectionRouteEdits(contSrc, [route]);
    expect(plan.applied).toBe(1);
    const out = applyEdits(contSrc, plan.edits);
    expect((out.match(/track_CH2_COM\.push/g) ?? []).length).toBe(1);
    expect(out).toContain(
      'track_CH2_COM.push(typecad.track({ net: \'CH2_COM\' }).from({ x: 134.425, y: 79.2 }, "F.Cu", 0.127).to({ x: 137.1, y: 81.875, layer: "F.Cu", width: 0.127 }).to({ x: 137.1, y: 83.04, layer: "F.Cu", width: 0.127 }));',
    );
    expectValidTs(out);
  });
});
