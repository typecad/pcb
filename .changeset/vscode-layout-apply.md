---
'vscode-typecad-pcb': minor
---

The board viewer's Layout view can apply drags back to code: the webview bridge (`typecad/layout-rebuild`) resolves each moved reference to its source variable, rewrites the `<var>.pcb = { x, y, … }` literal by the dragged delta, saves, runs the project build, and regenerates the viewer — then reports per-component skips (no variable, computed placement) instead of failing silently.
