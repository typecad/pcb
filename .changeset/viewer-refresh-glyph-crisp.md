---
'@typecad/typecad': patch
---

Gerber viewer: keep TrueType title text crisp after a page refresh — restored
layer settings no longer rewrite `opacity="1"` over untouched layers (which
re-composites them and can rasterize sub-pixel glyph fills fatter), and region
paths can never pick up a stroke from any theme rule.
