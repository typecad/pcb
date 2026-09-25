---
'@typecad/pcb': patch
---

Zoom-to-component (in-viewer search and the vscode extension's select flow) no longer lands zoomed out in the PCBA view: each hit element's own transform is now folded into its bounding box before the fit union. `getBBox()` ignores an element's own transform, and PCBA component glyphs are `translate(centroid) rotate(angle)` groups — their local boxes unioned with the pads' board-frame boxes stretched the fit from the board origin to the part, so every selection rendered the whole board instead of the component.
