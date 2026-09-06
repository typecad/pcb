---
"@typecad/typecad": patch
---

The gerber viewer's ruler tool gained angle snapping: holding `Shift` while measuring constrains the endpoint to 45-degree increments (0/45/90/...) from the start point, at the same radial distance. The snap applies to the live ruler while moving and to the ruler that sticks on the second click; releasing Shift restores free placement.
