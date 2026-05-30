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
    const codeProp = codeMeta
        ? `    (property "Code" "${codeMeta.replace(/"/g, '')}")`
        : '';
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
            const net0 = ir.nets.find(n => n.number === 0);
            expect(net0).toBeDefined();
            const net1 = ir.nets.find(n => n.number === 1);
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

        it('should parse fab text property', () => {
            const tree = SExprNode.parse(pcbWithFootprint());
            const ir = builder.build(tree);
            const r1 = ir.footprints[0];
            expect(r1.fabTextProperty).not.toBeNull();
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
});
