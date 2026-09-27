---
'@typecad/pcb': patch
---

The layout view's trace-properties dialog (E) can no longer write a width
below the board's own minimum. The `[`/`]` width keys already stopped at
the rules island's `minTrackWidthMm`, but the dialog clamped at a
hardcoded 0.05 mm floor — an under-minimum value typed there rode the
apply bridge into source verbatim (seen as a 0.05 mm trace that rendered
sub-pixel in the viewer: "my trace vanished after the layer change").
Both the dialog and the shared resize path now floor at the rules
minimum, and the dialog's hint shows it (`min 0.2 mm` when the board
carries one).
