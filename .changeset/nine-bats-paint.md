---
'@typecad/pcb': patch
---

The layout view's layer-edit preview now paints the target layer's own
theme color, and the layout view no longer hue-rotates back copper. Two
invented color transforms made layer edits unreadable: the live preview
shifted the re-layered trace's hue by a fixed 150°, and entering the
layout view applied the same rotation to every back copper group — so in
Nord a trace sent to B.Cu painted orange (the rotated blue ≈ Nord's own
front-copper rust, i.e. "nothing changed"), and the rebuilt board showed
the same off-theme orange that exists nowhere in the theme (gruvbox's
green back copper rendered purple). Both transforms are gone: a re-
layered trace repaints instantly in the resolved theme ink of its target
layer — verbatim what the rebuilt board will paint there — and the
layout stack keeps each copper layer in its theme's own color, with the
existing 75% translucency providing the front-over-back depth cue.
The properties dialog's apply also drops the segment selection now: the
selection highlight is a solid white line at the trace's own width, and
left standing it covered the very stroke the layer edit just repainted —
the recolor was there all along but invisible until the selection
cleared (reported as "the layer change does nothing until rebuild").
The net highlight's paint snapshot no longer reverts a re-layer either:
clearing a highlight restores every matched element's saved stroke, and
that snapshot is now kept in sync when a layer edit (or its undo)
repaints a trace — plus the dialog's apply clears the highlight — so
clicking elsewhere after an edit leaves the new layer color standing
instead of repainting the pre-edit color over it. The edited trace is now
a NATIVE member of its target layer: the path and its hit lines move
into the target copper group and carry that group's own `var(--ink-…)`
stroke, so theme switches, the layer visibility checkbox, the per-layer
opacity slider, and the layout view's translucency apply to it exactly as
they do to the layer's built ink — undo returns it to its original group
with its original stroke.
