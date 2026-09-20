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
