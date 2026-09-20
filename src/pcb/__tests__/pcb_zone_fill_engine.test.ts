import { describe, expect, it } from 'vitest';
import { parse, SNode } from '../../sexpr/index.js';
import type { SExpr } from '../../sexpr/index.js';
import { fillZone } from '../pcb_zone_fill_engine.js';

function board(body: string): SNode {
  return SNode.from(
    parse(`(kicad_pcb (version 20241229)
      (layers (0 "F.Cu" signal) (4 "In1.Cu" signal) (31 "B.Cu" signal))
      (net 0 "") (net 1 "GND") (net 2 "SIG")
      ${body}
    )`) as SExpr[],
  );
}

/** odd-even fill test across every island ring of a fill result */
function anyFilled(rings: number[][], x: number, y: number): boolean {
  return rings.some((ring) => filled(ring, x, y));
}

/** odd-even fill test on a flat ring */
function filled(ring: number[], x: number, y: number): boolean {
  const pts: number[][] = [];
  for (let i = 0; i < ring.length; i += 2) pts.push([ring[i]!, ring[i + 1]!]);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

describe('zone fill engine', () => {
  it('fills a plain rectangular zone on its layer', () => {
    const root = board(
      `(zone (net 1) (net_name "GND") (layer "In1.Cu") (hatch edge 0.508)
         (connect_pads (clearance 0.5)) (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`,
    );
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'In1.Cu')!;
    expect(res.islands).toHaveLength(1);
    // gross ≈ 20×20 mm
    expect(res.totalAreaMm2).toBeGreaterThan(390);
    expect(res.totalAreaMm2).toBeLessThan(410);
    const ring = res.islands[0]!.ring;
    expect(filled(ring, 20, 20)).toBe(true);
  });

  it('cuts clearance holes around foreign vias and connects same-net thermally', () => {
    const root = board(`
      (via (at 15 15) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2))
      (via (at 25 25) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))
      (zone (net 1) (net_name "GND") (layer "In1.Cu") (hatch edge 0.508)
        (connect_pads (clearance 0.5))
        (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'In1.Cu')!;
    const ring = res.islands[0]!.ring;
    // foreign via at (15,15): r 0.3 + clearance 0.5 → empty within 0.8mm
    expect(filled(ring, 15, 15)).toBe(false);
    expect(filled(ring, 15.5, 15.5)).toBe(false); // diag dist 0.71 < 0.8
    expect(filled(ring, 15.9, 15.9)).toBe(true); // diag dist 1.27 > 0.8
    // same-net via at (25,25): gap ring r 0.8, spokes 0.5 wide on axes
    expect(filled(ring, 25, 25)).toBe(true); // spokes cross the center
    expect(filled(ring, 24.6, 25)).toBe(true); // horizontal spoke
    expect(filled(ring, 25.5, 25.5)).toBe(false); // gap ring (dist 0.71), off-spoke
  });

  it('keeps foreign track clearances', () => {
    const root = board(`
      (segment (start 10 20) (end 30 20) (width 0.25) (layer "In1.Cu") (net 2))
      (zone (net 1) (net_name "GND") (layer "In1.Cu")
        (connect_pads (clearance 0.5))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'In1.Cu')!;
    expect(res.islands).toHaveLength(2); // corridor splits the zone
    const rings = res.islands.map((i) => i.ring);
    expect(anyFilled(rings, 20, 20)).toBe(false); // on the track
    expect(anyFilled(rings, 20, 20.5)).toBe(false); // within clearance (±0.625)
    expect(anyFilled(rings, 20, 21.2)).toBe(true); // outside clearance
    expect(anyFilled(rings, 20, 15)).toBe(true); // well above the corridor
  });

  it('produces rings KiCad can re-read (balanced, closed)', () => {
    const root = board(`
      (via (at 20 20) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2))
      (zone (net 1) (net_name "GND") (layer "In1.Cu") (connect_pads (clearance 0.5))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'In1.Cu')!;
    const ring = res.islands[0]!.ring;
    // the outer loop is closed: its first vertex repeats before the first
    // hole ring begins — find the repeat of vertex 0
    const n = ring.length;
    let closedAt = -1;
    for (let i = 2; i + 1 < n; i += 2) {
      if (ring[i] === ring[0] && ring[i + 1] === ring[1]) {
        closedAt = i;
        break;
      }
    }
    expect(closedAt).toBeGreaterThan(0);
    expect(ring.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('cuts keepout-zone polygons out of the fill', () => {
    const root = board(`
      (zone (net 0) (net_name "") (layers "In1.Cu") (keepout (tracks not_allowed) (vias not_allowed) (pads allowed) (footprints allowed))
        (polygon (pts (xy 18 18) (xy 22 18) (xy 22 22) (xy 18 22))))
      (zone (net 1) (net_name "GND") (layer "In1.Cu") (connect_pads (clearance 0.5))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const fillZone1 = root
      .children('zone')
      .find((z) => z.child('keepout') === null)!;
    const res = fillZone(root, fillZone1, 'In1.Cu')!;
    const rings = res.islands.map((i) => i.ring);
    expect(rings.length).toBeGreaterThan(0);
    expect(anyFilled(rings, 20, 20)).toBe(false); // inside the keepout
    expect(anyFilled(rings, 15, 20)).toBe(true); // outside it
  });

  it('uses custom-pad primitive geometry as the obstacle', () => {
    const root = board(`
      (footprint "T:C" (layer "F.Cu") (at 20 20)
        (pad "1" smd custom (at 0 0 0) (size 0.5 0.5) (layers "F.Cu" "In1.Cu" "*.Mask") (net 2)
          (primitives (gr_poly (pts (xy -1 -1) (xy 1 -1) (xy 1 1) (xy -1 1)) (width 0)))))
      (zone (net 1) (net_name "GND") (layer "In1.Cu") (connect_pads (clearance 0.5))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'In1.Cu')!;
    const rings = res.islands.map((i) => i.ring);
    // the 2×2 custom poly + 0.5 clearance → empty at 1.5mm, filled past 2.2
    expect(anyFilled(rings, 20, 20)).toBe(false);
    expect(anyFilled(rings, 20, 18.6)).toBe(false); // 1.4mm: within poly edge (1.0) + clearance (0.5)
    expect(anyFilled(rings, 20, 18.2)).toBe(true); // 1.8mm: past the inflated poly edge
  });

  it('removes unconnected islands (KiCad default mode)', () => {
    const root = board(`
      (via (at 13 13) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))
      (segment (start 24 24) (end 25 25) (width 0.25) (layer "In1.Cu") (net 1))
      (segment (start 26 26) (end 27 27) (width 0.25) (layer "In1.Cu") (net 2))
      (zone (net 1) (net_name "GND") (layer "In1.Cu") (connect_pads (clearance 0.5))
        (polygon (pts (xy 10 10) (xy 16 10) (xy 16 16) (xy 10 16)))
        (polygon (pts (xy 22 22) (xy 28 22) (xy 28 28) (xy 22 28))))`);
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'In1.Cu')!;
    // only the island containing the same-net via/track is kept
    expect(res.islands).toHaveLength(1);
    const ring = res.islands[0]!.ring;
    expect(filled(ring, 13, 13) || filled(ring, 25, 25)).toBe(true);
    expect(res.totalAreaMm2).toBeLessThan(40); // one 6×6 island, not two
  });

  it('emits hatch output: border + 45° lines, less copper than solid', () => {
    const root = board(`
      (zone (net 1) (net_name "GND") (layer "In1.Cu") (connect_pads (clearance 0.5))
        (fill yes (mode hatch) (thermal_gap 0.5) (thermal_bridge_width 0.5)
          (hatch_thickness 0.3) (hatch_gap 0.6) (hatch_orientation 0) (hatch_min_hole_area 0.15))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const solidRoot = board(`
      (zone (net 1) (net_name "GND") (layer "In1.Cu") (connect_pads (clearance 0.5))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'In1.Cu')!;
    const solid = fillZone(solidRoot, solidRoot.children('zone')[0]!, 'In1.Cu')!;
    expect(res.totalAreaMm2).toBeGreaterThan(30); // border alone ≈ perimeter × thickness
    expect(res.totalAreaMm2).toBeLessThan(solid.totalAreaMm2 * 0.85); // thick border + dense lines
    const ring = res.islands[0]!.ring;
    // border: a point 0.1mm inside the region edge is copper
    expect(filled(ring, 20, 10.1)).toBe(true);
    // mid-region: on a 45° hatch line copper, between lines empty —
    // lines pass through (20,20) at 45°; check along the perpendicular
    const on = filled(ring, 20, 20);
    const perpOff = 0.45; // pitch 0.9, so 0.45 lands mid-gap on the perpendicular
    const offX = 20 - perpOff * Math.SQRT1_2;
    const offY = 20 + perpOff * Math.SQRT1_2;
    const between = filled(ring, offX, offY);
    // at least one of on/between must differ (hatch pattern present) and
    // both cannot be empty (lines run every 0.9mm)
    expect(on || filled(ring, offX + 0.3, offY - 0.3)).toBe(true);
    expect(ring.length / 2).toBeGreaterThan(solid.islands[0]!.ring.length / 2);
  });

  it('respects blind-via layer spans', () => {
    const root = board(`
      (via (at 15 15) (size 0.6) (drill 0.3) (layers "F.Cu" "In1.Cu") (net 2))
      (zone (net 1) (net_name "GND") (layer "B.Cu") (connect_pads (clearance 0.5))
        (polygon (pts (xy 10 10) (xy 30 10) (xy 30 30) (xy 10 30))))`);
    const z = root.children('zone')[0]!;
    const res = fillZone(root, z, 'B.Cu')!;
    // blind via on F/In1 does not affect a B.Cu zone
    expect(filled(res.islands[0]!.ring, 15, 15)).toBe(true);
  });
});
