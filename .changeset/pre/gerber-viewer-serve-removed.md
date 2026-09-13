---
'@typecad/pcb': minor
---

`gerber-viewer serve` is removed, along with the `gerber_viewer` npm script it was wired into by `typecad-pcb create` — the VS Code extension's Board viewer now covers that loop (re-export + rerender on every `npm run build`) with cross-probing on top. The one-shot CLI (`gerber-viewer <dir> -o board.html [--netlist] [--drc] [--render pcba]`) is unchanged; the programmatic gerber-viewer exports lose `startGerberViewerServer`, `findBoardFile` (the gerber-viewer one) and `RELOAD_CLIENT`. Existing projects can delete the `gerber_viewer` script from `hw/package.json` — nothing else references it.
