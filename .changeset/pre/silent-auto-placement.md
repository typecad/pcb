---
'@typecad/pcb': patch
---

Building no longer warns when a component's `sch` object doesn't specify a
placement. Components without `sch` coordinates (or with missing
`x`/`y`/`rotation`) are still defaulted and placed deterministically — the
same schematic output, now silently. The per-component "missing schematic
placement data" warnings and the one-line "placed deterministically"
summary are gone.
