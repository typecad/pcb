import { describe, it, expect } from 'vitest';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { encodeCodeMetadata } from '../src/kicad2typecad/codec.js';
import type { CodeMetadata } from '../src/kicad2typecad/types.js';

const minimalPcb = `(kicad_pcb (version 20221018) (generator pcbnew)
  (net 0 "")
  (net 1 "VCC")
  (net 2 "GND")
  (segment (start 10 20) (end 30 40) (width 0.25) (layer F.Cu) (net 1))
  (segment (start 50 60) (end 70 80) (width 0.2) (layer B.Cu))
  (via (at 15 25) (size 0.6) (drill 0.3))
  (via (at 55 65) (size 0.8) (drill 0.4))
  (gr_rect (start 0 0) (end 100 100) (layer "Edge.Cuts"))
  (gr_line (start 5 5) (end 95 5) (layer "Edge.Cuts"))
  (gr_text "Label" (at 50 50 45) (layer "F.SilkS")
    (effects (font (size 1.27 1.27) (thickness 0.15)))
  )
)`;

const pcbWithFootprint = (codeMeta?: string) => {
  const codeProp = codeMeta ? `    (property "Code" "${codeMeta.replace(/"/g, '')}")` : '';
  return `(kicad_pcb (version 20221018) (generator pcbnew)
  (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
    (at 120 80 90)
    (uuid "abc-123-def")
    (property "Reference" "R1" (at 0 -1.43) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (property "Value" "10k" (at 0 1.43) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15)))
    )
${codeProp}
    (fp_text user "FAB_TEXT" (at 0 0.5 90) (layer "F.Fab")
      (effects (font (size 0.8 0.8) (thickness 0.1)))
    )
  )
  (footprint "Capacitor_SMD:C_0402" (layer "B.Cu")
    (at 200 100)
  )
)`;
};

describe('KicadIRBuilder', () => {
  const builder = new KicadIRBuilder();

  describe('build - minimal PCB', () => {
    it('should parse version and generator', () => {
      const tree = SExprNode.parse(minimalPcb);
      const ir = builder.build(tree);
      expect(ir.version).toBe('0');
      expect(ir.generator).toBe('pcbnew');
    });

    it('should parse nets (includes segment net children)', () => {
      const tree = SExprNode.parse(minimalPcb);
      const ir = builder.build(tree);
      expect(ir.nets.length).toBeGreaterThanOrEqual(3);
      const net0 = ir.nets.find((n) => n.number === 0);
      expect(net0).toBeDefined();
      const net1 = ir.nets.find((n) => n.number === 1);
      expect(net1).toBeDefined();
    });

    it('should parse segments with full data', () => {
      const tree = SExprNode.parse(minimalPcb);
      const ir = builder.build(tree);
      expect(ir.segments).toHaveLength(2);
      expect(ir.segments[0]).toEqual({
        start: { x: 10, y: 20 },
        end: { x: 30, y: 40 },
        width: 0.25,
        layer: 'F.Cu',
        net: 1,
      });
    });

    it('should parse segment without net', () => {
      const tree = SExprNode.parse(minimalPcb);
      const ir = builder.build(tree);
      expect(ir.segments[1].net).toBeUndefined();
    });

    it('should parse vias', () => {
      const tree = SExprNode.parse(minimalPcb);
      const ir = builder.build(tree);
      expect(ir.vias).toHaveLength(2);
      expect(ir.vias[0]).toEqual({
        at: { x: 15, y: 25 },
        size: 0.6,
        drill: 0.3,
      });
      expect(ir.vias[1]).toEqual({
        at: { x: 55, y: 65 },
        size: 0.8,
        drill: 0.4,
      });
    });

    it('should parse outlines on Edge.Cuts', () => {
      const tree = SExprNode.parse(minimalPcb);
      const ir = builder.build(tree);
      expect(ir.outlines).toHaveLength(2);
      expect(ir.outlines[0].type).toBe('rect');
      expect(ir.outlines[1].type).toBe('line');
    });

    it('should parse text elements', () => {
      const tree = SExprNode.parse(minimalPcb);
      const ir = builder.build(tree);
      expect(ir.textElements).toHaveLength(1);
      expect(ir.textElements[0].text).toBe('Label');
      expect(ir.textElements[0].x).toBe(50);
      expect(ir.textElements[0].y).toBe(50);
      expect(ir.textElements[0].rotation).toBe(45);
      expect(ir.textElements[0].layer).toBe('F.SilkS');
    });
  });

  describe('build - footprints', () => {
    it('should parse footprint with full data', () => {
      const tree = SExprNode.parse(pcbWithFootprint());
      const ir = builder.build(tree);
      expect(ir.footprints).toHaveLength(2);
      const r1 = ir.footprints[0];
      expect(r1.footprintName).toBe('Resistor_SMD:R_0603_1608Metric');
      expect(r1.position).toEqual({ x: 120, y: 80, rotation: 90 });
      expect(r1.side).toBe('front');
      expect(r1.uuid).toBe('abc-123-def');
    });

    it('should detect back-side components', () => {
      const tree = SExprNode.parse(pcbWithFootprint());
      const ir = builder.build(tree);
      const c1 = ir.footprints[1];
      expect(c1.side).toBe('back');
    });

    it('should attempt Code metadata extraction', () => {
      const tree = SExprNode.parse(pcbWithFootprint());
      const ir = builder.build(tree);
      expect(ir.footprints[0].codeMetadata).toBeNull();
    });

    it('should fallback uuid to footprintName:reference', () => {
      const tree = SExprNode.parse(pcbWithFootprint());
      const ir = builder.build(tree);
      const c1 = ir.footprints[1];
      expect(c1.uuid).toBe('Capacitor_SMD:C_0402:?');
    });

    it('should parse reference property positioning', () => {
      const tree = SExprNode.parse(pcbWithFootprint());
      const ir = builder.build(tree);
      const r1 = ir.footprints[0];
      expect(r1.referenceProperty).not.toBeNull();
      expect(r1.referenceProperty!.y).toBeCloseTo(-1.43);
    });

    it('should parse value property positioning', () => {
      const tree = SExprNode.parse(pcbWithFootprint());
      const ir = builder.build(tree);
      const r1 = ir.footprints[0];
      expect(r1.valueProperty).not.toBeNull();
    });

    it('should return null for footprint without name', () => {
      const pcb = `(kicad_pcb (footprint (at 0 0)))`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.footprints).toHaveLength(0);
    });
  });

  describe('build - outlines', () => {
    it('should skip non-Edge.Cuts outlines', () => {
      const pcb = `(kicad_pcb
  (gr_rect (start 0 0) (end 10 10) (layer "F.Cu"))
  (gr_line (start 0 0) (end 10 10) (layer "Edge.Cuts"))
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.outlines).toHaveLength(1);
      expect(ir.outlines[0].type).toBe('line');
    });

    it('should parse arc outline', () => {
      const pcb = `(kicad_pcb
  (gr_arc (start 0 0) (mid 5 5) (end 10 0) (layer "Edge.Cuts"))
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.outlines).toHaveLength(1);
      expect(ir.outlines[0].type).toBe('arc');
      expect(ir.outlines[0].mid).toEqual({ x: 5, y: 5 });
    });

    it('should parse circle outline', () => {
      const pcb = `(kicad_pcb
  (gr_circle (center 50 50) (end 70 50) (layer "Edge.Cuts"))
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.outlines).toHaveLength(1);
      expect(ir.outlines[0].type).toBe('circle');
      expect(ir.outlines[0].center).toEqual({ x: 50, y: 50 });
    });

    it('should calculate rect width/height', () => {
      const pcb = `(kicad_pcb
  (gr_rect (start 10 20) (end 50 70) (layer "Edge.Cuts"))
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.outlines[0].width).toBe(40);
      expect(ir.outlines[0].height).toBe(50);
    });

    it('should parse gr_poly outline points', () => {
      const pcb = `(kicad_pcb
  (gr_poly (pts (xy 0 0) (xy 100 0) (xy 100 80) (xy 50 100) (xy 0 80)) (layer "Edge.Cuts"))
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.outlines).toHaveLength(1);
      expect(ir.outlines[0].type).toBe('poly');
      expect(ir.outlines[0].points).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 50, y: 100 },
        { x: 0, y: 80 },
      ]);
    });

    it('should reject gr_poly with fewer than 3 points', () => {
      const pcb = `(kicad_pcb
  (gr_poly (pts (xy 0 0) (xy 10 10)) (layer "Edge.Cuts"))
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.outlines).toHaveLength(0);
    });

    it('should skip gr_poly on non-Edge.Cuts layers', () => {
      const pcb = `(kicad_pcb
  (gr_poly (pts (xy 0 0) (xy 10 0) (xy 10 10)) (layer "F.SilkS"))
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.outlines).toHaveLength(0);
    });
  });

  describe('build - stackup', () => {
    it('should return null when no setup/stackup present', () => {
      const pcb = `(kicad_pcb (version 20221018) (generator pcbnew))`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.stackup).toBeNull();
    });

    it('should parse a 2-layer stackup and count copper layers', () => {
      const pcb = `(kicad_pcb
  (setup
    (stackup
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4"))
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (copper_finish "None")
      (dielectric_constraints no)
    )
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.stackup).not.toBeNull();
      expect(ir.stackup!.copperLayerCount).toBe(2);
      expect(ir.stackup!.layers).toHaveLength(3);
      expect(ir.stackup!.layers[0].name).toBe('F.Cu');
      expect(ir.stackup!.layers[0].thickness).toBe(0.035);
      expect(ir.stackup!.copperFinish).toBe('None');
      expect(ir.stackup!.dielectricConstraints).toBe(false);
    });

    it('should parse a 4-layer stackup with In1.Cu/In2.Cu', () => {
      const pcb = `(kicad_pcb
  (setup
    (stackup
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "prepreg") (thickness 0.21))
      (layer "In1.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 2" (type "core") (thickness 1.065))
      (layer "In2.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 3" (type "prepreg") (thickness 0.21))
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (copper_finish "ENIG")
      (dielectric_constraints yes)
    )
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.stackup!.copperLayerCount).toBe(4);
      expect(ir.stackup!.copperFinish).toBe('ENIG');
      expect(ir.stackup!.dielectricConstraints).toBe(true);
    });
  });

  describe('build - text elements with effects', () => {
    it('should parse font size and thickness', () => {
      const pcb = `(kicad_pcb
  (gr_text "Hello" (at 10 20) (layer "F.SilkS")
    (effects (font (size 2 3) (thickness 0.2)))
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.textElements[0].fontSize).toEqual([2, 3]);
      expect(ir.textElements[0].thickness).toBe(0.2);
    });

    it('should parse bold and italic', () => {
      const pcb = `(kicad_pcb
  (gr_text "BoldItalic" (at 0 0) (layer "F.SilkS")
    (effects (font (size 1 1) bold italic))
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.textElements[0].bold).toBe(true);
      expect(ir.textElements[0].italic).toBe(true);
    });

    it('should parse justify', () => {
      const pcb = `(kicad_pcb
  (gr_text "Justified" (at 0 0) (layer "F.SilkS")
    (effects (font (size 1 1)) (justify left bottom mirror))
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.textElements[0].justify).toEqual({
        horizontal: 'left',
        vertical: 'bottom',
        mirror: true,
      });
    });

    it('should parse hide at top level', () => {
      const pcb = `(kicad_pcb
  (gr_text "Hidden" (at 0 0) (layer "F.SilkS") hide
    (effects (font (size 1 1)))
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.textElements[0].hide).toBe(true);
    });

    it('should parse font face', () => {
      const pcb = `(kicad_pcb
  (gr_text "Styled" (at 0 0) (layer "F.SilkS")
    (effects (font (face "Inter") (size 1 1)))
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.textElements[0].fontFace).toBe('Inter');
    });
  });

  describe('build - edge cases', () => {
    it('should handle empty PCB', () => {
      const pcb = `(kicad_pcb (version 20221018) (generator pcbnew))`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.footprints).toHaveLength(0);
      expect(ir.segments).toHaveLength(0);
      expect(ir.vias).toHaveLength(0);
      expect(ir.outlines).toHaveLength(0);
      expect(ir.textElements).toHaveLength(0);
      expect(ir.nets).toHaveLength(0);
    });

    it('should handle segment where parser returns 0 for non-numeric', () => {
      const pcb = `(kicad_pcb (segment (start abc def) (end 10 10) (width 0.2) (layer "F.Cu")))`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.segments).toHaveLength(1);
      expect(ir.segments[0].start.x).toBe(0);
      expect(ir.segments[0].start.y).toBe(0);
    });

    it('should handle via without at node', () => {
      const pcb = `(kicad_pcb (via (size 0.6) (drill 0.3)))`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.vias).toHaveLength(0);
    });

    it('should handle net without number', () => {
      const pcb = `(kicad_pcb (net abc "VCC"))`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.nets).toHaveLength(0);
    });

    it('should default position when no at node', () => {
      const pcb = `(kicad_pcb
  (footprint "Test:FP" (layer "F.Cu")
    (property "Reference" "U1")
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.footprints[0].position).toEqual({ x: 0, y: 0, rotation: 0 });
    });
  });

  describe('build - fp_text layout parsing', () => {
    const pcbWithFpText = `(kicad_pcb (version 20221018) (generator pcbnew)
  (footprint "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm" (layer "F.Cu")
    (at 100 80 0)
    (uuid "test-uuid-1")
    (property "Reference" "U1" (at 0 -5) (layer "F.SilkS"))
    (property "Value" "LM358" (at 0 5) (layer "F.Fab"))
    (fp_text reference "U1" (at 0 -3.81 0) (layer "F.SilkS")
      (effects (font (size 1.27 1.27) (thickness 0.15)))
    )
    (fp_text value "LM358" (at 0 3.81 90) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.1)))
    )
    (fp_text user "\${REFERENCE}" (at 0 0 180) (layer "F.Fab")
      (effects (font (size 0.8 0.8) (thickness 0.08)))
    )
  )
  (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu")
    (at 50 50 0)
    (uuid "test-uuid-2")
    (property "Reference" "R1" (at 0 -1) (layer "F.SilkS"))
    (fp_text reference "R1" (at 0 -1.5 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (fp_text value "10k" (at 0 1.5 0) (layer "F.Fab")
      (effects (font (size 0.5 0.5) (thickness 0.05) bold italic))
    )
  )
)`;

    it('should parse referenceLayout from fp_text reference', () => {
      const tree = SExprNode.parse(pcbWithFpText);
      const ir = builder.build(tree);
      const u1 = ir.footprints.find((f) => f.reference === 'U1');
      expect(u1).toBeDefined();
      expect(u1!.referenceLayout).toBeDefined();
      expect(u1!.referenceLayout!.x).toBe(0);
      expect(u1!.referenceLayout!.y).toBe(-3.81);
      expect(u1!.referenceLayout!.rotation).toBe(0);
    });

    it('should parse valueLayout from fp_text value', () => {
      const tree = SExprNode.parse(pcbWithFpText);
      const ir = builder.build(tree);
      const u1 = ir.footprints.find((f) => f.reference === 'U1');
      expect(u1!.valueLayout).toBeDefined();
      expect(u1!.valueLayout!.x).toBe(0);
      expect(u1!.valueLayout!.y).toBe(3.81);
      expect(u1!.valueLayout!.rotation).toBe(90);
    });

    it('should parse fabLayout from fp_text user ${REFERENCE}', () => {
      const tree = SExprNode.parse(pcbWithFpText);
      const ir = builder.build(tree);
      const u1 = ir.footprints.find((f) => f.reference === 'U1');
      expect(u1!.fabLayout).toBeDefined();
      expect(u1!.fabLayout!.text).toBe('${REFERENCE}');
      expect(u1!.fabLayout!.x).toBe(0);
      expect(u1!.fabLayout!.y).toBe(0);
      expect(u1!.fabLayout!.rotation).toBe(180);
      expect(u1!.fabLayout!.width).toBe(0.8);
      expect(u1!.fabLayout!.height).toBe(0.8);
      expect(u1!.fabLayout!.thickness).toBe(0.08);
    });

    it('should not parse non-REFERENCE user text as fabLayout', () => {
      const pcb = `(kicad_pcb
  (footprint "Test:FP" (layer "F.Cu")
    (at 0 0 0)
    (uuid "test-uuid")
    (property "Reference" "U2")
    (fp_text user "some other text" (at 1 1 0) (layer "F.Fab"))
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.footprints[0].fabLayout).toBeUndefined();
    });

    it('should parse bold and italic from fp_text value', () => {
      const tree = SExprNode.parse(pcbWithFpText);
      const ir = builder.build(tree);
      const r1 = ir.footprints.find((f) => f.reference === 'R1');
      expect(r1!.valueLayout).toBeDefined();
      expect(r1!.valueLayout!.bold).toBe(true);
      expect(r1!.valueLayout!.italic).toBe(true);
    });

    it('should leave layouts undefined for footprints without fp_text', () => {
      const pcb = `(kicad_pcb
  (footprint "Test:FP" (layer "F.Cu")
    (at 10 20 0)
    (uuid "test-uuid-3")
    (property "Reference" "U99")
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      const u99 = ir.footprints.find((f) => f.reference === 'U99');
      expect(u99!.referenceLayout).toBeUndefined();
      expect(u99!.valueLayout).toBeUndefined();
      expect(u99!.fabLayout).toBeUndefined();
    });

    it('should handle hide flag in fp_text', () => {
      const pcb = `(kicad_pcb
  (footprint "Test:FP" (layer "F.Cu")
    (at 0 0 0)
    (uuid "test-uuid")
    (property "Reference" "U3")
    (fp_text reference "U3" (at 0 0 0) (layer "F.SilkS")
      (effects (font (size 1 1)) hide)
    )
  )
)`;
      const tree = SExprNode.parse(pcb);
      const ir = builder.build(tree);
      expect(ir.footprints[0].referenceLayout).toBeDefined();
      expect(ir.footprints[0].referenceLayout!.show).toBe(false);
    });
  });
});
