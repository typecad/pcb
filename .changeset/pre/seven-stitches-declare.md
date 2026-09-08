---
'@typecad/pcb': minor
---

`pcb.stitch()` is now declarative — no `pcb.add()` or ordering knowledge needed.

- `pcb.stitch(net, options)` records a request (validating net, pitch, and layers at the call) and the vias are placed at `create()` time against the complete board contents. Every component passed to `create()` is visible to the stitcher — netted or not — so mounting holes and other mechanical parts no longer need `pcb.add()` beforehand, matching how `pcb.plane()` already works. Repeated `create()` calls replace previously placed stitch vias instead of duplicating them.
- **Breaking**: `stitch()` no longer returns the via count (placement is deferred); count vias in the generated board if needed. Region errors (no outline and no `area`) surface at `create()` instead of at the call.
