---
'@typecad/pcb': minor
---

The gerber/layout views have a house layer theme. `typecad` is built from the
typecad.dev design system — near-black canvas, typeCAD green front copper,
darker green back copper, white silk and board edge, zinc grays for secondary
layers, and a five-color rotation for inner copper. It leads the layer-theme
picker and is the default on first open (and for anyone whose saved pick was
the old `typeCAD` no-theme placeholder). The raw palette the placeholder used
to show is still there, as the `Default` option. Vendored KiCad themes are
unchanged and keep winning over the default once picked.

The pcba view's old `typeCAD house` colorway is gone — it was a teal stub
that never matched the brand, and the name now belongs to the layer theme.
`--theme typecad` on the pcba image renderer no longer resolves to a builtin;
use a JSON theme file for custom pcba palettes.
