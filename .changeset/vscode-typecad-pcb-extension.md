---
'@typecad/pcb': minor
---

`typecad-pcb create` now bundles the typeCAD PCB VS Code extension into every new project (`hw/.vscode/extensions/typecad-pcb/`), zero-install like the HAL addon:

- **Pin hovers** — hover a component variable in `src/` to see its reference, footprint, placement, and a pad-by-pad table with connected/unconnected status (net-less `np_thru_hole` pads read as mechanical). A declared component missing from the compiled board explains itself instead of hovering silent.
- **Cross-probe board viewer** — *typeCAD: View Board* renders the compiled board (gerbers + netlist, zones refilled) in a webview beside the editor; the hover's *view on board* link zooms to the component, and clicking any pad or outline in the viewer jumps back to the declaring source line. Viewport, layer settings, and highlight survive board-change reloads.
- **Editor integration** — `.vscode/extensions.json` force-installs the extension workspace-scoped; `.vscode/settings.json` hides its manifest from the NPM Scripts pane and the Explorer (ported from the HAL addon's npm-hiding settings).

Also in this change:

- The footprint `Code` property now always embeds the declaring `file:line` (previously only anonymous components carried it), normalized to a POSIX project-relative path so committed boards stay machine-independent. This is what the reverse cross-probe and the hover's source row read.
- `gerber-viewer` one-shot mode gained `--netlist`/`--drc` flags (serve-mode parity), a `#typecad-probe` SVG group and a `window.typecadViewer` embedding API, board-coordinate (y-down) mouse readout, and viewport persistence across reloads.
- `typecad-pcb export gerbers` (and `jlcpcb-export`) pass `--check-zones` on KiCad ≥ 9 — a fresh build's zone declarations carry no fill geometry, so exported gerbers previously plotted no pours at all.
- Board lookup (`query`, `export`, `drc`, `check`) picks the newest `.kicad_pcb` in `build/` instead of refusing when stray boards share the directory.
- A new workspace package `packages/vscode-typecad-pcb` develops the extension; `npm run bundle` ships the compiled copy into `assets/editor-extensions/` (now included in the npm `files`).
