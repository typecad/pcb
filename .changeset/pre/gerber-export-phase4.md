---
'@typecad/pcb': minor
---

Native gerber export (Phase 4): text rendering. Silkscreen/fab/user-layer text now plots natively via KiCad's built-in stroke font (newstroke glyph data embedded for U+0020–U+00FF, decoded with the exact `value + 'R'` / `FONT_OFFSET −8` / `1/21` conventions) and TTF texts render from the board's own `render_cache` polygons as filled regions. Text placement replicates the probe-verified KiCad 10 rules: file `(size H W)` axis order, cap-middle justification offsets (`sy − 0.052·th + max(0, 0.013·(0.8·sy − w))` base with the 1.17-height fudge), negated rotation for the internal y-down frame, nm-truncating point conversion, per-segment MoveTo/LineTo emission, hidden-property skipping (symbol-valued `hide yes`), properties-only footprint text, and the texts-before-graphics two-pass ordering with bare (attribute-free) text runs. Also: legacy `fp_text user` items render except `${REFERENCE}`/`${VALUE}`
placeholders, and `typecad-pcb export gerbers` now defaults to the native
plotter for all users (`--kicad` opts back into the legacy kicad-cli path;
the legacy path keeps passthrough flags and zone-refill behavior). The features fixture now
matches kicad-cli on all 26 output files; rd_skeleton matches everywhere
except ~30 lines of silk (one identical-geometry ring rotation + tie
rounding) and ~80 lines of fab (tie rounding, one swapped arc pair),
all documented in gerber_spec/SPEC.md. Late fixes: font data pinned to
the KiCad 10.0 branch, gr_text raw indexing, ${REFERENCE}/${VALUE}
substitution, ClampTextPenSize pen clamping (positions keep the
unclamped thickness), and closing-vertex ring dedupe.
