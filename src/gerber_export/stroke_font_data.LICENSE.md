# stroke_font_data.json — provenance and license

The glyph data in `stroke_font_data.json` is derived from the **Hershey
"futural" font**, one of the Hershey vector fonts created by Dr. Allen V.
Hershey at the United States National Bureau of Standards in the 1960s as
US-government work. **The Hershey font data is in the public domain.**

- Source data: `hersheytext.json` from the `hersheytext` project
  (https://github.com/techninja/hersheytextjs), which packages the Evil Mad
  Scientist Laboratories Hershey Text engraving-font conversion under an
  MIT license for its code. Only the public-domain font coordinates are
  used here.
- Conversion (`gerber_spec/tools/convert_hershey.py` in the typeCAD
  workspace): SVG-style y-down paths normalized into the exporter's glyph
  frame (cap box y ∈ [−0.95, +0.05], baseline −0.95, advance widths in
  cap-height units, +0.19 em inter-letter gap). No KiCad/GPL code or data
  is included.

This replaces an earlier prototype that embedded KiCad's GPL-2+ newstroke
data — removed for license compatibility with this package's Apache-2.0
distribution.
