---
'@typecad/pcb': patch
---

Gerber viewer + import fixes found on the castellated-header demo board:

- Viewer: macro outline (primitive 4) rotation is now read from the last parameter instead of an index derived from the declared vertex count — KiCad counts closing-vertex repeats into that count (and lists extras), so the old index landed on a coordinate (e.g. −0.6 read as degrees), silently unrotating mirrored/moved pads and warping the polygon by fractions of a degree. A pad rotated 180° (the right-edge castellated header) rendered with its chamfers pointing off-board; explicit closing repeats are also dropped from the parsed point list.
- Import apply: loose `const routeN = new TrackBuilder(...)` chains (written by the viewer's apply bridge beside create()) are now part of the routing section the regeneration owns — their statements and create() arguments are removed in the same change as the arrays are regenerated from the board. Left in place, every track they carried would exist twice after the next build (the golden-corpus sync test caught exactly that state).
