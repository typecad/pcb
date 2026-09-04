---
'@typecad/typecad': minor
---

Placement DX: targeted errors, live arithmetic, body-centering, bounds warnings.

- Bad coordinate assignments now fail with actionable messages instead of cryptic ones — passing an un-called helper (`y: pcb.board.fromLeft` instead of `fromLeft(5)`) reports `pcb.y received the function "fromLeft" — did you mean to call it?`; strings, null, and keyless objects report the axis and what was received.
- `PlacementValue.plus(n)` / `.minus(n)` return new deferred values — `x: pcb.board.sameAs(r1).x.plus(2)` nudges while staying live (re-resolves at `create()` if r1 moves). `sameAs(c).x/.y` are typed `PlacementValue` so the chain type-checks.
- `pcb.board.centered()` returns `{ x, y }` placement values that center the component's occupied box (rotation- and origin-aware), unlike `board.center` which centers the origin point: `u1.pcb = { ...pcb.board.centered() }`.
- A footprint whose bounds cannot be resolved (bad name/library path) warns once per name the first time any placement math uses it, instead of silently collapsing to zero-size.
