---
'@typecad/pcb': patch
---

Export hygiene: the fab dir no longer accumulates foreign-board artifacts — export prunes files from other boards on each run — and fabrication outputs identify as typeCAD/pcb with the package version. Board discovery prefers the project's own board when several boards are around.
