---
'@typecad/pcb': patch
---

`typecad-pcb drc` now refills zones in memory before checking (`--refill-zones`, KiCad ≥ 9) — matching KiCad's GUI DRC, which refills by default. Since builds ship zone declarations without fill geometry (fills are computed by the consumer), a plain check validated a board that never exists: every via tying into a pour read as dangling, flooding the report with phantom violations (the demo board reported 203 violations / 499 unconnected items unfilled; its true count is 4 warnings / 0 unconnected). Extra kicad-cli flags still pass through after `--`.
