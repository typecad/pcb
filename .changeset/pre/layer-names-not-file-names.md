---
'@typecad/pcb': patch
---

Viewer sidebar layer list shows layer names, not file names. Rows read
`F_Cu`, `B_Silkscreen`, `In1_Cu`, `Edge_Cuts`, `Drill` instead of
`board-F_Cu.gtl`-style file names — the board-name prefix and the file
extension are dropped per file (the old shortener only stripped a prefix
shared by EVERY file, so a gerbers directory carrying one stray file from
another board — or a single-layer viewer — showed full file names and the
layer truncated out of view). The full file name stays on the row as its
tooltip, and drills with no layer token in their name display their
detected kind (`Drill` / `NPTH Drill`).
