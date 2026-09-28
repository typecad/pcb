---
'@typecad/pcb': patch
---

The VS Code Board viewer no longer keeps serving a page built by an older
viewer after the viewer tooling itself updates. The panel cached its
generated HTML keyed on the board's mtime alone, so a `gerber-viewer`
rebuild (or any out-of-band regeneration of `build/serve/viewer.html`)
that didn't touch the board left every already-open workspace serving the
pre-update page — with `retainContextWhenHidden` keeping that stale page
alive across tab switches, a rendering fix could land and the user would
still see the old behavior until the board next changed or the window
reloaded. `show()` and the watcher refresh now adopt an on-disk viewer
page that is newer than the served one and still describes the current
board revision (the same freshness rule the panel-restore fast path
already used), swapping it in without rerunning the export pipeline, and
never while a generation is mid-write. Every generated page now carries a
`tc-viewer-build` stamp, and the extension logs it on each page
assignment, so the output channel always answers "which page build is
this webview running" — including "pre-stamp page" for pages older than
the stamp itself.
