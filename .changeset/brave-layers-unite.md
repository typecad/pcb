---
'@typecad/typecad': minor
---

N-layer boards: the copper layer set is now a first-class, always-resolved property of the PCB.

- `new PCB(name, { layers: N })` sets the copper-layer count at construction (2–32); `pcb.copperLayers` exposes the resolved layer names and `pcb.layerCount` the count. `pcb.stackup()` still configures stackup materials and overrides the count.
- Routing defaults now derive from the board's layer set: `pcb.route()` uses every declared copper layer when no `layers` are passed, through-hole pads are expanded to the board's layers for obstacle avoidance, and through vias block every copper layer they span.
- Layer references are validated when the board is written — a zone, keepout, via, or route referencing an undeclared layer (e.g. `"In1.Cu"` on a 2-layer board, or a typo like `"f.cu"`) fails with an actionable error instead of producing a `.kicad_pcb` KiCad cannot load. `pcb.route()` rejects undeclared routing layers up front.
- `track.via()` without an explicit span now always defaults to a through via (F.Cu→B.Cu) instead of guessing a blind span from the current layer.
- `copperLayerNames`, `validateLayerCount`, `MAX_COPPER_LAYERS`, and `MIN_COPPER_LAYERS` are exported from the package root.
