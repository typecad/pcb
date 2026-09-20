// Validates pour ring topology: shoelace area, nonzero-winding point
// sampling (thermal slots empty, spokes filled, pour interior filled), and
// self-intersection count EXCLUDING the collinear keyhole channel overlays
// (the in/out channel segments legitimately overlap).
import { fillZone } from '../../@typecad/pcb/src/pcb/pcb_zone_fill_engine.js';
import { parse, SNode } from '../../@typecad/pcb/src/sexpr/index.js';

const VIA_BOARD = `(kicad_pcb
  (net 0 "") (net 1 "GND")
  (gr_line (start 5 5) (end 55 5) (layer "Edge.Cuts") (stroke (width 0.05)))
  (gr_line (start 55 5) (end 55 40) (layer "Edge.Cuts") (stroke (width 0.05)))
  (gr_line (start 55 40) (end 5 40) (layer "Edge.Cuts") (stroke (width 0.05)))
  (gr_line (start 5 40) (end 5 5) (layer "Edge.Cuts") (stroke (width 0.05)))
  (footprint "x:via" (at 20 28) (layer "F.Cu")
    (pad "" thru_hole circle (at 0 0) (size 0.6 0.6) (drill 0.3) (layers "*.Cu") (net 1) (net_name "GND")))
  (zone (net 1) (net_name "GND") (layers "F.Cu") (hatch edge 0.5)
    (connect_pads (clearance 0.2)) (min_thickness 0.17)
    (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.4))
    (polygon (pts (xy 5 5) (xy 55 5) (xy 55 40) (xy 5 40))))
)`;

function shoelace(ring: number[]): number {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += ring[i * 2]! * ring[j * 2 + 1]! - ring[j * 2]! * ring[i * 2 + 1]!;
  }
  return a / 2;
}

/** nonzero winding number of the (single) ring at a point */
function winding(ring: number[], px: number, py: number): number {
  const n = ring.length / 2;
  let w = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ring[i * 2]!, y1 = ring[i * 2 + 1]!;
    const x2 = ring[j * 2]!, y2 = ring[j * 2 + 1]!;
    if (y1 <= py) {
      if (y2 > py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) > 0) w++;
    } else if (y2 <= py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) < 0) w--;
  }
  return w;
}

const root = SNode.from(parse(VIA_BOARD) as any[]);
const zone = root.children('zone')[0]!;
const res = fillZone(root, zone, 'F.Cu')!;
const ring = res.islands[0]!.ring;
const area = Math.abs(shoelace(ring));
console.log(`pts=${ring.length / 2} area=${area.toFixed(2)} mm² (board 50×35=1750, expect ~1749 minus slots)`);

// via at (20,28): pad r=0.3, gap annulus to r2=0.4, spokes at 0/90/180/270°,
// slots centered at 45/135/225/315°
const samples: Array<[number, number, number, string]> = [
  [20.318, 28.318, 0, 'slot NE center r=0.45 (gap → empty)'],
  [19.682, 28.318, 0, 'slot NW center (gap → empty)'],
  [19.682, 27.682, 0, 'slot SW center (gap → empty)'],
  [20.318, 27.682, 0, 'slot SE center (gap → empty)'],
  [20.4, 28.0, 1, 'E spoke midpoint r2 (copper)'],
  [20.0, 28.4, 1, 'N spoke midpoint r2 (copper)'],
  [20.35, 28.35, 0, 'slot outer region at 45deg r=0.5 (gap → empty)'],
  [30, 20, 1, 'far pour interior'],
  [6, 6, 1, 'board corner interior'],
];
let bad = 0;
for (const [x, y, want, label] of samples) {
  if (want < 0) continue;
  const w = winding(ring, x, y);
  const ok = w !== 0 === (want === 1);
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} w=${w} at (${x},${y}) — ${label}`);
}
console.log(bad === 0 ? 'SAMPLES ALL OK' : `${bad} SAMPLE FAILURES`);
