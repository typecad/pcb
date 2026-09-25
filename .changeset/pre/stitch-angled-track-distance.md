---
'@typecad/pcb': patch
---

Fixed `pcb.stitch()` voiding the entire bounding square of an angled track.

- Track obstacles carry their exact segment geometry, but the stitch clearance check only tested the obstacle's AABB — for the autorouter's 45° segments that AABB is the whole square containing the diagonal, so a routed signal voided ~8×8 stitch cells above and below it instead of a thin band along the copper.
- Stitch candidates are now measured with the same point-to-centerline (capsule) distance the routing grid's precise check uses: `distance - width/2 < via radius + clearance` blocks, everything else stitches. Orthogonal tracks are unaffected (their capsule matches their AABB).
