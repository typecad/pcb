---
"@typecad/pcb": patch
---

fix: autorouter correctness and completion — exact clearance, honest success, faster searches.

- Clearance is measured against exact pad and track geometry, per search move (a step can pass closer to a corner than either end point), instead of padding every obstacle by up to 1.5 grid cells plus a hidden 0.05 mm buffer. Designs laid out exactly at the rule limit now route; the buffer is gone.
- The board edge is an exact keepout (edge rule + copper radius) on a separate mask, so pads that sit right at the edge rule stay reachable; concave outlines and cutouts keep half a cell of margin.
- Tracks no longer cut corners after validation: when a run already lay on same-net copper the track builder skipped it without moving, and the next segment became a chord across clearance that every check had passed. Segment merging also requires true collinearity (it compared only the signs of dx/dy).
- One large pad no longer inflates every occupancy probe's scan radius (a 37 mm pad turned each probe into a ~270-cell scan and timed out trivially routable boards).
- A multi-pin net is reported routed only when all its pins end up in one connected copper tree; when an MST edge fails, other pin pairs between the disconnected pieces are tried before giving up.
- Vias are no longer held to double clearance; within one bus route later pairs see earlier pairs' vias, and each pair's tracks carry their own net.
- Rip-up re-routes blocker nets with their own width/clearance/layers (not the victim's) and tries the other re-route order before giving up.
- Coarse geometry (wide traces and clearances, no fine-pitch pads) gets a coarser grid; search windows grow geometrically.
- Route success is recomputed after provided routes are appended, and a net with unresolvable pins is not reported routed.
- Placing a footprint on the back flips each pad's layers once (a double flip put back-side SMD pads on F.Cu).
