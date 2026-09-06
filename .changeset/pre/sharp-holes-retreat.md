---
'@typecad/typecad': patch
---

Via stitching keeps clear of mechanical footprints' full keep-clear zones.

- `pcb.stitch()` body blockers now use the footprint's **full graphical extent** (pads + silkscreen/courtyard geometry, rotation-aware via `getFootprintBounds`) instead of the pad bounding box — a mounting hole's pad is drill-sized while its screw-head keep-clear zone is the footprint outline. Falls back to pad bounds when the footprint file can't resolve.
- Netless components (`pcb.add()`ed mechanical parts like mounting holes) are now discovered for stitching via `schematic.components` — previously only net-referenced components were found, so parts with no net were invisible to the stitcher.
