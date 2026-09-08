---
'@typecad/pcb': major
---

Placement moved onto `pcb.board`; free functions removed.

- `pcb.board` is the complete placement namespace: live outline bounds (`center`, edges, corners, `fromLeft()`/`fromRight()`/`fromTop()`/`fromBottom()`) plus the component-relative verbs `below(c)`, `above(c)`, `rightOf(c)`, `leftOf(c)`, `sameAs(c)`. Readable before or after `pcb.outline()`; values follow the final outline.
- **Breaking**: the free functions (`below`, `above`, `rightOf`, `leftOf`, `sameAs`, `board`, `PlacementValue`, `isPlacementValue`) are no longer exported from the package root, and the verbs are not PCB-class methods. Replace `board(pcb).fromLeft(5)` with `pcb.board.fromLeft(5)`, `below(r1).by(3)` with `pcb.board.below(r1).by(3)`, `sameAs(r1).x` with `pcb.board.sameAs(r1)` (assignable directly). Placement *types* (`PlacementBuilder`, `BoardBounds`, `SameAsResult`, `PlacementNumber`, `PlacementInput`) remain exported.
