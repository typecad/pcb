---
'@typecad/pcb': minor
---

`route()` now errors loudly when it is called before the net's components are placed: routing captures the pads' current positions and never re-anchors when a late placement resolves at `create()`, so a `route()` above the placement code silently draws the trace at the default (0, 0) position — and the stray segments pollute the board bounds that zones and `typecad.board` placements derive from. The error names the unplaced components and states the required order: `outline() → place components (.pcb = {...}) → route() → zone()/stitch() → create()`.
