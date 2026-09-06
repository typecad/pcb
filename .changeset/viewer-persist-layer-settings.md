---
"@typecad/typecad": patch
---

The gerber viewer now remembers layer settings across rebuilds. Visibility toggles and opacity sliders are stored in the browser's localStorage (keyed per board title) and re-applied when the serve-mode page reloads after a build, so a hand-tuned layer view survives the live-reload instead of snapping back to defaults. New layers added by a rebuild fall back to their defaults; All/None buttons persist too.
