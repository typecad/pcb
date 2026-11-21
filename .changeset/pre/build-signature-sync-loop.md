---
"@typecad/pcb": patch
"vscode-typecad-pcb": patch
---

fix: the layout view no longer rebuild-loops, and the sync pipeline is hardened.

- The build signs every board it writes (sha256 per board in `.typecad-board.json`, re-signed after zone fill). The viewer's drift absorb and `import --watch` skip the build's own output; previously a fresh build read as a KiCad edit, was absorbed into source, triggered a rebuild, and repeated forever whenever the round trip was not an exact fixed point.
- Board identity is a content hash (not an mtime) for page stamps, render caches and apply stamps. Board and manifest writes are atomic (temp + rename).
- Absorb is keyed on board content, holds the pipeline while running, defers to a running KiCad-sync importer (project lock; the Windows lock-path bug is fixed), and trips a circuit breaker (2 per 5 min) that shows "sync paused" in the status bar (click for the log).
- Saves made mid-build/mid-apply are rebuilt instead of dropped; refused applies are rebased when the touched parts are unchanged; the view refreshes once an apply releases the pipeline; staleness is per board; one build command; the per-keystroke source scan is gone; timers are consolidated into independent slots.
- Importer fix: back-side label layouts are converted back to the authored frame, so build → import → build converges instead of flipping rotation/y each cycle.
- New build → import → build fixed-point regression test.
