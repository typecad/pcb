---
'@typecad/pcb': patch
---

Schematic export is quieter about the code-only workflow. Components
created without `sch` coordinates (which the renderer places
deterministically) are now reported as one summary line naming them all,
instead of a warning per component that trained you to ignore the log. And
when a power net has no matching KiCad power symbol, the warning says what
that means — the net still connects via labels, but the schematic shows no
rail glyph and ERC cannot verify it — and suggests real rails the power
library carries (`+3V3` | `+5V` | `GND` | …) instead of a bare "not
found".
