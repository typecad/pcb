import { fillZone } from '../../@typecad/pcb/src/pcb/pcb_zone_fill_engine.js';
import { parse, SNode } from '../../@typecad/pcb/src/sexpr/index.js';

const src = `(kicad_pcb
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
const root = SNode.from(parse(src) as any[]);
const zone = root.children('zone')[0]!;
const res = fillZone(root, zone, 'F.Cu')!;
const ring = res.islands[0]!.ring;
console.log('total pts:', ring.length / 2);
// print vertices within 4mm of the via, in ring order, with indices
for (let i = 0; i < ring.length / 2; i++) {
  const x = ring[i * 2]!, y = ring[i * 2 + 1]!;
  if (Math.hypot(x - 20, y - 28) < 3) {
    console.log(i, x.toFixed(3), y.toFixed(3));
  }
}
