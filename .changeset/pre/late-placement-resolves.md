---
'@typecad/typecad': minor
---

Late `component.pcb = { x, y }` assignment now accepts deferred placement values.

- The `pcb` field is a resolving accessor: assignment takes `PlacementNumber` (e.g. `board(pcb).fromLeft(5)`), resolves against the component's footprint immediately, and validates finiteness — reads always return plain numbers, so every downstream consumer (serializer, autorouter, placement) stays type-clean. Previously only the constructor accepted placement values; assigning after construction was both a type error and silently stored the unresolved value.
