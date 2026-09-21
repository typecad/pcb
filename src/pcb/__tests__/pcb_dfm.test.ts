// Tier-1 DFM checks: synthetic fixtures with hand-computed expectations.
// Advisory checks run at warning severity by default (conf can promote).
import { describe, expect, it } from 'vitest';
import { parse, SNode } from '../../sexpr/index.js';
import type { SExpr } from '../../sexpr/index.js';
import { runDrc, type DrcViolation } from '../pcb_drc_engine.js';

function board(body: string): string {
  return `(kicad_pcb (version 20241229)
    (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
    (net 0 "") (net 1 "GND") (net 2 "SIG") (net 3 "VCC")
    (general (thickness 1.6))
    ${body}
  )`;
}

function dfm(body: string, constraints: Record<string, unknown> = {}): DrcViolation[] {
  return runDrc(board(body), constraints).violations;
}

const types = (vs: DrcViolation[]): string[] => vs.map((v) => v.type);
const EDGES = `
  (gr_line (start 0 0) (end 30 0) (layer "Edge.Cuts") (stroke (width 0.05) (type solid)) (uuid "e1"))
  (gr_line (start 30 0) (end 30 20) (layer "Edge.Cuts") (stroke (width 0.05) (type solid)) (uuid "e2"))
  (gr_line (start 30 20) (end 0 20) (layer "Edge.Cuts") (stroke (width 0.05) (type solid)) (uuid "e3"))
  (gr_line (start 0 20) (end 0 0) (layer "Edge.Cuts") (stroke (width 0.05) (type solid)) (uuid "e4"))`;

describe('DFM tier 1', () => {
  it('flags dangling track ends (no same-net copper at the endpoint)', () => {
    // one end lands on a same-net pad, the other floats
    const vs = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 10 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "t1"))`);
    const dangling = vs.filter((v) => v.type === 'track_dangling');
    expect(dangling).toHaveLength(1);
    expect(dangling[0]!.severity).toBe('warning');
    expect(dangling[0]!.items[0]!.pos).toEqual({ x: 20, y: 10 });
    // both ends connected: clean
    const ok = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 10 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (footprint "T:Y" (layer "F.Cu") (at 20 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p2")))
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "t1"))`);
    expect(ok.filter((v) => v.type === 'track_dangling')).toHaveLength(0);
  });

  it('flags holes too close to the board edge', () => {
    // NPTH centered 0.4mm from the edge line (min 0.5)
    const vs = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 0.4 10)
        (pad "" np_thru_hole circle (at 0 0) (size 1.2 1.2) (drill 1.2) (layers "*.Cu") (uuid "h1")))`);
    expect(types(vs)).toContain('hole_edge_clearance');
    // centered 2mm from the edge: clean
    const ok = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 2 10)
        (pad "" np_thru_hole circle (at 0 0) (size 1.2 1.2) (drill 1.2) (layers "*.Cu") (uuid "h1")))`);
    expect(ok.filter((v) => v.type === 'hole_edge_clearance')).toHaveLength(0);
  });

  it('flags drill aspect ratio above the plating limit', () => {
    // 1.6mm board / 0.15mm via drill = 10.67:1 > 10
    const vs = dfm(`
      ${EDGES}
      (via (at 15 10) (size 0.35) (drill 0.15) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`);
    const ar = vs.filter((v) => v.type === 'drill_aspect_ratio');
    expect(ar).toHaveLength(1);
    expect(ar[0]!.description).toContain('10.67');
    // 0.3mm drill = 5.33:1: clean
    const ok = dfm(`
      ${EDGES}
      (via (at 15 10) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`);
    expect(ok.filter((v) => v.type === 'drill_aspect_ratio')).toHaveLength(0);
  });

  it('flags acid traps at acute copper angles', () => {
    // a wedge-shaped custom pad (≈7° apex) is a genuine etch trap; rounded
    // track caps blend smooth (no false positives at acute track junctions)
    const vs = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (pad "1" smd custom (at 0 0 0) (size 0.5 0.5) (layers "F.Cu") (net 1) (uuid "p1")
          (primitives (gr_poly (pts (xy 0 0) (xy 5 0.3) (xy 5 -0.3)) (width 0)))))`);
    const trap = vs.find((v) => v.type === 'acid_trap');
    expect(trap).toBeDefined();
    expect(trap!.description).toContain('7°');
    expect(trap!.items[0]!.description).toContain('net GND');
    // right-angle copper (rect pad) is fine
    const ok = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (net 1) (uuid "p1")))`);
    expect(ok.filter((v) => v.type === 'acid_trap')).toHaveLength(0);
    // two tracks meeting acutely DO trap etchant at the junction crotch —
    // the classic case this check exists for
    const caps = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 25 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (footprint "T:B" (layer "F.Cu") (at 24.8 15.2)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p2")))
      (segment (start 15 10) (end 25 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "t1"))
      (segment (start 15 10) (end 24.8 15.2) (width 0.3) (layer "F.Cu") (net 1) (uuid "t2"))`);
    const capsTrap = caps.find((v) => v.type === 'acid_trap');
    expect(capsTrap).toBeDefined();
    expect(capsTrap!.description).toContain('28°');
  });

  it('flags silkscreen text below manufacturable height/thickness', () => {
    const vs = dfm(`
      ${EDGES}
      (gr_text "tiny" (at 15 10 0) (layer "F.SilkS") (effects (font (size 0.6 0.6) (thickness 0.05))))`);
    expect(types(vs)).toContain('text_height');
    expect(types(vs)).toContain('text_thickness');
    const ok = dfm(`
      ${EDGES}
      (gr_text "fine" (at 15 10 0) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.15))))`);
    expect(ok.filter((v) => v.type === 'text_height' || v.type === 'text_thickness')).toHaveLength(0);
  });

  it('flags silkscreen over solder mask openings', () => {
    // silk line crossing an SMD pad's mask aperture
    const vs = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu" "F.Mask") (net 1) (uuid "p1")))
      (gr_line (start 10 10) (end 20 10) (layer "F.SilkS") (stroke (width 0.15) (type solid)) (uuid "s1"))`);
    expect(types(vs)).toContain('silk_over_mask');
    // silk well clear of the pad: clean
    const ok = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu" "F.Mask") (net 1) (uuid "p1")))
      (gr_line (start 10 16) (end 20 16) (layer "F.SilkS") (stroke (width 0.15) (type solid)) (uuid "s1"))`);
    expect(ok.filter((v) => v.type === 'silk_over_mask')).toHaveLength(0);
  });

  it('flags via-in-pad (same-net via centered inside an SMD pad)', () => {
    const vs = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu" "F.Mask") (net 1) (uuid "p1")))
      (via (at 15 10) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`);
    expect(types(vs)).toContain('via_in_pad');
    // via beside the pad (overlapping edge would be its own concern): clean
    const ok = dfm(`
      ${EDGES}
      (footprint "T:X" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu" "F.Mask") (net 1) (uuid "p1")))
      (via (at 20 10) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`);
    expect(ok.filter((v) => v.type === 'via_in_pad')).toHaveLength(0);
  });

  it('flags an unclosed board outline', () => {
    const vs = dfm(`
      (gr_line (start 0 0) (end 30 0) (layer "Edge.Cuts") (stroke (width 0.05) (type solid)) (uuid "e1"))
      (gr_line (start 30 0) (end 30 20) (layer "Edge.Cuts") (stroke (width 0.05) (type solid)) (uuid "e2"))
      (gr_line (start 30 20) (end 0 20) (layer "Edge.Cuts") (stroke (width 0.05) (type solid)) (uuid "e3"))`);
    const bad = vs.filter((v) => v.type === 'edge_not_closed');
    expect(bad).toHaveLength(1);
    expect(bad[0]!.severity).toBe('error'); // structural, not advisory
    expect(types(dfm(EDGES))).not.toContain('edge_not_closed');
  });

  it('defaults every DFM check to warning severity (advisory)', () => {
    const vs = dfm(`
      ${EDGES}
      (via (at 15 10) (size 0.35) (drill 0.15) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`);
    const ar = vs.find((v) => v.type === 'drill_aspect_ratio')!;
    expect(ar.severity).toBe('warning');
    // conf severity overrides apply per check id
    const promoted = dfm(`
      ${EDGES}
      (via (at 15 10) (size 0.35) (drill 0.15) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`, {
      severities: { drill_aspect_ratio: 'error' },
    });
    expect(promoted.find((v) => v.type === 'drill_aspect_ratio')!.severity).toBe('error');
  });
});

describe('DFM tier 2', () => {
  it('flags copper slivers narrower than the fab minimum', () => {
    // a 0.08mm-wide custom-pad sliver between two healthy pads
    const vs = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (pad "1" smd custom (at 0 0 0) (size 0.5 0.5) (layers "F.Cu") (net 1) (uuid "p1")
          (primitives (gr_poly (pts (xy 0 -0.04) (xy 4 -0.04) (xy 4 0.04) (xy 0 0.04)) (width 0)))))`, {
      copper_sliver_quiet: true,
    });
    const sliver = vs.filter((v) => v.type === 'copper_sliver');
    expect(sliver.length).toBeGreaterThanOrEqual(1);
    expect(sliver[0]!.severity).toBe('warning');
    // healthy 0.3mm track is not a sliver
    const ok = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (segment (start 15 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "t1"))`, {
      copper_sliver_quiet: true,
    });
    expect(ok.filter((v) => v.type === 'copper_sliver')).toHaveLength(0);
  });

  it('flags solder mask web below the fab minimum between nearby pads', () => {
    // two SMD pads 0.05mm apart: web < 0.1
    const vs = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 10 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 1) (uuid "p1")))
      (footprint "T:B" (layer "F.Cu") (at 11.05 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 2) (uuid "p2")))`);
    expect(types(vs)).toContain('mask_web');
    // 0.5mm apart: healthy web
    const ok = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 10 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 1) (uuid "p1")))
      (footprint "T:B" (layer "F.Cu") (at 11.5 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 2) (uuid "p2")))`);
    expect(ok.filter((v) => v.type === 'mask_web')).toHaveLength(0);
  });

  it('flags courtyard overlap between footprints', () => {
    const vs = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (property "Reference" "A1" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
        (fp_line (start -2 -2) (end 2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 -2) (end 2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 2) (end -2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start -2 2) (end -2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (footprint "T:B" (layer "F.Cu") (at 16.5 10)
        (property "Reference" "B1" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
        (fp_line (start -2 -2) (end 2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 -2) (end 2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 2) (end -2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start -2 2) (end -2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 2) (uuid "p2")))`);
    expect(types(vs)).toContain('courtyard_overlap');
    // 6mm apart: courtyards clear
    const ok = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (property "Reference" "A1" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
        (fp_line (start -2 -2) (end 2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 -2) (end 2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 2) (end -2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start -2 2) (end -2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (footprint "T:B" (layer "F.Cu") (at 22 10)
        (property "Reference" "B1" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
        (fp_line (start -2 -2) (end 2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 -2) (end 2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start 2 2) (end -2 2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (fp_line (start -2 2) (end -2 -2) (stroke (width 0.05) (type solid)) (layer "F.Courtyard"))
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 2) (uuid "p2")))`);
    expect(ok.filter((v) => v.type === 'courtyard_overlap')).toHaveLength(0);
  });

  it('flags pads whose thermal relief resolves too few spokes', () => {
    // zone barely larger than the pad's thermal void: after edge pullback
    // the spoke stubs don't reach the sample band → 0 resolved
    const vs = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 15)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (zone (net 1) (net_name "GND") (layer "F.Cu") (connect_pads (clearance 0.2))
        (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.4))
        (polygon (pts (xy 14 14) (xy 16 14) (xy 16 16) (xy 14 16))))`);
    expect(types(vs)).toContain('min_resolved_spokes');
    // a generous zone resolves all four spokes
    const ok = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 15)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (zone (net 1) (net_name "GND") (layer "F.Cu") (connect_pads (clearance 0.2))
        (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.4))
        (polygon (pts (xy 10 10) (xy 20 10) (xy 20 20) (xy 10 20))))`);
    expect(ok.filter((v) => v.type === 'min_resolved_spokes')).toHaveLength(0);
  });

  it('missing_courtyard is ignore-by-default and promotable', () => {
    const vs = dfm(`
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))`);
    expect(vs.filter((v) => v.type === 'missing_courtyard')).toHaveLength(0);
    const promoted = dfm(
      `
      ${EDGES}
      (footprint "T:A" (layer "F.Cu") (at 15 10)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))`,
      { severities: { missing_courtyard: 'warning' } },
    );
    expect(promoted.filter((v) => v.type === 'missing_courtyard')).toHaveLength(1);
  });
});
