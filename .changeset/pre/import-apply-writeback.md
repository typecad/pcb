---
'@typecad/pcb': minor
---

`typecad-pcb import --apply` now writes back the elements that used to be
display-only. Outline, zone/keepout, and the whole routing section round-trip:
move a via, drag a zone corner, grow the board outline, or reroute a trace in
KiCad, run `npm run import`, select the changes, and the source is patched —
rebuild and the board matches.

Two new flags on `import`:

- **`--auto`** — applies every detected change without the interactive
  checkboxes (implies `--apply`). What would be applied is still listed in
  the output; the safety rails (unsupported constructs, non-contiguous
  routing regions) behave exactly as in interactive mode and fall back to
  notes instead of guessing.
- **`--watch`** — watches the .kicad_pcb file and re-runs the import on
  every save (500 ms debounce; touch-without-write cycles are skipped;
  a partially written or locked file logs a warning and the next save
  retries instead of killing the session). Combined with `--auto`
  (`import build/board.kicad_pcb --watch --auto`) the typeCAD source is
  live-synced while the board is edited in KiCad; Ctrl+C stops. Without
  `--auto`, watch re-runs display mode on each save.

The `--capture-layouts` flag is gone: text layout positions
(referenceLayout, valueLayout, fabLayout) are now imported and updated by
default on every `--apply`/`--auto` run, and the import is not in sync
until they match the board. Existing layout assignments in source are
updated as before; new ones are inserted for components without them
(a layout identical to the unset default produces no change).

- **Text section** — board text now round-trips instead of only updating
  calls that already exist: `gr_text` elements with no matching
  `typecad.text()` call are inserted (position, layer, size, thickness,
  font, mirror/justify, `hide: true` all included), and source calls whose
  text is no longer on the board are removed. Duplicate labels (two GNDs,
  two X marks) pair position-aware, so an update never teleports the wrong
  instance.
- **Arc tracks** — KiCad's arc-shaped `(arc (start) (mid) (end))` tracks are
  imported: they are tessellated into straight segments on the same
  net/width/layer, so the copper follows the drawn path instead of
  silently vanishing. Zone outline arcs already tessellated; zone-internal
  arcs are not mistaken for tracks.
- **Stackup depth** — the per-layer stackup detail (thickness, material,
  epsilon_r, loss_tangent, color for copper/dielectric/mask/silk layers,
  plus copper finish) is imported into the `typecad.stackup(N, { layers: … })`
  options. Apply mode regenerates the call — including inserting it when
  the source has none — so a rebuilt board's dielectric geometry matches
  what KiCad had instead of the library preset.
- **Board graphics on silk/user layers** — `gr_line`/`gr_rect`/
  `gr_circle`/`gr_arc`/`gr_poly` outside Edge.Cuts import as
  `pcb.line()/rect()/circle()/arc()/poly()` calls (v6 `width` and v7+
  `stroke` forms both read; `fill` mapped). Apply mode pairs them
  position-aware, regenerates moved/resized shapes, deletes ones removed
  from the board, and appends new ones. Edge.Cuts items continue to feed
  the outline and stay out of the graphics sync.
- **Unsupported elements are reported against the file-format spec** — the
  import now declares everything it leaves behind, with counts, instead of
  dropping it quietly: dimensions; `bezier`/`gr_curve` curves (both the
  v7+ and legacy tokens); images, `gr_bbox` and text boxes; the title
  block; board-level properties; embedded font declarations;
  footprint-embedded zones; per-footprint graphic edits (silk drawn in the
  board editor); footprint user text annotations; and blind/buried vias
  (imported as through vias — the standalone via API cannot express layer
  spans yet).
- **Stability fixes found by burn-in** — three ways the apply cycle could
  fight itself or the project are gone: a bare `(justify)` element (KiCad's
  default-alignment marker) parsed as an empty object and flagged phantom
  justify changes forever; the source justify was compared as a raw
  PropertyValue record against the board's plain object, flagging every
  mirrored text on every run while writing back identical text; and a
  source file that fails to parse (transient read race, editor mid-save
  under `--watch`) was silently treated as absent, so components matched
  into whichever file still parsed and positions/routing/text were written
  there — the cycle now reports the unparseable files and skips entirely.
- **Duplicate-label text sync (audit follow-up)** — the source analyzer
  recorded every `typecad.text()` call twice (the statement handler and a
  generic call visitor both fired), so on boards with duplicate labels
  (two GNDs, two X marks) the surplus entries paired against the wrong
  board text and the updater rewrote a call to its sibling's position —
  silently collapsing distinct labels onto one spot over repeated
  import/build cycles. Calls are now recorded once, updates match on text
  AND source line, and regression tests pin both labels keeping their own
  positions through a move. A missing-terminator bug in freshly inserted
  `typecad.stackup(...)` statements was also fixed (the no-semicolon
  compare text leaked into the insert path).
- **Hand-written source patterns (audit follow-up)** — apply-mode write-back
  now recognizes code the way users actually write it, not just the
  generator's canonical shapes: zone geometry given as
  `bounds: { left, top, width, height }`; fill settings written flat on the
  options object (`thermalGap: …`) instead of grouped under `fill:`; outline
  calls using the bounds-object argument (previously corrupted into
  `outline(0, 0)`); class-field components (`private r1 = new Component(…)`),
  which now match and update their inline props in place — and never get
  `this.r1.pcb = …` statements inserted into the class body, which produced
  unparseable source. Zone calls in any of these styles compare semantically
  and are left untouched when they already match the board, so the importer
  no longer rewrites hand-written style into canonical form just to
  converge.
- **Outline** — positional args of `typecad.outline(...)`/`outlineCircle(...)`
  update in place; fillet radii appear/disappear; polygon outlines and
  cutouts rewrite their point arrays; removed or added Edge.Cuts shapes
  delete or append the corresponding calls.
- **Zones** — zone/keepout calls are matched to board zones by net, layers,
  and center, then semantically diffed through the same code generator the
  console output uses (so "no change" means truly equal); geometry rewrites
  keep the rect form when the polygon is still a rectangle and fall back to
  `points` when it is not; fill options, restrictions, and scalars all
  update. Zones deleted on the board are removed, new zones appended.
- **Routing** — the track section (declarations, pushes, standalone vias,
  and the `typecad.create(...)` spreads) is regenerated as a whole from the
  board whenever any vertex, via, or net differs, and stays byte-identical
  when in sync. Chains are built by one shared pure generator
  (`buildTrackChains`/`trackBlockSource`) that the console display also uses,
  so import output, apply output, and manual copies can never drift. Safety
  rails: statements with `powerInfo`/spreads/unknown builder calls, or
  non-contiguous routing regions, are left alone with an explanatory note;
  routing is only ever inserted into the single file that owns `create()` —
  other project files with their own `create()` are never touched. Track
  arrays are declared with `const` (they are only ever pushed to).
- **create() track list hygiene** — older generated code passed track arrays
  as bare identifiers (`create(j1, track_VCC)`); when the board's net set
  changes, such a name can lose its declaration and crash the build
  (`ReferenceError: track_VCC is not defined`). The create list is now
  rewritten independently of the routing region diff: bare track-array
  identifiers are recognized and dropped, only component arguments are
  preserved, spreads are emitted for the board's current nets, and the
  generated text matches the replaced range exactly so repeated applies
  converge instead of growing whitespace.

Verified end-to-end on the rd_skeleton demo: KiCad-side edits (via move,
zone corner drag, outline resize, trace reroute) → `--apply` → rebuild
reproduce every edit in the rebuilt board, and re-import reports zero
pending changes.
