---
'@typecad/pcb': patch
---

kicad2typecad: imported TrackBuilder chains now carry their net names.
Named nets used to survive only as `// Net:` comments and variable names —
the generated `typecad.track().from(...)` calls were electrically
anonymous, forcing re-annotation of every imported chain by coordinate
matching. The importer now emits `typecad.track({ net: 'GND' }).from(...)`
for named nets (vias inherit the net from the builder), so copper imports
round-trip with their connectivity intact.
