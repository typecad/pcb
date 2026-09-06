---
"@typecad/gerber-viewer": minor
---

New package: `@typecad/gerber-viewer` — a zero-dependency Gerber (RS-274X) + Excellon parser and interactive HTML viewer. Two modes: a one-shot CLI (`gerber-viewer gerbers/ -o view.html`) and a dev server (`gerber-viewer serve`) that watches a typeCAD project's `build/*.kicad_pcb`, re-exports gerbers via `typecad export`, and live-reloads the viewer page on every `npm run build`. Also exposes `parseGerber`, `parseExcellon`, `detectLayer`, `renderSvg`, `buildViewerFromFiles` and `startGerberViewerServer` for programmatic use. `typecad create` scaffolds projects with a `gerber_viewer` npm script wired to it.
