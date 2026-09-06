---
'@typecad/typecad': minor
---

N-layer boards, phase 2: layer roles, net-class layer affinity, and a via manufacturing policy.

- `pcb.plane(net, layer)` dedicates a copper layer to a net. At `create()` the plane is materialized as a board-covering filled zone on that layer (through-hole-only pad connections), and the layer is excluded from the autorouter's default routing layers. The plane extent comes from the board outline, so `pcb.outline()` must be called before `create()`; a layer can carry only one plane.
- Net classes accept `layers: string[]` — preferred routing layers for the class's nets. The autorouter anchors the net's through-hole endpoints on the class's layer and favors it while routing. Layers must be declared copper layers; plane layers are ignored.
- `pcb.viaPolicy({ type: 'through' | 'blind-buried', maxSpan? })` controls the spans of vias placed by the autorouter. The default is `through` (every router via spans F.Cu→B.Cu — the budget-fab-friendly choice); `blind-buried` lets the router use the exact layer pair a route transitions between, within `maxSpan` layer boundaries (default 2), falling back to through vias for deeper transitions. Previously inner-layer transitions always emitted blind/buried spans.
- `IViaPolicy` is exported from the package root.
