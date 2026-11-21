import { describe, expect, it } from 'vitest';
import { applyPlacementEdits, maxZonePriority, planComponentEdits, planEndpointEdits, parsePlacementLiteral, planNetClassEdits, planOutlineEdits, planPlacementEdits, planTextDeletions, planTextEdits, planZoneDeletions, planZoneGeometryEdits } from '../layoutEdits.js';
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

describe('planPlacementEdits flip (side)', () => {
  it('appends side when the literal has none — rotation untouched', () => {
    const src = 'r3.pcb = { x: 59, y: 26 };\n';
    const { edits, skipped } = planPlacementEdits(src, [{ ref: 'R3', dx: 0, dy: 0, side: 'back' }], () => 'r3');
    expect(skipped).toEqual([]);
    expect(applyPlacementEdits(src, edits)).toContain("r3.pcb = { x: 59, y: 26, side: 'back' }");
  });

  it('rewrites an existing side (back flips back to front)', () => {
    const src = "c4.pcb = { x: 10, y: 10, side: 'back' };\n";
    const { edits } = planPlacementEdits(src, [{ ref: 'C4', dx: 1, dy: 0, side: 'front' }], () => 'c4');
    expect(applyPlacementEdits(src, edits)).toContain("c4.pcb = { x: 11, y: 10, side: 'front' }");
  });

  it('writes side into an INSERTED literal for constructor-placed parts', () => {
    const src = `const led = new LED({ value: 'red' });
typecad.create(led);
`;
    const { edits, skipped } = planPlacementEdits(src, [{ ref: 'D1', dx: 0, dy: 0, ax: 20, ay: 30, side: 'back' }], () => 'led');
    expect(skipped).toEqual([]);
    const updated = applyPlacementEdits(src, edits);
    expectValidTs(updated);
    expect(updated).toContain("led.pcb = { x: 20, y: 30, side: 'back' };");
  });

  it('a move without side never touches an existing side field', () => {
    const src = "c4.pcb = { x: 10, y: 10, side: 'back' };\n";
    const { edits } = planPlacementEdits(src, [{ ref: 'C4', dx: 1, dy: 1 }], () => 'c4');
    expect(applyPlacementEdits(src, edits)).toContain("c4.pcb = { x: 11, y: 11, side: 'back' }");
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

  it('a flip translates each endpoint by ITS pad delta (padsTo), not the part delta', () => {
    // the part moves +2 in x; its flip mirrors pad offsets about the local X
    // axis, so the two pads end at different deltas — endpoint 1 follows
    // pad 1's final position, not the center's
    const pads = [
      { x: 57.5375, y: 26 },
      { x: 60.5375, y: 26 },
    ];
    // pad1 final: offset (-1.5,0) mirrored -> (+1.5,0) then +2 center move
    const padsTo = [
      { x: 61.0375, y: 26 }, // 57.5375 + 3.5
      { x: 59.0375, y: 26 }, // 60.5375 - 1.5
    ];
    const edits = planEndpointEdits(src, { ref: 'R3', dx: 2, dy: 0, pads, padsTo });
    const updated = applyPlacementEdits(src, edits);
    expect(updated).toContain('.from({ x: 61.0375, y: 26 })');
    expect(edits).toHaveLength(1);
  });

  it('padsTo absent falls back to the uniform delta (pure move unchanged)', () => {
    const pads = [{ x: 57.5375, y: 26 }];
    const edits = planEndpointEdits(src, { ref: 'R3', dx: 2, dy: 1, pads });
    expect(applyPlacementEdits(src, edits)).toContain('.from({ x: 59.5375, y: 27 })');
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

describe('planOutlineEdits (board outline rewrite)', () => {
  const src = `typecad.outline(10, 20, 50, 40);
typecad.outline(0, 0, 30, 30, 2);
`;

  it('rewrites the matching outline call, keeping the fillet argument', () => {
    const { edits, reason } = planOutlineEdits(src, { x: 10, y: 20, w: 50, h: 40 }, { x: 8, y: 18, w: 54, h: 44 });
    expect(reason).toBeUndefined();
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain('typecad.outline(8, 18, 54, 44);');
    expect(out).toContain('typecad.outline(0, 0, 30, 30, 2);'); // untouched
  });

  it('rewrites the filleted call when the original matches', () => {
    const { edits } = planOutlineEdits(src, { x: 0, y: 0, w: 30, h: 30 }, { x: 0, y: 0, w: 32, h: 30 });
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain('typecad.outline(0, 0, 32, 30, 2);');
  });

  it('reports when no literal matches the authored outline', () => {
    const { edits, reason } = planOutlineEdits(src, { x: 100, y: 100, w: 5, h: 5 }, { x: 90, y: 90, w: 6, h: 6 });
    expect(edits).toEqual([]);
    expect(reason).toContain('no `.outline(');
  });

  it('polygon outlines never match (reported, not mangled)', () => {
    const poly = 'typecad.outlinePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]);\n';
    const { edits, reason } = planOutlineEdits(poly, { x: 0, y: 0, w: 10, h: 8 }, { x: 1, y: 1, w: 10, h: 8 });
    expect(edits).toEqual([]);
    expect(reason).toContain('no `.outline(');
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

  it('deletes the whole statement — receiver, semicolon, and newline included', () => {
    const { edits, skipped } = planTextDeletions(src, [{ text0: 'rd-skeleton', x0: 62, y0: 80 }]);
    expect(skipped).toHaveLength(0);
    expect(edits).toHaveLength(1);
    const out = applyPlacementEdits(src, edits);
    expect(out).not.toContain('rd-skeleton');
    expect(out).toBe("typecad.text({ text: 'vcc', x: 10, y: 4, layer: 'F.Fab' });\n");
  });

  it('delete matches anchors within 0.05 and reports misses as skipped', () => {
    const { edits, skipped } = planTextDeletions(src, [
      { text0: 'vcc', x0: 10.03, y0: 3.99 },
      { text0: 'nope', x0: 0, y0: 0 },
    ]);
    expect(edits).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.ref).toContain('nope');
    const out = applyPlacementEdits(src, edits);
    expect(out).not.toContain("'vcc'");
    expect(out).toContain('rd-skeleton');
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

  it('rewrites a style diff onto present keys (width/height/thickness/font/italic)', () => {
    const { edits, skipped } = planTextEdits(src, [
      {
        text0: 'rd-skeleton',
        x0: 62,
        y0: 80,
        text: 'rd-skeleton',
        x: 62,
        y: 80,
        rot: 0,
        style: { w: 2, h: 2.5, thickness: 0.3, font: 'DejaVu Sans', italic: true },
      },
    ]);
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain("font: 'DejaVu Sans'");
    expect(out).toContain('width: 2');
    expect(out).toContain('height: 2.5');
    expect(out).toContain('thickness: 0.3');
    expect(out).toContain('italic: true');
    expect(out).toContain("text: 'rd-skeleton', x: 62, y: 80");
    expect(out).toContain("typecad.text({ text: 'vcc', x: 10, y: 4, layer: 'F.Fab' })");
  });

  it('appends absent style keys and replaces a nested justify object', () => {
    const s = "typecad.text({ text: 'vcc', x: 10, y: 4, layer: 'F.Fab', justify: { horizontal: 'left' } });\n";
    const { edits } = planTextEdits(s, [
      {
        text0: 'vcc',
        x0: 10,
        y0: 4,
        text: 'vcc',
        x: 10,
        y: 4,
        rot: 0,
        style: { h: 2, bold: true, justify: { horizontal: 'right', vertical: 'top', mirror: true } },
      },
    ]);
    const out = applyPlacementEdits(s, edits);
    expect(out).toContain('height: 2');
    expect(out).toContain('bold: true');
    expect(out).toContain("justify: { horizontal: 'right', vertical: 'top', mirror: true }");
    expect(out).not.toContain("horizontal: 'left'");
    expectValidTs(out);
  });

  it('a position-only edit sprays no style keys into the literal', () => {
    const { edits } = planTextEdits(src, [
      { text0: 'vcc', x0: 10, y0: 4, text: 'vcc', x: 12, y: 6, rot: 0 },
    ]);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain("typecad.text({ text: 'vcc', x: 12, y: 6, layer: 'F.Fab' })");
    expect(out).not.toContain('italic');
    expect(out).not.toContain('justify');
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
    // the rotation is the label's ABSOLUTE angle — the build writes it verbatim
    // as the KiCad text angle (it once wrote 90: label 270 minus the part's 180)
    expect(line).toContain('referenceLayout: { x: -4, y: 0.5, rotation: 270 }');
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

  it('matches type-annotated and non-declaring constructor shapes', () => {
    const annotated =
      "import type { Component } from '@typecad/pcb';\n" +
      "const u1: Component = new Component({ reference: 'U1', value: 'old' });\n" +
      'u1.pcb = { x: 10, y: 10, rotation: 0 };\n';
    const annotatedOut = applyPlacementEdits(
      annotated,
      planComponentEdits(
        annotated,
        [{ ref: 'U1', value: 'new' }],
        (ref) => (ref === 'U1' ? parsePlacementLiteral(annotated, 'u1') : null),
        new Set(['U1']),
      ).edits,
    );
    expectValidTs(annotatedOut);
    expect(annotatedOut).toContain("value: 'new'");

    // export + annotation, and a bare non-declaring usage, both match too
    const exported = "export const u2: Component = new Component({ reference: 'U2', value: 'old' });\n";
    const exportedOut = applyPlacementEdits(
      exported,
      planComponentEdits(
        exported,
        [{ ref: 'U2', value: 'new' }],
        () => ({ x: 0, y: 0, rot: 0 }),
        new Set(['U2']),
      ).edits,
    );
    expect(exportedOut).toContain("value: 'new'");
    const bare = 'parts.push(new Component({ reference: \'U3\', value: \'old\' }));\n';
    const bareOut = applyPlacementEdits(
      bare,
      planComponentEdits(bare, [{ ref: 'U3', value: 'new' }], () => ({ x: 0, y: 0, rot: 0 }), new Set(['U3'])).edits,
    );
    expect(bareOut).toContain("value: 'new'");
  });
});

describe('planComponentEdits fab label', () => {
  const src =
    "const r1 = new Component({ symbol: 'Device:R_Small', reference: 'R1', value: '1k' });\n" +
    "r1.pcb = { x: 16, y: 15, rotation: 180 };\n";
  it('writes the fabLayout option for the small fab refdes text (the field the importer reads)', () => {
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', label: { kind: 'fab', x: 18, y: 15, rot: 180 } }],
      (ref) => (ref === 'R1' ? parsePlacementLiteral(src, 'r1') : null),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expectValidTs(out);
    expect(out).toContain('fabLayout: { x: -2, y: 0, rotation: 180 }');
    expect(out).not.toMatch(/fab:/);
  });
});

describe('planComponentEdits label style', () => {
  const placementOf = (text: string) => (ref: string) => (ref === 'R1' ? parsePlacementLiteral(text, 'r1') : null);

  it('merges a style diff into a fresh layout option beside the position', () => {
    const src =
      "const r1 = new Component({ symbol: 'Device:R_Small', reference: 'R1', value: '1k' });\n" +
      "r1.pcb = { x: 16, y: 15, rotation: 0 };\n";
    const { edits, skipped } = planComponentEdits(
      src,
      [
        {
          ref: 'R1',
          label: { kind: 'reference', x: 18, y: 15, rot: 0, style: { h: 2, italic: true, justify: { horizontal: 'left' } } },
        },
      ],
      placementOf(src),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expectValidTs(out);
    expect(out).toContain('height: 2');
    expect(out).toContain('italic: true');
    expect(out).toContain("justify: { horizontal: 'left' }");
    expect(out).toMatch(/referenceLayout: \{ x: 2, y: 0, rotation: 0,/);
  });

  it('preserves unmanaged keys (layer, show) and nested justify in an existing layout literal', () => {
    const src =
      "const r1 = new Component({ reference: 'R1', value: '1k', referenceLayout: { x: 1, y: 2, rotation: 90, layer: 'F.SilkS', show: true, justify: { horizontal: 'right' } } });\n" +
      "r1.pcb = { x: 16, y: 15, rotation: 0 };\n";
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', label: { kind: 'reference', x: 18, y: 15, rot: 0, style: { thickness: 0.25 } } }],
      placementOf(src),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expectValidTs(out);
    expect(out.match(/referenceLayout:/g)).toHaveLength(1);
    expect(out).toContain("layer: 'F.SilkS'");
    expect(out).toContain('show: true');
    expect(out).toContain('thickness: 0.25');
    // the position was replaced, the unedited nested justify preserved
    expect(out).toContain("justify: { horizontal: 'right' }");
    expect(out).toContain('x: 2, y: 0, rotation: 0');
    expect(out).not.toContain('x: 1, y: 2');
  });

  it('a style-only label edit (same position) leaves the literal valid', () => {
    const src =
      "const r1 = new Component({ reference: 'R1', referenceLayout: { x: 1, y: 2, rotation: 90 } });\n" +
      "r1.pcb = { x: 16, y: 15, rotation: 0 };\n";
    const { edits, skipped } = planComponentEdits(
      src,
      [{ ref: 'R1', label: { kind: 'reference', x: 18, y: 15, rot: 0, style: { bold: true } } }],
      placementOf(src),
      new Set(['R1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expectValidTs(out);
    expect(out).toContain('bold: true');
  });
});

describe('planComponentEdits regression guards', () => {
  const src =
    "const r1 = new Component({ symbol: 'Device:R_Small', reference: 'R1', value: '1k' });\n" +
    "r1.pcb = { x: 16, y: 15, rotation: 180 };\n";
  const placementOf = (text: string) => (ref: string) => (ref === 'R1' ? parsePlacementLiteral(text, 'r1') : null);

  it('a standalone `<var>.referenceLayout = {…}` statement wins over the constructor option', () => {
    // the mod-EC shape: the layout lives in a post-construction assignment
    // (imported from KiCad), so it OVERRIDES any constructor option at
    // runtime — writing the constructor there made the rebuild revert
    // every label drag
    const withStmt =
      "const u1 = new Component({ reference: 'U1', value: 'MCU' });\n" +
      "u1.pcb = { x: 147.25, y: 85.25, rotation: 0 };\n" +
      "u1.referenceLayout = { x: 0, y: -3.83, rotation: 0, layer: 'F.SilkS', width: 0.75, height: 0.75, thickness: 0.1, show: true };\n";
    const place = (ref: string) => (ref === 'U1' ? parsePlacementLiteral(withStmt, 'u1') : null);
    const { edits, skipped } = planComponentEdits(
      withStmt,
      [{ ref: 'U1', label: { kind: 'reference', x: 148.5, y: 82, rot: 0 } }],
      place,
      new Set(['U1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(withStmt, edits);
    expectValidTs(out);
    // the STATEMENT carries the new offset (kept style keys lead, position
    // lands after — key order follows the merge, only presence matters)
    expect(out).toMatch(/u1\.referenceLayout = \{[^\n]*x: 1\.25, y: -3\.25, rotation: 0/);
    // …its unmanaged style keys survive…
    expect(out).toContain("layer: 'F.SilkS'");
    expect(out).toContain('show: true');
    // …and no dead constructor option was appended (it would lose anyway)
    expect(out).not.toMatch(/referenceLayout\s*:/);
  });

  it('a standalone `<var>.fabLayout = {…}` statement wins for fab labels too', () => {
    const withStmt =
      "const u1 = new Component({ reference: 'U1' });\n" +
      "u1.pcb = { x: 100, y: 100 };\n" +
      "u1.fabLayout = { x: 0, y: 0, rotation: 0 };\n";
    const place = (ref: string) => (ref === 'U1' ? parsePlacementLiteral(withStmt, 'u1') : null);
    const { edits, skipped } = planComponentEdits(
      withStmt,
      [{ ref: 'U1', label: { kind: 'fab', x: 101, y: 100, rot: 0 } }],
      place,
      new Set(['U1']),
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(withStmt, edits);
    expectValidTs(out);
    expect(out).toContain('u1.fabLayout = { x: 1, y: 0, rotation: 0 }');
    expect(out).not.toMatch(/\bfab\s*:/);
  });

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
    expect(out).toContain('referenceLayout: { x: -5, y: 0, rotation: 0 }');
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

describe('constructor-inline placements (the jump-to-(0,0) incident)', () => {
  // a part placed via the constructor's inline pcb option has no
  // `var.pcb = {…}` literal — the first apply INSERTS one, and it must
  // carry the FINAL ABSOLUTE position. The old insert wrote the drag
  // delta, which then overrode the constructor placement and jumped the
  // part to near (0,0) — every constructor-placed part "moved" ended up
  // far up-left of where it was placed
  it('inserts the final absolute position, not the drag delta', () => {
    const src = `import { PCB, Capacitor } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const c1 = new Capacitor({ reference: 'C1', value: '100nF', pcb: { x: 143.3, y: 89.2, rotation: 0 } });
typecad.create(c1);
`;
    // the user dragged C1 by (+0.6, -1.1) board — final absolute
    // (143.9, 88.1); the delta alone would insert { x: 0.6, y: -1.1 }
    const { edits, skipped } = planPlacementEdits(
      src,
      [{ ref: 'C1', dx: 0.6, dy: -1.1, ax: 143.9, ay: 88.1 }],
      (ref) => ({ C1: 'c1' })[ref],
    );
    expect(skipped).toHaveLength(0);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain('c1.pcb = { x: 143.9, y: 88.1');
    expect(out).not.toContain('x: 0.6');
  });

  it('older pages without ax/ay keep the delta fallback', () => {
    const src = `import { PCB, Component } from '@typecad/pcb';
const typecad = new PCB('demo', {});
const battery = new Component({ footprint: 'Battery:Keystone_3008_1x2450', prefix: 'BT' });
typecad.create(battery);
`;
    const { edits } = planPlacementEdits(src, [{ ref: 'BT1', dx: 12.5, dy: -5 }], (ref) => ({ BT1: 'battery' })[ref]);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain('battery.pcb = { x: 12.5, y: -5 }');
  });
});

describe('planNetClassEdits (layout-view rules panel)', () => {
  const src = [
    "import { PCB } from '@typecad/pcb';",
    "const typecad = new PCB('demo');",
    "  typecad.netClass('PWR', { track_width: 0.5, clearance: 0.3 });",
    "  typecad.netClass('SIG', { track_width: 0.2 });",
    "typecad.create();",
  ].join('\n');

  it('rewrites known keys in place and appends missing ones', () => {
    const { edits, skipped } = planNetClassEdits(src, [
      { name: 'PWR', values: { track_width: 0.8, via_diameter: 0.9 } },
    ]);
    expect(skipped).toEqual([]);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain("netClass('PWR', { track_width: 0.8, clearance: 0.3, via_diameter: 0.9 })");
    expect(out).toContain("netClass('SIG', { track_width: 0.2 })"); // untouched
    expectValidTs(out);
  });

  it('reports classes with no literal instead of inventing one', () => {
    const { edits, skipped } = planNetClassEdits(src, [
      { name: 'NOPE', values: { track_width: 0.3 } },
    ]);
    expect(edits).toEqual([]);
    expect(skipped[0]).toContain('NOPE has no netClass() literal');
  });
});

describe('planZoneGeometryEdits / planZoneDeletions', () => {
  const src = [
    "import { PCB } from '@typecad/pcb';",
    "const typecad = new PCB('demo');",
    "  typecad.zone({ net: 'VCC', layers: ['F.Cu'], x: 144.6, y: 78.5, width: 5.6, height: 1.7 });",
    "  typecad.zone({ net: 'AMP', layers: ['B.Cu'], x: 10, y: 10, width: 4, height: 4 });",
    "  typecad.keepout({ layers: ['F.Cu'], x: 20, y: 20, width: 3, height: 3 });",
    'typecad.create();',
  ].join('\n');

  it('rewrites the matching zone literal geometry in place', () => {
    const { edits, skipped } = planZoneGeometryEdits(src, [
      { original: { x: 144.6, y: 78.5, w: 5.6, h: 1.7, layer: 'F.Cu' }, rect: { x: 140, y: 75, w: 10, h: 6 } },
    ]);
    expect(skipped).toEqual([]);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain("typecad.zone({ net: 'VCC', layers: ['F.Cu'], x: 140, y: 75, width: 10, height: 6 })");
    expect(out).toContain("typecad.zone({ net: 'AMP', layers: ['B.Cu'], x: 10, y: 10, width: 4, height: 4 })"); // untouched
    expectValidTs(out);
  });

  it('a net on the edit reassigns the pour (rewritten in place, or inserted when absent)', () => {
    const { edits, skipped } = planZoneGeometryEdits(src, [
      { original: { x: 144.6, y: 78.5, w: 5.6, h: 1.7, layer: 'F.Cu' }, rect: { x: 144.6, y: 78.5, w: 5.6, h: 1.7 }, net: 'GND' },
    ]);
    expect(skipped).toEqual([]);
    const out = applyPlacementEdits(src, edits);
    expect(out).toContain("net: 'GND', layers: ['F.Cu'], x: 144.6");
    expect(out).not.toContain("net: 'VCC'");
    expect(out).toContain("net: 'AMP', layers: ['B.Cu'], x: 10, y: 10, width: 4, height: 4 })"); // untouched
    expectValidTs(out);
    // a literal with no net key (a keepout being converted) gains one
    const noNet = src.replace("typecad.zone({ net: 'VCC', layers: ['F.Cu'], x: 144.6, y: 78.5, width: 5.6, height: 1.7 })", "typecad.zone({ layers: ['F.Cu'], x: 144.6, y: 78.5, width: 5.6, height: 1.7 })");
    const r2 = planZoneGeometryEdits(noNet, [
      { original: { x: 144.6, y: 78.5, w: 5.6, h: 1.7, layer: 'F.Cu' }, rect: { x: 144.6, y: 78.5, w: 5.6, h: 1.7 }, net: 'MID' },
    ]);
    const out2 = applyPlacementEdits(noNet, r2.edits);
    expect(out2).toContain("{ net: 'MID', layers: ['F.Cu']");
    expectValidTs(out2);
  });

  it('layer disambiguates identical rects', () => {
    const dup = src.replace(
      "typecad.zone({ net: 'AMP', layers: ['B.Cu'], x: 10, y: 10, width: 4, height: 4 })",
      "typecad.zone({ net: 'TWIN', layers: ['B.Cu'], x: 144.6, y: 78.5, width: 5.6, height: 1.7 })",
    );
    const { edits, skipped } = planZoneGeometryEdits(dup, [
      { original: { x: 144.6, y: 78.5, w: 5.6, h: 1.7, layer: 'F.Cu' }, rect: { x: 140, y: 75, w: 10, h: 6 } },
    ]);
    expect(skipped).toEqual([]);
    const out = applyPlacementEdits(dup, edits);
    expect(out.match(/x: 140, y: 75/g)).toHaveLength(1); // only the F.Cu one moved
    expect(out).toContain("net: 'TWIN', layers: ['B.Cu'], x: 144.6"); // twin untouched
  });

  it('deletes the whole zone statement', () => {
    const { edits, skipped } = planZoneDeletions(src, [{ x: 10, y: 10, w: 4, h: 4, layer: 'B.Cu' }]);
    expect(skipped).toEqual([]);
    const out = applyPlacementEdits(src, edits);
    expect(out).not.toContain("net: 'AMP'");
    expect(out).toContain("net: 'VCC'"); // neighbors survive
    expectValidTs(out);
  });

  it('reports plane-materialized / unmatched zones instead of guessing', () => {
    const { edits, skipped } = planZoneGeometryEdits(src, [
      { original: { x: 100, y: 100, w: 5, h: 5, layer: 'F.Cu' }, rect: { x: 90, y: 90, w: 5, h: 5 } },
    ]);
    expect(edits).toEqual([]);
    expect(skipped.join(' ')).toContain('no editable literal');

    const { edits: de, skipped: dsk } = planZoneDeletions(src, [{ x: 100, y: 100, w: 5, h: 5, layer: 'F.Cu' }]);
    expect(de).toEqual([]);
    expect(dsk.join(' ')).toContain('no removable literal');
  });

  it('keepouts edit and delete the same way', () => {
    const { edits } = planZoneGeometryEdits(src, [
      { original: { x: 20, y: 20, w: 3, h: 3, layer: 'F.Cu' }, rect: { x: 21, y: 21, w: 4, h: 4 } },
    ]);
    expect(applyPlacementEdits(src, edits)).toContain("typecad.keepout({ layers: ['F.Cu'], x: 21, y: 21, width: 4, height: 4 })");
    const { edits: de } = planZoneDeletions(src, [{ x: 20, y: 20, w: 3, h: 3, layer: 'F.Cu' }]);
    expect(applyPlacementEdits(src, de)).not.toContain('typecad.keepout');
  });

  it('polygon (points) zones delete by bounding box and reassign nets', () => {
    // the exact absorbed zone from the live session: an L-shaped pour the
    // import wrote as points. bbox: x 144.236, y 78.875, w 2.971, h 2.28
    const poly = `  typecad.zone({ layers: ['F.Cu'], points: [{ x: 144.236, y: 78.875 }, { x: 147.207, y: 78.875 }, { x: 147.187, y: 79.929 }, { x: 145.386, y: 79.948 }, { x: 145.386, y: 81.155 }, { x: 144.236, y: 81.117 }], priority: 1 });\n`;
    const withPoly = src + poly;
    const bbox = { x: 144.236, y: 78.875, w: 2.971, h: 2.28, layer: 'F.Cu' };

    // delete removes the whole statement
    const { edits: de, skipped: dsk } = planZoneDeletions(withPoly, [bbox]);
    expect(dsk).toEqual([]);
    expect(applyPlacementEdits(withPoly, de)).not.toContain('points');

    // a pure net reassignment (geometry unchanged) inserts the net key and
    // leaves the points untouched
    const { edits: ne, skipped: nsk } = planZoneGeometryEdits(withPoly, [
      { original: bbox, rect: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h }, net: 'GND' },
    ]);
    expect(nsk).toEqual([]);
    const rewritten = applyPlacementEdits(withPoly, ne);
    expect(rewritten).toContain("net: 'GND'");
    expect(rewritten).toContain('points: [{ x: 144.236, y: 78.875 }');

    // a geometry change on a polygon is refused with the redraw hint — a
    // rect rewrite would replace the L with its bounding box
    const { edits: ge, skipped: gsk } = planZoneGeometryEdits(withPoly, [
      { original: bbox, rect: { x: 144, y: 78, w: 4, h: 3 } },
    ]);
    expect(ge).toEqual([]);
    expect(gsk.join(' ')).toContain('polygon (points) zone');
    expect(gsk.join(' ')).toContain('delete and redraw');

    // the priority floor sees polygon zones too
    expect(maxZonePriority(withPoly)).toBe(1);
  });
});
