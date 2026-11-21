---
"vscode-typecad-pcb": patch
---

The post-apply semantic check accepts a route segment covered by existing same-net copper (the builder trims or drops those overlaps), so routes that run along or tie onto a trace no longer report "semantic check failed".
