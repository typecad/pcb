---
"@typecad/typecad": patch
---

Fixed ballooned TrueType text on the gerber viewer's dark canvas. The dark-theme recoloring for silkscreen/paste/drill matched every element carrying a `stroke` attribute — including region paths that carry `stroke="none"` (TrueType text glyphs, pour outlines) — which painted a ~1mm outline around each glyph. The stroke override now excludes `stroke="none"`, so filled polygon text like a board's title renders crisp while stroke-font designators keep their recolored strokes.
