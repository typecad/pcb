---
"@typecad/pcb": patch
---

fix: autorouter board-edge, pad and isolation bugs found by the PCBWorld bench.

- The autorouter keeps copper on the board and clear of every edge. Outlines are only staged until `create()`, so routing never saw the edge: tracks and vias could leave the board, run closer than `min_copper_edge_clearance`, or cross a `pcb.cutout()`. Edge.Cuts now becomes the routable region (largest closed contour = board, the rest = cutouts; rects, polygons, circles and line/arc chains). Copper keeps the rule plus its own half-width or via radius, and the routing grid is sized to the outline.
- Pads sharing a number in one footprint (connector shields, split thermal pads) are each routed. Before, only the first was connected and KiCad reported the rest unconnected.
- An SMD pad on B.Cu (or any B.* item) inside a front-side footprint stays on B.Cu. Placing a footprint now flips layers the way KiCad does — front as authored, back swaps F↔B. Before, every layer was forced to the placement side, so card-edge fingers landed on the wrong copper and disagreed with the router.
- Footprint geometry caches are keyed by content (pads) and resolved file (bounds), not by name. Two footprints sharing a name no longer get each other's pads.
- Placed parts of one board no longer act as obstacles in another board's routes in the same process.
- Native DRC: `gr_rect`, `gr_poly` and `gr_circle` outlines and line/arc chains drawn in either direction count as closed (no false `edge_not_closed`), and copper-to-edge is measured against the edge line, not the area it encloses (no false `copper_edge_clearance` on everything inside a rect outline; a track crossing a cutout is still flagged).
- On the PCBWorld fixture boards, clean passes go from 14/22 to 18/23 (one board was previously unscoreable).
