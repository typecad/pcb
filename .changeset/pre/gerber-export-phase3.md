---
'@typecad/pcb': minor
---

Native gerber export (Phase 3): Excellon drill and `.gbrjob` job files now plot natively, and `typecad-pcb export gerbers --native` writes the complete fabrication set (26+ gerbers, `.drl`, `-job.gbrjob`) without kicad-cli. Byte-parity with kicad-cli 10.0.0 goldens on both fixtures. Reverse-engineered and encoded KiCad's drill conventions: sequential tool numbering (vias → component drills → NPTH), a two-pass body (all plain hits, then routed `G85` slots per tool), slot axes rotating with the position matrix, and the exact coordinate formatter — digit-wise nm parsing with `nm × 1e-6` double arithmetic and round-half-even printing, verified against 16 probe/golden data points. Job files synthesize the default stackup for boards without one and derive Size/DesignRules from board geometry.
