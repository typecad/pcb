---
'@typecad/pcb': minor
---

The layout view's arrangement surface grows real editor interactions: marquee box selection renders where you drag it (shift-click toggles members, click deselects, a single selected part collapses its highlight), Escape unselects everything, right-hold pans the board while parts move only when already selected, and the toolbar slims down (the layout hint, fab report panel, and zoom/export buttons are gone). Unrouted-net ratsnest wires show from first open, in every gerber-stack view. Every pad carries pin-number + net-name labels from the PCB model, rendered topmost; a part drag carries its labels live — the whole footprint moves as one group — and rotated parts' refdes always reads keep-upright (L→R or B→T). Pin highlight is component-style ants+brackets+tint instead of a blue circle, body-hidden pads (BGA balls) become selectable, and board presses hand keyboard focus to the svg so keys always reach it.
