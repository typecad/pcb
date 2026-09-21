// Native DRC engine (phase 1: copper core) — synthetic boards per check,
// plus KiCad-parity conventions: exact-min gaps pass, no-net vs no-net is
// unchecked, through vias report dimension violations once.
import { describe, expect, it } from 'vitest';
import { parse, SNode } from '../../sexpr/index.js';
import type { SExpr } from '../../sexpr/index.js';
import { runDrc, type DrcViolation } from '../pcb_drc_engine.js';

function board(body: string): string {
  return `(kicad_pcb (version 20241229)
    (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
    (net 0 "") (net 1 "GND") (net 2 "SIG") (net 3 "VCC")
    ${body}
  )`;
}

function drc(body: string, constraints = {}): DrcViolation[] {
  return runDrc(board(body), constraints).violations;
}

const types = (vs: DrcViolation[]): string[] => vs.map((v) => v.type);

describe('native DRC (phase 1 copper core)', () => {
  it('reports shorting between different-net overlapping tracks once per net pair', () => {
    const vs = drc(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 12 10) (end 18 10) (width 0.3) (layer "F.Cu") (net 2) (uuid "b"))`);
    expect(types(vs)).toEqual(['shorting_items']);
    expect(vs[0]!.description).toContain('nets GND and SIG');
  });

  it('does not check same-net overlap', () => {
    const vs = drc(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 12 10) (end 18 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "b"))`);
    expect(vs).toHaveLength(0);
  });

  it('does not check no-net against no-net (KiCad convention)', () => {
    const vs = drc(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (uuid "a"))
      (segment (start 12 10) (end 18 10) (width 0.3) (layer "F.Cu") (uuid "b"))`);
    expect(vs).toHaveLength(0);
  });

  it('reports crossing tracks (point intersection)', () => {
    const vs = drc(`
      (segment (start 10 10) (end 20 10) (width 0.2) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 15 5) (end 15 15) (width 0.2) (layer "F.Cu") (net 2) (uuid "b"))`);
    expect(types(vs)).toContain('tracks_crossing');
  });

  it('flags clearance below the minimum but passes exact-min and clear gaps', () => {
    // 0.15mm edge gap (tracks 0.3 wide, centers 0.45 apart) violates 0.2
    const bad = drc(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 10 10.45) (end 20 10.45) (width 0.3) (layer "F.Cu") (net 2) (uuid "b"))`);
    expect(types(bad)).toContain('clearance');
    // exact 0.2 gap (centers 0.5 apart) passes
    const exact = drc(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 10 10.5) (end 20 10.5) (width 0.3) (layer "F.Cu") (net 2) (uuid "b"))`);
    expect(types(exact)).not.toContain('clearance');
    // comfortable gap passes
    const ok = drc(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 10 12) (end 20 12) (width 0.3) (layer "F.Cu") (net 2) (uuid "b"))`);
    expect(ok).toHaveLength(0);
  });

  it('flags via annular width once per via (not per layer)', () => {
    const vs = drc(`
      (via (at 15 15) (size 0.35) (drill 0.15) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`);
    const annular = vs.filter((v) => v.type === 'annular_width');
    expect(annular).toHaveLength(1);
    expect(annular[0]!.description).toContain('actual 0.1000 mm');
    // exact-min ring passes: 0.6 via, 0.3 drill → ring 0.15
    const ok = drc(`
      (via (at 15 15) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))`);
    expect(types(ok)).not.toContain('annular_width');
  });

  it('flags hole-to-hole below minimum', () => {
    const vs = drc(`
      (via (at 15 15) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))
      (via (at 15.5 15) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2) (uuid "v2"))`);
    // centers 0.5 apart, radii 0.15+0.15 → edge gap 0.2 < 0.25
    expect(types(vs)).toContain('hole_to_hole');
  });

  it('flags hole-to-foreign-copper below minimum', () => {
    // NPTH (pad size == drill) at (15,15); foreign track 0.45 from center
    // → 0.45 - 0.25 (hole r) = 0.2 < 0.25 hole clearance
    const vs = drc(`
      (footprint "T:X" (layer "F.Cu") (at 15 15)
        (pad "" np_thru_hole circle (at 0 0) (size 0.5 0.5) (drill 0.5) (layers "*.Cu")))
      (segment (start 15.45 10) (end 15.45 20) (width 0.2) (layer "F.Cu") (net 2) (uuid "t"))`);
    expect(types(vs)).toContain('hole_clearance');
  });

  it('suppresses hole checks for pairs that already short', () => {
    // track runs straight through a foreign pad: shorting only, no hole noise
    const vs = drc(`
      (footprint "T:X" (layer "F.Cu") (at 15 15)
        (pad "1" thru_hole circle (at 0 0) (size 1.6 1.6) (drill 0.8) (layers "*.Cu") (net 1)))
      (segment (start 10 15) (end 20 15) (width 0.3) (layer "F.Cu") (net 2) (uuid "t"))`);
    expect(types(vs)).toEqual(['shorting_items']);
  });

  it('checks zone fills as copper: fills tighter than the rule minimum get flagged', () => {
    // zone declared clearance 0.1 < DRC min 0.2: the fill legitimately keeps
    // only 0.1 from the foreign track (its own constraint) — the DRC flags
    // the resulting gap. A same-net pad keeps the islands alive.
    const vs = drc(`
      (footprint "T:X" (layer "F.Cu") (at 15 8)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (segment (start 15 5) (end 15 15) (width 0.3) (layer "F.Cu") (net 2) (uuid "t"))
      (zone (net 1) (net_name "GND") (layer "F.Cu") (connect_pads (clearance 0.1))
        (polygon (pts (xy 5 4) (xy 25 4) (xy 25 16) (xy 5 16))))`);
    expect(types(vs)).toContain('clearance');
    const v = vs.find((x) => x.type === 'clearance')!;
    expect(v.items.some((i) => i.description.startsWith('Filled zone [GND]'))).toBe(true);
    // foreign track outside the zone: clean
    const ok = drc(`
      (footprint "T:X" (layer "F.Cu") (at 15 8)
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1) (uuid "p1")))
      (segment (start 5 20) (end 25 20) (width 0.3) (layer "F.Cu") (net 2) (uuid "t"))
      (zone (net 1) (net_name "GND") (layer "F.Cu") (connect_pads (clearance 0.2))
        (polygon (pts (xy 5 4) (xy 25 4) (xy 25 16) (xy 5 16))))`);
    expect(ok.filter((x) => x.type !== 'hole_clearance')).toHaveLength(0);
  });

  it('honors severity overrides (ignore suppresses reporting)', () => {
    const vs = runDrc(board(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 12 10) (end 18 10) (width 0.3) (layer "F.Cu") (net 2) (uuid "b"))`), {
      severities: { shorting_items: 'ignore' },
    }).violations;
    expect(vs).toHaveLength(0);
  });

  it('uses net-class-aware board minimum from constraints', () => {
    const vs = drc(`
      (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "a"))
      (segment (start 10 10.45) (end 20 10.45) (width 0.3) (layer "F.Cu") (net 2) (uuid "b"))`, {
      min_clearance: 0.1,
    });
    expect(types(vs)).not.toContain('clearance');
  });

  it('emits KiCad-schema descriptions for report parity', () => {
    const vs = drc(`
      (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 15 15)
        (pad "1" smd roundrect (at -0.75 0) (size 0.8 0.75) (layers "F.Cu") (net 2) (uuid "p1")))
      (segment (start 10 15) (end 20 15) (width 0.3) (layer "F.Cu") (net 1) (uuid "t"))`);
    const v = vs.find((x) => x.type === 'shorting_items')!;
    expect(v).toBeDefined();
    const descs = v.items.map((i) => i.description);
    expect(descs.some((d) => d.startsWith('Pad 1 [SIG] of '))).toBe(true);
    expect(descs.some((d) => d.startsWith('Track [GND] on F.Cu, length'))).toBe(true);
    // positions present for every item
    for (const i of v.items) expect(Number.isFinite(i.pos.x)).toBe(true);
  });
});
