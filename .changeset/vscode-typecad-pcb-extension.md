---
'@typecad/pcb': minor
---

`typecad-pcb create` now bundles the typeCAD/pcb VS Code extension into every new project (`hw/.vscode/extensions/typecad-pcb/`), zero-install like the HAL addon:

- **Pin hovers** — hover a component variable in `src/` to see its reference, footprint, placement, and a pad-by-pad table with connected/unconnected status (net-less `np_thru_hole` pads read as mechanical). A declared component missing from the compiled board explains itself instead of hovering silent.
- **Cross-probe board viewer** — *typeCAD/pcb: View Board* renders the compiled board (gerbers + netlist, zones refilled) in a webview beside the editor; the hover's *view on board* link zooms to the component (and *View Component on Board* from the palette prompts for a designator, seeded with the word under the cursor), and double-clicking any pad or outline in the viewer jumps back to the declaring source line — traces too: `pcb.net`/`pcb.route` callsites are now stamped into the netlist (Code/Route properties) and surface through `query nets`, so a trace hover reads "net2 { source board.ts:83 }" and double-clicking a trace reveals that line (single clicks — measurement ruler points included — always stay inside the viewer). Viewport, layer settings, and highlight survive board-change reloads, and an open Board panel is restored across VS Code window reloads too — instantly from the last generated view when the board hasn't changed, or with a brief placeholder while the export reruns. While a rebuild's new render is being generated, the viewer's lower-left status text announces it — and locks the readout so the mouse-coordinate display cannot overwrite the notice — unlocking when the new view lands. The hover readout names the source variable beside the designator ("R1 { source r1 }"), and the PNG export rasterizes at ~1600 px.
- **Editor integration** — `.vscode/extensions.json` force-installs the extension workspace-scoped; `.vscode/settings.json` hides its manifest from the NPM Scripts pane and the Explorer (ported from the HAL addon's npm-hiding settings).

Also in this change:

- The footprint `Code` property now always embeds the declaring `file:line` (previously only anonymous components carried it), normalized to a POSIX project-relative path so committed boards stay machine-independent. This is what the reverse cross-probe and the hover's source row read.
- `gerber-viewer` one-shot mode gained `--netlist`/`--drc` flags, a `#typecad-probe` SVG group and a `window.typecadViewer` embedding API, board-coordinate (y-down) mouse readout, and viewport persistence across reloads.
- `typecad-pcb export gerbers` (and `jlcpcb-export`) pass `--check-zones` on KiCad ≥ 9 — builds write zone declarations without fill geometry, so the export computes the pour copper at plot time.
- Board lookup (`query`, `export`, `drc`, `check`) picks the newest `.kicad_pcb` in `build/` instead of refusing when stray boards share the directory.
- A new workspace package `packages/vscode-typecad-pcb` develops the extension; `npm run bundle` ships the compiled copy into `assets/editor-extensions/` (now included in the npm `files`).
