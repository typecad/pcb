---
'@typecad/pcb': patch
---

Viewer exports are faithful and work inside the vscode webview again:

- The webview CSP now allows `img-src data: blob:` — the PNG export rasterizes the serialized SVG through a data: URL, which `default-src 'none'` silently blocked ("could not be rasterized").
- Blueprint zone pours carry a faint solid twin under the hatch pattern: renderers without pattern support (some viewers, office suites) fall back on the tint instead of an arbitrary blob color, so the pour still reads as marked copper.
- Exported SVGs bake their page-CSS styling into explicit attributes: clear-polarity shapes keep the canvas color and DRC markers keep their red fills/strokes (a standalone file has no page stylesheet, so class-only styling fell back to SVG-default black).
