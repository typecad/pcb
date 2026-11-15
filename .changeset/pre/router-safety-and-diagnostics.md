---
'@typecad/pcb': minor
---

Router safety: the autorouter can no longer emit shorting copper. Every
router-produced path passes an exact-geometry gate (segments and vias vs
every different-net pad and track, edge-to-edge with the stricter
clearance) before it becomes a track — a path whose swept copper clips
foreign copper is retried once on a finer grid and otherwise failed with a
message naming the pin pair, the violated obstacle, and the numbers
(`Route U2.3 → J2.1 failed: route rejected (clearance): segment 4 (34.19,13.79)->(34.9,14.5) on F.Cu clears U2.2 [DQ] by 0.05mm < 0.20mm`). Obstacles that already overlap the route's own terminal pads are placement errors DRC owns, not routing rejections. The escape-channel
warning now models the real escape path (a fat ray in both escape
directions, catching shell tabs squarely in front of a pad, not just
lateral flanks), and failed routes always print per-pair at the default
log level instead of a bare "some routes failed".
