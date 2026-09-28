---
'@typecad/pcb': patch
---

Board viewer: the layout view now derives from the gerbers' X2 pad attributes alone, so a fresh board with nothing connected still gets it — previously the overlay (and the Layout dropdown entry) only appeared when the netlist carried at least one pad→net mapping, which meant the very project `create` scaffolds opened without a layout view. Ratsnest wires are now the layout view's alone: the plain gerber stack renders the fabricated board without them (they had been drawn into every view that renders the gerbers, including the viewer's first open in gerber mode). Routing keys and drags were already layout-gated, so no interaction lost them.
