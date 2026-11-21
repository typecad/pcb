# vscode-typecad-pcb

## 0.12.0-alpha.7

### Patch Changes

- 119fa34: The post-apply semantic check accepts a route segment covered by existing same-net copper (the builder trims or drops those overlaps), so routes that run along or tie onto a trace no longer report "semantic check failed".

## 0.12.0-alpha.6

### Patch Changes

- eea53a8: fix: the layout view no longer rebuild-loops, and the sync pipeline is hardened.

  - The build signs every board it writes (sha256 per board in `.typecad-board.json`, re-signed after zone fill). The viewer's drift absorb and `import --watch` skip the build's own output; previously a fresh build read as a KiCad edit, was absorbed into source, triggered a rebuild, and repeated forever whenever the round trip was not an exact fixed point.
  - Board identity is a content hash (not an mtime) for page stamps, render caches and apply stamps. Board and manifest writes are atomic (temp + rename).
  - Absorb is keyed on board content, holds the pipeline while running, defers to a running KiCad-sync importer (project lock; the Windows lock-path bug is fixed), and trips a circuit breaker (2 per 5 min) that shows "sync paused" in the status bar (click for the log).
  - Saves made mid-build/mid-apply are rebuilt instead of dropped; refused applies are rebased when the touched parts are unchanged; the view refreshes once an apply releases the pipeline; staleness is per board; one build command; the per-keystroke source scan is gone; timers are consolidated into independent slots.
  - Importer fix: back-side label layouts are converted back to the authored frame, so build → import → build converges instead of flipping rotation/y each cycle.
  - New build → import → build fixed-point regression test.

## 0.12.0-alpha.0

### Minor Changes

- 4b55bbb: The layout view's "apply & rebuild" carries the whole gesture: interactive routes append as TrackBuilder chains, deleted segments — and vias — drop out of the chains they came from, and all of it plans together with the moves, text/value/label/rename edits in one pass (new layoutApply.ts): sequential stages whose offsets are computed against the text the previous stage produced, so no two planned edits ever overlap; the viewer applies stage by stage with one WorkspaceEdit each and re-reads the document in between. Regenerated chains match the real TrackBuilder API — every surviving via keeps its own size/drill/layer span (plain F.Cu/B.Cu pairs emit default through vias), a mid-route width change severs a piece whose own `w` covers the whole run, `export` prefixes ride the split halves, and both `.to({...})` call styles parse. A stress suite pins the adversarial shapes — CRLF checkouts, comments inside chains and create() args, mid-piece vias, many-way splits, overlapping routes, the cross-file routes/create split — to output that still parses.

  The viewer ships the board's rules to the layout view: boardRules.ts resolves the project's optional `typecad.rules.json` (hand-authored, beside typecad.conf.ts — wins field-by-field) over the board's `.kicad_pro` design settings, writes the merged floors + net-class width/via defaults as `build/<board>_rules.json`, and generate runs with `--rules`.

  DRC markers can no longer lie: the report is always embedded, markers are skipped when the report predates the board, layout apply re-runs DRC after the rebuild, and a stale report bakes a "markers show the PREVIOUS board revision" notice into the page's own status line — spliced before the probe client so the CSP nonce covers it, and re-evaluated on every generate so a failed attempt's flag can't leak. Board discovery prefers the project's own board (boardFile.ts, vscode-free + tested), and the webview keeps its context when its tab hides.

  Double-click probing is back and smarter: it probes again while no route is live, resolves the pad under a component outline first (BGA balls under bodies probe ref+pin, not just the part), resolves NETLESS traces to their declaring line, and treats N/C as the plotter's no-connect label instead of a net — netless routes still resolve their TrackBuilder source. Hardening: Windows path-casing no longer needlessly drops the board-data cache, the file watcher owns exactly one teardown hook, and quoted-literal rewrites escape against the quote character actually in the source.

- 6f0fe23: The board viewer's Layout view can apply drags back to code: the webview bridge (`typecad/layout-rebuild`) resolves each moved reference to its source variable, rewrites the `<var>.pcb = { x, y, … }` literal by the dragged delta, saves, runs the project build, and regenerates the viewer — then reports per-component skips (no variable, computed placement) instead of failing silently.

  Phase 2: the apply payload carries rotation deltas and the component's original pad centers; the placement rewriter adds/updates `rotation` in the literal, and a pure endpoint planner (unit-tested, precision-preserving, single-snapshot WorkspaceEdit) translates matching `.from`/`.to` route literals — with a regression test pinning that an endpoint edit replaces exactly its literal and never duplicates the document tail.
