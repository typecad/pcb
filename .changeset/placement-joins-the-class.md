---
'@typecad/typecad': major
---

Placement verbs and board bounds moved onto the PCB class.

- `pcb.board` (getter), `pcb.below(c)`, `pcb.above(c)`, `pcb.rightOf(c)`, `pcb.leftOf(c)`, and `pcb.sameAs(c)` replace the free functions — positioning never leaves the `pcb.` namespace and needs no imports.
- **Breaking**: the free functions (`below`, `above`, `rightOf`, `leftOf`, `sameAs`, `board`, `PlacementValue`, `isPlacementValue`) are no longer exported from the package root. Replace `board(pcb)` with `pcb.board`, `below(r1).by(3)` with `pcb.below(r1).by(3)`, `sameAs(r1).x` with `pcb.sameAs(r1)` (assignable directly). Placement *types* (`PlacementBuilder`, `BoardBounds`, `SameAsResult`, `PlacementNumber`, `PlacementInput`) remain exported.
