---
'vscode-typecad-pcb': minor
---

The board viewer's Layout view can apply drags back to code: the webview bridge (`typecad/layout-rebuild`) resolves each moved reference to its source variable, rewrites the `<var>.pcb = { x, y, … }` literal by the dragged delta, saves, runs the project build, and regenerates the viewer — then reports per-component skips (no variable, computed placement) instead of failing silently.

Phase 2: the apply payload carries rotation deltas and the component's original pad centers; the placement rewriter adds/updates `rotation` in the literal, and a pure endpoint planner (unit-tested, precision-preserving, single-snapshot WorkspaceEdit) translates matching `.from`/`.to` route literals — with a regression test pinning that an endpoint edit replaces exactly its literal and never duplicates the document tail.
