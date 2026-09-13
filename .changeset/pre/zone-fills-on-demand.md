---
'@typecad/pcb': minor
---

Zone fills are no longer typeCAD's job at build time — each operation that needs fill geometry now computes it itself, so `npm run build` writes zone declarations only and skips the ~20s kicad-cli refill round-trip entirely (the rd_skeleton demo board builds in ~3.5s where it took ~30s).

- `pcb.create()` no longer calls `materializeZoneFills` after writing the board. The board file carries zone declarations without `(filled_polygon)` geometry — valid as far as KiCad is concerned; KiCad fills zones on demand.
- `typecad-pcb export gerbers` always passes `--check-zones` (KiCad ≥ 9), so plotted gerbers include the pour copper even though the `.kicad_pcb` never materialized it.
- `typecad-pcb check` refills as part of its DRC pass, as before.
- `materializeZoneFills(pcb, state)` remains exported for callers that want to force a fill-and-save on the board file itself (e.g. before handing it to a tool that can't refill).
- The zone-fill sidecar files (`.zonefill`) are gone — with the build no longer filling, there was nothing left to record. The board viewer detects completed builds by file mtime stability instead.
