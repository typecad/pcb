---
'@typecad/pcb': patch
---

`typecad-pcb add-component --folder=./src` now writes the component into
that directory instead of nesting `src/src/` beneath it, and the "use it
with" hint prints the import path relative to where the command ran
(`./src/AP2112K_3_3`, not a hardcoded `./AP2112K_3_3` that only works from
inside src).
