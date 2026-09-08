import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';
import { KicadIRBuilder } from '../src/kicad2typecad/ir_builder.js';
import { generateOutlineCode, generateStackupCode, type ChalkHelpers } from '../src/kicad2typecad/display.js';
import logger from '../src/utils/logging.js';
import type { KicadIR } from '../src/kicad2typecad/types.js';

/**
 * Identity chalk helper — produces plain strings with no ANSI codes, so the
 * generated typeCAD source can be asserted verbatim.
 */
const PLAIN_CH: ChalkHelpers = {
  chKey: (s: string) => s,
  chProp: (s: string) => s,
  chStr: (s: string) => s,
  chNum: (n: number) => String(n),
  chPunc: (s: string) => s,
  chVar: (s: string) => s,
};

function buildIr(pcb: string): KicadIR {
  const tree = SExprNode.parse(pcb);
  return new KicadIRBuilder().build(tree);
}

/** Capture all logger.log calls as a joined string. */
function captureLogs(fn: () => void): string {
  const calls: string[] = [];
  const spy = vi.spyOn(logger, 'log').mockImplementation((...args: unknown[]) => {
    calls.push(args.join(' '));
  });
  fn();
  spy.mockRestore();
  return calls.join('\n');
}

describe('generateOutlineCode round-trip', () => {
  it('emits typecad.outline for a single gr_rect', () => {
    const ir = buildIr(`(kicad_pcb
  (gr_rect (start 10 20) (end 60 70) (layer "Edge.Cuts"))
)`);
    const out = captureLogs(() => generateOutlineCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.outline(10, 20, 50, 50);');
  });

  it('emits typecad.outline for a 4-line rectangle', () => {
    const ir = buildIr(`(kicad_pcb
  (gr_line (start 0 0) (end 100 0) (layer "Edge.Cuts"))
  (gr_line (start 100 0) (end 100 80) (layer "Edge.Cuts"))
  (gr_line (start 100 80) (end 0 80) (layer "Edge.Cuts"))
  (gr_line (start 0 80) (end 0 0) (layer "Edge.Cuts"))
)`);
    const out = captureLogs(() => generateOutlineCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.outline(0, 0, 100, 80);');
  });

  it('emits typecad.outlineCircle for a circular board', () => {
    const ir = buildIr(`(kicad_pcb
  (gr_circle (center 50 50) (end 100 50) (layer "Edge.Cuts"))
)`);
    const out = captureLogs(() => generateOutlineCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.outlineCircle(50, 50, 50);');
  });

  it('emits typecad.outlinePolygon for a polygon board', () => {
    const ir = buildIr(`(kicad_pcb
  (gr_poly (pts (xy 0 0) (xy 100 0) (xy 100 80) (xy 0 80)) (layer "Edge.Cuts"))
)`);
    const out = captureLogs(() => generateOutlineCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.outlinePolygon(');
    expect(out).toContain('{ x: 0, y: 0 }');
    expect(out).toContain('{ x: 100, y: 80 }');
    expect(out).not.toContain('// Note:');
  });

  it('emits cutoutCircle for a circle inside a rectangular outline', () => {
    const ir = buildIr(`(kicad_pcb
  (gr_rect (start 0 0) (end 100 100) (layer "Edge.Cuts"))
  (gr_circle (center 20 20) (end 23 20) (layer "Edge.Cuts"))
)`);
    const out = captureLogs(() => generateOutlineCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.outline(0, 0, 100, 100);');
    expect(out).toContain('typecad.cutoutCircle(20, 20, 3);');
  });

  it('emits cutout for a polygon inside a rectangular outline', () => {
    const ir = buildIr(`(kicad_pcb
  (gr_rect (start 0 0) (end 100 100) (layer "Edge.Cuts"))
  (gr_poly (pts (xy 20 20) (xy 40 20) (xy 40 40) (xy 20 40)) (layer "Edge.Cuts"))
)`);
    const out = captureLogs(() => generateOutlineCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.cutout(');
    expect(out).toContain('{ x: 20, y: 20 }');
    expect(out).toContain('{ x: 40, y: 40 }');
  });
});

describe('generateStackupCode round-trip', () => {
  it('emits typecad.stackup with the copper layer count', () => {
    const ir = buildIr(`(kicad_pcb
  (setup
    (stackup
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4"))
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (copper_finish "None")
      (dielectric_constraints no)
    )
  )
)`);
    const out = captureLogs(() => generateStackupCode(ir, 'test', PLAIN_CH));
    expect(out).toContain('typecad.stackup(2);');
  });

  it('emits options for non-default copper finish', () => {
    const ir = buildIr(`(kicad_pcb
  (setup
    (stackup
      (layer "F.Cu" (type "copper") (thickness 0.035))
      (layer "dielectric 1" (type "core") (thickness 1.51))
      (layer "B.Cu" (type "copper") (thickness 0.035))
      (copper_finish "ENIG")
      (dielectric_constraints yes)
    )
  )
)`);
    const out = captureLogs(() => generateStackupCode(ir, 'test', PLAIN_CH));
    expect(out).toContain("typecad.stackup(2, { copper_finish: 'ENIG', dielectric_constraints: true });");
  });

  it('emits nothing when no stackup present', () => {
    const ir = buildIr(`(kicad_pcb (version 20221018) (generator pcbnew))`);
    const out = captureLogs(() => generateStackupCode(ir, 'test', PLAIN_CH));
    expect(out).toBe('');
  });
});
