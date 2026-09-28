---
'@typecad/pcb': patch
---

Vias placed by one edge of a multi-pin net are now visible to the router
when it places the rest of the net: they're appended to a shared
hole-to-hole list (drill edges need clearance even between same-net vias)
and rasterized into the routing grid as net-aware pads, so later edges
connect through their own vias instead of stacking a second via a fraction
of a millimetre away or routing tracks blind through the first one. Vias
already staged on the board before routing starts are included, and rip-up
rollbacks re-snapshot the list for the next attempt.
