---
'@typecad/pcb': minor
---

Rectangle-geometry APIs accept a `bounds` object — `pcb.board` passes straight through.

- `pcb.zone()`, `pcb.keepout()`, `pcb.rect()`, and `pcb.stitch({ area })` accept `bounds`/`area` as a bounds-style rectangle: `{ left, top, width, height }` (e.g. `pcb.board`) or `{ x, y, width, height }`. `pcb.zone({ net: 'GND', bounds: pcb.board, layers: [...] })` replaces the field-by-field `x: board.left, y: board.top, width: board.width, height: board.height` mapping. Bounds shift with group offsets like the other geometry forms, and combining `bounds` with `points` or `x/y/width/height` is rejected. `IBoundsLike` is exported.
