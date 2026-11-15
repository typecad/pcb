---
'@typecad/pcb': minor
---

The Layout view edits three more things, and one gesture applies them all:
flip a part to the other side, draw a copper pour or keepout, and resize the
board outline.

- **Shift+F flips the selection** (KiCad's F; plain `f` stays fit-to-view,
  and the E panel gains a side select). The pending ink mirrors about the
  part's LOCAL X axis — the exact transform the writer's back-side path
  applies (pad-local Y negated, rotations mirrored, chamfers flipped), so
  the preview and the rebuilt board agree — pad probes, rip-up binding and
  the ratsnest follow the mirrored pads, and undo/redo rides the standard
  move snapshots. Apply writes an absolute `side: 'back'|'front'` into the
  `<var>.pcb = { … }` literal (rewritten, appended, or inserted with the
  position into `_sync.ts` for constructor-placed parts) — `rotation`
  stays, matching the writer. The payload carries each flipped part's FINAL
  pad centers, and sticky TrackBuilder endpoints now translate PER PAD (a
  mirror moves every pad differently; a pure move still translates by the
  uniform delta). The semantic check reads the rebuilt footprint's layer:
  a flip that didn't land is a miss.
- **Zones**: a two-click rectangle tool (the ruler's interaction model,
  grid-snapped) with pour/keepout, copper layer, and net picked beside the
  button — nets collected from the board's own pads and traces. Pending
  zones render as dashed overlays, Del removes the selected one, undo/redo
  and the pending-state snapshot carry them. They have no source literal to
  rewrite, so apply inserts `typecad.zone({ net, layers, x, y, width,
  height })` / `typecad.keepout({ layers, x, y, width, height })` calls
  into the `_sync.ts` sidecar (new grammar section, anchored after
  placements and before routes), which runs right before `create()`; the
  export's zone-fill materialization refills the pour and the semantic
  check verifies the rebuilt zone by corners, layer, and net name.
- **Board outline**: clicking Edge.Cuts ink selects the outline (the
  segment/via capture selector stands down for it), the E panel edits
  x/y/width/height in board mm, arrows nudge, and the new rect previews as
  a dashed overlay while the authored ink dims. Apply rewrites the matching
  `typecad.outline(x, y, width, height)` literal in place — the fillet
  argument survives, numeric literals only — with no sidecar fallback (a
  second Edge.Cuts contour would read as a KiCad cutout); a polygon or
  circle outline reports that no literal matches instead of guessing. The
  semantic check measures the rebuilt board's Edge.Cuts `gr_line`/`gr_arc`
  extent against the requested rect.

The apply bridge gained `zones` and `outline` payload slots (the webview
bridge callback stays tail-detected, so older pages keep working), the
counts/log lines cover both, and the keys cheat-sheet documents the new
bindings. The bundled extension asset is rebuilt.

Viewer pages now carry their generator's identity
(`<meta name="tc-viewer-generator" content="<@typecad/pcb version>">`), and
the extension's restore fast path refuses a cached page whose stamp differs
from the project's installed toolchain (resolved npx-style, walking up
`node_modules/@typecad/pcb` from the hw folder) — previously a toolchain
update with an unchanged board served the stale page forever, new layout
gestures dead under the old page's handlers (regeneration only ever keyed
on the board file changing). An unresolvable toolchain keeps the legacy
behavior; a pre-stamp page counts as stale and regenerates once.

The board importer's routing-section and create()-args comparisons are
line-ending aware: the generated block is LF, so a CRLF checkout or a
Windows editor save read as a full routing drift and every apply proposed
rewriting the whole section (converting the file). The wanted block now
renders with the file's own EOLs — CRLF files compare equal, converge, and
stay CRLF; a golden-corpus regression pins it.

Zone follow-ups from live use: pending-zone labels render upright (they
live in a group OUTSIDE the y-flip now — inside it the scale mirrored the
glyphs — and follow the Flip Board mirror), the dashed zone strokes thin to
match the outline indicator (0.08, selected 0.12), and a pour drawn fully
outside the authored board outline warns in the layout warnings box before
any apply — KiCad clips pours to Edge.Cuts, so an off-outline pour filled
to nothing silently. The importer's zone sync scans every `_sync*.ts`
beside the given sources (a layout-applied pour living only in the sidecar
no longer proposes duplicating itself into hand-written code) and compares
both sides through the zone API's defaults — a minimal
`typecad.zone({ net, layers, x, y, width, height })` is IN SYNC with its
board zone, while a genuine deviation still proposes its update and the
applied form converges on the next compare.

The viewer now draws every DECLARED zone's boundary in the layout view
(thin dashed outline + a small net/layer label, upright and flip-aware,
pointer-transparent) — gerbers carry only the FILLED copper, so a keepout
or a pour outside Edge.Cuts (KiCad clips pours to the outline, so it fills
to nothing) was invisible in the viewer while KiCad's canvas showed its
boundary. With this, "none of my zones appear" becomes answerable at a
glance: the boundary is the zone, the copper under it is its fill.

Declared zones are now EDITABLE from the layout view: clicking a boundary
selects it, E moves/resizes the rect (rewriting the matching
`typecad.zone()`/`.keepout()` literal's x/y/width/height in place — layer
included in the match, so identical rects on different layers stay
distinct), and Del removes the zone's whole statement from source. Both
ride the apply bridge as `zoneEdits`/`zoneDeletes`, persist across
reloads, and verify on the rebuilt board (a deletion that is still there
is a miss). Plane-materialized and import-authored zones have no literal
to rewrite and report that instead of being mangled.

And the fill-order fix the zones surfaced: a pour drawn inside an
existing plane at equal priority 0 LOST the fill to the plane entirely —
KiCad fills by decreasing priority and an equal-priority zone is
subordinate, so the pour rendered nothing and read as a pour touching
ground with no gap. New pours from the layout view now land ABOVE every
zone priority already in source (ascending across multiple inserts), so
the plane keeps its clearance around them; a regression pins the
ordering.

And the follow-up the fills surfaced: the zone boundaries now carry their
FILL STATE — the build measures each declared zone's filled copper with
the native fill engine and the layout view's label reads
"AMP_OUT · F.Cu · no fill (no AMP_OUT copper inside)" when it filled to
nothing. The rule that produced it (KiCad's too): a zone keeps only
islands that connect to same-net copper — a pour drawn over nothing but
foreign planes is removed whole, however carefully it was drawn. New pours
also land above every existing zone priority so planes keep their
clearance around them once they do connect.

And the semantic check stopped lying about zones: typeCAD's writer
pretty-prints zone blocks (every token on its own line, sub-lists wrapped
in their own parens), and the rebuilt-board zone parser only matched the
inline `(zone …` form — every zone apply reported "MISSING from the
rebuilt board" while the pour rendered fine. The parser collapses the
block's whitespace and tolerates the grouping parens; a regression test
pins the verbatim pretty-printed shape.
