---
'@typecad/jlcpcb-parts': patch
---

The add-to-project flow now shells out to the renamed `typecad-pcb` bin (lookup, cmd.exe invocation, messages, README) — it previously failed with "typecad command not found" for projects on `@typecad/pcb`.
