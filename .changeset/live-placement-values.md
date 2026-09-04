---
'@typecad/typecad': minor
---

Relative placement is order-independent — no more call-order fore-knowledge.

- `below()`, `above()`, `rightOf()`, `leftOf()` no longer bake the source component's position into a number at `.by()` time: every placement value re-reads the source's live position and bounds when resolved. Position a component relative to another *before* either has its final position, and the relationship holds.
- `board(pcb)` no longer snapshots the outline at call time — all properties (`center`, `left`, `fromTop()`, ...) are re-read on every access. `board()` can be called before `pcb.outline()`; values follow the final outline.
- `sameAs(c).x/.y` return placement values (still assignable wherever a number was) that re-read the component's position at resolve time.
- Components re-resolve their deferred placement expressions at `create()` (fixpoint over chains: `r3` below `r2` below `r1` settles regardless of assignment order). Manually moving a component after assigning an expression freezes that axis — the manual value wins.
- `.by(gap, target)` now returns a deferred `PlacementValue` instead of an immediately-resolved number (assignable anywhere a `PlacementNumber` is expected; `resolvePlacement(value, footprint)` is exported for manual resolution).
- `pcb` coordinates now accept the placement helpers directly: `j1.pcb = { x: sameAs(mh1), y: below(mh1) }` works without `.x` / `.by()` — a builder resolves with its default gap, and a `sameAs` result picks the axis being assigned. `PlacementInput` is the accepted union.
- Edge-to-edge math is now origin-relative and rotation-faithful: footprint bounds carry the occupied box relative to the footprint origin (`minX/minY/maxX/maxY` — many origins are pin 1 or a corner, not the body center), and placement rotates the full box with the same transform KiCad uses for pads before computing edges. `below(mh1).by(0.1)` now yields exactly a 0.1mm physical gap for a rotated, off-center part like a terminal block — previously the gap was silently off by several mm. Create()-time re-resolution passes the component's rotation (fixed a bug where it re-resolved unrotated).
