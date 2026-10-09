---
'@typecad/pcb': patch
---

Layout view: a rotated footprint's labels anchor where KiCad actually plots
them — and a selected text finally reads as selected.

`parseBoardLabels` placed footprint properties with the rotation applied in
the wrong direction (R(+θ) instead of R(−θ)) and added the footprint's
angle to the label's own (absolute) angle. Every label of a rotated part was
mirrored across its origin — U3 in mod-ec (footprint rot 90) had its
reference anchored 5.7mm from the plotted "U3" ink, so the claim radius,
the anchor disc, and the press path could never reach it: the designator
was unclickable and never appeared in the Tab cycle (only the pour and the
trace through it did). The frame is pad-verified (pad 3 at local (−1.76, 0)
plots at origin + R(−90)·local) and now matches the gerber plotter, which
had it right all along. A rot-180 part is its own mirror, which is why
only rotated parts (U3, J1, J2) suffered.

On top of the corrected anchors: the hovered part's own labels join the
Tab cycle (KiCad's Tab steps through a footprint's fields), the part
candidate falls back to a geometric box test when ink or pad labels above
its handle swallow the DOM hit, the anchor disc tracks the live
(comp-transported) label position, and a press on a claimed glyph's own ink
selects its text over the copper beneath (the layer groups carry
pointer-events:none, so the claimed paths never receive real presses — the
layout-view capture path now aim-tests the ink in screen space before the
near-segment search).

Selecting a text — by click or Tab — draws an overlay-owned selection box
at the text's live anchor: recoloring claimed glyphs alone is invisible
where the ink is already the selection color (white silk/fab under the dark
theme's white selection ink) or where the label has no claimed strokes.
The box rides pending moves and rotations, doubles as the drag target a
stroke-less label never had, and every non-text selection (pad, segment,
via, zone, part, copper) clears it.

Cycle candidates now come from directly under the cursor and nowhere else.
Two reach bugs were retired: the part handles inherited the default
stroke-width of 1px (=1mm board units), and pointer-events:all counts the
stroke band even when stroke is none — every part was hittable ~0.5mm
outside its body (J2 joined the cycle from 2.2mm away). And a text with no
claimable ink cycled within a length-scaled disc of its anchor — 7+ mm for
long values — so labels nowhere near the cursor appeared in the stack; the
disc is now a last-resort scaled by the glyph height alone (a text with
claimed ink cycles only over that ink, and a part's labels only over the
part itself).
