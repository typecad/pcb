---
"@typecad/pcb": patch
---

`typecad-pcb create` now installs the alpha dependency line its scaffold requires: `@typecad/pcb@~1.0.0-alpha.4` plus `tsx`, instead of bare names (bare `@typecad/pcb` would resolve to whatever `latest` is). The pin uses `~` rather than `^` because the Windows npm spawn goes through cmd.exe, which treats `^` as an escape character.
