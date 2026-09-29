---
'@typecad/pcb': minor
---

`typecad-pcb diff` (and the `typecad-gitdiff` entry point) now renders every
layer image natively — the same gerber-writer + SVG-renderer pipeline the
docs use — so board diffs no longer require a KiCad install and no longer
spawn one kicad-cli process per layer. Pad-level changes now annotate
correctly: pads render as absolute-coordinate shapes, so a moved or resized
pad shows up as red/green geometry instead of being hidden inside shared
symbols. GUI layer spellings (`F.Silkscreen`, `User.Drawings`, …) are
accepted like kicad-cli accepted them, back-side layers keep their mirrored
presentation, and the diff report can now also be generated when running
straight from the source tree (the viewer template assembles in memory if
the built copy isn't there yet).

Follow-up fixes from visual verification: unchanged geometry now dims out of
the diff-only view on BOTH sides (the modified layer used to keep the whole
board visible under the highlights), changed zone pours render as thin
outlines instead of translucent slabs covering the change that moved them,
the shared-bbox crop addresses the flipped viewBox correctly (the diff
panels previously rendered blank), and zoom-to-change lands on the actual
change again (screen-space offset math), and the diff-only view now shows the selected layers dimmed behind the highlights instead of a blank canvas. Layer inks default to the typeCAD theme — the same palette the VS Code
addon's board viewer shows (`--theme` still overrides) — and the
added-feature highlight is red instead of green, which collided with the
green typeCAD copper.
