---
'@typecad/pcb': patch
---

The pads manifest (`build/<board>_pads.json` — per-pad world position,
extents, copper layers, pin numbers, and net names measured from the final
board) is now announced at info level and listed in the build output
summary instead of being written silently at debug level. The pcb-placement
skill doc now points placement work at it so measured pad geometry is used
over datasheet estimates.
