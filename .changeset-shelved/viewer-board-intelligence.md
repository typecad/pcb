---
"@typecad/pcb": minor
---

The gerber viewer now understands the board it is showing. KiCad's X2 object attributes (`%TO.N` nets, `%TO.P` component/pin, `%TO.C` refs) are parsed and carried onto the rendered geometry, enabling: hover probing (net / ref.pin in the coordinate readout), click-to-highlight an entire net across copper layers (with pad→net filled in from the project netlist in serve mode), and a component search box that zooms to any reference's pads. A collapsible fab-report panel shows board dimensions, per-layer trace length and min/max widths, and the drill table (sizes, counts, plated/NPTH). In serve mode, DRC violations from the build's `_drc.json` are overlaid as markers — mapped from board to gerber coordinates via the edge layer vs the board outline — with hover messages, a toolbar toggle, and automatic refresh on every rebuild. New `SVG`/`PNG` export buttons snapshot the current view (theme, layer visibility, active highlight) as a vector file or a 2× raster.
