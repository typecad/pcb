---
'@typecad/pcb': patch
---

kicad2typecad: axis-aligned rectangular zones and keepouts now import as
`x/y/width/height` instead of a 4-point polygon, matching the rect form the
zone/keepout docs teach (same collapse the outline importer already did for
`gr_rect`). Non-rectangular polygons still import as explicit `points`.
The zone skill doc gained a points-form example and a geometry note.
