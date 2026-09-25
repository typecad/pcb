---
'@typecad/pcb': patch
---

The vscode extension grows HAL-style ambient board state plus three new commands:

- A **status bar entry** shows the build target — `rd_skeleton · 28 parts · 3 unconnected · 2E 5W` — with a `stale` flag when hw sources are newer than the built board; click opens the Board viewer.
- **Unconnected pads and single-pin nets** appear in the Problems pane as warnings aimed at the declaring source lines (via the Code/net provenance), with an italic "R1 · 2 unconnected pads" chip after the declaration line.
- **Run DRC** runs `typecad-pcb drc` and maps violations into Problems aimed at their source (a clearance hit on `net2` points at the `pcb.route` line); counts land in the status bar, and the Board viewer renders the same report's markers.
- **Browse Components** is a QuickPick over the compiled board (ref — value · footprint · source variable) that zooms the Board viewer to the pick.
- **Diff Board vs HEAD** renders the generated board's visual diff against git HEAD in a panel (`typecad-pcb diff` gained `--no-open` for embedded callers; `query components --json` now carries each component's `source` location).

Review fixes folded in: Problems diagnostics and declaration chips clear when the board (or project) goes away instead of lingering from the previous revision; chip paths compare case-insensitively so a differently-cased open file still gets its chips on Windows; a warnings-only DRC count reads `· 2W` with its own separator; the DRC net fallback aims at the longest matching name (VCC_3V3 beats VCC); the diff panel locks down with the same per-page nonce CSP as the Board viewer (`applyNoncePolicy`, extracted from `injectProbeClient` — no more `script-src 'unsafe-inline'`); and the viewer guards all three data-overlay flags (netlist/DRC/stackup) behind one existsSync check so a missing artifact renders without that overlay instead of failing the whole export. The bundled editor-extension copies (assets/editor-extensions + the rd_skeleton demo) are regenerated — both predated the 0.11.11 `--stackup` pass-through and silently never shipped it.
