---
'@typecad/pcb': minor
---

`materializeZoneFills()` now fills zones with the native engine instead of
round-tripping the board through `kicad-cli pcb drc --refill-zones
--save-board` — no KiCad install needed, and the written `filled_polygon`
blocks come from the same fill engine the native DRC, gerber export and
docgen images use, so the saved fills and every consumer agree. The refill
core (`refillZoneFills`) moved from the export command into
`pcb/pcb_zone_fill.ts` and is re-exported from the export command for
existing importers. The `KICAD_NOT_AVAILABLE=1` escape hatch is retired —
there is no external dependency left to escape from.
