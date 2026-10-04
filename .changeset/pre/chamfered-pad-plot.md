---
'@typecad/pcb': patch
---

Gerber export: chamfered roundrect pads now plot their chamfers. Pads carrying `(chamfer …)`/`(chamfer_ratio …)` previously plotted as plain squares (or plain rounded rects), losing the corner cuts in the fabrication output — the castellated header's inner pads are the visible example. The writer now emits the same polygon aperture KiCad does (45° cuts measured from the corner, plain corners rounded at 4 segments per 90°, the pad angle carried in the macro's rotation parameter), and FreePoly macros match KiCad's emission byte-for-byte (closing-vertex repeat in the count, one macro reused across rotations). Also fixes an off-by-one in the FreePoly polygon vertex count.
