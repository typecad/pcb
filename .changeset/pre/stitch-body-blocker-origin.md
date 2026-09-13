---
'@typecad/pcb': patch
---

Fixed `pcb.stitch()` placing body keep-out boxes at the footprint bounds center instead of the footprint origin.

- Many footprints' origin is pin 1 or a corner (DIPs, pin headers, most THT connectors), not the body center. The stitch grid treated the origin-relative bounds box as centered on the component position, so it shadowed open board up-and-left of the part — refusing vias that would fit, e.g. the row above and the column left of a `DIP-8_W7.62mm` — while leaving the real body open down-and-right, where stitch vias could punch straight through the part.
- Blockers are now built from the box's rotated corners anchored at the component position (mirrored about the X axis for back-side parts), matching the placement code's `rotatedBox` semantics.
