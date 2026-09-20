import { describe, expect, it } from 'vitest';
import { refillZoneFills } from '../commands/export.js';
import type { SExpr } from '../../../sexpr/types.js';
import { SNode, parse } from '../../../sexpr/index.js';

// Minimal board whose (zone_defaults) header precedes the real zone — the
// naive `(zone` substring matcher used to splice fills into zone_defaults.
const BOARD = `(kicad_pcb
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 0 "")
  (net 1 "GND")
  (zone_defaults
    (thermal_gap 0.254)
  )
  (gr_line (start 0 0) (end 20 0) (layer "Edge.Cuts"))
  (gr_line (start 20 0) (end 20 15) (layer "Edge.Cuts"))
  (gr_line (start 20 15) (end 0 15) (layer "Edge.Cuts"))
  (gr_line (start 0 15) (end 0 0) (layer "Edge.Cuts"))
  (zone
    (net 1)
    (net_name "GND")
    (layer "F.Cu")
    (hatch edge 0.5)
    (fill
      (thermal_gap 0.3)
      (thermal_bridge_width 0.4)
    )
    (polygon
      (pts
        (xy 2 2)
        (xy 18 2)
        (xy 18 13)
        (xy 2 13)
      )
    )
    (filled_polygon
      (layer "F.Cu")
      (pts (xy 3 3) (xy 4 3) (xy 4 4) (xy 3 4))
    )
  )
)`;

describe('refillZoneFills (export gerbers --check-zones path)', () => {
  it('injects fresh fills into the real zone, not (zone_defaults)', () => {
    const out = refillZoneFills(BOARD);
    expect(out).not.toBeNull();
    const root = SNode.from(parse(out as string) as SExpr[]);

    const defaults = root.children('zone_defaults');
    expect(defaults.length).toBe(1);
    for (const d of defaults) {
      expect(d.children('filled_polygon').length).toBe(0);
    }

    const zones = root.children('zone');
    expect(zones.length).toBe(1);
    const fills = zones[0]!.children('filled_polygon');
    expect(fills.length).toBeGreaterThan(0);
    // stale saved fill was replaced, and the fresh one covers the zone body
    const pts = fills[0]!.child('pts')!.children('xy');
    expect(pts.length).toBeGreaterThan(4);
  });

  it('strips stale saved fills before injecting', () => {
    const out = refillZoneFills(BOARD) as string;
    // the stale 4-point ring from the fixture must not survive verbatim
    expect(out).not.toMatch(/\(xy 3 3\) \(xy 4 3\) \(xy 4 4\) \(xy 3 4\)/);
  });
});
