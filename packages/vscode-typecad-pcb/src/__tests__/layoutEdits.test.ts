import { describe, expect, it } from 'vitest';
import { applyPlacementEdits, planComponentEdits, planEndpointEdits, parsePlacementLiteral, planPlacementEdits, planTextEdits } from '../layoutEdits.js';
import { expectValidTs } from './helpers/valid_source.js';

const source = `import { PCB } from '@typecad/pcb';
const typecad = new PCB('demo');
const r3 = new Component({ reference: 'R3' });
r3.pcb = { x: 59, y: 26 };
const mcu = new Component({ reference: 'U1' });
mcu.pcb = { x: b.center.x, y: b.center.y };
const u2 = new Component({ reference: 'U2' });
u2.pcb = { x: 17, y: 34, rotation: 90 };
`;

describe('planPlacementEdits', () => {
  it('rewrites x/y by the delta, preserving other fields', () => {
    const { edits, skipped } = planPlacementEdits(source, [{ ref: 'U2', dx: 12.5, dy: -5 }], (ref) =>
      ref === 'U2' ? 'u2' : undefined,
    );
    expect(skipped).toEqual([]);
    expect(edits).toHaveLength(1);
    const updated = applyPlacementEdits(source, edits);
    expect(updated).toContain('u2.pcb = { x: 29.5, y: 29, rotation: 90 }');
    expect(updated).toContain('r3.pcb = { x: 59, y: 26 };');
  });

  it('INSERTS the literal after the constructor for an UNPLACED component (the layout view\'s whole point)', () => {
    // a project whose parts were never placed: no `var.pcb = {…}` anywhere
    const unplaced = `import { PCB, Component } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const battery = new Component({
  footprint: 'Battery:Keystone_3008',
  prefix: 'BT',
});
const led = new LED({ value: 'red' });
typecad.create(battery, led);
`;
    const { edits, skipped } = planPlacementEdits(
      unplaced,
      [
        { ref: 'BT1', dx: 12.5, dy: -5 },
        { ref: 'D1', dx: 1, dy: 1, rot: 90 },
      ],
      (ref) => ({ BT1: 'battery', D1: 'led' })[ref],
    );
    expect(skipped).toEqual([]);
    expect(edits).toHaveLength(2);
    const out = applyPlacementEdits(unplaced, edits);
    // insertion lands right after the constructor statement, on its own line
    expect(out).toContain("prefix: 'BT',\n});\nbattery.pcb = { x: 12.5, y: -5 };\nconst led");
    expect(out).toContain('led.pcb = { x: 1, y: 1, rotation: 90 };');
    // a follow-up apply now REWRITES the inserted literal (delta math)
    const again = planPlacementEdits(out, [{ ref: 'BT1', dx: 1, dy: 0 }], () => 'battery');
    expect(applyPlacementEdits(out, again.edits)).toContain('battery.pcb = { x: 13.5, y: -5 };');
  });

  it('handles negative coordinates and formatting', () => {
    const neg = 'const a = new Component();\na.pcb = { x: -10.25, y: 3 };\n';
    const { edits } = planPlacementEdits(neg, [{ ref: 'A1', dx: -0.5, dy: 0.25 }], () => 'a');
    expect(applyPlacementEdits(neg, edits)).toContain('a.pcb = { x: -10.75, y: 3.25 }');
  });

  it('skips computed placements and unknown refs with reasons', () => {
    const { edits, skipped } = planPlacementEdits(
      source,
      [
        { ref: 'U1', dx: 1, dy: 1 },
        { ref: 'ZZ', dx: 1, dy: 1 },
        { ref: 'NOPE', dx: 1, dy: 1 },
      ],
      (ref) => ({ U1: 'mcu', ZZ: 'zz', NOPE: undefined })[ref],
    );
    expect(edits).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      'placement is computed, not a literal',
      'no `zz.pcb = {…}` literal found',
      'no source variable',
    ]);
  });

  it('applies several edits in one document with stable ranges', () => {
    const { edits } = planPlacementEdits(
      source,
      [
        { ref: 'R3', dx: 0.5, dy: 0.5 },
        { ref: 'U2', dx: -1, dy: 2 },
      ],
      (ref) => ({ R3: 'r3', U2: 'u2' })[ref],
    );
    const updated = applyPlacementEdits(source, edits);
    expect(updated).toContain('r3.pcb = { x: 59.5, y: 26.5 }');
    expect(updated).toContain('u2.pcb = { x: 16, y: 36, rotation: 90 }');
  });

  it('keeps the statement’s trailing semicolon (only the literal is replaced)', () => {
    const { edits } = planPlacementEdits(source, [{ ref: 'R3', dx: 1, dy: 1 }], () => 'r3');
    const updated = applyPlacementEdits(source, edits);
    expect(updated).toMatch(/r3\.pcb = \{ x: 60(\.0+)?, y: 27(\.0+)? \};/);
  });
});

describe('planPlacementEdits rotation', () => {
  it('adds a rotation field when the literal has none', () => {
    const src = 'r3.pcb = { x: 59, y: 26 };\n';
    const { edits } = planPlacementEdits(src, [{ ref: 'R3', dx: 0, dy: 0, rot: 90 }], () => 'r3');
    expect(applyPlacementEdits(src, edits)).toContain('r3.pcb = { x: 59, y: 26, rotation: 90 }');
  });

  it('accumulates onto an existing rotation', () => {
    const src = 'u2.pcb = { x: 17, y: 34, rotation: 90 };\n';
    const { edits } = planPlacementEdits(src, [{ ref: 'U2', dx: 1, dy: 0, rot: 90 }], () => 'u2');
    expect(applyPlacementEdits(src, edits)).toContain('u2.pcb = { x: 18, y: 34, rotation: 180 }');
  });

  it('leaves rotation untouched when the move carries none', () => {
    const src = 'u2.pcb = { x: 17, y: 34, rotation: 90 };\n';
    const { edits } = planPlacementEdits(src, [{ ref: 'U2', dx: 2, dy: 0 }], () => 'u2');
    expect(applyPlacementEdits(src, edits)).toContain('rotation: 90');
  });
});

describe('planEndpointEdits (sticky TrackBuilder endpoints)', () => {
  const src = `const vcc = new TrackBuilder(typecad, { net: 'VCC' })
  .from({ x: 57.5375, y: 26 })
  .to({ x: 41, y: 26, width: 0.3 });
const other = new TrackBuilder(typecad, { net: 'GND' })
  .from({ x: 17, y: 25.418 });
`;

  it('translates the from/to literals that sit on the moved pads', () => {
    const pads = [
      { x: 57.5375, y: 26 },
      { x: 60.5375, y: 26 },
    ];
    const edits = planEndpointEdits(src, { ref: 'R3', dx: 12.5, dy: -5, pads });
    const updated = applyPlacementEdits(src, edits);
    expect(updated).toContain('.from({ x: 70.0375, y: 21 })');
    expect(updated).toContain('.to({ x: 41, y: 26, width: 0.3 })'); // untouched
    expect(edits).toHaveLength(1);
  });

  it('keeps extra fields in a matched .to literal', () => {
    const s = '.to({ x: 60.5375, y: 26, layer: \'B.Cu\', width: 0.3 });\n';
    const edits = planEndpointEdits(s, { ref: 'R3', dx: 1, dy: 1, pads: [{ x: 60.5375, y: 26 }] });
    expect(applyPlacementEdits(s, edits)).toContain(".to({ x: 61.5375, y: 27, layer: 'B.Cu', width: 0.3 })");
  });

  it('matches within 0.05 mm and ignores everything else', () => {
    const edits = planEndpointEdits(src, { ref: 'R3', dx: 1, dy: 1, pads: [{ x: 57.55, y: 26.02 }] });
    expect(edits).toHaveLength(1);
    const none = planEndpointEdits(src, { ref: 'R3', dx: 1, dy: 1, pads: [{ x: 10, y: 10 }] });
    expect(none).toHaveLength(0);
  });
});

describe('planEndpointEdits replacement bounds', () => {
  it('replaces exactly the literal — no document tail duplication', () => {
    const src = "const t = new TrackBuilder(p, { net: 'A' })\n  .to({ x: 57.5375, y: 26 }, 'F.Cu', W);\nconst after = 1;\n";
    const edits = planEndpointEdits(src, { ref: 'R3', dx: 1, dy: 1, pads: [{ x: 57.5375, y: 26 }] });
    const out = applyPlacementEdits(src, edits);
    expect((out.match(/const after/g) ?? []).length).toBe(1);
    expect(out).toContain(".to({ x: 58.5375, y: 27 }, 'F.Cu', W);");
    expect(out.endsWith('const after = 1;\n')).toBe(true);
  });
});

describe('planTextEdits', () => {
  const src =
    "typecad.text({ text: 'rd-skeleton', x: 62, y: 80, layer: 'F.SilkS', font: 'OCR A Std', width: 1.5, height: 1.5 });\n" +
    "typecad.text({ text: 'vcc', x: 10, y: 4, layer: 'F.Fab' });\n";

  it('moves a text literal, keeping every other property', () => {
    const { edits, skipped } = planTextEdits(src, [
      { text0: 'rd-skeleton', x0: 62, y0: 80, text: 'rd-skeleton', x: 63.5, y: 78, rot: 0 },
    ]);
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain("text: 'rd-skeleton', x: 63.5, y: 78, layer: 'F.SilkS'");
    expect(out).toContain("typecad.text({ text: 'vcc', x: 10, y: 4, layer: 'F.Fab' })");
  });

  it('edits the value in place (quote style preserved)', () => {
    const { edits } = planTextEdits(src, [
      { text0: 'vcc', x0: 10, y0: 4, text: 'VCC 3V3', x: 10, y: 4, rot: 0 },
    ]);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain("{ text: 'VCC 3V3', x: 10, y: 4, layer: 'F.Fab' }");
  });

  it('accumulates rotation, inserting the property when absent', () => {
    const { edits } = planTextEdits(src, [
      { text0: 'rd-skeleton', x0: 62, y0: 80, text: 'rd-skeleton', x: 62, y: 80, rot: 90 },
    ]);
    const out = applyPlacementEdits(src, edits);
    expect(out).toMatch(/rotation: 90[,}\s]/);
  });

  it('skips edits whose authored anchor/value matches nothing', () => {
    const { edits, skipped } = planTextEdits(src, [
      { text0: 'nope', x0: 1, y0: 1, text: 'nope', x: 2, y: 2, rot: 0 },
    ]);
    expect(edits).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('matches anchors within 0.05 mm and skips nested justify objects', () => {
    const s =
      "typecad.text({ text: 'a', x: 5, y: 5, justify: { horizontal: 'left' } });\n" +
      "typecad.text({ text: 'b', x: 5.03, y: 4.99, layer: 'F.Fab' });\n";
    const { edits } = planTextEdits(s, [{ text0: 'b', x0: 5, y0: 5, text: 'B!', x: 5, y: 5, rot: 0 }]);
    const out = applyPlacementEdits(s, edits);
    expect(out).toContain("{ text: 'B!', x: 5, y: 5, layer: 'F.Fab' }");
    expect(out).toContain("justify: { horizontal: 'left' }");
  });

  it('replaces exactly the call literal — no tail duplication', () => {
    const s = "typecad.text({ text: 'a', x: 5, y: 5 });\nconst after = 1;\n";
    const { edits } = planTextEdits(s, [{ text0: 'a', x0: 5, y0: 5, text: 'z', x: 6, y: 6, rot: 0 }]);
    const out = applyPlacementEdits(s, edits);
    expect((out.match(/const after/g) ?? []).length).toBe(1);
    expect(out).toContain("typecad.text({ text: 'z', x: 6, y: 6 });\nconst after = 1;\n");
  });
});




describe('planComponentEdits (combined constructor pass)', () => {
  const src =
    "const r1 = new Component({ symbol: 'Device:R_Small', reference: 'R1', value: '1k' });\n" +
    "r1.pcb = { x: 16, y: 15, rotation: 180 };\n";
  const placementOf = (ref: string) => (ref === 'R1' ? parsePlacementLiteral(src, 'r1') : null);

  it('applies rename + value + label layout as ONE replacement', () => {
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', newRef: 'R9', value: '2d', label: { kind: 'reference', x: 20, y: 14.5, rot: 270 } }],
      placementOf,
      new Set(['R1', 'R2']),
    );
    expect(skipped).toHaveLength(0);
    expect(edits).toHaveLength(1);
    const out = applyPlacementEdits(src, edits);
    const line = out.split('\n').find((l) => l.includes('reference:'));
    expect(line).toContain("reference: 'R9'");
    expect(line).toContain("value: '2d'");
    expect(line).toContain('referenceLayout: { x: -4, y: 0.5, rotation: 90 }');
  });

  it('guards rename collisions while still applying the value edit', () => {
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', newRef: 'R2', value: '5k' }],
      placementOf,
      new Set(['R1', 'R2']),
    );
    expect(edits).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });
});

describe('planComponentEdits fab label', () => {
  const src =
    "const r1 = new Component({ symbol: 'Device:R_Small', reference: 'R1', value: '1k' });\n" +
    "r1.pcb = { x: 16, y: 15, rotation: 180 };\n";
  it("writes the plain 'fab' option for the small fab refdes text", () => {
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', label: { kind: 'fab', x: 18, y: 15, rot: 180 } }],
      (ref) => (ref === 'R1' ? parsePlacementLiteral(src, 'r1') : null),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expectValidTs(out);
    expect(out).toContain('fab: { x: -2, y: 0, rotation: 0 }');
    expect(out).not.toContain('fabLayout');
  });
});

describe('planComponentEdits regression guards', () => {
  const src =
    "const r1 = new Component({ symbol: 'Device:R_Small', reference: 'R1', value: '1k' });\n" +
    "r1.pcb = { x: 16, y: 15, rotation: 180 };\n";
  const placementOf = (text: string) => (ref: string) => (ref === 'R1' ? parsePlacementLiteral(text, 'r1') : null);

  it('REPLACES an existing layout option on a second label move (no duplicate keys)', () => {
    const moved = applyPlacementEdits(src, planComponentEdits(
      src,
      [{ ref: 'R1', label: { kind: 'reference', x: 20, y: 14.5, rot: 270 } }],
      placementOf(src),
      new Set(['R1']),
    ).edits);
    // moving the SAME label again must rewrite the option, not append a twin
    const second = planComponentEdits(
      moved,
      [{ ref: 'R1', label: { kind: 'reference', x: 21, y: 15, rot: 0 } }],
      (ref) => (ref === 'R1' ? parsePlacementLiteral(moved, 'r1') : null),
      new Set(['R1']),
    );
    expect(second.skipped).toHaveLength(0);
    const out = applyPlacementEdits(moved, second.edits);
    expectValidTs(out);
    expect(out.match(/referenceLayout:/g)).toHaveLength(1);
    expect(out).toContain('referenceLayout: { x: -5, y: 0, rotation: -180 }');
  });

  it('keeps the literal intact when a length-changing rename precedes an insert', () => {
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', newRef: 'USB1', value: '10k' }],
      placementOf(src),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expectValidTs(out);
    expect(out).toContain("reference: 'USB1'");
    expect(out).toContain("value: '10k'");
    expect(out).toContain("symbol: 'Device:R_Small'");
  });

  it('inserts after the reference even when value precedes it in the literal', () => {
    const reordered = "const r1 = new Component({ value: '1k', reference: 'R1' });\n";
    const { edits, skipped } = planComponentEdits(
      reordered,
      [{ ref: 'R1', newRef: 'USB1', value: '2k' }],
      placementOf(reordered),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(reordered, edits);
    expectValidTs(out);
    expect(out).toContain("value: '2k'");
    expect(out).toContain("reference: 'USB1'");
  });

  it("escapes a quote in a typed value instead of breaking the string literal", () => {
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', value: "1k (don't)" }],
      placementOf(src),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expectValidTs(out);
    expect(out).toContain("value: '1k (don\\'t)'");
  });

  it('escapes a value rewrite against the existing value literal’s own quote', () => {
    // the constructor quotes reference and value differently: the rewrite
    // must escape for the value's double quotes, not the reference's singles
    const mixed = "const r1 = new Component({ reference: 'R1', value: \"1k\" });\nr1.pcb = { x: 16, y: 15 };\n";
    const { edits, skipped } = planComponentEdits(
      mixed,
      [{ ref: 'R1', value: '2" x 1/4 W' }],
      (ref) => (ref === 'R1' ? parsePlacementLiteral(mixed, 'r1') : null),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(mixed, edits);
    expectValidTs(out);
    expect(out).toContain('value: "2\\" x 1/4 W"');
  });
});
