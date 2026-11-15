# @typecad/pcb

## 1.0.0-alpha.10

### Minor Changes

- 91db638: `typecad-pcb export` learns assembly outputs: `export pos`, `export bom`,
  and `export assembly` — placement (centroid/CPL/pick-and-place), bill of
  materials, and the one-shot zipped provider package, all written by
  typeCAD's own writers with no kicad-cli involved.

  The placement exporter is profile-driven — a provider is a data object in
  `src/assembly_export/profiles.ts`, not a code path. Six ship: `kicad`
  (column semantics of `kicad-cli pcb export pos --format csv`: always-quoted
  text fields, 6-decimal mm, lowercase `top`/`bottom`), `jlcpcb`
  (`Designator,Mid X,Mid Y,Layer,Rotation` with T/B sides), `pcbway` (the
  same CPL family spelling Top/Bottom), `seeed`, `openpnp` (the Reference CSV
  importer's `id,x,y,rotation,side`), and `generic` (every knob exposed,
  including inch/mils units). Coordinates stay in the KiCad board frame —
  JLCPCB, PCBWay and Seeed all ingest KiCad-native data and adapt it on their
  side (PCBWay explicitly asks customers not to pre-mirror bottom-side data),
  so profiles emit what the board stores and leave `--rotation-offset` /
  `--bottom-rotation` as explicit overrides for shops that want a shift.

  Which datum a row reports is a first-class choice: `--centroid
anchor|pads|body`. Anchor is what KiCad's pos export reports (the
  footprint's `at` origin); body transports the measured fab-outline bbox
  center through the footprint rotation — the physical body center shops ask
  for, which matters more than it sounds: rd_skeleton's D2 (a DO-41 laid
  horizontal, pads 7.62mm apart) anchors on pad 1 while its body center sits
  3.81mm away, and a machine placing at the anchor would drop the part half
  a pitch off. The local→board transport is the pad-verified one the gerber
  plotter and label anchoring already share.

  Filtering matches KiCad's own semantics: `exclude_from_pos_files` /
  `exclude_from_bom` footprint attributes and DNP are honored across every
  shape KiCad writes (`(dnp yes)`, `(attr (dnp yes))`, legacy `(attr dnp)`),
  DNP parts ride along in the kicad profile (as kicad-cli does) and stay out
  of shop profiles, and ref globs (`--exclude "FID*,MH*"`, plus per-profile
  defaults) drop fiducials and mounting holes.

  `export bom` joins board truth with the netlist beside it — MPN lands in
  JLC's `LCSC Part #` column (the typeCAD serializer's capitalized fields,
  plus LCSC/manufacturer-part-number aliases), rows group by
  value+footprint+mpn with refs collapsed (`--ungrouped` for one row per
  reference), and a missing netlist degrades to board-only columns rather
  than erroring.

  The `openpnp` profile also writes a native `<board>.board.xml` you open
  straight from OpenPnP's Boards tab — no empty board to create, no import
  step. Schema and conventions come from OpenPnP's own source and its
  checked-in sample (root `openpnp-board`, placements with
  `part-id`/`side`/mm locations), and bottom-side parts carry the transform
  its KiCad .pos importer applies: x negated, rotation mirrored
  (rot → 180 − rot). The board size rides along when Edge.Cuts geometry
  exists. The shop profiles (JLC/PCBWay/Seeed) deliberately do none of this
  — their uploaders take the unmodified KiCad frame.

  Re-exporting that board.xml doesn't destroy work done inside OpenPnP:
  part associations, Ignore/Fiducial types, enabled flags, and comments are
  copied from the previous file per placement while geometry (and a flipped
  side) always follow the board — placements for refs that left the board
  are dropped and named in the log, and hand-added placements for refs still
  on the board (a fiducial) ride over untouched. `export assembly`'s
  staging-wipe captures the old file before deleting the directory, so the
  merge works there too. `--fresh-board` opts out and regenerates clean.

  The openpnp profile now also carries what the machine needs to run, not
  just what to place: `FID*` references ship as `type="Fiducial"`
  placements instead of being excluded (mounting holes stay out), a closing
  Edge.Cuts outline rides as the board `<profile>` path, and every pad on a
  paste layer lands in `solderPastePads` for dispensing setups — the pad
  shape as a `Pad$RoundRectangle`/`Pad$Circle` subclass picked by simple-xml's
  `class=` attribute (the `BoardPad.pad` field is the abstract
  `org.openpnp.model.Pad`, not the Footprint pad used in packages.xml). The profile
  encoding matches OpenPnP's actual reader, quirks included: the required
  `winding-rule` attribute, and the first vertex repeated after the loop —
  their commit switch falls through from MOVETO into LINETO, consuming four
  points for the first entry, and a plain vertex list dies with an
  IndexOutOfBounds wrapped in an InvocationTargetException (the empty
  "board load failed" dialog). Beside the board file, `<board>-packages.xml` and
  `<board>-parts.xml` define each unique package — pad layout (with
  roundness from roundrect ratios, 100 for circles) and body size from the
  fab outline, the geometry bottom vision checks against — plus one part
  per unique footprint+value, named identically to the board's part-ids.
  OpenPnP has no import menu for those; they're drop-in documents for its
  configuration directory. The formats are pinned by a round-trip harness
  (openpnp_spec/) that deserializes our output with OpenPnP's own serializer
  settings and a verbatim copy of its profile-rebuild commit code — the
  three reader quirks above were each caught by loading, not by reading.

  `export assembly` composes the native gerber/drill/job export (zones
  refilled in memory, as `export gerbers` does) with both files into
  `build/assembly/<board>-<profile>/` and zips it — a store-only ZIP from a
  new dependency-free writer (fab packages are text; compression buys
  nothing) — to `<board>-<profile>.zip`, the file the shop's uploader wants.
  `--no-zip` keeps just the staging directory.

  `board_model` grew the fields these writers consume: footprint
  body-center (the bbox measure now reports the center alongside the size,
  µm-rounded), the dnp/exclude flags, the board's aux (drill/place) origin
  (`--origin aux` rebases placement rows onto it), per-pad rotation /
  roundness / size, and the Edge.Cuts outline as line segments (arcs
  flattened, rects expanded).

- 99a818f: Board artwork from an image file: `new Image({ file, at, size, ... })` +
  `pcb.create(art)` rasterizes a PNG onto the board's three real inks — exposed
  copper, silkscreen, and solder-mask openings — as filled board graphics.

  The format is an ink palette, not grayscale, because a fabricated board's
  "colors" are exactly three on a substrate: red `#FF0000` pixels become copper
  on `F.Cu`/`B.Cu` with an automatic mask opening beside them (copper under
  intact mask is invisible; the opening grows by `maskExpansion`, default
  0.05mm, for fab registration), white `#FFFFFF` becomes silkscreen, blue
  `#0000FF` becomes a mask opening (bare substrate, or gold where copper sits
  under it), and every other pixel is background — the fab's mask color IS the
  background, you order it rather than paint it. `inks: { copper: '#00FF00',
silk: null }` remaps or disables per ink; `tolerance` (default 100, Euclidean
  RGB) sets how far off-palette a pixel may drift and still match.

  Each ink is classified per raster cell (`resolution`, default 0.1mm — cells
  sample the source image center, so pixel art upscales crisply) and greedily
  merged into rectangles, emitted as filled `gr_poly` graphics. Polygons, not
  rects: the gerber exporter strokes `gr_rect` but regions filled `gr_poly`, so
  art plots correctly on every layer; holes (letter counters, logo counters)
  need no special handling — an unclaimed cell is simply never painted. Rebuilds
  are byte-identical; `side: 'back'` mirrors the artwork horizontally and emits
  onto the B.* layers so it reads correctly when the board is flipped.

  The image pipeline is dependency-free: a hand-rolled PNG decoder (node:zlib)
  reads 8/16-bit gray, RGB, palette+tRNS, and RGBA at 1/2/4/8-bit depth, checks
  chunk CRCs, and rejects interlaced files with a re-export hint. The Image
  itself validates options in the constructor (`file`, finite `at`, positive
  `size`, `side`, `resolution` bounds) and decodes lazily at create() time,
  where a bad file fails the build with the call site attached.

  Two engine gaps the copper ink exposed, both fixed: the native copper gerber
  plotter silently dropped ALL board-level graphics (`gr_line`/`gr_poly`/`gr_text`
  … on F.Cu/B.Cu) — pads, vias, tracks, and zone pours plotted, hand-drawn copper
  ink never did — so the copper pass now routes board graphics through the same
  drawers the graphics layers use (a filled poly lands as a G36 region, an
  unfilled one strokes at its width, copper text renders). And `pcb.create()`
  now accepts `Image` items alongside Components and TrackBuilders.

  Documented caveats: copper artwork is non-net copper — keep it clear of real
  nets yourself (DRC flags collisions, which is the feature working), and dense
  silk artwork trips `silk_overlap` warnings against its own rectangles; the
  rule is calibrated against kicad-cli goldens so it was left alone, and
  art-heavy boards set `silk_overlap: ignore` in the conf severities. 22 new
  tests cover the decoder (all color types, filters, corruption), the ink
  classifier and rect merger, the Image class (options, ink overrides, front/
  back geometry, mask pairing, determinism), the full-board integration, and
  the copper-graphics gerber fix.

  The VS Code layout view gained the matching gesture: a **place image** button
  beside the zone tools. Arming it asks the extension host to open the PNG
  picker (a webview cannot), and the host answers with the picked file — bytes
  as a data URL for the on-canvas ghost, plus the absolute path. A click drops
  the artwork's CENTER (grid-snapped, like every placement); the ghost previews
  the image and MIRRORS it when `back` is selected beside the button, since
  back-side art lands mirrored on the board. `E` opens a properties panel for
  the pending artwork (x/y center, width/height, side), `Del` removes it, both
  undo-able; pending artwork persists across reloads — geometry and path only,
  without the base64 bytes, which would blow the localStorage quota that every
  other pending kind shares (a restored image renders an outlined placeholder;
  the apply needs the path, not the bytes).

  Apply copies each picked file into the project's `art/` folder BEFORE the
  plan (deduped by content — the same PNG placed twice reuses its first copy),
  so the generated statements carry project-relative paths and the project
  stays self-contained. The stage then ensures the sidecar speaks the artwork
  grammar — older sidecars predate it: the `Image` specifier joins the pcb
  import, and `export const syncArt: Image[] = [];` lands beside syncTracks —
  and inserts `syncArt.push(new Image({ file: 'art/x.png', at: { x, y }, size:
[w, h] }));` after the last image statement (below zones). The entry file's
  canonical integration gains the `...syncArt` spread beside `...syncTracks`
  (one rewrite — both replace the whole create() call, so composing them as
  two edits would corrupt the call), and `create()` evaluates the spread after
  syncBoard() ran, so every push is visible. The rebuild's semantic check now
  also verifies artwork: some filled gr_poly on the placed side's layers must
  intersect the placed rect (a mask-only PNG paints only openings; that counts).

  The `_sync.ts` grammar extension is contract-pinned across the two copies
  (vscode extension + kicad2typecad importer) as before, and the extension's
  bundled asset plus the demo and rd_skeleton projects' installed copies are
  rebuilt with it.

  Tier 2, as promised: contours are now the DEFAULT geometry — each ink's cell
  grid is traced into rectilinear boundary loops (interior-on-left directed
  edges, pinch-point ties hugging the current component), holes are classified
  by even-odd containment depth, and every shape bridges its holes into ONE
  ring with hairline keyhole slits — the exact shape KiCad's own image
  converter emits, so kicad_pcb's single-ring gr_poly carries donuts and letter
  counters without hundreds of rectangles. `mode: 'rects'` keeps the v1 merged
  rectangles; `smooth` (default half the resolution, `0` off) Douglas-Peucker
  straightens grid staircases before bridging (never after — simplification
  could collapse the slits). Copper's mask opening for traced shapes is a true
  clipper offset (join round, nm integers like the DRC engine), not a radial
  guess. A 20mm donut logo lands as ~5 polys / 148 points / ~1.7KB of gerber;
  the same art in rect mode is 10+ regions with many times the points.

  SVG input: `file: 'logo.svg'` reads a dependency-free subset of SVG —
  path (full command grammar: M/L/H/V/C/S/Q/T/A/Z with implicit repeats),
  rect (rounded corners included), circle, ellipse, polygon, polyline — with
  `transform` chains (matrix/translate/scale/rotate/skew, composed) and
  presentation attributes (a `style` attr's `fill:` wins over the attribute,
  opacity < 0.5 skips the shape). Curves flatten deterministically (fixed
  subdivision counts), arcs go through the W3C endpoint→center conversion,
  rings store viewBox-relative units and scale through `size`/`resolution`
  exactly like pixels. Subpaths of one shape nest even-odd, so a donut is one
  path and its inner circle is a bridged hole; a shape with NO fill attribute
  on its chain IS the artwork (implicit fill → copper ink), `fill="none"` and
  off-palette colors are background, and strokes/text/use/clip/CSS are skipped
  silently. Sniffing is content-based (PNG signature vs `<svg`), so the
  extension doesn't matter. `mode` has no meaning for SVG — there is no grid.

  Packages: artwork ships inside reusable modules — assign an `Image` to a
  `this.` property (or `this.add()` it) in `build()`, authored in
  package-local coordinates; `_autoCollect` picks it up beside components and
  track builders, `_applyOffset` shifts its `at` by the package's x/y exactly
  like a component's `.pcb`, and `pcb.create(myPackage.components)` delivers
  it. `pcb.group()` tolerates images in the member list (they carry no
  reference and join no group).

  21 new tests pin the tracer (plus → one 12-corner loop, ring → outer+hole,
  bridged donut stays a hole under even-odd, seam-collinear merging,
  determinism), the Image contour path (plus → 1 ring vs rect mode's 3 rects,
  counters as holes, staircase smoothing strictly reducing vertices,
  byte-identical artwork across rebuilds), the SVG reader (viewBox/size
  mapping, implicit fills → copper, white → silk, subpath holes, transforms,
  resolution default scaling, curve flattening, rounded-rect corners, fill
  inheritance from ancestor groups), and the package flow (auto-collect,
  offset shift, board content at the shifted position).

  A double-check pass over the whole feature found and fixed three more: the
  SVG reader dropped `fill` inheritance (`<g fill="white"><rect/></g>` landed
  its rect on copper instead of silk — fills now inherit down the chain, so
  "no fill anywhere" is the only implicit-copper case, and an explicit
  `fill="none"` on a child still overrides); the rounded-rect corner sequence
  arced the LEFT EDGE instead of the bottom-left corner and ran the top-left
  corner's arc backwards (both bowing through the shape's interior) — corners
  now emit as four short clockwise arcs between exact edge chords; and
  `maskExpansion` stopped rejecting negative values in the Tier 2 rewrite
  (inert at render, but the constructor's contract says [0, 5) — restored,
  with constructor-validation regressions for it, `smooth`, and `mode`).
  Rebuild determinism was re-verified on a mixed board (contour PNG + back-
  side SVG + rect PNG): zero artwork-line differences across rebuilds; the
  only diffs are per-instance component UUIDs and the process reference
  counter, pre-existing core behavior.

  Follow-up from live use (rd_skeleton placed its favicon): the `Image` options
  now accept the API exactly as originally proposed — `at` takes `[x, y]` as
  well as `{ x, y }`, and `size: [w, h]` is a bounding box the artwork FITS
  INSIDE with its aspect preserved and centered (a square source in `[40, 30]`
  places at 30×30), not a stretch. Malformed tuples are rejected with the same
  constructor-error shape as every other option, and a regression pins both
  forms against the object/single-number spellings.

  That report also exposed a real geometry bug: `render()` mapped CELL
  coordinates through the PIXEL scale, so any raster whose grid differed from
  its pixel count — every down- or upsampled image, i.e. nearly every real
  logo at the default 0.1mm resolution — scaled by gridW/widthPx (a 32px
  favicon at 30mm placed spanning ~281mm). Each pipeline's unit space now maps
  independently: grid cells divide the placed box by gridW/gridH, SVG user
  units scale by size/units. The mask expansion rides the same per-space
  scale. rd_skeleton's favicon now places at exactly its fitted box on the
  mod-ec board (verified in the built .kicad_pcb), typechecks clean, and DRC
  drops to zero errors with the art inside the outline; the commit also
  documents the ink mapping its teal logo needed (`inks: { copper: '#02B388' }`
  — artwork must be drawn in ink colors, and real assets usually aren't).

  The layout view now treats PLACED artwork as a first-class object, not just
  ink: the build writes build/<board>_images.json (every Image's file, center,
  placed box, side — the pads manifest's shape), the viewer page carries it as
  a data island, and each applied image draws a dashed outline + file label
  beside its ink. Click selects; E edits x/y/width/height/side or arms
  "replace file…" (the host picker re-arms against the selected image, and the
  picked PNG lands in art/ through the same content-deduped copy); Del removes.
  Apply rewrites/deletes the matching `new Image({ … })` statement in place
  (matched by file + center — the placed box is a fit, so its w/h can differ
  from the statement's bounding box and never enter the key), replacement
  files rewrite the statement's path, and the post-rebuild check reads the
  FRESH images manifest to verify every edit landed and every delete is gone.
  Pending artwork's committed ghost now renders fully opaque (it is the ink;
  0.85 read as translucent silkscreen against the board's real silk).

  Two importer sync repairs the placed art exposed on the rd_skeleton corpus:
  a comment inside create()'s argument list (`// u1,`) no longer reads as
  drift — the args compare strips comments/whitespace noise while a real
  difference still rewrites to the clean form — and artwork polys are now
  recognized as IMAGE-owned: `new Image({ … })` statements in source (object
  and tuple `at` spellings, whitespace-flexible, nested-option tolerant) claim
  the gr_polys inside their placement box on that side's layers, so the
  graphics sync stops proposing to duplicate the art as a typecad.poly()
  literal on every KiCad-side touch. 5 new tests cover the statement
  rewrites/deletes (position, size, side, replacement file, tolerance, whole-
  line removal, honest skips) through the apply stage.

  Two restart bugs the first live session surfaced: the applied-image overlays
  rendered only when something else triggered them — `enterLayout()` drew the
  pending zones, board zones, and outline on every entry into the Layout view
  but not the images, so after a full VS Code restart (fresh webview
  localStorage → restorePending early-returns before its render call) the ink
  showed with nothing to click; enterLayout now renders pending AND applied
  artwork, and exitLayout removes their overlay groups like the zones'.
  Second, the restore fast path's staleness check keyed on the toolchain
  VERSION alone — a workspace-linked toolchain gains features without a
  version bump, so a page written before a generator change but after the last
  board edit served forever (the code already documented this exact hole from
  an earlier incident). The fast path (and the disk-page adopter) now also
  refuse any page older than the installed generator module itself
  (dist/gerber_viewer/render/viewer_html.js mtime, resolved with the same
  walk-up as the version).

  Follow-ups from the first applied-image edits: the statement matcher only
  recognized the canonical sidecar shape, so an edit to a HAND-WRITTEN image
  (`let art = new Image({ at: [x, y], ... })` — tuple `at`, bare declaration,
  nested `inks`, comments) matched nothing, the apply skipped it silently, and
  the rebuild restored the old position. The planner is now a real scanner:
  quote/comment-aware brace matching finds every `new Image({...})` expression
  (canonical `syncArt.push(...)` wrapper and hand-written declarations alike),
  extracts the at/size/side/file spans (object or tuple `at`, tuple or
  single-number `size`), and rewrites them surgically so all surrounding
  formatting survives — rewriting `at: [142.5, 85.5]` to the object form in
  place. Deletes remove the whole declaration line AND the identifier's
  argument in `.create(...)` (the parse gate remains the backstop for
  references in other files), and side flips insert `side: 'back'` in the
  canonical spacing when the statement carried none. Apply counts now count
  consumed inputs, not surgical spans.

  And M now grabs selected artwork: the component grab's interaction (cursor
  pick, deltas, grid snap, click drops, Esc reverts, undo) drives the image's
  edit record instead of a layout move — for applied images (arming an edit
  that apply & rebuild writes) and pending ones alike; the drop click and Esc
  cancel are wired beside the component grab's, and the grab takes precedence
  over the component grab only when an image is actually selected.

  Custom inks — the layer-stack cube: a fabbed board is three binary layers
  (copper, mask opening, silk), and the three presets are fixed points in that
  space. `inks.custom` now maps any additional pixel color to any combination
  via `{ copper, mask, silk }` — hidden copper (electrically real, visually
  absent), silk over hidden copper, and `maskPaint`, the SUBTRACTIVE channel
  that closes mask openings (two-tone mask art; painting mask over exposed
  copper keeps the metal but re-hides it, the documented precedence, enforced
  with a clipper difference over the collected openings). Silk stacked over a
  mask opening is rejected at construction — most fabs strip that silkscreen —
  with the error naming the `allowExposedSilk` opt-in for fab lines that print
  it. Backward compatible: the presets emit exactly what they did before.

  The PCBA render learned the same physics: with a mask film, board-level
  copper at an opening used to fall through to the substrate color (only pad
  flashes got the finish treatment), so exposed-copper artwork rendered as
  bare board. The copper ink now also paints in the finish color through an
  inverted copy of the openings mask — artwork gold matches the pads, and
  two-tone mask art shows mask vs substrate correctly (openings reveal the
  substrate either way). Blueprint and schematic styles are unchanged.

  The clipper difference's solution carries holes as separate oppositely-
  oriented paths — emitted independently, an opening's hole filled as its own
  opening (a painted-back square came out as an extra opening instead of shut
  mask). The mask emission now re-nests the solution and keyhole-bridges each
  shape back into one ring, the same shape every other emitted poly has; a
  contour-mode regression pins the painted square staying shut.

  rd_skeleton's artwork is now an ink-swatch demo (assets/ink-swatch.png, a
  40x40 two-tone grid): red exposed copper, white silkscreen, a blue mask
  opening with a purple maskPaint square inside it (two-tone), and black
  hidden copper — one Image statement on the back of the mod-ec board showing
  every ink the feature ships. Probed on the built board: each cell lands on
  exactly its layers, the painted square stays shut, the hidden copper emits
  B.Cu with no opening, and DRC reports nothing against the graphics.

- 99a818f: The Layout view edits three more things, and one gesture applies them all:
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

- b085cf2: `typecad-pcb viewer` — the board-viewer render pipeline as ONE command, and
  a source-of-truth rework of the sync model around it.

  The vscode extension used to spawn five-plus npx children per board change
  (`export gerbers`, `export drill`, `gerber-viewer`, plus `simulate` and
  `check-sync`), each paying node/npx startup before any plotting happened.
  The new command composes the native gerbers/drill/job export and the
  interactive page build back-to-back in one process — same plots, same page,
  no per-step startup (the in-process composition renders the one_hz fixture
  in ~0.5s; the real rd_skeleton board in 2.0s vs 5.0s for the old chain).
  Overlays ride the same flags gerber-viewer knows (`--netlist`, `--drc`,
  `--stackup`, `--rules`) and auto-discover the build's own artifacts; `-o`
  places the page, `--saved-fills` opts out of the in-memory zone refill,
  `--json` summarizes. The export core behind it is now a programmatic call
  (`exportNativeGerbers(pcbPath, { outputDir, savedFills, json })`) with the
  `export gerbers` CLI as a thin, behavior-identical wrapper.

  **The sync model is reworked around one rule: the ts source is the single
  source of truth, the .kicad_pcb a build artifact.** The viewer layout is
  the editor (its applies rewrite source and rebuild); KiCad-side edits reach
  source exclusively through the sync watcher (`typeCAD: Start KiCad Sync`,
  `typecad-pcb import <board> --watch --auto`). Nothing in the render
  pipeline ever writes source from the board — the auto-reconcile that
  earlier iterations shipped (`import --auto` from the render path) is gone:
  it could silently revert an apply's own work when a semantic-check miss
  left the board holding stale copper, and every route apply churned through
  a full consolidation cycle. check-sync remains, as a DIAGNOSTIC: drift with
  a board newer than every source means the artifact changed out-of-band
  (the banner says "start typeCAD: KiCad Sync or the next build overwrites
  it"); drift with nothing newer means the build does not reproduce source
  ("please report").

  **Applies now write routing in the write-back's canonical grammar, so they
  create no drift at all.** When a project's routing already lives in the
  per-net track section (`// Net: X` + `const track_X: TrackBuilder[] = []` +
  `track_X.push(typecad.track({ net }).from(...).to(...))`), new routes land
  THERE — byte-identical to how kicad2typecad would render them (naming,
  number formatting, per-leg widths, end vias, block order, the create()
  spread) — appended to the existing net's block or as a new block plus
  spread. Verified live against rd_skeleton: a route planned and inserted by
  the extension, one build, and the oracle reports "in sync — the source
  regenerates this board exactly". The sidecar path remains for projects
  without a section. One apply click = one build = one render: the apply
  releases the pipeline lock at its tail, the board watcher's racing refresh
  is deferred while an apply owns the pipeline and replayed at its
  completion, and an all-skipped apply answers failure so the page keeps its
  pending gesture.

  Toolchain fixes the rework surfaced: a layout-view segment delete can empty
  a net's last push, leaving an orphaned `const track_<NET>: TrackBuilder[] =
[];` that the section regenerator's push-paired member scan skipped — the
  regenerated section re-declared the name beside the survivor and the parse
  gate refused the whole import cycle. Declarations carrying a regenerated
  name now die with the section. Polygon zone literals (`points: […]`, what
  the import writes for non-rect pours) match by bounding box — deletable
  from the layout view, net-reassignable through the E panel, counted by the
  new-pour priority floor; a geometry resize on one is refused with a
  delete-and-redraw hint. And the extension's source/board watchers were one
  shared handle — installing the board watcher at activation disposed the
  source watcher, so source edits never auto-built; they are independent
  now, with an activation regression test pinning both alive. Host status
  locks carry a timestamp and the page reclaims a notice gone two minutes
  stale, so a stalled chain can no longer freeze the readout.

  One more live-report fix: an apply's render could complete without its
  page ever being shown — the watcher refresh that assigns pages was
  deferred while the apply owned the pipeline, and its replay hit the
  board-unchanged branch, which returned without assigning the pending
  HTML. The panel kept the PRE-apply page and the next apply was refused
  against a stale board stamp ("the board was rebuilt since this view
  rendered"). That branch now lands any render the panel has not been
  shown, with a regression test pinning it.

  And the canonical writer learned the orphaned-declaration shape: a net
  whose pushes were all segment-deleted leaves `const track_<NET>:
TrackBuilder[] = [];` with nothing in it, which the push-only
  existing-net check could not see — the new-net path then re-DECLARED the
  symbol beside the survivor (a duplicate-symbol build failure, seen live
  on track_DRIVE) and re-SPREAD it into create() (which would double the
  copper). A push now lands directly after the surviving declaration, and
  the create()-args spread is only appended when the args do not already
  carry it. The live project was repaired through the import's canonical
  regeneration (one `track_DRIVE`, one spread, oracle reporting exact
  agreement).

  The apply's semantic check learned two truths the live board exposed:
  footprint blocks come in pcbnew-10 split style too (`(` and `footprint`
  on separate lines — the placement parser split on the literal
  `(footprint ` and reported every moved component as having no footprint
  at all), and a rip-up-and-REDRAW deletes a leg and re-adds the same path
  at a new width in one gesture — geometry-only matching read the redraw
  as the deleted trace surviving. Split-style footprints parse now, and a
  "still present" delete whose copper coincides with a leg the same
  gesture added is the redraw, not a miss; a genuinely surviving delete
  still flags. One more parser truth: typeCAD's own provenance property —
  `(property "Code" "typecad:v1:…" (at 0 0 0) …)` — precedes the
  footprint's placement, so the first-(at) heuristic read 0,0 and every
  move verified as "sits at 0.00,0.00" while the move had landed
  perfectly; the placement is now the first (at) outside any property
  form.

  The canonical writer learned the two remaining routing truths the live
  board taught. Mid-chain vias: a drawn route that changes copper layer
  needs vias AT the transitions, and the canonical form for those is a
  standalone `typecad.via({ at, net, size, drill });` line after the last
  net block — the writer had only attached chain-END vias inline, so both
  transition vias of a layer-jumping route silently vanished from the
  board (seen live on AMP_OUT). Contiguous continuation: the oracle chains
  positionally-contiguous segments into ONE statement regardless of how
  many strokes drew them, so a route that starts where the net's last
  statement ends now EXTENDS that statement instead of adding a sibling
  (seen live as CH2_COM/DRIVE redraw drift until the write-back re-chained
  them).

  And the delete direction learned the same truth: deleting a route takes
  its standalone transition vias with it (a via belongs to the geometry it
  joins — when every leg touching its vertex is deleted, the statement
  goes; seen live: the track went, both vias stayed on the rebuilt
  board), and selecting a via and deleting it removes exactly its
  statement — via-kind deletes had been pure bookkeeping. A via-delete at
  a plain segment endpoint (the page fires one at every endpoint, most
  carry no via) still drops silently and never refuses an apply.

  The layout view can now REACH a via under a component body: the part's
  own graphics swallow DOM hits, so element-based picking never saw copper
  beneath the footprint — a press under the part fell through to segment
  logic only, and the Tab cycle carried pad/segment/part/zone candidates
  with no via kind. A `viaUnderCursor` barrel test (half the via's size
  plus aim forgiveness) now claims the press before the segment fallthrough,
  and the Tab cycle gained a via candidate with the click path's selection
  semantics (sole via, net lit, Del removes). And the selection is VISIBLE
  there: the via's selection ring paints on the element itself in the
  copper group — beneath part graphics — so `viaHiSync` now also mirrors
  every selected via's ring into an on-top group that re-appends itself as
  the flip host's last child on every sync (last child = top of the SVG
  paint order), keeping the ring above every layer and overlay.

  Routing gained KiCad's layer rhythm: V no longer fires a via instantly
  at wherever the cursor rests — it ARMS one, and the next click anchors
  the segment and places the via exactly there (V again disarms; Shift+V
  still cycles the far layer for blind/buried spans; finishing on a pad
  discards the arm). While armed, the cursor carries the via's DRC
  keep-out ring and a quiet solid ghost of the barrel itself — the same ring a
  placed via shows, tracking the walk end with the live clear/red tint and
  resizing with the via ladder — so the click point is chosen with
  clearance VISIBLE. (The via-halo tint now TOGGLES its bad class instead
  of replacing the class list — a swap stripped the preview marker,
  freezing the ring where V was pressed and stranding it beyond cleanup.)
  The preview's red and the placement refusal are the BARREL's own
  clearance — a degenerate segment of the via's diameter over the same
  obstacle set and rule any trace uses — not the trace walk's: a trace can
  legally thread where a fat barrel would not, and a click that would land
  the barrel on netted foreign copper is refused whole (neither anchor nor
  via), with N/C crossings tinting red but placing with a warning, exactly
  as trace anchors behave. Tab during a live route now cycles the copper layer
  the next segment draws on — at the start of a route, and on the
  continuation piece after a via, where the via's target layer follows the
  choice (a piece with committed geometry refuses with a hint to place a
  via first, since those segments already belong to their layer). Outside
  a route, Tab still cycles the pad/trace/part/zone stack.

  And page-side fixes now reach a LIVE session: the panel re-renders on
  focus when the served page predates the installed generator bits —
  previously a toolchain update with no board change left the open Board
  tab serving the old in-memory page indefinitely (seen live as "no change
  in any behavior" after a page-side fix), because nothing keyed a
  re-render and re-focusing the tab changed nothing.

  The via keep-out now sees the whole STACK: a barrel spans layers, so its
  obstacle world is every copper group's foreign ink plus the pad
  manifest's exact rects — pads included even when N/C (unconnected pad
  copper is real copper; only the route's own net is exempt, keeping
  via-in-pad legal) — which is why the ring now reddens over parts whose
  pads are mostly unconnected, not just over foreign traces. And the halo
  rings carry a thin board-unit stroke: an unsized SVG stroke defaults to
  1 user unit = 1mm of board, so the keep-out band read ~1.8mm across for
  a 0.85mm envelope.

  Deleting a via now takes its solder-mask openings too: the delete path
  cleared the copper flashes, the drill hole, and the session ink, but a
  rebuilt via also renders one mask opening per mask layer — leaving them
  painted a white ring where the via was until the next rebuild
  regenerated the page.

  Part bodies read as movable and own their press: the move cursor shows
  on HOVER over any part (before, only the selected part carried it, so
  unselected bodies kept the board crosshair and read as unmovable), and
  pressing a footprint selects the PART — the capture listener no longer
  claims an underlying segment for the trace selector, which had made
  parts in dense corridors (U3 among its traces) effectively
  unselectable. A via barrel under a body still claims its press (nothing
  else can reach it), and traces beneath parts stay reachable through the
  Tab cycle.

  Text delegation now requires AIM: elementsFromPoint ignores pointer-events
  and paint order, so a silk refdes glyph stacked anywhere beneath a part
  handle made every body press on small parts delegate to the text handler
  — their label ghost engaged instead of the part (C6/C3/D1 reads
  mirrored; U3 unselectable under its own label). The press claims the
  text only when it lands on the glyph's own ink (screen-space stroke
  sampling); body presses belong to the part.

  The mirror itself is fixed, and it lived in the label ghost's
  keep-upright: the plotter bakes KiCad's fp-text rule into the gerber (an
  angle in the upside-down half (90, 270] plots pre-flipped, so authored
  rot-180 labels already read upright in the file), but the ghost re-flipped
  whenever the TOTAL angle sat in that half — true for a rot-180 label even
  with nothing pressed, so the first move turned already-upright glyphs
  upside-down (for C6/6C-class glyph pairs, pixel-identical to a mirror;
  seen live on C6, C3, D1 — exactly the parts whose labels author at
  180/270, while U1's 0° labels never flipped). The flip now engages only
  when pending presses move the label ACROSS the boundary relative to its
  authored angle. The edited-value preview's stand-in <text> had the same
  absolute test and also ignored the part's pending presses — it now
  rotates to the direction the rebuild will plot (keep-upright folded in,
  part presses included), with board-level gr_texts keeping their own
  presses alone.

  Arrow-key part nudges work again, and their DRC gate became an advisory.
  The gate measured every obstacle by its bounding box while the rest of
  the clearance machinery measures a track by its true centerline — a
  diagonal run's fat box blankets the corridor beside its copper, and on
  the live board that refused all four directions for every part in the
  routed area (C6, U3 — and J2 additionally failed the board-edge check
  its pads trip by overhanging the outline, as an edge connector's do).
  Pads now walk their perimeter through the shared poly-aware margin walk
  (same-net copper connects, net-class clearances honored, edge explicitly
  not a part obstacle), and the verdict no longer blocks the move: the
  M-drag lands ungated, so the nudge landing ungated matches it — a pad
  that would sit in violation flashes the ghost red and appends
  "clearance violation, DRC will flag it" to the readout instead of
  refusing. A landed nudge also writes the position readout to the status
  bar like the M-drag does (it used to leave the cursor coordinates
  standing, which read as a no-op). The INK nudges keep their hard
  refusal — the segment drag they mirror is itself gated.

  And the DRC hints now follow moved parts. A moved part's ink carries
  its ghost as the element's OWN transform, which getBBox ignores — every
  clearance verdict kept testing the part at its authored spot, so a
  trace drawn through the part's OLD position still reddened as if
  something were there while the NEW position welcomed it blindly. The
  obstacle build now folds the ghost transform into both the pad boxes
  (boxInParent) and the track centerline vertices, skips display:none ink
  (a moved part's ripped routing is not copper until the rebuild
  re-routes it), and a live route's cached obstacle lists rebuild when a
  move commits. Verified live on D1: routed from its VCC pad after an
  arrow-move, the halo reddens over the GND pad's NEW position (naming
  "D1.1 is GND") and stays clear over the vacated one.

  The ? sheet's width & via rows no longer read as if "/" sized anything:
  the key column's slash SEPARATOR between bracket pairs ("[ / ]",
  "Shift+[ / ]") was indistinguishable from a key, so the rows now say
  "[ ]", "Alt + [ ]" and "Shift+[ ] (the { } keys)" — matching the
  mid-route status and the width-button tooltip.

  The W width picker found its shape: the hint line at the bottom was the
  widest child and never wrapped, stretching the panel past twice the
  button ladders' width with everything else left-aligned in the corner.
  The panel caps at the ladders' width now (the hint wraps beneath), and
  the two ladders carry section titles in the E panel's header style —
  "trace width" and "via size" — where before neither section said what
  it sized; the exact-entry rows tighten to "mm" / "mm · drill 0.3" under
  those titles.

  The typeCAD theme's back copper is blue: the house palette carries one
  green, and B.Cu's token read as a dimmer F.Cu — the two outer layers
  were hard to tell apart. B.Cu (and pad_back with it) takes a blue
  sibling of the theme's inner-layer accents, so front green and back
  blue tell apart at a glance in the gerber and layout views.

  A barrel never shares copper with another barrel, whatever the nets
  say. The armed via's tests exempted the route's own net (rightly, for
  copper — via-in-pad and via-on-trace are connections), so an armed via
  placed dead-on a SAME-NET via sailed through and landed overlapping
  (seen live on a PROBE_1 barrel). The new test has no net exemption at
  all, and its threshold matches the visible affordance — the arm
  preview's OUTER ring (barrel + clearance) touching the other barrel:
  red and the click refusal ("via keep-out violation — another barrel is
  inside the ring") begin where the rings meet, not where the copper
  does (KiCad's hole-to-hole discipline is net-agnostic for the same
  reason). The check hoists ABOVE the finish-tie branch (the walk
  snapping onto the via read as a finish and committed straight
  through), and includes the route's own already-placed barrels, whose
  data-route stamp only lands at commit.

  And the via-delete leftover found its true source: not the mask
  openings (those were fixed, and this board plots none for vias) but
  the POUR KNOCKOUT — zone fills render as fragmented regions whose
  clearance gap around a barrel is the ABSENCE of fill, so deleting the
  via's ink leaves a hole in the copper pour where the barrel was, with
  no element to sweep. The delete MEASURES the hole: an isPointInFill
  march outward through the fragments takes the nearest pour edge as the
  knockout radius (rays that never hit run down a trace's clearance
  channel and are ignored — an earlier unmasked march fanned the patch
  out along it; a guessed-radius disc before that read as a green circle
  inside the larger hole). The patch is that measured disc MASKED by the
  fill engine's own discipline — black strokes of trace width plus the
  measured pour clearance along every nearby trace, black discs for
  neighbor barrels and pads — so channels and neighboring knockouts stay
  dark. The patch also inherits the fragments' computed OPACITY (pours
  render de-emphasized — an element-level opacity the fill color alone
  doesn't carry; a full-brightness patch read as a green circle):
  unattributed layer-ink paint that never registers as copper or
  an obstacle and dies at the rebuild, whose fill engine recomputes the
  true pour.

  The ratsnest learned what a pin is: a pin numbered on more than one
  pad is ONE netlist node, joined inside the footprint — dual-row
  connectors (J1/J2) plot every pin twice, and the duplicate pads were
  owing each other wires at rest that only a perfectly-snapped finish
  cleared when routed. Same-pin pads now union into one connectivity
  node (the pin resolved from the pad manifest by authored position when
  the island pad carries none — guarded for the init-time refresh that
  runs before the manifest island loads), wired-ness propagates to
  twins, and a route reaching EITHER pad satisfies the whole pin.

  And a live apply exposed two writers' gaps that broke the no-drift
  guarantee on the canonical grammar: routes chained WITHIN one apply
  read only the original text, so a route starting where a
  just-appended statement ends added a sibling the oracle re-chains
  (one J1 route committed in three steps landed as three statements
  split mid-run) — earlier routes' statements now extend as pending
  edits; and an emptied array kept its `...track_X` create() spread (the
  oracle's args drop it — track_AMP_OUT drifted the moment its last push
  died) — the emptied block (comment, declaration, spread) now goes
  whole, with spread-aware name stripping in the create-args rewrite.
  The live project was re-canonicalized through the oracle and reports
  "in sync — the source regenerates this board exactly".

  Tab to another copper layer now rebuilds the walk's obstacle world:
  cycleRouteLayer switched the piece's canon, layerGroup and ink but left
  the obstacle list built for the layer the piece STARTED on, so a route
  Tabbed onto an inner layer kept measuring against the front layer's
  copper and reddened over crossings the new layer doesn't carry (seen
  live: every F.Cu obstacle tripped an In1 walk).

  V now arms a via ANYWHERE, not just mid-route: with no route live, the
  same DRC keep-out ring follows the cursor (stacked foreign copper,
  via-on-via — the identical tests), and the click places a through-via
  with barrels on every copper layer. The net comes from whatever copper
  sits under the ring — a pad, a barrel, any layer's trace, or a POUR
  REGION (isPointInFill on the fill fragments: a stitching via in the
  ground pour adopts GND, which was the whole point). Placed off copper
  the via is FLOATING and perfectly legal — the library's net is
  optional and the canonical grammar omits the property, so the write
  lands `typecad.via({ at, size, drill })` net-less and round-trips
  through the oracle exactly. The apply entry is via-only (no pieces)
  and the route writer carries it: standalone statements append without
  a track statement, net-less when floating. And the via's E panel
  gained a NET selector — the board's nets plus floating; a change
  rewrites the barrel's electrical identity as a delete + re-place
  netted, riding the existing apply payloads so session and board-built
  barrels both edit (size and drill ride along; undo/redo restores the
  original ink and entry).

  And an apply in flight owns the pipeline: from the click until the
  host's callback lands, the page is INPUT-DEAD — the not-allowed cursor
  on everything (body.applying), every pointerdown swallowed at the
  window capture before any downstream handler (part grabs, route
  anchors, panel clicks), and the keydown handlers (layout keybinds, the
  Escape cascade, view keys) return at their tops. A click landing
  mid-build edits state the rebuild is about to replace and leaves undo
  entries describing a page that no longer exists. A three-minute
  failsafe unlocks a host that never answers. The jsdom props tests'
  host stubs predate the 16-argument payload — their callback parameter
  bound mid-list and never fired (harmless before the lock); they now
  take the callback from the last argument.

  Free-via follow-ups, all seen live: a FLOATING via's delete now
  matches its net-less statement — the delete registry required the
  `net:` clause literally, so deleting an applied floating via matched
  nothing and refused the whole apply ("nothing was applied — 1 deleted
  segment(s) matched no source route"). A netted via is a ratsnest NODE:
  a barrel stranded from its net's copper owes a wire exactly like a
  stranded pad (assigning a net to a free via drew nothing — the via's
  component carried no pad and read as a dead stub); the wire appears on
  assignment and leaves on delete or connection.

  Walk TIES are layer-local now too: routeEndpoint gathered its snap
  candidates from every copper group, so an anchor on one layer kept
  capturing onto traces buried on another — copper there is not copper
  here without a via (seen live: an anchor just north of U1.9 always
  snapped to the In2 trace under it). Trace ties and barrel ties require
  their ink in the current piece's layer group; a barrel qualifies
  through its flash on that layer. Same-layer ties snap exactly as
  before (verified: the walk on In2 still lands dead-on the SWCLK trace
  and names the foreign net, while the same hover on F.Cu stays free).

  The render every board change pays for shrank to the default view alone:
  the pcba/blueprint/schematic renders and the ngspice solve are LAZY now.
  The extension renders with `--lazy-views` — the page ships empty
  placeholder groups (42% smaller on the live board: 1.31 MB vs 2.26 MB)
  and each view fills on FIRST SWITCH: the page asks its host through the
  new typecad/view-part bridge (`window.typecadViewPart`), the extension
  runs `typecad-pcb viewer --view-part <name>` (one view re-rendered from
  the same board, ~0.45 s) and answers with the mountable fragment; an
  http-served page falls back to fetching the fragment the CLI left
  beside it. A spinner names the work the whole time — "solving the
  ngspice operating point…", "rendering the pcba view…", "calculating
  copper ΔT…" — and the thermal solve yields a frame first so the ring
  actually paints before the synchronous math. The ngspice solve itself
  moved wholesale off the render chain: it used to run (npx + ngspice,
  seconds) whenever the op file was older than the netlist — after every
  apply — and now runs once at the first ngspice/thermal view switch,
  cached by the same freshness rule. A failed solve costs the hover
  readout, not the view (exactly an eager page built with no op island);
  a failed render keeps the current view and names the error. The lazy
  switch, the cache (second switch asks nothing), and the failure path
  are pinned by jsdom tests; the bridge ask/reply and the extension's
  part-serving (including the solve-once-cache-while-fresh rule) by
  client and pipeline tests. The standalone CLI keeps its eager default,
  so a plain `typecad-pcb viewer` page is unchanged; and `-o` finally
  binds (short flags parked under their letter, so `-o` was silently
  ignored forever — the multi-board per-board path masked it
  server-side).

  The pour is now RECOMPUTED live on delete, not patched. Deleting a
  via (or trace segments) used to leave the barrel's clearance hole in
  the rendered pour — painted over by a measured disc masked against its
  neighbors (three rounds of "the circle is still visible": ring, green
  disc, tone-shifted cutout). That machinery is gone. The delete path now
  rebuilds the zone's fill WHOLE from live page state: the zone polygon
  painted in the pour's own style, masked by the fill engine's own
  discipline rebuilt from the ink that survived the delete — foreign
  traces as fat strokes (width + 2x zone clearance), foreign barrels as
  grown rects, foreign pads as clearance rects, and same-net pads as
  thermal reliefs (a black gap ring with white bridge spokes). The
  zone's clearance and thermal gap/bridge numbers ride the zones island
  now (parseBoardZones captures (clearance …) and the (fill …)
  sub-list); layer matching canon-normalizes so 'demo-F_Cu.gbr' groups
  and 'F.Cu' zones agree; the pour's paint prefers the fragments'
  attributes and restores the pre-dim opacity when the net-highlight
  dimmer had stamped 0.06 over them. Pinned by a jsdom test that seeds a
  zone, fragments, a foreign pad and a same-net pad, deletes a plotted
  via, and asserts the whole replacement: one live fill with the zone
  polygon, the pour's own paint, a mask with thermal spokes and foreign
  holes — and the old ray-march/measured-disc/fragment-clone strings
  absent from the page for good. Trace-segment deletes recompute their
  layers' zones too (a closed channel anywhere along the run).

  Drift maintenance went SILENT. Out-of-band board drift (the board newer
  than every source — a KiCad edit without the sync watcher, or a stale
  writer's apply) is now absorbed automatically at the render: the
  extension runs the importer's canonical regeneration (`import --apply
--auto` — byte-identical to kicad2typecad, zero drift by construction),
  re-checks, and only leaves the banner when absorption cannot converge.
  One attempt per board revision (win or lose — an unabsorbable drift can
  never loop the pipeline), never while an apply owns it (the race that
  killed the old render-path reconcile), and the equally-aged build-bug
  class still banners because nothing can auto-fix a build bug. And the
  writer-bug failure mode self-heals too: when an apply's source parses
  but the REBUILD fails (the duplicate-symbol class that broke this
  project for a morning), the apply now restores the pre-apply snapshot
  immediately — the tree stays green, the page keeps the pending gesture,
  and the next attempt re-applies against clean source. The standing
  13:31 drift on the live project was reconciled through the exact
  import command the absorber runs, and the corpus reports exact sync.

  DRC runs only on request now, through the palette's typeCAD: DRC (or the
  status chip's Run DRC link — the single affordance left). The opt-in
  `typecad-pcb.drcOnBuild` watcher is gone (setting deleted with it), and
  the apply pipeline no longer re-runs the check after every rebuild — it
  builds, verifies, and re-renders, nothing more. With nothing refreshing
  the report automatically, a report older than the board is WITHHELD from
  the page instead of embedded: its markers describe the previous revision
  and would sit at pre-move positions (the output channel says so and
  points at the command); the fresh report a user just requested embeds
  exactly as before. Both invariants are pinned: an apply never spawns the
  drc child, and the render embeds --drc only when the report is at least
  as new as the board.

  A dead-code pass over the session's removals found the page clean of
  grid/mil remnants but three true fossils: `segAt` (a nearest-segment
  helper whose last caller died in the click-twin work), `exportSvgString`
  - `download` (an SVG/PNG export path whose button left an earlier
    iteration), and a source-level test asserting the dead exporter's own
    body — the assertion had become the feature's only remains. All gone;
    the page script now has no declared-but-never-called functions, and the
    files touched today pass a `noUnusedLocals` build (the repo's older
    unused locals in docgen/component.ts predate this work and stay).

  The **mil** checkbox left the sidebar with its functionality: position
  readouts are mm, full stop (the formatter collapsed to one line), and
  the store's `__snap` no longer carries a units field. The removal also
  surfaced a latent break from the grid surgery — the mm/mil formatter sat
  between the deleted vars and the grid builder and went with them,
  silently (the page script is a string to the typechecker, and no test
  read a position status). It's back, mm-only, with a regression test
  that drags a text and asserts the readout says `mm` — a status path
  now guarded.

  The layout view's GRID feature is gone entirely — the snap-ladder select
  and the grid-show checkbox left the sidebar, the visible-grid builder
  and its persistence with them. What remains is the snap checkbox at one
  fixed step (0.5 mm — every interaction that snapped before snaps the
  same way; there is just no ladder to climb anymore), and the store keeps
  snap on/off + mil units under `__snap` (old `__grid` entries are simply
  unread). And **B** now applies & rebuilds — the keydown clicks the same
  sidebar button, so the whole gesture is identical: the pending-state
  gate (a disabled button's click is a no-op), the input lock while the
  build runs, the host bridge. The help sheet says so, and its two
  grid-worded rows now say "snap step". Pinned by tests: the sidebar
  items and grid element never exist, snap persists across a reload
  without `__grid`, and b fires the apply payload exactly when the button
  is armed (a free via arms it; a quiet page does nothing).

  The via-delete pour patch finally disappears: the measured disc painted
  UNDER the pour fragments at the fragments' own fill and opacity, but
  its rim reached past the knockout and holes beside pads/channels are
  not circles — outside the hole the disc stacked beneath live pour and
  inside it stood alone, so the spot read as a tone-shifted cutout
  circle (half-bright within, doubly-bright along the rim; seen live as
  "a cutout circular pattern left in its place"). The patch's mask now
  blacks out the pour's OWN fragments (cloned with their fill-rule), so
  the disc paints only where the pour is absent and composites exactly
  like the single-layer fill beside it — and the disc sizes to the
  WIDEST measured ray when the hole is fully enclosed (the fragment
  clipping makes the overshoot safe: the pour takes the hole's true
  outline, notches included), falling back to the nearest edge when a
  ray runs out into open board so the disc never paints background.
  Verified live at two spots — a bare-corridor via and a via surrounded
  by the SWD connector's pads — with the pour and patch both forced to
  high opacity, the disc blends seamlessly: no tone shift, no rim, no
  empty cutouts.

  And the intermittent WHITE RING after a via delete found its chain of
  events: a selected via's ring is MIRRORED into an on-top group (above
  part graphics), and those mirror circles die only at the next
  viaHiSync. Deleting a segment whose endpoint carried a via — the
  selection's U-growth pulls endpoint barrels in, painting their mirrors
  — swept the via inside segDelete, whose set bookkeeping emptied viaSel
  BEFORE the Delete handler's conditional sync could run: the one case
  where the only selected via rode a segment delete left its mirror
  painted exactly where the barrel was (why it felt random — it took a
  segment delete with the endpoint via selected). Fixed at both layers:
  segDelete refreshes the mirrors at its tail beside its segment sync,
  and removeViasAt itself sweeps any mirror rings at the deleted point,
  so no caller's missed sync can orphan one. A jsdom regression test
  places a real session via on a selected segment's endpoint, grows the
  selection (ring appears), deletes the segment, and pins the ring gone
  — with either fix layer disabled, the test leaves exactly one ring
  behind.

  Two more canonical-writer defects the SCL/SDA/UART apply exposed,
  both silent until esbuild refused the build. A REDRAW PAIR — two
  routes for one net in one payload (a re-send after a failed build, or
  the stale session route riding beside its replacement) — starts both
  at the same pad, so the contiguous within-apply extension never fires,
  and every existing-net scan reads the ORIGINAL text: the second route
  found no track_SDA.push there, took the new-net path, and re-DECLARED
  the symbol beside the block the first route had just written
  ("track_SDA has already been declared", the whole build dead). A net
  that exists in this apply's pending edits now takes its second route
  as a sibling push inside the pending block — one declaration, one
  spread, both statements. And the create()-spread insert died silently
  on TRAILING-COMMA args (`...track_X,\n);` — what canonical rewrites
  and hand edits leave): the last-comma scan found nothing but
  whitespace past that comma and returned null, so SDA/SCL/UART_RX/
  UART_TX all gained blocks and NONE gained spreads — their copper never
  reaching the board. The insert backs up over the trailing comma now,
  slotting the spread between the last real argument and the surviving
  comma. The live project was repaired by hand (superseded SDA block
  removed, four spreads restored, the routing section re-canonicalized
  through the oracle, the syncBoard call my own repair had swallowed
  restored) and the corpus reports the source regenerating the board
  exactly — pour included.

  The live "the entire top copper zone turned black" after a via delete
  was the net-highlight DIM outliving its selection, not the pour
  recompute (whose geometry renders perfectly — verified by building the
  engine's exact output by hand in the live page and screenshotting it
  green). Selecting a via/segment/pad lights its net by dimming
  everything else to opacity 0.06 — on the dark canvas a 0.06 pour is
  invisible, and three lifecycle holes let that state strand: the Tab
  cycle's zone/part branches light no net and cleared no dim (a pad or
  via step's dim survived onto them), the Delete handler tore down the
  selection without clearing its dim, and the recomputed live fill
  carried no net so the dimmer's un-attributed sweep could blanket it
  like any anonymous ink. All three closed: cycleHits clears any dim
  before its branches re-light their own, every selection-consuming
  Delete path (segments, vias, parts) clears the dim with the selection,
  and the live fill is stamped with its zone's net and fill-rule — the
  dimmer treats it with the fragments' own semantics (dims on foreign
  nets, lights on its own, restores on clear) while the obstacle scans
  rightly ignore it as pour paint and zonePourFragments still finds it
  on re-recompute. Pinned by two jsdom regressions that fail with any of
  the clears disabled, and verified live end-to-end: selecting a
  PROBE_1 segment dims 360 elements with the pour at 0.06 (the exact
  "black zone"), one Tab onto the zone restores the pour to 0.18 with
  zero dimmed elements left, and the delete leaves the board fully lit.

  And the dimmer itself was the deeper half of the same report: 0.06 — its
  old floor — sits below the dark theme's readability floor, so ANY dim
  (read: every via/segment/pad selection, however brief) read as "the
  board turned black", the pour chief among the wreckage (a second live
  report, "exactly as it did before", arrived with the page in a perfectly
  healthy post-fix state — the black was the selection dim of the gesture
  itself). The dim now floors at 0.35 and never above an element's
  authored opacity: traces and pads recess visibly but stay readable, and
  a pour authored at 0.18 keeps its exact normal wash through any
  foreign-net highlight — what you see highlighted is a bright net on a
  dimmed-but-intact board, not a black void. Pinned by the same
  regressions (dim-to-floor asserted, 0.18-authored pour asserted
  untouched) and verified live: 357 elements at 0.35, zero at 0.06, pour
  at 0.18 throughout, clean restore on Esc.

  And the live "unbuilt changes turn the pour black" report found the true
  root of all three sightings: the recompute's MASK REGION. The engine built
  its mask with `maskUnits="userSpaceOnUse"` but no x/y/width/height — the
  default region is -10%..120% of the viewport, resolved against the board-mm
  viewBox in a space the y-flip has already inverted, and the zone's
  negative-y extent lands entirely OUTSIDE it. The mask evaluates empty, the
  whole live fill paints nothing, and the pour vanishes into the dark canvas
  — every attribute on the element perfectly sane (fill green, opacity 0.18,
  sane polygon, sane mask children), which is exactly why three rounds of
  DOM inspection read the page as healthy while the user watched it black.
  Isolated by pixel-decoding screenshots of the live page: unmasking the
  path painted the exact healthy wash; a hand-built control mask failed
  identically; adding an explicit region to the same mask turned the pour
  green on the spot. The engine now writes the mask region explicitly (the
  zone bbox ±3, the same rect as the white base) — verified live end-to-end:
  delete a plotted via through the real selection path, and the pour renders
  51% green wash at the sample clip with its clearance holes, byte-identical
  in style to the server pour. The knockout clones also drop any opacity
  the net dimmer had stamped on their source traces — a half-transparent
  stroke in a mask is a half-open channel; knockouts are binary now. jsdom
  cannot render masks, so the regression pins the region attributes and the
  clone-opacity strip directly.

  Enter now reaches a ZONE's source definition. Clicking a pour (or Tab
  cycling to it) selects it — a selection the E and Del affordances already
  act on — but the Enter probe chain knew only components and nets, so a
  zone click either probed whatever copper the cursor last crossed or
  nothing. The page exposes the selected zone (net, layer, board-frame
  points) through `typecadSelectedZone`; the injected client's Enter sends
  it as a zone probe that OUT-RANKS the hover record (selecting the zone was
  the explicit act); and the host bbox-matches the points against every
  `zone({ … points: […] })` literal in src/**/*.ts (net breaking ties
  between coincident per-layer pours) and reveals the declaring line — the
  canonical writer and the zones island both round to 0.001 mm, so the
  match is exact. The zone's selection status names Enter beside E and Del.
  Pinned at all three layers: the page API's board-frame points (props),
  the client's zone-wins-Enter message (client exec), and the resolver's
  bbox/net/multi-line matching (unit) — and verified live: selecting the
  GND pour reports the exact points of the `typecad.zone({...})` literal in
  `_sync.ts`, line-for-line.

  Free board text is now Del-deletable. A gr_text (authored as a
  `typecad.text({...})` statement) selected in the layout view — click its
  strokes, same as dragging it — used to have no Delete affordance at all;
  now Del hides its ink immediately (undo restores it), records the
  AUTHORED value+anchor as a pending deletion that rides the apply payload,
  and the apply removes the whole statement from source — receiver,
  semicolon, and newline included, matched by the same 0.05 mm anchor
  discipline text edits use, with the deletion stage running before the
  edit stage so a delete supersedes any pending move of the same text.
  Component labels (a part's reference/value) are deliberately not
  deletable this way — they belong to their footprint's options, not to a
  standalone statement. Pinned by planner tests (whole-statement removal,
  anchor tolerance, miss reporting) and a jsdom props test that deletes
  the fixture text, asserts the hidden ink, the armed apply, the payload's
  authored identity, and the undo round-trip; verified live on the board's
  back silk — `microfire.co` selected, deleted, all 79 glyph strokes gone,
  apply armed.

  The Tab cycle carries a TEXT candidate now. Reference labels and board
  texts render as glyph strokes that overlays sit ABOVE — part ghosts,
  probe outlines, denser neighbors — so DOM picking never reaches them
  (U3's own reference designator, buried behind its corridor, could not be
  selected at all). `textUnderCursor` finds the text whose glyphs sit under
  the cursor (rendered `data-text` paths and claimed plotted strokes both,
  nearest anchor winning) and cycleHits offers it between the part and the
  zone candidates; selecting mirrors the press path's semantics (sole text,
  E panel owns the edit, drag to move). The ? sheet's Tab row names the
  full ladder: pad / trace / via / part / text / zone. Pinned by a jsdom
  regression that buries the fixture text under an overlay and reaches it
  only through the cycle (it fails with the candidate disabled), and
  verified live: hovering U3, Tab walks pad → segment → part →
  `text "U3"` and selects it.

  The text cycle learned its first live lesson: a single text candidate was
  not enough. A part's reference and value labels share one anchor, and the
  stroke-claiming competition (nearest-anchor-normalized-by-reach) hands
  ALL the glyphs to the longer text — U3's reference had zero claimed
  strokes, so hovering the drawn 'U3' offered pads, segments, the part, the
  zone… everything except the text. The lookup is now a STACK, like the
  zone stack: glyph hits (claimed strokes or the render's own data-text
  paths) rank first, and every text whose own anchor disc contains the
  cursor joins — so both labels at a shared anchor cycle (value then
  reference), and neighbors in reach follow. Verified live at U3's label
  anchor: the cycle reads `TS3A24159DRC` → `U3` → the adjacent labels, each
  selectable. Pinned by a jsdom regression with reference and value
  sharing one anchor and no seeded glyphs — the anchor disc is the only
  road to the reference, and both labels must appear in one cycle.

  And the text cycle respects the layer rail: a text whose layer is toggled
  off (the sidebar checkbox writes display="none" on the layer group) never
  cycles — fab labels cycling "even with the fab layers invisible" read as
  ghosts. The visibility check maps each text to its nominal layer group
  (layerKind + side; board texts without a layerKind pass if EITHER fab or
  silk is on, matching the claim's own both-kinds search). Verified live
  with every layer on — hovering U3's silk glyphs cycles `U3` FIRST, then
  the value and neighbors — and with fab off: every fab label leaves the
  cycle while the silk reference stays reachable. The jsdom fixtures
  render their fab layer hidden by default, which the new hidden-layer
  regression turned into its own lesson: the fixture-based text tests now
  enable the layer explicitly, and the regression toggles it off and back
  on to pin the filter both ways.

  And the visibility rule found its true boundary: a REFERENCE label is
  the layout overlay's own ink. With F.SilkS toggled off the plotted
  strokes vanish, but the overlay still draws the designator above the
  part — a visible, unselectable text (U3, reported live: "selecting the
  U3 silkscreen text still won't select" with the front silk rail off).
  References are exempt from the layer filter now — the overlay renders
  them while editing regardless of the gerber rail, so they are always
  selectable; value/fab labels and board texts remain plotted ink and
  follow their layer (the fab-ghost fix stands). Pinned by the hidden-layer
  regression extended with a reference label that must STAY cyclable
  while its layer is off, beside the fab label that must not; verified
  live in the user's own rail state (front silk and fabs off): the cycle
  at the drawn U3 reads `text "R5"` → `text "U3"` and selects it.

  One more hardening from the same report: the glyph-hit test read only
  the inline style for hidden ink, but the layer rail hides groups with
  the display ATTRIBUTE — rail-hidden strokes still produced glyph hits
  (hidden-layer texts ranking first by a hit their layer said was
  invisible). pointInPathBox checks both now. And the selectability was
  re-verified end-to-end through the real affordances — the front-silk
  rail checkbox clicked on, the cursor over the drawn silk glyphs, Tab
  presses — the cycle reads `text "C1"` → `text "U3"` and selects it;
  the same page with the rail off selects it through the reference
  exemption. The page is proven in both states; a surface that still
  fails is serving a pre-fix page (the ? sheet's Tab row naming
  "pad / trace / via / part / text / zone" is the one-keypress version
  marker).

- badda73: Router safety: the autorouter can no longer emit shorting copper. Every
  router-produced path passes an exact-geometry gate (segments and vias vs
  every different-net pad and track, edge-to-edge with the stricter
  clearance) before it becomes a track — a path whose swept copper clips
  foreign copper is retried once on a finer grid and otherwise failed with a
  message naming the pin pair, the violated obstacle, and the numbers
  (`Route U2.3 → J2.1 failed: route rejected (clearance): segment 4 (34.19,13.79)->(34.9,14.5) on F.Cu clears U2.2 [DQ] by 0.05mm < 0.20mm`). Obstacles that already overlap the route's own terminal pads are placement errors DRC owns, not routing rejections. The escape-channel
  warning now models the real escape path (a fat ray in both escape
  directions, catching shell tabs squarely in front of a pad, not just
  lateral flanks), and failed routes always print per-pair at the default
  log level instead of a bare "some routes failed".

### Patch Changes

- badda73: Reference designators follow `create()` argument order. They were assigned
  from a module-global counter on the first read of `.reference` — so the
  order nets happened to mention pins decided the numbering and a BOM could
  contradict the user's source (a 10µF labeled C1 over a 100nF). The
  schematic's counter now assigns in registration order; the global counter
  only hands out display placeholders before registration. `add component`
  emits the part number as the generated component's `value` for
  part-number-like symbol names (`ATtiny85-20S`, `DS18B20`), overridable
  with `--value`; `typecad-pcb create` derives its `@typecad/pcb@~<version>`
  pin from the CLI release the user ran instead of a hardcoded alpha; the
  placement JSDoc no longer shows the crashing `sameAs(r1).plus(2)` form;
  and `search` stays silent on pipes (no ANSI spinner frames in piped logs)
  with the redundant "Top match" trailer removed.
- c6ecd95: Layout view: a rotated footprint's labels anchor where KiCad actually plots
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

  Selecting a part — or any of its attached labels — draws dashed leader
  lines from the part's center to each label's live anchor, both ends
  tracking pending moves: on a busy board a designator sits millimeters from
  the body it names and a fab value reads as orphaned ink; the leader closes
  that gap at a glance. A leader aims the eye at ink, so labels on hidden
  layer rails get none (a fab value with F.Fab toggled away); stacked labels
  (reference and value sharing one anchor) draw a single line, a label
  centered on its own body (the fab reference mirror) draws none, and
  clearing the selection clears the lines.

  The layout sidebar slims down: the align-row and distribute-X buttons are
  gone (their handlers went with them), and the toolbar's width-mirror
  button (reading e.g. "0.3 mm") — the width/via picker it opened stays
  reachable through its W key, and the [ ] / { } sizing keys are untouched.

  Revert asks first. The revert button opens a confirmation dialog (webviews
  suppress window.confirm, so the page owns the modal — Esc or the dimmed
  backdrop cancels, Enter or the amber-accented button confirms) asking
  whether to throw away the layout edits and return to the source file as it
  renders. OK resets the session and asks the host to re-serve the page, so
  the webview reloads to the source's own render; without a host (plain
  http) the in-page reset is the whole revert. With nothing pending the
  button never asks — the status line says there is nothing to revert.

  A rebuilt board no longer carries a stale DRC report: `typecad-pcb
viewer`'s auto-discovery embedded whatever <board>_drc.json existed, so
  every page regenerated after a rebuild painted the previous revision's
  violation markers at pre-move positions (and named "drc" among its
  overlays) — reading as "the rebuild ran DRC". Auto-discovery now embeds
  the report only when it is newer than the board (the same freshness rule
  the vscode extension's page generation applies); an explicit --drc still
  wins, and a fresh report — the one a DRC run just wrote — embeds as
  before.

  The regenerated viewer page is also never served half-written. The page
  (and its view-part fragments) are re-served to an open browser tab on
  every rebuild, and the plain in-place write handed a concurrent fetch a
  truncated document: the DOM error-corrected enough for the page script
  to run — halos moved, the checklist worked — but the SVG painted
  nothing, reading as "the board went black". The CLI now writes those
  files atomically (temp file + rename), so a rebuild landing while the
  viewer is open can only ever serve the complete old or complete new
  page.

  And the mounted view fragments no longer share id namespaces. Every
  pcba-family render emitted the same internal ids (pcba-clip, the
  openings masks, aperture symbols, the components group), so with two
  views mounted — pcba visited, then assembly — the document carried
  duplicate ids and assembly's clip-path/mask references resolved into
  the FIRST fragment's defs, inside a display:none view subtree. Engines
  that treat a clipPath resolved through a hidden subtree as empty clip
  the whole board away — black viewing area with only the (unclipped)
  hover outlines alive. Each view now renders under its own prefix
  (pcba/as/bp/sch, threaded through every generated id), references
  resolve inside their own fragment, and a cross-fragment id-uniqueness
  test keeps it that way.

  For the renderer itself, the assembly view's hover outlines are now
  DOM-built (createElementNS) on a requestAnimationFrame throttle instead
  of per-move innerHTML string injection — same pixels, none of the
  string-parsing churn — and the page carries a render-health self-report:
  on the first assembly interaction it sends what the renderer actually
  did (fragment mount state, board group size and display, clip/mask
  resolution, viewport center hit) through the probe client into the
  extension's output channel, so "the DOM says visible but the screen says
  black" has an in-renderer witness the next time it happens.

  That witness named the real black-board cause: a RESTORED view mode
  asked for its deferred part at page boot, before the webview's injected
  client had installed the host bridge — and the http fetch fallback is
  CSP-blocked in the webview (connect-src falls back to default-src
  'none'). The part was marked failed for the whole session, and every
  later switch showed its EMPTY placeholder: black canvas with only the
  page chrome (the BOM panel, the hover outlines) alive. The page now
  waits briefly for the bridge before falling back to the fetch, a failed
  part gets one retry on the next switch into it, and an unloaded
  placeholder is never displayed — the previous view stays up and the
  error stays on the status line instead of a black rectangle.

  The toolbar slims to Fit / Flip / All / None + the pcba theme picker:
  the KiCad layer-color theme select is retired (its recolor machinery
  and island went with it — the dark-canvas silkscreen/paste/drill
  recolor rules it gated now simply apply), the measure and DRC toggle
  buttons are gone (rulers' Escape-clear and the embedded DRC markers'
  rendering remain), and the theme options the pcba view carried now live
  in the toolbar for every view — recoloring the pcba render AND the
  assembly view's bare board, with a mount-time re-base so a theme picked
  before a deferred view loads applies when it lands. The assembly
  checklist grows to fill the sidebar's leftover height instead of a
  46vh cap.

  The pcba view composites like the physical board again. Its two openings
  masks wrapped the mask gerber's ink in groups carrying a stroke color but
  no stroke-width — and an unsized SVG stroke is 1 unit, 1mm in board
  coordinates. Every pad opening dilated by half a millimeter on every side
  until neighboring openings merged into corridors, and the copper pour
  painted through them as a continuous ring of exposed copper around every
  component's pad cluster (a 1.2mm opening read as 2.2mm). Both wrappers
  now pin stroke-width to 0 (trace draws carry their own explicit widths
  and never see the wrapper's); the openings are pad-sized again, so
  exposed metal appears only where the soldermask actually opens — verified
  against the gerber's own opening geometry, with zero copper rendered
  outside it across a full-board sample grid.

  Tented vias read as metal rings. The board's vias carry no mask openings
  (covered, like KiCad's default), so their annuli only ghosted through the
  film in a tone nearly identical to the clad — each via collapsed into a
  bare drill dot. The assembled render now draws the true annulus (drill
  edge to copper-flash edge, in the finish metal) under the drill dot for
  every plated hole — a drill with a concentric round copper flash; an
  unplated hole (no flash) stays bare.

  Flipping the pcba view shows the back of the board instead of an empty
  frame. The flip mirrored the gerber stack and negated the viewBox's x,
  but the pcba render lived outside the gerber group — after the flip its
  content sat entirely outside the visible window: black. The pcba now
  ships with a back-side twin (its own id namespace, rendered from the
  back layers pre-mirrored to land in the flipped viewBox), and Flip Board
  swaps the two boards — same fragment, so the eager page, the deferred
  host bridge, and the http fragment fetch all carry it. A board with no
  back layers mirrors its front render instead of vanishing, and the
  blueprint/schematic drawings of the front mirror the same way. The
  viewBox mirror is computed from the live viewBox on every toggle, so a
  deferred part mounted mid-session (whose union may have widened the
  window) still flips correctly; a deferred pcba mounted while already
  flipped comes up showing its back board.

  A fifth view joins the switcher: Assembly — the build checklist. The
  board renders bare (substrate, soldermask film with its openings,
  finish-metal pads, silk, annuli, drills — no component bodies), every
  component glyph shipped hidden, and the sidebar carries the BOM: parts
  grouped by value + footprint, biggest groups first, each instance a
  clickable chip. Checking a part off — its chip, or a click on the part's
  land pattern in the view — reveals its glyph exactly as the pcba view
  draws it, so the board visibly fills in as the build progresses; a
  second click un-places, reset clears the lot, and check-offs persist
  per board (the same store as layer settings and viewport, so a reload
  mid-build loses nothing). Hovering a BOM row outlines every instance of
  that group on the board — "where do the three 100nF go" answered at a
  glance — and Flip Board swaps to the bare back side (with its own
  checkable parts) like the pcba view does. Parts without drawn glyphs
  (mounting holes, fiducials) stay out of the checklist. The view rides
  the same deferred machinery as its siblings: `--lazy-views` ships an
  empty placeholder, `--view-part assembly` serves the fragment, and the
  vscode host bridge renders it on first switch. Hovering works both
  ways: over the board, a part highlights its chip and row in the list
  (scrolled into view) and outlines its whole value group; and the
  outlines follow each part's BOARD-frame extents — the checklist data
  carries w/h in the part's local frame, so a vertically-placed connector
  (outlined horizontally at first) now reads vertical, at any rotation.

- badda73: Diagnostics tell the truth: `query net`'s copper analysis is now geometric
  (a track endpoint anywhere on a pad, a mid-span tee, and a via inside a
  pad annulus all connect — the previous exact-coordinate unions read almost
  every routed net as "1/N pins connected"), which also fixes `query
summary`'s bogus "unrouted nets" count on fully routed boards. `check`
  lists each intentionally-open pin once (ERC owns no-net pins when it ran)
  and gains a typecheck step (`tsc --noEmit`; `--skip-typecheck` to skip)
  plus a `pcb.dnc(...)` hint on `pin_not_connected` — catching type errors
  the tsx build would have run anyway. `drc --kicad` / `erc --kicad` now
  print the engine that actually ran. MountingHole pads are auto-marked
  do-not-connect so they stop failing ERC on every board.

## 1.0.0-alpha.9

### Minor Changes

- a5511ff: The chip passives now work out of the box on machines with no KiCad
  install. @typecad/pcb bundles the six `Device` symbols the passive size
  tables default to (`R_Small`, `C_Small`, `L_Small`, `D_Small`,
  `LED_Small`, `Fuse_Small`) plus the 34 chip footprints those tables
  reference (R/C/L/D/LED in 0201–1210, Fuse in 0603–1210), resolved as the
  last resort after install/conf paths and the project's `build/lib/` —
  so `new Resistor()` and friends build with zero setup. `doctor` and
  `typecad-pcb lib list` report the bundled set alongside the other
  sources. Bundled footprint 3D-model references keep their upstream env
  form; fetch models per project with `lib add --footprint` when the 3D
  view matters.
- 7f87876: Components deleted in KiCad now import: the reverse direction of the sync.

  - **`typecad-pcb import --apply`** — matching always ran board → source, so
    a component deleted in KiCad simply produced no footprint and its source
    declaration stayed: the import reported "everything is in sync" and the
    next build resurrected the part. A new deletion pass computes the reverse
    set (source components with no board counterpart) and removes each one
    everywhere it lives — the declaration statement, standalone
    `x.pcb`/`parts.x.…` overrides, the identifier in every `typecad.create()`
    argument list, its `syncBoard(…)` parts-map entry, and its `x.pin(…)`
    references in `.net()`/`.joint()` calls — through one shared,
    comment/string-aware grammar module. Deletions run FIRST in the cycle
    (before positions/text/routing are planned) under the snapshot/rollback,
    drift-stamp, and parse gates, and an applied deletion must converge (not
    reappear as a candidate) or the cycle rolls back. Safety rails: a board
    with zero footprints never deletes anything (wrong file, not an empty
    project); a component never passed to `create()` is work-in-progress and
    is left alone with a note; a variable name declared in more than one file
    is ambiguous and left for manual deletion; and a removal whose identifier
    would survive anywhere is refused loudly — a dangling reference breaks
    the build, so nothing is written for it. Interactive imports get a
    checkbox per deleted component; `--auto`/`--watch` apply them (verified
    end-to-end on the mod-ec board: R1 deleted in KiCad → r1 gone from
    source, project compiles, rebuild produces the board without R1).
  - **Layout view: `Delete` on a selected part removes it** — parts had move
    (M), nudge, probe (Enter), and edit, but no delete. `Delete` with
    segments/vias selected keeps its copper semantics; with PARTS selected it
    now rips the part's ink (overlay handle, pads, outlines, drills —
    reversible via undo/revert, and its autorouter copper rips with it), the
    ratsnest drops its pads, and the deletion rides the apply: the host runs
    the same shared grammar to remove the component from source, with the
    same ambiguity and dangling-reference refusals reported as skips. Pending
    part deletions persist across page reloads like routes and segment
    deletes do, and the apply summary counts them.
  - The grammar module (`component_delete.ts`) is byte-pinned between
    `@typecad/pcb` and the VS Code extension exactly like `_sync.ts`'s, with
    a contract test that fails when the copies drift.

- 081813f: `typecad-pcb diagnostics` (and `build --diagnostics`) now runs ERC/DRC
  through the native engines by default, like `erc`, `drc` and `check`.
  ERC reads the `<name>_erc.json` report the build writes (a report older
  than the schematic is not trusted), DRC runs the native engine on the
  board. Pass `--kicad` to either command to run the checks through
  kicad-cli instead. The native step helpers moved to a shared module used
  by both `check` and `diagnostics`.
- 081813f: `typecad-pcb doc` now renders layer, drill-map and stackup images natively —
  the gerber exporter and SVG renderer plot the board in-process, so generating
  documentation no longer requires a KiCad install. `{Render/...}` 3D images
  still use kicad-cli `pcb render` when it's available — when it isn't, they
  are skipped with a console warning instead of failing the document (all other
  images are unaffected). Each document plots the board once and reuses it across all
  images instead of spawning one kicad-cli process per image, `kicad_theme`
  front-matter resolves against the gerber viewer's registered board themes
  (KiCad's default palette included), and back-side layer combinations keep
  their mirrored bottom-view presentation. Images may name the full built-in
  user-layer range (User.1–User.9) like kicad-cli did, and boards without an
  authored stackup get the synthesized KiCad default for their copper count
  instead of skipping the stackup image. Also fixed along the way: the
  interactive gerber viewer applied the wrong color to inner copper layers when
  a layer theme was selected, and inlined doc images now carry unique SVG symbol
  ids so several images can coexist in one HTML file.
- 081813f: `typecad-pcb diff` (and the `typecad-gitdiff` entry point) now renders every
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

- 7284ad8: `typecad-pcb import --apply` now writes back the elements that used to be
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

- c54d344: Hardened the `import` round-trip: the pipeline now proves itself on every
  run instead of relying on the test suite having imagined the right failure.
  Every write is preceded by a snapshot and followed by verification, and a
  failed verification rolls your sources back untouched.

  - **Convergence oracle with auto-rollback** — after any apply, every change
    category is recomputed against the written files; anything still pending
    (or any written file that no longer parses) restores the pre-cycle
    snapshot and reports exactly what failed. Non-convergent writes — the
    class behind every phantom-diff and corruption incident — can no longer
    land silently.
  - **Per-cycle snapshots + `--restore`** — the analyzed source set is copied
    to `.typecad-import/snapshots/` before the first write (rotating
    `latest`/`previous`), because the per-pass `.backup` files only captured
    the state before the last pass. `import <board> --restore` undoes the
    most recent apply cycle.
  - **`--dry-run`** — computes and prints every pending change across all
    categories, with per-edit `- old` / `+ new` previews, and writes nothing
    (no snapshot, no prompts).
  - **Parser self-test** — the TS-capable parser is probed at startup (class
    fields + type annotations); a missing `acorn-typescript` now fails loudly
    instead of silently matching nothing. Also surfaced as a `doctor` check.
  - **Write safety** — writes may only target files that were parsed in this
    cycle (ownership set); files edited on disk mid-cycle (an editor under
    `--watch`, or during interactive prompts) abort the write instead of
    interleaving ranges; `--watch` additionally watches `src/` so external
    source saves re-trigger a cycle.
  - **Project lock** — two import processes (`npm run sync` plus a manual
    run) can no longer write the same project concurrently; stale locks
    (dead pid) are reclaimed.
  - **Board fingerprint** — every import prints a 16-hex semantic hash of the
    parsed board (order- and formatting-insensitive), making "in sync" a
    verifiable claim across machines and runs.
  - **Self-proving tests** — a seeded fuzz harness (random boards × random
    source styles: receivers, quotes, multiline objects, custom track-array
    names) asserts parse-after-apply, convergence, and byte idempotency; a
    burn-in test pins two full auto cycles to a byte-stable converged file;
    and the repo's real boards (rd_skeleton, simple_board, upgrade_test's
    1.1 MB KiCad-authored file) form a golden corpus, with the committed
    mod-ec source required to be exactly in sync with its board.
  - **Adversarial hardening (red-team follow-up)** — corrupt or hostile
    inputs now degrade loudly instead of corrupting: footprints with
    non-finite coordinates (`nan`, `1e400` → Infinity) are dropped and
    reported (previously `nan` silently applied as position 0,0, moving real
    parts to the origin, and Infinity propagated into source as the valid
    JS identifier `Infinity`); the same guard covers segments, vias, text
    and layout positions; and a parseable file that is not a board (a
    `.kicad_sch` handed over by mistake) is refused outright instead of
    importing as an empty board and deleting source. Verified against
    unbalanced/garbage/BOM inputs, escaped quotes, unicode/bidi text,
    scientific notation, semicolon-free and CRLF source styles, block
    comments inside the routing section, and computed (non-literal) text
    arguments — all either handled correctly or safely skipped with a note.

  - **Auto-named nets keep their identity on imported copper (red-team
    follow-up)** — the importer treated any net name starting with `net`
    ("net14" — typeCAD's auto-name for anonymous nets) as "unnamed" and
    emitted its tracks with no net at all. That copper then ran net-less
    against netted pads, which DRC reports as `shorting_items` and
    `solder_mask_bridge`. Only a genuinely empty net name is unnamed now;
    auto-named tracks import as `track_net14` with `{ net: 'net14' }`
    (verified to join the existing auto-named net on rebuild), and standalone
    vias carry the net too.

  - **Through-via layer span in the native DRC (user report)** — the
    connectivity union-find gave a through via only its literal
    `(layers "F.Cu" "B.Cu")` tokens, so on a 4-layer board an In1/In2 track
    ending at that via never shared a layer with it: via-joined nets split
    into phantom `unconnected_items` (SWDIO/SWCLK on the demo board) that
    kicad-cli `pcb drc --refill-zones` does not report. A through via now
    spans every copper layer of the stack; blind/buried vias keep their
    declared span (regression-tested both ways).

  - **Native DRC parity pass (5-board audit vs kicad-cli `--refill-zones`)** —
    `gapNm` now returns zero for crossing shapes (copper straddling the board
    edge — castellated pads — previously read a positive vertex-to-edge
    distance and passed the edge rule kicad-cli failed on); holes are checked
    against the board edge under the SAME edge-clearance constraint and
    reported as `copper_edge_clearance` (the separate `hole_edge_clearance`
    rule with its own stricter default produced 17 phantom violations);
    edge violations dedup per physical pad board-wide (duplicated pad
    numbers — PVSON rect+oval leads, castellated duals — are one pad to
    KiCad, on every layer); mask-web enforcement is opt-in like KiCad
    (32 phantom web warnings gone); silkscreen collection includes
    `fp_poly`/`gr_poly` outlines (silk-edge and silk-over-opening checks
    previously never saw polygon silk, missing all 13+24 items on the demo);
    `silk_over_mask` renamed to KiCad's `silk_over_copper`; and mask-bridge
    identity keys on `ref:padNumber` so a pad never bridges its own
    duplicated parts while genuinely no-net items still bridge.

  - **`kicad_sync` is the round-trip's front door** — new projects get
    `npm run kicad_sync` (import `--watch --auto`) instead of the old
    one-shot `import --apply` script, and the VS Code extension gains
    **typeCAD/pcb: Start KiCAD Sync**, which runs it in a dedicated
    reused terminal. A news article on the typecad.dev site covers the
    import overhaul end to end.

- 081813f: KiCad symbols and footprints no longer require a KiCad install. Library
  resolution is decoupled from the kicad-cli binary: symbols resolve from
  the install, then `typecad.conf.ts` (`symbols_path`/`footprints_path`
  override the install), then the project's `build/lib/`, then the `power`
  library now bundled inside @typecad/pcb (the renderer's power-symbol and
  PWR_FLAG generation always works). A machine with no install builds from
  `build/lib/` alone — component packages already sync there.

  New `typecad-pcb lib` command fills `build/lib/` on demand from the
  official KiCad library repos: `lib add Device Connector` fetches whole
  symbol libraries, `lib add Device:R_Small` fetches a single symbol,
  `lib add power` copies the bundled library offline, and `lib list` shows
  the active sources. Fetching a footprint also downloads its 3D model(s)
  from kicad-packages3D into `build/lib/3dshapes/` and rewrites the
  footprint's reference to `${KIPRJMOD}/lib/3dshapes/…`, so the KiCad GUI
  3D viewer and kicad-cli raytrace renders find the project-owned models
  with no environment setup. Downloads go through a user-level cache
  (`~/.typecad/cache/kicad-libs`) and land inside the project (committable;
  the board builds offline from then on). Builds never fetch — resolution
  failures now point at `lib add` instead of "install KiCad".
  `doctor` reports all active library sources and marks the CLI as optional
  for the native flow.

- 7f87876: Multi-board projects: more than one PCB per project — mother/daughter
  boards, board/jig setups.

  - **Build** — `typecad.conf.ts` gains `boards: { mother: './src/mother.ts',
daughter: './src/daughter.ts' }`; `typecad-pcb build` runs every entry
    (or one with `--board <stem>`), each writing its own
    `build/<stem>.kicad_pcb`. The build manifest (.typecad-board.json) now
    MERGES: `boards` accumulates every board the project produces and
    `board` stays the most recent one (single-board projects read exactly
    as before). Watch mode rebuilds all boards on any change (union of the
    entries' import graphs).
  - **Discovery + selection** — `check`, `drc`, `export gerbers/drill`, and
    `query` take `--board <stem>` and resolve that board; an unknown stem
    reports the project's known boards instead of failing blindly.
  - **Per-board fab dirs** — once the manifest lists more than one board,
    gerbers export to `build/gerbers/<stem>/` (single-board projects keep
    the shared `build/gerbers/`). Without this, each board's export pruned
    the other's layers as "foreign" — one board's fab output literally
    deleted its sibling's. The viewer reads the same per-stem dir.
  - **Sync scoping** — `import --apply` on a multi-board project scopes its
    cycle to the board's entry import graph (found by the file constructing
    `new PCB('<stem>')`), so every name-based guard — variable ambiguity,
    the sidecar-first assignment search, routing ownership — sees only
    files that can legally hold that board's components. The same `r1` on
    two boards is no longer ambiguous; a KiCad-side deletion on one board
    can never remove a sibling board's component. Single-board projects
    keep the whole-src scan.
  - **Per-board sidecar** — multi-board sidecars are named
    `_sync.<stem>.ts` (single-board keeps `_sync.ts`), each wired into its
    own entry's create() through the same shared grammar.
  - **Viewer** — typeCAD/pcb: **Switch Board** picks which of the
    manifest's boards the panel shows; multi-board projects get one page
    per board (`build/serve/<stem>.html`) and one gerbers dir each, so the
    page title/path — and with it the viewer store, flip state, and
    pending-edit session keys — are per board for free.

- 01d3d7d: ERC is now native, like DRC. The build runs a small engine over the typeCAD
  object model itself (components, nets, pin electrical types — no file
  parsing, no kicad-cli) and writes `<name>_erc.json` next to the schematic.
  It checks electrical correctness only: pins no `net()`/`dnc()` ever touched
  (`pin_not_connected`) and incompatible pin connections such as two outputs
  on one net (`pin_to_pin`). Power pins never conflict — driver analysis is
  out of scope and typeCAD's auto PWR_FLAG would false-positive every rail.

  `typecad-pcb erc` reads that report by default; `--kicad` keeps the legacy
  kicad-cli shell-out (still the only route for arbitrary external
  schematics). `typecad-pcb check` uses the native report too, with
  `--kicad-erc` as the opt-out. New API: `pcb.erc()` returns the report
  programmatically. Severity overrides for both check ids come from the conf
  constraints severities map.

- 081813f: Footprint library upgrades are now native: `add package`, `add component`
  and the footprint loader migrate `.kicad_mod` files to the current format
  in-process instead of shelling out to `kicad-cli fp upgrade` — same
  transformation set (module→footprint rename, fp_text→property migration,
  synthesized Value/Datasheet/Description properties, uuid fill-in,
  stroke/fill normalization, pad-layer canonicalization with wildcard
  compression, model transform completion, bare-token quoting, and the legacy
  %R/%V text variables becoming ${REFERENCE}/${VALUE}), verified byte-for-byte against
  kicad-cli 10 output. Two long-standing bugs went with it: the footprint
  loader's and the exported `upgradeFootprint()`'s `--output` argument always
  equaled the input, which kicad-cli rejects — those calls had never upgraded
  anything; both now upgrade in place and actually work. Files already at or
  newer than the target format are left untouched, and a malformed file no
  longer aborts the whole library (errors are isolated per file).
- 081813f: The layout view's E properties dialog now follows the selection and covers
  every element's properties. An open panel rebuilds for whatever the next
  press lands on (part, trace, via, or text — no reopening per element), keeps
  placement fields fresh through drags, rotations, and undo, and never steals
  focus from the canvas keys. Panels gained full property coverage: parts show
  board side, the pin→net map from the PCB pad manifest, and any named net
  class claiming their nets; traces show the net's class defaults and the
  computed impedance of the current width on its layer (stackup permitting);
  vias show the annular ring and the board's via floor; texts are newly
  editable in the dialog — content, placement, and the full style block
  (character width/height, stroke thickness, font face, italic, bold, and
  horizontal/vertical/mirrored justification), parsed from the board, previewed
  live, and written back into source on apply as a diff (only changed keys
  travel): board gr_texts rewrite their `.text({ … })` literals, part labels
  edit through the Component's referenceLayout/valueLayout/fab options (a
  reference label's content renames the part, a value label's edits its value)
  with existing unmanaged keys in those literals preserved — and parts with no
  matchable constructor literal (subclass factories like `new LED({…})`,
  prefix-derived references) get their label edits written as public-field
  assignments after the constructor (`led.referenceLayout = { … }`), the same
  door moves use. Pressing a claimed text glyph near copper now selects the
  text instead of the trace underneath.

  Two robustness fixes found in the wild: route re-apply idempotency now
  recognizes chains in CRLF-authored files (a pending session route on a
  Windows project re-inserted itself as a duplicate on every apply, and the
  duplicate insertion colliding with a delete rewrite corrupted the source),
  and the layout apply dry-runs its whole plan and parse-checks every touched
  file before writing — a planner bug now surfaces as a refused apply with a
  message instead of broken source the build chokes on.

  Undo of a segment delete no longer leaves the restored tracks stuck
  highlighted: the delete's DOM capture now excludes transient visuals (the
  selection overlay, pad-highlight clones, text previews) so undo cannot
  resurrect them, every undo/redo re-syncs the selection overlays from the
  live sets, detached members leave the selection, and the redo path's
  snapshot (which crashed on partially-deleted tracks) carries its track
  reference again.

  The arrow keys now nudge the selected ink as well as parts: selected trace
  segments translate by a grid step (Alt fine, same as parts) with same-layer
  neighbors stretching to stay connected, selected vias jump and carry every
  attached trace end across layers, and each move serializes through the same
  delete + session-route contract a segment drag uses — apply & rebuild writes
  the moved track into source, and Ctrl+Z restores the original geometry.

  Via visuals match the board's truth: the selection ring is sized in board
  units off each barrel's own diameter (it was a fixed 2px screen stroke that
  blew up to several via-widths through aperture-scaled flash symbols), a
  session via renders its drill hole from the moment it is placed (a .cut
  sibling riding the barrel through resizes, rips, and arrow-key nudges — a
  resize overlay carries its own hole too), and deleting a board via removes
  its drill-layer hole along with the barrel unless a pad owns the same spot.

  A stale DRC report (older than the board) no longer locks a permanent
  "DRC markers show the PREVIOUS board revision" banner into the viewer's
  status line — the provenance note goes to the typeCAD/pcb output channel
  only, leaving the status line free for normal operation.

  Editing session ink no longer re-materializes phantom traces: a rewritten
  chain that belongs to a not-yet-applied route (a D-slide or an arrow nudge)
  reconciles that route's own geometry — the entry carries the new polyline
  and moved barrels their new positions — instead of writing the pre-edit
  trace beside the new one after apply & rebuild.

  Layout applies now write each stage as ONE whole-document replacement
  composed exactly like the dry-run the parse gate validates — VS Code's
  multi-range WorkspaceEdit resolves entries sequentially and silently drops
  overlapping ones, so a dropped delete left the live document longer than
  the plan's text and later stages' ranges landed early, splicing tokens into
  source (the recurring `width: 0.3const route15` corruption). Application is
  now byte-identical to what the gate checked.

  A source backup system lands under the apply bridge: every apply snapshots
  the files it will touch into build/layout-backups/<timestamp>/ (20 kept), a
  post-write parse check auto-restores the snapshot the instant anything
  unparsable hits disk, and a new "typeCAD: Restore Source from Backup"
  command lists snapshots and restores them from a picker. A hardening matrix
  test drives combined gestures (routes + deletes + labels + texts + values)
  over both LF and CRLF projects, asserting the composed source parses, no
  route declaration duplicates, and create() carries every declared route.

  Semantic verification closes the loop after every apply & rebuild: the
  rebuilt .kicad_pcb is checked against what the apply intended — added route
  segments and vias present (right layer, either orientation, tolerance for
  rounding), deleted segments actually gone, moved components sitting at
  their computed final positions, edited texts landed — with each miss
  reported to the output channel, the status bar, and the viewer status, so
  "parses but wrong" bugs surface instead of silently shipping. The
  workspace-bundled extension now self-updates: at activation it compares its
  version against the project's own @typecad/pcb dependency asset (once per
  day), copies the newer asset over itself, and offers a window reload — the
  bundled copy can no longer rot at its scaffold-time version. A
  `sync:extension` script in @typecad/pcb refreshes the shipped asset from a
  built extension for maintainers.

  Apply application is now a single atomic write: each touched file's final
  composed text (the exact strings the parse gate validated) lands in ONE
  whole-document WorkspaceEdit, after verifying the live document still
  matches the text the plan was built against — a keystroke landing between
  planning and writing previously shifted every offset and spliced tokens,
  caught by the post-write check's auto-restore but leaving the apply to
  retry; now the race refuses cleanly before anything is written.

  A fresh session via no longer wears a dark ring: the drill-hole sibling the
  barrel carries from placement inherits the .cut rule's !important stroke
  with the SVG default 1mm width, painting a background-colored circle around
  the via until the rebuild replaced it with the real drill render — the hole
  now carries an explicit zero stroke-width.

  A stale view can no longer seed phantom traces: when a replacement gesture
  (deletes + a new route on the same net) has deletes that match no source
  segment — the page computed them against a board render that predates the
  source — the apply refuses with instructions to reopen the Board tab and
  redo, instead of leaving the unmatched geometry's chain fragment beside the
  new route (seen as a phantom trace, via, and nub between two parts).

  Routing gets a rubber band: the moment a route starts from a pad, the
  ratsnest re-ties — the walk's end connects to the nearest still-stranded
  pad of the net (the pad to route to) and follows every mousemove instead of
  staying behind pad-to-pad; hovering the target drops the band (the arrival
  is the signal), and cancel or commit restores the ordinary stranded wires.
  The start pad now drops out by position too (island pads carry no pin
  field, so the pin-keyed skip never matched).

  The ratsnest is now connectivity-based: per-net union-find over pads and
  ink elements (each M-subpath is its own conductor, endpoints join within
  half-widths) computes connected components, and wires are only owed
  BETWEEN components — a route that exists but broke in the middle no longer
  counts as wired at both pads (the old pad-granular test drew nothing until
  every segment was deleted), while complete routes, pour-covered nets, and
  stubs behave as before. The routing rubber band draws in the gerber frame
  the ratsnest group renders (the earlier y negation mirrored it: moving the
  cursor up moved the band down), and the start/target pad drop-outs compare
  positions across the board/gerber frame boundary.

  Ratsnest wires now land on the CLOSEST pair of contact points between
  connectivity components — a partial trace's dangling end talks directly to
  the far pad instead of pad-center to pad-center — and the routing rubber
  band ties to the nearest point of the unreached components (a dangling
  trace end included), dropping the component the route grows from and the
  hovered target's.

  Pending gesture deletes no longer wedge every later apply: a failed apply
  leaves its deletes in the session's persisted state, the board rebuilds
  anyway (a plain npm run build), and the restored deletes then describe
  geometry only the OLD board had — accumulating across retries until every
  apply refused as "the view was stale" even on a freshly generated viewer.
  Deletes are now pruned against the live board ink (segments either
  orientation, vias by position, board-frame aware) both when the pending
  state restores and again at the apply door: dead deletes drop silently,
  deletes matching existing ink ride, and the stale-view refusal only fires
  for genuine source/board divergence.

  Unmatched-delete triage ends the false staleness refusals: the page pushes
  a via-delete at EVERY deleted-segment endpoint (most endpoints carry no
  via), and a via-delete claims its source segment first — leaving the
  segment delete itself apparently unmatched and every apply refusing as
  stale even on a freshly built board. Deletes that match copper another
  delete already removes now absorb as duplicates, unmatched via-kind
  deletes never refuse, and only a SEGMENT delete drifting within 0.3mm of
  its net's source copper trips the stale-view guard (the phantom recipe);
  everything else drops with an output-channel note.

  The source↔board↔viewer chain is now self-syncing: source edits under src/
  (or typecad.conf.ts) auto-build after a 2s debounce, opening a workspace
  whose board predates its sources builds once immediately, and a status bar
  item shows the pipeline state (✓ typeCAD synced · "building…" · "build
  failed" with the error) — clicking it opens the Board view. Applies set a
  busy flag so their own source writes never double-build. Every generated
  viewer page embeds the mtime of the board it renders and carries it with
  each apply; when the board has since been rebuilt (auto-build, external
  edit), the apply regenerates the viewer and tells the user to redo the
  edit on the fresh view instead of splicing edits from a superseded board.

  Route retries can no longer stack parallel corridors: a same-net chain
  already connecting a new route's endpoints (either direction, bends
  ignored) is that connection — the retry skips instead of adding a
  near-duplicate route beside it. This was the delete/retry loop that piled
  five R1→D1 corridors: each failed apply left its drawn route pending, and
  byte-level idempotency missed the reversed and jittered variants.

  A gesture's own deletes ride the apply again: the anti-staleness prune ran
  once more at the apply door, where a gesture's deletes have already had
  their ink removed by the gesture itself — the prune read them as dead
  state and dropped them, so deleting a route and drawing its replacement
  left BOTH in source after apply. Pruning now belongs to restorePending
  only, compared against a freshly rendered board.

  The viewer sidebar collapses to a single button's width: the toggle stays
  as a slim rail, and the layer list swaps to a compact selector — minimal
  swatch + checkbox per layer (no names, no opacity sliders) that inherits
  the full list's selection state and keeps editing in tandem (either view
  mirrors to the other and drives the board groups). The collapse state
  persists per browser, and theme recoloring updates the compact swatches
  alongside the full-list chips.

  Pad-manifest rotation is pinned against the gerber plot: 90°/270°/0° unit
  tests assert the three-pin layout lands where KiCad actually draws it (pin
  3 alone on top at 90°, on the bottom at 270°, right at 0°) — the manifest
  drives both the pad labels and trace snapping, and a mismatch mirrors them
  about the part center (seen once after a mid-edit build; verified 111/111
  pads matching ink after a clean rebuild).

  A first placement insert can no longer jump a part to ~(0,0): a component
  placed via the constructor's inline pcb option has no `var.pcb = {…}`
  literal, and the apply bridge's insert path wrote the drag DELTA as the
  absolute position — the inserted reassignment then overrode the constructor
  placement, so every constructor-placed part "moved" landed far up-left of
  where it was placed. The move payload now carries the part's final
  absolute board position (ax/ay), and the insert path writes it (older pages
  fall back to the delta); the six mis-written literals in the user's project
  were reconstructed as constructor placement + recorded drag delta.

  Layout polish: parts no longer wear the yellow warning border in any case
  (overlap, off-outline — the amber text list in the layout panel is the
  whole warning surface), the collapsed sidebar actually shows its compact
  layer rail (it sat inside the hidden sidebar body, leaving only the toggle
  button), and the layout grid controls — step (0.1/0.25/0.5/1), snap,
  visible grid, mil units — persist across the page reload every rebuild
  triggers.

  KiCad interaction model: source navigation moved from double-click to
  Enter — hovering or clicking a component (pin-aware via the pad manifest)
  or trace records the probe, Enter jumps to its source line, and an active
  route keeps owning both keys. Parts no longer move by drag: a press only
  selects, M grabs the selection (centers snap to the cursor on the first
  move, multi-select offsets preserved), the cursor moves it, click drops,
  Esc reverts — with full undo.

  The viewer sidebar keeps its height bounded (height 100%, min-height 0,
  overflow hidden on the sidebar and its body) so the layer list scrolls
  internally and the toolbar row — fit/all/none, theme selector, measure,
  DRC — always stays inside the viewport; the collapsed compact rail gets
  the same treatment, so theme swatches render at full size instead of a
  crushed sliver when the layer list is tall.

  The collapsed rail is wide enough to actually show its swatches: 18px
  clipped the stacked checkbox+chip column to slivers — the rail is now 34px
  with padding clearing the toggle button, so every layer reads as a full
  checkbox over a full color chip.

  Enter on a SELECTED trace now lands on the TrackBuilder `.to()` that drew
  that exact segment — the viewer sends the selected segments' board-frame
  endpoints and the host matches them against chain geometry in src/**/*.ts
  (either orientation, 0.05 mm tolerance, net-aware) — falling back through
  the net's `typecad.named('…')` declaration (for highlighted-but-unselected
  nets) and then the recorded route/net source as before.

  Segment-to-source matching now reads BOTH authoring forms: multi-line
  `const x = new TrackBuilder(…)` chains AND the one-line
  `typecad.track({ net: '…' }).from(…).to(…)` chains the apply bridge emits
  (seen in mod-ec.ts — 292 chain points, previously zero matches, so Enter
  always fell through to the net line).

- 7f87876: Auto-inserted code now lands in one machine-owned sidecar instead of
  splicing into hand-written source: **`_sync.ts`**. The layout view's apply
  and the board import share its grammar, so tool-written statements always
  win the code-order battle and never compete with user code for insertion
  points.

  - **The sidecar** — `src/_sync.ts` exports `syncBoard(typecad, parts)`,
    which the entry file calls immediately before `typecad.create(...)` (and
    `...syncTracks` inside create() once routes exist). Because component
    state is read at create() time and public-field assignments override
    constructor options, everything the sidecar assigns always wins —
    placements and label layouts ride `parts.<var>.pcb` /
    `parts.<var>.<prop>Layout`, routes are loose `const routeN = new
TrackBuilder(...)` chains pushed onto `syncTracks`. The only lines ever
    added to hand-written code are the import, the call, and the spread —
    all canonical, all idempotent. The file is created lazily on the first
    auto-insert and never touches an existing file that does not speak the
    grammar.
  - **Layout view (vscode extension)** — moves/labels with no literal to
    rewrite and newly drawn routes now go to the sidecar instead of
    after-constructor/before-create inserts. Updates rewrite the sidecar's
    own literals in place; route deletes split chains with their own collect
    lines and emptied routes take theirs along; backups mark created files
    so a restore deletes rather than empties them. The whole apply still
    passes the dry-run parse gate, stale-view/board guards, atomic writes,
    post-write re-parse with auto-restore, and the rebuilt-board semantic
    check. A byte-identity contract test pins the extension's copy of the
    shared grammar module to the canonical one in `@typecad/pcb`.
  - **`typecad-pcb import --apply`** — the rewriter now searches `x.pcb`
    and layout assignments sidecar-first over the constructor's own file
    (exactly the two places that can win at runtime), so a KiCad position
    edit updates the sidecar's override instead of fighting a stale
    constructor literal. The search never reaches further: variables are
    file-scoped, and a same-named variable in an unrelated module is a
    different component, not an override. The routing
    regen speaks the sidecar's loose dialect, regenerates its collect lines
    with the routes, and no longer refuses a routing section whose create()
    legitimately lives in another file (the `...syncTracks` spread delivers
    it) — converging byte-stably, pinned by tests.
  - **Comment-blind structural scan** — `typecad.create(` is located through
    a comment/string-aware shadow (in the shared grammar module as well, so
    the entry-file wiring is covered too), and the canonical `typecad`
    receiver is preferred so an earlier unrelated `x.create(…)` cannot
    capture the rewrite; prose that merely mentions the call (the sidecar's
    own banner once did) can no longer capture a create() rewrite.
  - **Deletes work on import-written copper** — the layout view's delete
    planner only parsed loose `const routeN = new TrackBuilder(…)` chains,
    so a project whose routing is entirely import-generated (`track_NET.push(
typecad.track({ net }).from(…).to(…));`, including the no-options
    `typecad.track()` form unnamed nets get) reported "no TrackBuilder routes
    in source" and stranded every deleted trace. Push chains now parse
    alongside loose ones: matched links drop from the statement, middle
    breaks split it into two pushes on the same array, emptied statements
    vanish (the array and its `...spread` stay — an emptied array adds
    nothing, and the import's regen tidies the rest), a trailing via rides
    only the half that still ends at the chain's end, and via-kind deletes
    keep their established truncation semantics. The duplicate-absorption,
    near-source drift tagging, and insert-corridor guards all see push
    copper too. Verified by replaying a real rd_skeleton delete against
    mod-ec.ts: the exact skipped segment from the user report now applies
    as one surgical statement removal that still parses.
  - **One routing owner per board** (width-change incident) — with routing
    statements in more than one file (the entry's per-net arrays AND the
    sidecar's loose builders), the import regenerated EACH from the full
    board IR, so every trace existed twice at two widths and the wider copy
    painted over the narrower in the gerbers — a narrowed trace looked
    unchanged no matter what the source said. The import now consolidates:
    the create()-owning routing file is regenerated from the board, every
    other routing file's section is emptied ("absorbed into …") — but only
    when the owner's regeneration actually happened or it was already in
    sync; a refused owner (unsupported constructs, no/multiple create())
    leaves every copy in place with a note, so copper is never deleted
    without its replacement — the orphaned `...syncTracks` spread leaves
    create() with the emptied sections, and
    buildTrackChains collapses exact-duplicate board segments (same
    net/layer/geometry, 1 nm-quantized, first copy wins) so an
    already-doubled board heals in one pass. Round-trips converge; the
    layout view re-uses the sidecar for its next insert as before.
  - **Pad labels can no longer lag the board** (moved-component incident) —
    `build/<board>_pads.json` (the pin numbers/net names the viewer bakes
    over the copper) was written only by the build's board write, so a
    KiCad-side move that flowed through sync without a full rebuild left it
    one revision behind: the copper moved (gerbers re-export from the
    board) while the labels stayed at the old position — observed on C1,
    and earlier on U1. The manifest is now treated as the derived artifact
    it is: `export gerbers` (the step that runs on every viewer
    regeneration) and the viewer build itself heal it from the board file
    whenever it is missing or older, and the write is temp-file + rename
    with retries so a reader holding the file open on Windows cannot strand
    the previous revision. rd_skeleton's stale manifest was healed and the
    regenerated viewer verified aligned.

- 081813f: `materializeZoneFills()` now fills zones with the native engine instead of
  round-tripping the board through `kicad-cli pcb drc --refill-zones
--save-board` — no KiCad install needed, and the written `filled_polygon`
  blocks come from the same fill engine the native DRC, gerber export and
  docgen images use, so the saved fills and every consumer agree. The refill
  core (`refillZoneFills`) moved from the export command into
  `pcb/pcb_zone_fill.ts` and is re-exported from the export command for
  existing importers. The `KICAD_NOT_AVAILABLE=1` escape hatch is retired —
  there is no external dependency left to escape from.

### Patch Changes

- 7f87876: Gerber export: chamfered roundrect pads now plot their chamfers. Pads carrying `(chamfer …)`/`(chamfer_ratio …)` previously plotted as plain squares (or plain rounded rects), losing the corner cuts in the fabrication output — the castellated header's inner pads are the visible example. The writer now emits the same polygon aperture KiCad does (45° cuts measured from the corner, plain corners rounded at 4 segments per 90°, the pad angle carried in the macro's rotation parameter), and FreePoly macros match KiCad's emission byte-for-byte (closing-vertex repeat in the count, one macro reused across rotations). Also fixes an off-by-one in the FreePoly polygon vertex count.
- c54d344: Fixes `check` silently skipping ERC ("– erc / No .kicad_sch found") when
  build/ holds more than one schematic. `findBuildFile` only returns a file
  when exactly one matches, so stray `.kicad_sch` files left in build/ by
  earlier projects made the ERC step report "No .kicad_sch found" even though
  the project's schematic was right there. The schematic is now resolved the
  same way the board is: anchored on the build manifest's board stem
  (`mod-ec.kicad_pcb` → `mod-ec.kicad_sch`), falling back to the lone
  `.kicad_sch` only without a board to anchor on — and when several
  schematics remain ambiguous, the message says so instead of claiming none
  were found. `diagnostics` picks its schematic the same way.
- c54d344: Fixes `check` (and `query`/`report`) reporting QFN exposed-pad paste splits
  as unconnected pads — the unnamed `*.Paste`-only squares KiCad footprints
  place over the thermal pad to split its stencil opening carry `(net 0 "")`
  and no pad name by design, but the unconnected-pad analysis counted every
  net-less pad, printing `U1. has no net` nine times for a single QFN-32
  (reference + empty pad name). Pads with no copper layer (paste/mask-only
  apertures) are now excluded from the unconnected-pad list and summary count;
  genuinely unconnected copper pads are still reported.
- c54d344: Every file typeCAD writes is now marked `(generator "typeCAD/pcb")` with
  `(generator_version …)` auto-numbered from the package's real version, so
  any board, schematic, or library file can be traced to the exact writer
  build. Previously boards and schematics claimed `generator "typecad"` with
  a hardcoded `0.1.0`, and the new-project template even claimed `pcbnew`,
  which the KiCad file spec reserves for KiCad itself.

  - Board writer, schematic renderer, footprint upgrades (the project's local
    `build/lib` copies), symbol-library merges, and the create-project
    template all stamp the shared identity.
  - A rebuild re-stamps the board even when kicad-cli resaves (zone fills,
    DRC) had rewritten the marker to `pcbnew` — the regenerated file is our
    output, and preserving a stale pcbnew marker misattributed every rebuild
    to KiCad.
  - Local library footprints carrying the legacy `typecad` marker are
    re-stamped in place; upstream KiCad footprints keep their own generator
    (they are not ours to claim).
  - `generatorVersion()` resolves from package.json at runtime (src/ and
    dist/ layouts both work), falling back to `0.0.0-dev` only when the
    manifest is unreadable.

- aea99fd: Import audit — `typecad-pcb import` fixes found by walking the full pipeline
  against the rd_skeleton demo board (KiCad 9/10 writer plus kicad-cli resave
  forms):

  - `acorn-typescript` is now a real dependency. It was imported optionally and
    never installed, so every TypeScript source with type annotations failed to
    parse and `--apply` matched 0 components on any real project.
  - Segments and vias keep their net names: the inline `(net "NAME")` form the
    kicad-cli zone-fill resave writes was silently dropped, so all 120 demo
    tracks imported as `unnamed_Track`. Tracks now group per net
    (`track_VCC.push(typecad.track({ net: 'VCC' })…)`), chain vias match by
    net identity, and standalone vias carry their net.
  - Zones: the singular `(layer "F.Cu")` form produced `layers: []` in the
    generated code; `*.Cu` / `F&B.Cu` wildcards now expand against the stackup
    copper count; `(arc (start) (mid) (end))` vertices inside zone outlines are
    tessellated into polygon points; `arc_segments` fills parse and emit.
  - Apply mode: an omitted `rotation` prop no longer reports a phantom move
    (unset means 0, and angles compare modulo 360, so -90 ≡ 270); rotation and
    side are inserted into the pcb object when missing instead of being
    silently dropped.
  - Matching: passives (Resistor/Capacitor without an explicit footprint) match
    by exact reference; a stale Code-property file path (renamed source file)
    falls back to searching the variable name; anonymous components can no
    longer be bound to two different references; text changes scan every
    project source file, not just files that declare footprints.
  - Hidden board text (`(hide yes)`) imports as `hide: true` instead of
    resurrecting as visible silkscreen.
  - Elements the importer does not consume — dimensions, Edge.Cuts bezier
    curves, zones embedded in footprints — are now reported with counts
    instead of vanishing silently.

- 7f87876: Layout apply: a dragged Reference/Value/fab label now sticks for components whose layout lives in a standalone `var.referenceLayout = {…}` (etc.) statement — the shape every KiCad-imported project uses. The apply only knew the Component constructor's inline option, so it appended a constructor `referenceLayout:` that the later statement silently overrode at runtime and the rebuild reverted the drag. The label edit now rewrites the winning statement (keeping its unmanaged style keys) and leaves the constructor alone when a statement exists.
- 7f87876: Viewer sidebar layer list shows layer names, not file names. Rows read
  `F_Cu`, `B_Silkscreen`, `In1_Cu`, `Edge_Cuts`, `Drill` instead of
  `board-F_Cu.gtl`-style file names — the board-name prefix and the file
  extension are dropped per file (the old shortener only stripped a prefix
  shared by EVERY file, so a gerbers directory carrying one stray file from
  another board — or a single-layer viewer — showed full file names and the
  layer truncated out of view). The full file name stays on the row as its
  tooltip, and drills with no layer token in their name display their
  detected kind (`Drill` / `NPTH Drill`).
- 7f87876: Pad manifest: net names now survive every `(net …)` reference form a board can carry. The manifest read only the pad node's inline name — KiCad's `(net N "name")` — so a board last saved in kicad-cli's reserialized name-only form (`(net "name")`) or the legacy coded form (`(net N)`, names only in the top-level table) produced a manifest with pin numbers but no net names: the viewer's pad labels dropped to numbers-only after such a sync, until a full typeCAD rebuild rewrote the inline names. Both writers (build and the export/viewer-path healer) now resolve through the board's net table, so labels keep their net names regardless of which tool saved the board last.
- 7f87876: Hardening fixes from the post-merge review of the sync-sidecar work:

  - **Viewer script-block escapes actually escape** — the `routes` and
    `layout-comps` JSON blocks in the generated viewer page ran a no-op
    `.replace(/</g, '<')` (the other eight blocks correctly emit
    `\u003c`), so board-derived net names or values containing
    `</script>` could break out of the `<script type="application/json">`
    block. Both now escape like their siblings.
  - **Import apply counts only what it wrote** — a pending footprint or
    layout change whose target statement vanished between compute and
    apply (the file drifted) was silently dropped while still being
    counted as applied. It is now reported as a note and excluded from
    the applied count, in both the auto and interactive passes.
  - **Pads manifest temp files never strand** — the atomic manifest write
    retried every rename error class (a read-only directory does not heal
    by waiting) and left `<name>_pads.json.tmp` behind when the final
    rename failed; retries are now limited to transient Windows lock
    errors and the temp is unlinked on failure. The from-board refresh
    also re-stats the board after reading, so a write racing the refresh
    can no longer mint a manifest that suppresses the next heal.
  - **Zone-refill temp board is cleaned up** — exporting gerbers with
    unfilled zones wrote a filled copy of the board into the system temp
    dir and never removed it (one leaked board per export); it is deleted
    once the plots are written.
  - **Layout view matches every Component declaration shape** — the
    constructor scan required a bare `const x = new Component(…)`; a
    type-annotated declaration (`const u1: Component = new Component(…)`,
    annotated or exported) silently skipped value/rename/label edits.
    Annotations and non-declaring usages both match again, and the label
    statement search still keys off the declaring variable only when one
    exists.

- 7f87876: Layout-view routing fixes for net-less copper, found on the castellated J2 pads (two pads per pin showing a permanent 1-1 ratsnest wire):

  - Routes started with X inherit the pad's net even when net-less trace ink (or a selected segment) sits on the pad — previously the press resolved to the net-less copper and every route committed without a net, which the ratsnest can't credit and the DRC reports as a short.
  - DRC marker halos no longer intercept presses. The 11-px halo sits exactly on the violating copper, so every flagged pad became unclickable/unroutable — a trap that bred more net-less routes (the small center pip keeps the hover tooltip).

- 6a713db: Fixes multi-unit KiCad symbols rendering as a single unit in generated
  schematics. Components like the TS3A24159 dual switch (switch A / switch B /
  power units) placed only unit 1, so the sheet showed one switch while units
  2+ were never drawn — and because their pin lookup ignored units, nets on
  those pins dropped labels at coordinates that coincided with unit 1's pins
  or floated in empty space, visually merging distinct nets and hiding the
  pins from ERC entirely. The renderer now places one `(symbol ...)` instance
  per pin-carrying unit (same reference, KiCad's own file shape, top-level
  `(unit N)` only past the first), spaced by the widest unit's bounding box,
  and resolves every net label against the owning unit's origin. Verified
  against a TS3A24159DRC design: all three units place, DRIVE/REF_SW/CH2_COM
  labels separate from PROBE_1/RANGE_SW/CH1_NO, and `kicad-cli sch erc` now
  reports the previously invisible pins 9 and 11.
- 081813f: Building no longer warns when a component's `sch` object doesn't specify a
  placement. Components without `sch` coordinates (or with missing
  `x`/`y`/`rotation`) are still defaulted and placed deterministically — the
  same schematic output, now silently. The per-component "missing schematic
  placement data" warnings and the one-line "placed deterministically"
  summary are gone.
- c54d344: Fixes the infinite `sync`/viewer storm ("exporting gerbers… / viewer refresh
  failed: Cannot read properties of null (reading 'raw')" repeating forever) —
  two independent feedback loops, both closed:

  - **arc_segments ping-pong (the loop driver)** — the viewer's gerber export
    runs kicad-cli's zone refill, which resaves the board and DROPS
    `(arc_segments 16)` (KiCad's default). The importer then re-added
    `arcSegments: 16` to the source, the next build re-wrote it to the board,
    and the next export dropped it again — source and board chasing each
    other forever, every step firing every watcher in the workspace,
    including a running `import --watch`. The parser now reads an absent
    `arc_segments` as the default 16 and the emitter skips the default, so a
    gerber export leaves the round-trip exactly in sync.
  - **Viewer failure storm (the amplifier)** — a `generate()` that threw fell
    into the same 4s retry used for mid-build settles, and watcher events
    (the export pipeline touching build/) re-ran the failing export too; each
    retry's kicad-cli board resave re-fired the watchers again. Failures now
    back off exponentially (30s → 60s → 5min cap, reset on success), and
    watcher events against the unchanged failed board are ignored — only a
    genuinely new board revision or the ladder's own scheduled retry re-runs.
  - **null.raw crash hardened** — the gerber exporter's non-null assertions
    (`child('at')!`, `child('center')!`, …) crashed with `Cannot read
properties of null (reading 'raw')` on structurally partial board items
    (a pad without `at`, a primitive without `center`); every site now skips
    the malformed item instead of crashing the whole export.
  - **Malformed-footprint guard** — the board generator silently placed pads
    without an `(at x y)` at the footprint origin, which collapsed a corrupted
    library footprint into one stacked copper/silk blob. A pad missing its
    position now fails the build naming the footprint file and the re-add
    command, instead of shipping wrong copper.

- 7f87876: Layout view: silk/fab text inside a component body is clickable, selectable, and draggable again. Three things stacked to swallow those presses, each fixed:

  - The layout overlay's invisible part handles sit above every layer, and courtyard/mask ink renders above silk — a part drag now first walks the hit-test stack beneath the overlay and hands the press to a claimed text stroke (`data-text`) when one is under the pointer. Shift still forces the part grab, and double-clicks delegate the same way (text edits the text, not the part value).
  - Drill holes render above silk/fab with no handler of their own — they are the absence of material, so they now carry `pointer-events="none"` and presses pass through to the ink beneath.
  - Unattributed ink with no handler (the last fallthrough before box-select) also delegates to a claimed text beneath it, as a safety net.

  `elementsFromPoint` is guarded for non-browser harnesses (jsdom), where it does not exist.

- 081813f: The git-diff and documentation viewers are branded `typeCAD/pcb` (headers,
  page titles, and "Generated by" credits), each linking to
  https://www.typecad.dev/pcb, and the side-by-side view mode is removed from the diff viewer (Diff Only, Overlay, Onion Skin and Swipe remain).
- 7f87876: Viewer: **Flip Board** — a toolbar toggle that views the board from the
  back. The gerber stack gains a horizontal mirror (`#yflip` goes from
  `scale(1,-1)` to `scale(-1,-1)`, a 180° turn in gerber space) and the
  viewBox mirrors with it, so back-side copper and silk — plotted mirrored,
  read from the top — read the right way round while the front side reads
  mirrored, exactly like the physical board's back. `gerberAt` and the
  board-coordinate readouts invert the same mirror, so every gesture keeps
  editing the geometry it points at while flipped: part grabs and nudges,
  routing, segment/via deletes, probing, measuring, the DRC markers, the
  ratsnest, and the status-bar coordinates all stay consistent (the move
  deltas sent to source are computed in board space and remain correct — an
  edit made in the flipped view lands where the flipped view showed it).
  The toggle arms its button while active and persists per board in the
  viewer store alongside the viewport, so a rebuild reloads still flipped.
  Flipping also corrects the pan/zoom window (`tx` negates with the viewBox
  swap — the window describes the old x range, and without the correction a
  zoomed view shows empty space past the mirrored board), mirrors the
  outside-the-stack overlays (DRC markers and the cross-probe outlines via a
  group x-mirror; the measuring ruler negates x in its own math so its text
  label stays readable), and re-swaps the pad labels' upright counter-flip
  so they don't render mirrored while flipped. The screen→board converters
  invert exactly the added mirror — x only: the base y-flip is present in
  both states, so gestures (marquee select, part grabs, routing, deletes,
  probes, rulers) and the coordinate readout track the pointer 1:1 while
  flipped. Sessions that drew with the broken converters could commit an
  interactive route at mirrored coordinates; an unapplied route like that
  used to restore as a ghost via/trace far off-board forever (its delete
  always reporting "matched no source route"). Restoring pending routes now
  drops any whose geometry lies outside the board's own extent — the same
  stale-state pruning pending deletes already had — and re-persists the
  pruned state so the dead entries leave storage instead of re-arriving on
  every load.
- 7f87876: Gerber viewer + import fixes found on the castellated-header demo board:

  - Viewer: macro outline (primitive 4) rotation is now read from the last parameter instead of an index derived from the declared vertex count — KiCad counts closing-vertex repeats into that count (and lists extras), so the old index landed on a coordinate (e.g. −0.6 read as degrees), silently unrotating mirrored/moved pads and warping the polygon by fractions of a degree. A pad rotated 180° (the right-edge castellated header) rendered with its chamfers pointing off-board; explicit closing repeats are also dropped from the parsed point list.
  - Import apply: loose `const routeN = new TrackBuilder(...)` chains (written by the viewer's apply bridge beside create()) are now part of the routing section the regeneration owns — their statements and create() arguments are removed in the same change as the arrays are regenerated from the board. Left in place, every track they carried would exist twice after the next build (the golden-corpus sync test caught exactly that state).

## 1.0.0-alpha.8

### Minor Changes

- 2ce39f0: `typecad-pcb search <query> --footprint` searches installed KiCad footprint
  libraries instead of symbol libraries — symbols alone can't answer "what
  pads does this part have". Results list `library:footprint` ids with their
  pad numbers (and the description when the library carries one), ready to
  paste into `new Component({ footprint: '...' })`. `--limit` caps the list
  (default 10 for footprint searches), and `--json` returns the same results
  as data for scripts and agents.
- 2ce39f0: The autorouter screens every routed pin for escape-channel feasibility
  before any search work starts. A pad flanked by neighbours on both sides
  (a QFP/SOIC/SOT row) must escape through the corridor between them, and a
  trace of width W at clearance C needs W + 2×C of corridor to do it. When
  the corridor can't fit that, each pad gets one line with the actual
  numbers — `U3.7 must escape through a 0.31mm corridor between its
neighbouring pads, but a 0.25mm trace at 0.2mm clearance needs 0.65mm` —
  plus the fix (a narrower net class for that net, or necking the trace near
  the part), instead of a wall of DRC clearance violations after the build.
  Pads open on one side (chip passives, row ends) are never flagged, and
  same-net flanks don't count.
- 2d86f24: The gerber/layout views have a house layer theme. `typecad` is built from the
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

- 2bf1a7c: The scaffolded starter is now a complete circuit instead of a lone resistor: a 3 V CR2450 coin cell (Keystone 3008 holder, `Device:Battery_Cell` symbol, `BT` prefix) lights a red 0603 LED through a 150 Ω resistor, wired over named nets `+BATT`/`led_a`/`GND` with a `Power` source for simulation. A fresh project therefore exercises every board-view view on first open — real nets to drag and route in the layout view, and an ngspice deck that solves (3 V rail, ~8.4 mA). The starter's footer comments and the scaffolded `AGENTS.md` document the new `simulate` script, and `create` adds it to `hw/package.json`.

  The bundled VS Code extension now runs `typecad-pcb simulate` itself during viewer generation — best-effort, only when `build/<board>_op.json` is missing or older than the netlist — so the ngspice view has hover voltages/currents without a manual simulate step (previously nothing in the build or export pipeline produced the op file). A failure (ngspice not installed, entry error) only logs and skips; the viewer still generates. Net names matter for the auto power symbols: nets named like KiCad's power library entries (`GND`, `+BATT`) get schematic power glyphs, so the starter uses those.

### Patch Changes

- 21e9d51: The pads manifest (`build/<board>_pads.json` — per-pad world position,
  extents, copper layers, pin numbers, and net names measured from the final
  board) is now announced at info level and listed in the build output
  summary instead of being written silently at debug level. The pcb-placement
  skill doc now points placement work at it so measured pad geometry is used
  over datasheet estimates.
- 2ce39f0: `typecad-pcb create --name=agent-demo` no longer refuses to run: hyphens,
  spaces and other punctuation fold to underscores ("agent-demo" becomes
  `agent_demo`), with a yellow note when the name changed. The interactive
  prompt normalizes the same way, so pasting a name with spaces no longer
  bounces. A name is only rejected when nothing identifier-like remains.
- 2bf1a7c: `typecad-pcb create` now installs the firmware dependencies itself when the
  HAL scaffold's own install step didn't take (`fw/package.json` present but
  no `node_modules`). hal ≤ 1.0.0-alpha.20 cannot spawn npm on Windows, so a
  fresh project opened with a `fw/` that VS Code's Vitest extension
  immediately flagged ("vitest not found in fw folder") until `npm install`
  was run there by hand.
- 2ce39f0: The board viewer now renders inner copper layers. KiCad plots them as
  `.g1`–`.g30`, which the gerber extension allowlist didn't carry, so any
  4+-layer board silently lost every layer between front and back copper.
  Inner layers now join the stack in the viewer and pick up theme colors
  like the outer ones.
- 2bf1a7c: The layout view's apply bridge now heals a create() argument drift instead
  of letting it silently delete traces. The route rewrite stages maintain
  "every declared TrackBuilder is passed to typecad.create()" one edit at a
  time; a name that slipped through (seen once: an untouched route's
  argument dropped while its declaration survived a multi-route rewrite)
  made the route build nothing — its copper vanished from the board and the
  viewer with nothing in the log. Any route/delete apply now re-adds every
  declared-but-uncreated route name to create() as a final pass.
- 2bf1a7c: The layout view's apply bridge now writes route edits to the file the
  build actually runs. It previously planned against the first src file
  carrying a `typecad.create(` call — with a stray copy in src/ (an old
  duplicate with its own create()), every drawn route landed in the dead
  copy: the source looked edited, the board rebuilt without the new traces,
  and nothing reported the mismatch (one board lost three drawn routes this
  way; the copy also accumulated syntactic damage from rewrites aimed at
  its odd formatting). The planner now resolves the entry file from
  typecad.conf.ts and orders it first, so rewrites go where the build
  reads; the stale-copy capture is gone.
- 2bf1a7c: The layout view's layer-edit preview now paints the target layer's own
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
- 2ce39f0: Vias placed by one edge of a multi-pin net are now visible to the router
  when it places the rest of the net: they're appended to a shared
  hole-to-hole list (drill edges need clearance even between same-net vias)
  and rasterized into the routing grid as net-aware pads, so later edges
  connect through their own vias instead of stacking a second via a fraction
  of a millimetre away or routing tracks blind through the first one. Vias
  already staged on the board before routing starts are included, and rip-up
  rollbacks re-snapshot the list for the next attempt.
- 2bf1a7c: The VS Code Board viewer no longer keeps serving a page built by an older
  viewer after the viewer tooling itself updates. The panel cached its
  generated HTML keyed on the board's mtime alone, so a `gerber-viewer`
  rebuild (or any out-of-band regeneration of `build/serve/viewer.html`)
  that didn't touch the board left every already-open workspace serving the
  pre-update page — with `retainContextWhenHidden` keeping that stale page
  alive across tab switches, a rendering fix could land and the user would
  still see the old behavior until the board next changed or the window
  reloaded. `show()` and the watcher refresh now adopt an on-disk viewer
  page that is newer than the served one and still describes the current
  board revision (the same freshness rule the panel-restore fast path
  already used), swapping it in without rerunning the export pipeline, and
  never while a generation is mid-write. Every generated page now carries a
  `tc-viewer-build` stamp, and the extension logs it on each page
  assignment, so the output channel always answers "which page build is
  this webview running" — including "pre-stamp page" for pages older than
  the stamp itself.
- 2bf1a7c: the thermal (Copper ΔT) view no longer paints its relatively-hottest trace
  full-scale white on a thermally quiet board: the auto ramp is now floored at
  1 °C, so a board whose every rise is millidegrees renders all-cold instead of
  clamping a 3.7 m°C hairline to the white end of the stops while the hover
  readout says "+0.0°C". The hover rise itself now prints in engineering
  notation ("trace +3.71m°C ≈ 25.0°C"), so the color scale and the status text
  can never disagree about the same trace. The "color by margin" path is
  unchanged — a user-specified allowed rise still sets the scale exactly.
- 2ce39f0: Schematic export is quieter about the code-only workflow. Components
  created without `sch` coordinates (which the renderer places
  deterministically) are now reported as one summary line naming them all,
  instead of a warning per component that trained you to ignore the log. And
  when a power net has no matching KiCad power symbol, the warning says what
  that means — the net still connects via labels, but the schematic shows no
  rail glyph and ERC cannot verify it — and suggests real rails the power
  library carries (`+3V3` | `+5V` | `GND` | …) instead of a bare "not
  found".
- 2ce39f0: The measure tool owns its clicks. Ruler points now land on parts, pads and
  copper — the viewer's grab handlers used to swallow the pointer press, so
  a ruler couldn't start there; the tool now captures the press at the
  window before any of them see it. Two quick points on one spot are a
  double-click to the browser: while measuring, that no longer opens the
  part value editor, and in VS Code it no longer jumps the editor to the
  component's source or clears the saved highlight — the probe client stands
  down while the ruler is armed. Also in VS Code, `Build Board` leaves the
  command palette: the viewer builds the board on open, so an explicit
  rebuild lives where the intent is — the ▶ Build Board lens, the status
  chip, and the stale-board prompts.
- 2ce39f0: `typecad-pcb add-component --folder=./src` now writes the component into
  that directory instead of nesting `src/src/` beneath it, and the "use it
  with" hint prints the import path relative to where the command ran
  (`./src/AP2112K_3_3`, not a hardcoded `./AP2112K_3_3` that only works from
  inside src).
- 21e9d51: kicad2typecad: axis-aligned rectangular zones and keepouts now import as
  `x/y/width/height` instead of a 4-point polygon, matching the rect form the
  zone/keepout docs teach (same collapse the outline importer already did for
  `gr_rect`). Non-rectangular polygons still import as explicit `points`.
  The zone skill doc gained a points-form example and a geometry note.
- 2bf1a7c: The layout view's trace-properties dialog (E) can no longer write a width
  below the board's own minimum. The `[`/`]` width keys already stopped at
  the rules island's `minTrackWidthMm`, but the dialog clamped at a
  hardcoded 0.05 mm floor — an under-minimum value typed there rode the
  apply bridge into source verbatim (seen as a 0.05 mm trace that rendered
  sub-pixel in the viewer: "my trace vanished after the layer change").
  Both the dialog and the shared resize path now floor at the rules
  minimum, and the dialog's hint shows it (`min 0.2 mm` when the board
  carries one).
- 2bf1a7c: Board viewer: the layout view now derives from the gerbers' X2 pad attributes alone, so a fresh board with nothing connected still gets it — previously the overlay (and the Layout dropdown entry) only appeared when the netlist carried at least one pad→net mapping, which meant the very project `create` scaffolds opened without a layout view. Ratsnest wires are now the layout view's alone: the plain gerber stack renders the fabricated board without them (they had been drawn into every view that renders the gerbers, including the viewer's first open in gerber mode). Routing keys and drags were already layout-gated, so no interaction lost them.
- 2bf1a7c: Selecting traces in the layout view no longer needs pixel-perfect aim.
  The clickable corridor of each segment now carries round linecaps — the
  visible ink bulges a half-width past each endpoint in round caps, and a
  butt-capped corridor left the dangling end tips unclickable. And a press
  that lands on nothing interactive now captures the nearest segment within
  ~9 px: tiny cleanup fragments (a 0.2 mm leftover stub's whole clickable
  area was a few pixels) and the air beside a thin trace both select the
  trace instead of falling through to deselect. Presses on parts, pads, or
  near a dangling end (the route-start arm owns those) are untouched, and a
  click in genuinely empty board space still clears the selection.
- 2ce39f0: `typecad-pcb doctor` checks dependencies by resolving them the way an
  `import` would, instead of looking for a nested `node_modules/<dep>`
  directory. npm workspaces and parent-folder installs — where the project
  itself has no `node_modules` — no longer fail the node_modules and
  core-deps checks on setups that work perfectly.
- 21e9d51: kicad2typecad: imported TrackBuilder chains now carry their net names.
  Named nets used to survive only as `// Net:` comments and variable names —
  the generated `typecad.track().from(...)` calls were electrically
  anonymous, forcing re-annotation of every imported chain by coordinate
  matching. The importer now emits `typecad.track({ net: 'GND' }).from(...)`
  for named nets (vias inherit the net from the builder), so copper imports
  round-trip with their connectivity intact.

## 1.0.0-alpha.7

### Patch Changes

- 2073522: Fix `create` starving the spawned HAL wizard of console input on Windows. The interactive branch prompted with `@inquirer/prompts` and then spawned `npx -y @typecad/hal@latest create` via `execFileSync('cmd.exe', …, { stdio: 'inherit' })`; an @inquirer raw-mode console reader cannot be fully stopped after prompting, and the blocked event loop of a synchronous exec keeps libuv draining the console input buffer — so the inherited-stdio HAL child (any version) never received a keystroke and its board picker sat unresponsive. The three questions now use plain `readline/promises` behind a drop-proof line queue (also fixes piped-stdin answer sheets being partially discarded), and the HAL step spawns asynchronously and awaits the child. Verified end-to-end on a real console via WriteConsoleInput injection: name → hal → git → board filter → select → starter → both hw/ and fw/ scaffold.

## 1.0.0-alpha.6

### Minor Changes

- 8ae4765: The board viewer gains a fifth view — **Copper ΔT** — answering "given this operating point, where is the layout thermally stressed?":

  - Wires are colored by estimated temperature rise from the inverted IPC-2221 formula — the same constants the `powerInfo` width sizer uses — applied to each wire's solved current (the flow graph's per-edge value) and its real gerber width. A wire sized for its current reads exactly its rated rise; a neck-down carrying the same amps lights up.
  - Zone pours get a 2D sheet-resistance solve over the actual fill polygon (0.6 mm raster, red-black SOR, 1.724e-8 Ω·m at 35 µm), driven by the per-pad current injections — so heating appears where the copper truly funnels, and stitch-via bottlenecks show up as hot rings. Pours render as a clipped heat image; confidence is visually distinct from the per-wire computation.
  - The board renders near-monochrome graphite with an incandescent ramp (muted copper → warm → orange → near-white) instead of the electrical purple ramp; zero-current copper stays inert. Controls: ambient temperature (ΔT → absolute), allowed rise, and a color-by-margin mode; the legend shows the board's own ΔT range.
  - Copper-loss estimate only, and labeled as such: external-layer constants throughout, no component self-heating, no enclosure or lateral spreading. In parallel with a pour, a routed wire's share of the current is not modeled (the flow graph sends pad current along wires; the pour solve spreads the same injections over the sheet).

  Known follow-ups: per-via currents from the coupled two-layer solve, inner-layer constants from the stackup, and a hover report card (width/copper/current/resistance/loss/ΔT/margin).

  Via modeling: netted ref-less copper pads are vias — their current is an equal share of the net's total injection (stated in the legend; a coupled two-layer pour solve would give the true split), rated by the inverted IPC-2152 barrel formula on the drill diameter found in the drill marks, and their pads color like wires so a stressed via ring reads at a glance. Library-side, `TrackBuilder.via()` now inherits the builder's `net` option (vias previously landed un-netted) and the powerInfo solve is clamped to the board's fabrication floors — a modest current at 35 µm plating solved to sub-fab drills like 0.072 mm.

  Layer indication: the schematic-family renders (ngspice + Copper ΔT views) now include EVERY copper layer instead of only the front — the top layer draws solid as-is, the second layer as a thin centerline through its traces, the third as centerline plus one edge line, the fourth as centerline plus the other edge (deeper layers fall back to centerlines; out of scope for now). Real trace widths ride in a `data-w` attribute so the flow/thermal models use true geometry regardless of the visible stroke, and via counting dedupes the per-layer flashes.

  The board (FR4) itself joins the solve: a stacked two-layer steady-state model (1.2 mm raster) where every copper loss — wire I²R, via barrels, pour J²·Rs — heats the laminate, conducted laterally by copper/FR4, through the core, and convected from both faces. It renders as one continuous translucent field over the entire board (no trace gap — copper, pours and components draw above it), painted on a 3×-fine grid with bilinear sampling of the solved field; the legend reports the board's own ΔT.

  Component self-heating joins the board field: each device's solved watts (from the OP data the ngspice view already uses) are injected into the FR4 solve at its pads, split across its pins and spread over each pad's footprint. Since the model ignores component-surface convection, all of a part's dissipation conducts in through its leads — an upper bound, and now stated that way in the legend ("board ≈ +N°C (FR4 + parts)"). Accuracy companions in the same pass: via barrels now conduct heat between the two solved layers (previously the layers coupled only through the FR4 core — a via is ~15× a cell's core conductance), component pads count as in-plane copper, and the via copper-loss conductance was corrected to the electrical barrel value (σ·π·d·t/L ≈ 600 S at a 0.15 mm drill — the old constant used the thermal conductivity with a mm/m slip, overstating via I²R heat ~145×).

  Hover readout: in the Copper ΔT view the status bar now reports the temperature under the cursor — the trace's or via's own IPC rise when over copper (both via flashes of a barrel answer), and the bilinearly-sampled FR4 field everywhere else, each as rise-plus-absolute at the ambient setting.

- 7417cec: Native gerber export (Phase 1): new `gerber_export` module plots copper layers from a `.kicad_pcb` without kicad-cli. Byte-parity with kicad-cli 10.0.0 output on the `features` golden fixture (all 4 copper layers) and structural parity on `rd_skeleton` (pours equal within KiCad refill variance). Encodes the full observed KiCad convention set: aperture macros (RoundRect/HorizOval/RotRect/Outline4P/FreePoly), X2 object/aperture attributes, absolute pad angles, via/track/NPTH emission rules, and saved zone fills. Not yet wired into `typecad-pcb export` — parity harness lives in `gerber_spec/tools/parity.ts`.
- 7417cec: Native gerber export (Phase 2): graphics layers — Edge.Cuts, mask, paste, silkscreen geometry, fab geometry, courtyard, adhesive, margin and user layers now plot natively from `.kicad_pcb` board items, on top of the Phase 1 copper writer. Parity with kicad-cli 10.0.0 goldens: every non-text layer byte-exact on both fixtures (mask/paste openings, edge profiles with CW-normalized arcs, courtyard `TO.C` groups, filled-circle fat-pen rendering, canonicalized rects); silk/fab text strokes remain Phase 4. Encoded conventions include the quirky user-layer `FileFunction`s (`OtherDrawing,Comment`, `Other,ECO1`, …), gr-before-fp item ordering, and filled-poly stroke+region rendering.
- 7417cec: Native gerber export (Phase 3): Excellon drill and `.gbrjob` job files now plot natively, and `typecad-pcb export gerbers --native` writes the complete fabrication set (26+ gerbers, `.drl`, `-job.gbrjob`) without kicad-cli. Byte-parity with kicad-cli 10.0.0 goldens on both fixtures. Reverse-engineered and encoded KiCad's drill conventions: sequential tool numbering (vias → component drills → NPTH), a two-pass body (all plain hits, then routed `G85` slots per tool), slot axes rotating with the position matrix, and the exact coordinate formatter — digit-wise nm parsing with `nm × 1e-6` double arithmetic and round-half-even printing, verified against 16 probe/golden data points. Job files synthesize the default stackup for boards without one and derive Size/DesignRules from board geometry.
- 7417cec: Native gerber export (Phase 4): text rendering. Silkscreen/fab/user-layer text now plots natively via KiCad's built-in stroke font (newstroke glyph data embedded for U+0020–U+00FF, decoded with the exact `value + 'R'` / `FONT_OFFSET −8` / `1/21` conventions) and TTF texts render from the board's own `render_cache` polygons as filled regions. Text placement replicates the probe-verified KiCad 10 rules: file `(size H W)` axis order, cap-middle justification offsets (`sy − 0.052·th + max(0, 0.013·(0.8·sy − w))` base with the 1.17-height fudge), negated rotation for the internal y-down frame, nm-truncating point conversion, per-segment MoveTo/LineTo emission, hidden-property skipping (symbol-valued `hide yes`), properties-only footprint text, and the texts-before-graphics two-pass ordering with bare (attribute-free) text runs. Also: legacy `fp_text user` items render except `${REFERENCE}`/`${VALUE}`
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
- 7417cec: Native zone fill: copper pours are computed in-process with clipper-lib (Boost) — clearance from foreign pads/tracks/arcs/vias, thermal-relief spokes built analytically, edge pullback via chained Edge.Cuts outlines, keyhole-ring output that KiCad re-reads. Hatch-mode zones render as KiCad-style border rings plus 45°/135° capsule hatch lines (hatch_thickness/gap/orientation/min_hole_area honored). `typecad-pcb export gerbers` now refills declared-but-unfilled zones automatically (the --check-zones equivalent), so pour copper is never silently missing; boards with saved fills plot them unchanged. Also switches `export drill` to the native writer (--kicad escapes to the legacy plotter) and adds a permissive Hershey "futural" stroke font (public domain) replacing KiCad's GPL newstroke data for license compatibility — text layers diverge from kicad-cli goldens by design (structure still verified).
- 4b55bbb: Manual routing in the layout view: X over a highlighted pad arms a route — X over a trace arms from the trace, silently (the status line alone says where X starts), and a press within the pad-snap radius of a segment end arms there, ending the needle-threading at a 0.3 mm stub tip. The walk draws clearance-checked, corridor-hinted, via-capable tracks in 0/45/90 that actually reach the pad: 0/90 prioritized (diagonals and bends cost extra), a drag-trail interaction, placed-but-unstaged components are routing obstacles, and a pad snap finishes; V drops a via (the live layer flip actually flips), double-click commits without folding the last hop onto itself, and the rubber-band preview renders from the instant the route starts — layer ink and a start dot, no invisible anchors. Track segments are selectable on source tracks, not just interactive routes: click highlights, Delete removes (the deletions ride apply), U expands exactly one hop per press, committed and source-authored vias are first-class selectable elements, and single-segment selection names the declaring source in the status line — netless hand routes resolve their TrackBuilder declaration line. Track provenance reads at a glance: autorouter nets candy-cane stripe (RIP UP hides them, not greys) and every TrackBuilder-authored track — netted or netless — never stripes. Field hardening: the router can no longer wedge permanently (routeCancel clears state before cleanup, routeKey unwinds a half-built route on any throw), a peripheral throw no longer fails a built route, tie-in arming validates its geometry at the source, small traces route reliably (a real-coordinate sweep over the board's 12 shortest segments routes 11/12 — the last sits under a pour hatch stroke), the 1.2 mm magnetic radius applies only to empty-space presses near a dangling tip so mid-trace intent wins on small traces, walk endpoints snap to traces and via barrels like pads, via preview markers no longer leak as stuck highlights, pour clicks no longer net-dim the board, and a net-highlight cycle restores the layout view's legitimate zone subduing instead of flashing pours to full strength. TrackBuilder `from()`/`to()` accept both call styles — positional and object.
- 4b55bbb: The gerber/layout viewer's layer-theme picker vendors eight more KiCad color themes: KiCadMaxColors (MIT), Witch Hazel (Apache-2.0), and Behave Dark, Blue-Green Dark, Eagle Dark, KiCad 2020, KiCad Classic (converted from the KiCad 5 pcbnew fragment), and Nord from pointhi/kicad-color-schemes (CC0). Upstream JSONs and license notices live in `src/gerber_viewer/themes/`; the VS Code extension's Board viewer picks the new entries up automatically on the next render. The remaining pointhi themes (black-white, blue-tone, monokai, neon, solarized-dark/light, wdark, wlight) are schematic-only upstream — no board section exists to vendor.
- 4b55bbb: The layout view's arrangement surface grows real editor interactions: marquee box selection renders where you drag it (shift-click toggles members, click deselects, a single selected part collapses its highlight), Escape unselects everything, right-hold pans the board while parts move only when already selected, and the toolbar slims down (the layout hint, fab report panel, and zoom/export buttons are gone). Unrouted-net ratsnest wires show from first open, in every gerber-stack view. Every pad carries pin-number + net-name labels from the PCB model, rendered topmost; a part drag carries its labels live — the whole footprint moves as one group — and rotated parts' refdes always reads keep-upright (L→R or B→T). Pin highlight is component-style ants+brackets+tint instead of a blue circle, body-hidden pads (BGA balls) become selectable, and board presses hand keyboard focus to the svg so keys always reach it.
- 4b55bbb: The router runs against real board rules. A rules island (`build/<board>_rules.json`: min trace width, min clearance, copper-to-edge clearance, per-class width/via defaults) reaches the page when generate runs with `--rules`, and width stepping refuses to go below the floor — the readout warns. The live route carries a gray keep-out halo, the DRC clearance envelope around every drawn piece, that tints red on violation (via rings included, resized in lockstep), and copper samples inside it owe the copper-to-edge clearance to the nearest board edge. Widths come from where you'd expect: each net remembers the last width and via used, W opens the width control, `[`/`]` step the trace width (Alt for fine) and `{`/`}` the via — a via sized by explicit choice is decoupled from the trace width; otherwise the barrel tracks it, floors respected. Net-class defaults from the rules outrank the copper heuristics (regex pattern → class), I eyedrops an existing trace's width, P sizes a power net by current (IPC-2221, the same constants as the library's powerInfo sizer, ΔT 10 °C target, per-layer copper weight from the stackup), and Z solves a controlled-impedance width (Hammerstad microstrip ported verbatim from pcb_impedance.ts, clamped at a 3 mm cap). `?` toggles a legend.
- 6f0fe23: The board viewer gains a sixth view — **Layout** — a KiCad-editor-style arrangement surface over the real gerber stack: zones subdue to blueprint-faint, and every component renders as a draggable outline box (position from its pad centroid, orientation from the pad layout, body size from the footprint name — all derived from the gerbers, so it works in plain browser tabs). Dragging a component snaps to 0.5 mm (arrow keys nudge, Alt for 0.1 mm) and **rips up** its connected copper — every trace, via and pour edge on its nets, plus its pads — greying them until a rebuild lands. Trace provenance comes from a new `build/<board>_routes.json` the board writer emits (`manual` = TrackBuilder-built, `auto` = autorouter, `mixed`): TrackBuilder traces render dashed, autorouted ones solid, with legend chips. "apply & rebuild" hands the move deltas to the VS Code host (disabled in plain browser tabs), which rewrites each component's `<var>.pcb = { x, y }` literal in the board source and rebuilds the project and viewer — computed placements are skipped and reported, never mangled. **Phase 2:** R rotates the selection in 90-degree steps and apply writes the accumulated delta into the literal's `rotation` (added when absent). TrackBuilder endpoints are sticky — any `.from({ x, y })` / `.to({ x, y })` literal sitting on a moved component's ORIGINAL pads (within 0.05 mm, each literal's decimal precision preserved) translates with the part, so hand-built routes follow instead of dangling. Shift-click selects several components; `align row` snaps them to a common snapped Y, `distribute X` spaces them evenly between the outermost two (ends pinned). Arrow keys now nudge the whole selection.

  **Phase 3 guardrails:** every move re-checks live — a moved component that leaves the board outline (the gerber edge layer's bounds) or overlaps another footprint's rotated box warns in the panel and flags the offending boxes amber, and each ripped-up pad draws a thin dashed ratsnest line to the nearest surviving pad of its net, so what stays stranded until the rebuild reads at a glance. All of it clears on revert.

  **Phase 4 — the whole footprint moves:** drag handles are no longer generic boxes — each one is the component's exact footprint outline (the Fab-layer contour when the gerbers carry one, chamfers included, else the convex hull of the pad land pattern), in the layer stack alongside the copper. And a move now relocates the ENTIRE footprint like the KiCad editor: pads, mask/paste openings, fab/courtyard/silkscreen outlines and the component's drill hits all travel with the handle (live during the drag, rotation included) and nothing of the part lingers at the old spot — only the net's routing (traces/vias) rips up grey. The renderer now tags fab/courtyard/silk outline paths with `data-ref` (from `%TO.C` attributes) so every layer of a footprint is addressable, and unattributed drill circles are claimed by matching pad centers. Fab/silkscreen value and reference texts, which KiCad often plots as plain graphics without %TO.C, are claimed geometrically (within the footprint's reach) so the "1k" never stays behind. Revert puts every layer back exactly, and the pending arrangement is a layout-view-only rendering: switching to any other view (gerber, thermal, ...) restores the shared stack to the authored board, and re-entering re-applies the pending moves.

  **Silk/fab text editing:** board texts (gr_text — the `pcb.text()` API, parsed from the board file) are now editable in the layout view. Clicking the actual strokes grabs the whole text; dragging repositions it like a component (0.5 mm snap, R rotates about its anchor). Double-click edits the value in place — the strokes swap for a live preview until the rebuild re-plots real glyphs. "apply & rebuild" matches the source `.text({ ... })` literal by its authored value + anchor and rewrites value, x/y and rotation, keeping every other property (layer, font, sizes) untouched.

  **Component-owned text grabs:** a part's own silkscreen/fab ink — refdes and value strokes, outlines, courtyard — is now grabbable: clicking and dragging it moves the whole component (KiCad-style; the label is part of the footprint), and double-clicking opens an in-place editor for the component's VALUE, synced on apply to the `new Component({ … value: '…' })` constructor literal (inserted after `reference` when absent). The synthetic blue refdes labels are gone — the board's real silkscreen already names every part — and the editor double-click no longer jumps to source in the layout view (the probe reveal yields to in-place editing there).

  **Grab fix:** KiCad plots most footprint refdes/value texts with no `%TO.C` attribute at all — those strokes now bind to their nearest component (same reach the whole-footprint move claims with), so dragging the fab "1k" or the silk "R1" moves the part and double-click edits its value. Binding measures geometry through toggled-off layers too (getBBox zeroes for non-rendered elements), and listeners bind once instead of piling up on every view switch.

  **Independent label positioning:** every part's Reference and Value texts are now independent, API-addressable objects — drag the actual strokes to reposition a label anywhere (0.5 mm snap), R rotates it about its own anchor, and the component stays put. Apply converts the final world position to footprint-local coordinates against the part's final placement and writes `referenceLayout` / `valueLayout` into the `new Component({ … })` constructor (inserted after `reference` when absent) — exactly what the board writer's fp_text layout support consumes, so the rebuild lands the label where you dragged it. Label anchors are parsed from the board file (footprint `at` + property offsets, rotation-composed), strokes claim to their nearest label anchor, and double-clicking a Value label still edits the part's value; reference names stay fixed.

  **Interaction fixes:** component drags now carry their Reference/Value labels (they are footprint children — an independently dragged label stays pinned at its absolute spot instead). Label claiming is layer-scoped: dragging a silkscreen refdes can no longer swallow nearby fab strokes. Double-clicking the refdes opens a rename editor (apply rewrites `reference: '…'`, collision-guarded against existing refs), and value/reference edits hide the part's old label strokes and show a plain preview at the label's anchor. The extension applies value/rename/label edits as ONE constructor replacement — overlapping literal ranges can no longer collide inside a single apply.

  **Independent fab refdes text:** the small `${REFERENCE}` text inside a part's fab outline is now its own text object — the `Component` `fab` option positions it, so it drags and rotates independently of the value text instead of moving in tandem. Cluster claiming compares each stroke's distance to an anchor normalized by that text's own reach, so tightly-packed label clusters split correctly regardless of text size.

- 4b55bbb: DRC goes native: `typecad-pcb check` runs the in-process engine by default (`--kicad-drc` keeps kicad-cli). The copper core is built for KiCad-report parity — multi-polygon zones, oval drills, layer-aware unions, arcs/roundrect/trapezoids, annular-ring dedup, VALUE substitution, uuid collision and missing-dimension checks — and constraints come from the board's own `.kicad_pro` design settings (previously engine defaults ran, mislabeling compliant vias as undersized), with a conf-referenced JSON rules file for overrides. DFM advisories report as their own bucket — no kicad-cli counterpart, excluded from parity divergence. Tier 1: dangling tracks, hole-to-edge, aspect ratio, acid traps (structural copper only — hatched pour junctions no longer false-positive), outline integrity, silk/mask text checks, via-in-pad. Tier 2 unlocks copper slivers and mask webs through an erode-and-survive width primitive, plus courtyard overlap, thermal spoke resolution, and paste slivers. Hatched boards drop from >10 minutes under kicad-cli to ~18 s.
- 9428e2e: ngspice simulation now runs the whole circuit without per-component ceremony, headlessly, with a fully featured analysis API:

  - `simulate()` takes no arguments: passives (R/C/L/D references) are netlisted automatically — no `simulation: { include: true }` opt-ins — and power rails are discovered from the `Power` objects already attached to the circuit (voltage ratings stamped on pins). Passing `Power` objects explicitly still works and wins. `simulation: { exclude: true }` opts a component out.
  - `.tran()` no longer opens ngspice plot windows and blocks until you quit them — transient analysis runs in batch mode (`ngspice_con` on Windows) and returns the parsed `NgspiceResult` waveform, just like `.op()` (a final-value summary table replaces the per-point dump). Pass `openPlots = true` as the last argument to get the old interactive plot windows back.
  - New analyses: `.dc(source, start, stop, increment)` sweeps a named source (name one with `new Power({ …, name: 'VS' })`; auto sources are `V1`, `V2`, …), `.ac(sweep, points, fstart, fstop)` runs a small-signal frequency sweep — sources gain an `ac:` magnitude, and complex results come back with `getMagnitude` / `getDb` / `getPhaseDeg` for Bode-style checks. Sweep axes are the `v(v-sweep)` and `frequency` variables.
  - Custom devices: `simulation.model` emits a `.model` card (e.g. `'DLED D (IS=1a RS=3.3 N=1.8)'`), `simulation.subckt` + `simulation.library` instantiate `.subckt` parts from vendor-style `.lib` files (the `.include` path is rewritten relative to the generated netlist), `simulation.pinOrder` maps component pins onto model/subckt terminals, and `simulation.params` appends instance parameters (`'m=2'`, area factors, `W=/L=` …). Device cards now emit every connected pin, so multi-terminal parts work.
  - `Power` sources got `name`, `ac` (small-signal magnitude) and `waveform` (raw ngspice source expression such as `PULSE(0 5 1m 1u 1u 5m 20m)` or `SIN(0 1 1k)`).
  - Results API: `getWaveform(name)` for full data columns, `getAt(name, index)` for a point, plus `getMagnitude` / `getDb` / `getPhaseDeg` over the new `imaginary` arrays.
  - Fixed `.model` emission: the component's `value` was inserted before the model name on the device card, so modeled devices generated invalid SPICE and failed to converge. Model-based cards now reference the model name directly.
  - Fixed diode card pin order: KiCad's Device library numbers diodes `1=K` (cathode) and `2=A` (anode), but the ngspice `D` card lists anode first — every auto-netlisted diode/LED solved reverse-biased relative to its schematic symbol. The netlister now flips the pair; an explicit `simulation.pinOrder` still names the card order directly.
  - Fixed the ngspice ASCII parser to reset per data point — previously only the first point of a multi-point result was captured.
  - Per-device `.probe` vectors (`i(ref)`, `ref:power`) are now collected in every analysis mode, including headless transients.
  - Values are validated to a single token: ngspice 44+ strictly rejects extra tokens on device cards, so a `value: '10k ohm'` (or `'100nF X7R'`) would abort the whole simulation with a cryptic parser error — the netlister now warns and skips such components instead, with a message pointing at the whitespace.

  Known ngspice 44.2 strictness: named instance parameters (`area=2`, `m=2`, `off`, `temp=25`) parse fine, but _positional_ tokens on device cards (`D1 a c MODEL 2`) are rejected with "could not find a valid modelname" — use named forms in `simulation.params`.

- 9428e2e: The PCBA render gains a brand identity:

  - A signature **typecad** theme — deep teal soldermask, champagne-gold pad finish, warm-white silk — available as `--theme typecad`; the classic green stays the default.
  - Every render carries an **engineering title block** below the board: board name, date, dimensions, and a "made with typeCAD" wordmark in the theme's accent color. `--no-title-block` renders a clean image.
  - `--style blueprint` draws the board as an **engineering drawing** instead of an assembled render: plain blueprint paper, the board and component outlines in ink strokes, thin outlined pads, drill marks, and the title block in drawing ink — designators come from the fab layer (KiCad places them out of the way), with synthetic labels only when the layer set has no fab layer. Element classes stay distinct: traces keep their real widths and zone pours render as explicit diagonal hatch lines clipped to the pour outline (plain geometry — SVG pattern fills rendered as a solid wash in exported files and as arbitrary colors in third-party viewers), with a faint boundary and a faint solid underlay so copper under a pour stays legible.
  - The board viewer's switcher gains a third entry — **Blueprint view** — riding the same coordinate frame: pan/zoom, ruler, DRC markers, and cross-probing work there too.
  - The blueprint draws like a fab drawing: **dimension lines** with extension lines and arrowheads measure the board's overall width (top) and height (left) against the stitched outline, and **crop-style corner extents ticks** mark the board's four corners.- The blueprint paper now extends to fully contain every drawing annotation on all four sides — dimension lines and their text above/left, corner extents ticks on every edge (previously the annotations ran past the paper edge onto the canvas), and an **info block** in the bottom-left corner lists the layers the drawing was built from, units and side, the generating version, and up to two parse warnings.

- 9428e2e: The board viewer's PCBA view gains a **theme picker** (a second combo box under the view switcher, visible in PCBA view only): Green ENIG (default), Red ENIG, Blue ENIG, Purple ENIG, Black HASL, White mask with black silkscreen, Yellow mask with black silkscreen, **OSH Park After Dark** (black substrate, gold ENIG pads, white silk), and the typeCAD house teal.

  Switching remaps the embedded render's flat colors client-side — one render serves every theme, no re-export — and the mask-luminance ink is exempt so soldermask openings keep compositing correctly. The pick persists per board across reloads and rides into SVG/PNG exports (the colors are baked into attributes). The new colorways are also available to the CLI as `--theme red-enig|white-hasl|yellow-hasl|oshpark-after-dark`.

- 9428e2e: The board viewer gains a fourth view — **ngspice** — focused on components and traces: white paper, zone pours subdued to a gray hatch (never solid), traces at their real widths, and the PCBA component glyphs rendered semi-transparent on top so the routing reads through them. Designators are always shown.

  When an operating point is embedded, traces are **heat-mapped by voltage**: each stroke takes its net's solved DC voltage, interpolated continuously across the board's own min–max range — black at the coldest net (ground) through blue, green, yellow and orange to red, with purple marking the hottest, every voltage getting its own gradation (no fixed buckets). The ramp is the same one the component power map uses, so both scales read alike. A sidebar legend mirrors the ramp with the board's actual range at the ends, and nets outside the solve render gray so unsolved copper never masquerades as a voltage.

  Components get the same treatment **by power**: a translucent heat-map shape is laid over each solved component's glyph (on top of the component layer, pointer-transparent so hover/click still reach the pads), colored by its dissipated watts — the same continuous interpolation over the board's own power range, extended with purple above red so the single hottest part stands out. The shape hugs the component **body** — the glyph's largest filled geometry, so through-hole lead wires don't stretch it and round cans get round overlays. Hovering a component body reads the device's own operating point (`R2 · 330uA 1.09mW`); unsolved parts show no overlay and no readout. A second legend shows the power range.

  **Current flow** animates on top of the traces: white particles glide along each wire in the conventional-current direction (the EE convention, not electron flow) with speed and size scaled by the log of the wire's current within the board's own range, pausable via a checkbox and adjustable via a 0–4× speed slider — both persisted with the board's other viewer state so they survive reloads. Direction and magnitude come from new per-pad branch data — the solve reports each pad's signed current injection by net (device currents mapped through the card pin order, plus the source terminals) — resolved on the board's actual route graph: each entering pad's current walks its own path to the nearest exit, so branch currents are per-branch (a rail stub ending at a DC-open cap carries nothing and stays still, even though its net is live). In the solver API the same data is available as `result.branches`.

  Hovering a trace displays the net's **ngspice operating point** — voltage plus the connected devices' current and power (e.g. `net2 · 3.3V · R1 1.2mA 3.9mW`):

  - `typecad-pcb simulate` re-runs the project entry with `TYPECAD_SIMULATE=op`; `pcb.create()` then solves the DC operating point via ngspice and writes `build/<board>_op.json` (per-net voltages, per-device current/power). The viewer pipeline embeds it beside the DRC report — absent file, no readout. Transient analysis is deliberately out of scope for now.
  - Two-terminal passives whose pins were only partially instantiated (typeCAD creates pin objects lazily) previously emitted ngspice cards with too few nodes, aborting the whole solve; missing terminals now become isolated nodes so the solve completes.
  - The island names are normalized case-insensitively (ngspice lowercases every name while the gerber X2 attributes keep the schematic's case — hovering `VCC` finds `vcc`), probed power arrives as `r1:power` in ngspice's raw output and is matched alongside the `.probe p(R1)` spelling, and ground is pinned to 0 V (ngspice's node 0 never appears in the v() list).
  - Readout values use engineering notation (`32.84mV`, `330uA`, `1.09mW`); an exact zero reads `0V`/`0A` rather than `0uV`.

- 43acb9f: The board viewer's Copper ΔT view gets a full accuracy overhaul to its thermal/electrical math.

  **Stackup-driven geometry.** The board writer now emits `build/<board>_stackup.json` (resolved from the PCB object's `stackupGeometry`), the `gerber-viewer` CLI accepts `--stackup` (and auto-discovers it beside the netlist), and the VS Code addon passes it through. The viewer uses it for per-layer copper weight (sheet resistance and the IPC rise both scale with real thickness — 2 oz halves the rise) and the real dielectric/board thickness. Absent the file, the old 35 µm / 1.6 mm defaults apply.

  **Electro-thermal coupling.** Copper I²R now self-heats through the resistivity temperature coefficient (+0.39%/°C): the board field solve adds the temperature-dependent loss back into the source, so hot traces dissipate more and run hotter.

  **Real boundary conditions.** The lumped h≈12 W/m²·K is replaced by an orientation-aware natural-convection correlation (vertical / horizontal-face-up / horizontal-face-down) plus linearized radiation (ε≈0.9), so the two outer faces shed heat as a function of their actual temperature excess.

  **Transistor terminal currents.** The operating-point solve now probes each BJT/MOSFET/JFET terminal (`i(q1:c) i(q1:b) i(q1:e)`, etc.) and adds them to the flow-graph `branches`, so current routes through transistor pins (previously it vanished there, breaking conservation), and component heat can inject at the actual current-carrying pins. Subcircuit port currents remain unsupported (ngspice doesn't expose them via `i(x:port)`).

  **Accuracy fixes.** Pour copper loss now actually heats the board (the 2D sheet solve's per-cell loss carried a stray mm²→m² factor that cancels exactly — six orders of magnitude too small); non-square pour cells use anisotropic conductance (`cellY/(Rs·cellX)` / `cellX/(Rs·cellY)`); internal layers use the internal IPC constant (k=0.024) via `data-inner`; component self-heating distributes by pad area; the component power overlay interpolates in log space (with a legend sampling the same ramp); FR4 in-plane conductivity is corrected to ~0.3 W/m·K; and SOR solvers report non-convergence ("approximate") instead of stopping silently.

  The per-wire and per-via rise formulas still invert the library's `powerInfo` sizers exactly; a numeric test extracts the shipped kernels from the generated viewer and locks down their units, the sizer round-trips, the copper-weight scaling, and the convection/radiation coefficients.

  Known remaining idealizations: a two-slab thermal model for multi-layer boards (per-layer current distribution needs the coupled multi-layer electrical solve), no component θ_JC/θ_JB package models (no thermal database yet), and DC copper-loss only (no skin/AC effects).

### Patch Changes

- 9428e2e: The vscode extension grows HAL-style ambient board state plus three new commands:

  - A **status bar entry** shows the build target — `rd_skeleton · 28 parts · 3 unconnected · 2E 5W` — with a `stale` flag when hw sources are newer than the built board; click opens the Board viewer.
  - **Unconnected pads and single-pin nets** appear in the Problems pane as warnings aimed at the declaring source lines (via the Code/net provenance), with an italic "R1 · 2 unconnected pads" chip after the declaration line.
  - **Run DRC** runs `typecad-pcb drc` and maps violations into Problems aimed at their source (a clearance hit on `net2` points at the `pcb.route` line); counts land in the status bar, and the Board viewer renders the same report's markers.
  - **Browse Components** is a QuickPick over the compiled board (ref — value · footprint · source variable) that zooms the Board viewer to the pick.
  - **Diff Board vs HEAD** renders the generated board's visual diff against git HEAD in a panel (`typecad-pcb diff` gained `--no-open` for embedded callers; `query components --json` now carries each component's `source` location).

  Review fixes folded in: Problems diagnostics and declaration chips clear when the board (or project) goes away instead of lingering from the previous revision; chip paths compare case-insensitively so a differently-cased open file still gets its chips on Windows; a warnings-only DRC count reads `· 2W` with its own separator; the DRC net fallback aims at the longest matching name (VCC_3V3 beats VCC); the diff panel locks down with the same per-page nonce CSP as the Board viewer (`applyNoncePolicy`, extracted from `injectProbeClient` — no more `script-src 'unsafe-inline'`); and the viewer guards all three data-overlay flags (netlist/DRC/stackup) behind one existsSync check so a missing artifact renders without that overlay instead of failing the whole export. The bundled editor-extension copies (assets/editor-extensions + the rd_skeleton demo) are regenerated — both predated the 0.11.11 `--stackup` pass-through and silently never shipped it.

- c8a90a1: The vscode addon's UX follow-ups — cross-probing lands where the question was asked, and the loop closes:

  - **Pad double-clicks land on the net.** Double-clicking a specific pad in the Board viewer now reveals the line that declared or routed that pad's net (the same preference as trace double-clicks); component outlines still go to the component's own declaration. The pin the client already reported is finally used.
  - **Quick fixes on every Problems entry.** Unconnected-pad, single-pin-net, and DRC diagnostics carry _Show R1 on board_ / _Show net VCC on board_ actions that jump into the Board viewer; entries with no component or net (the board-file catch-alls, which otherwise open the huge generated text) offer _Open Board viewer_ instead.
  - **The diff panel survives window reloads** like the Board viewer: a serializer restores it instantly from the on-disk report when one exists, or re-runs `typecad-pcb diff` when the board changed since.
  - **View Component is now a picker.** The palette command opens one QuickPick for browsing and typing — the compiled board's components (ref — value · footprint · source variable), the filter seeded from the cursor word, and a typed designator matching no item is still attempted. This subsumes the separate Browse Components command, which is gone.
  - **New setting `typecad-pcb.drcOnBuild`** (default off): run the design rule check automatically after every board build, once the board file has settled for 10s and no source is newer — violations land in Problems and the status chip without a manual run.

- 1fd32d3: A UX pass over the vscode addon — every dead end now leads somewhere, and net cross-probing runs in both directions:

  - **Net hovers + net selection.** Hover the quoted net name in a `pcb.net(…)` / `pcb.route(…)` call for a net card — declared/routed source lines, a single-pin warning, and a _show on board_ link that highlights the net's traces in the Board viewer (`typecad/pcb: View Net on Board` does the same from the palette, seeded from the quoted string under the cursor). Previously only components crossed the editor→board direction, while trace double-clicks already went board→editor.
  - **Actionable notifications.** Every "no compiled board yet" message carries a Build Board button; render-failure and diff-failure messages get an Open Output button.
  - **State-aware status chip.** Clicking the status bar entry follows the board's state — build when there is no board, a build-or-view prompt when stale, open the viewer when fresh. The tooltip is markdown with clickable Build Board / Run DRC links, and says when DRC has not run for the current revision (counts reset on every rebuild, so a fresh chip no longer reads as a clean one by accident).
  - **Silent failures speak up.** A selection the viewer page never acks (5s timeout) and a probe whose component fails to resolve now show a transient status message instead of writing only to the output channel.

- 9428e2e: A **▶ Build Board** CodeLens sits above the first line of every TypeScript source in the hw folder (the HAL addon's Flash & Monitor pattern): one click runs `npm run build` in a reused terminal, and the board watcher refreshes an open Board viewer when the build lands.
- 9428e2e: `typecad-pcb drc` now refills zones in memory before checking (`--refill-zones`, KiCad ≥ 9) — matching KiCad's GUI DRC, which refills by default. Since builds ship zone declarations without fill geometry (fills are computed by the consumer), a plain check validated a board that never exists: every via tying into a pour read as dangling, flooding the report with phantom violations (the demo board reported 203 violations / 499 unconnected items unfilled; its true count is 4 warnings / 0 unconnected). Extra kicad-cli flags still pass through after `--`.
- 9428e2e: Viewer exports are faithful and work inside the vscode webview again:

  - The webview CSP now allows `img-src data: blob:` — the PNG export rasterizes the serialized SVG through a data: URL, which `default-src 'none'` silently blocked ("could not be rasterized").
  - Blueprint zone pours carry a faint solid twin under the hatch pattern: renderers without pattern support (some viewers, office suites) fall back on the tint instead of an arbitrary blob color, so the pour still reads as marked copper.
  - Exported SVGs bake their page-CSS styling into explicit attributes: clear-polarity shapes keep the canvas color and DRC markers keep their red fills/strokes (a standalone file has no page stylesheet, so class-only styling fell back to SVG-default black).

- 4b55bbb: Export hygiene: the fab dir no longer accumulates foreign-board artifacts — export prunes files from other boards on each run — and fabrication outputs identify as typeCAD/pcb with the package version. Board discovery prefers the project's own board when several boards are around.
- 9428e2e: Clicking a net (or a component) in the board viewer paints the matched copper bright against a harder-dimmed board (unmatched copper now dims to 6% opacity):

  - **Blueprint view** — the matched net is pure white at full opacity. The composite views now dim per element instead of per group: a dimmed group composites its opacity over the matched elements inside it, which previously made the clicked net FADE rather than pop.
  - **Gerber / PCBA views** — the matched net takes the color copper already uses there, resolved per element from its nearest filled ancestor group (the layer group, the pads/copper-ghost wrappers) instead of a global lookup that resolved to the mask definition's black.

  Pads recolor, traces restroke, both at forced opacity 1; zone fills keep their color, and everything restores exactly on clear.

- 9428e2e: Fix `npx @typecad/pcb <command>` failing with `could not determine executable to run`. When a package exposes multiple bins, npm only auto-picks one whose name matches the package's unscoped name (`pcb`); the package only offered `typecad-pcb`/`gerber-viewer`/`kicad-symbols`/`kicad2typecad`, so the documented `npx @typecad/pcb create` quick-start (README + website) errored before the CLI ever ran. Added a `pcb` bin alias pointing at the same `dist/cli/typecad/index.js` entry as `typecad-pcb`; existing bin names are unchanged.
- 9428e2e: The vscode extension learns to share a workspace with the typeCAD/hal extension instead of talking over it:

  - Activation is `workspaceContains:**/typecad.conf.ts` only (no `onLanguage:typescript`) — the extension stays asleep in non-typeCAD TypeScript workspaces instead of planting a status chip there. Palette commands still activate it implicitly.
  - The status bar chip hides when no typeCAD project is in the workspace (it used to squat in the bar saying "no project"), and sits at priority 101 — just left of typeCAD/hal's chip (99) — so the two no longer jostle for the same slot with the same circuit-board icon.
  - Component hovers are scoped to TypeScript sources inside the hw folder (the same rule the ▶ Build Board lens uses). Firmware files are typeCAD/hal's hover domain; a component identifier in fw/ used to stack a PCB hover under hal's pin hover.

- 9428e2e: Zoom-to-component (in-viewer search and the vscode extension's select flow) no longer lands zoomed out in the PCBA view: each hit element's own transform is now folded into its bounding box before the fit union. `getBBox()` ignores an element's own transform, and PCBA component glyphs are `translate(centroid) rotate(angle)` groups — their local boxes unioned with the pads' board-frame boxes stretched the fit from the board origin to the part, so every selection rendered the whole board instead of the component.
- 9428e2e: Fixed `pcb.stitch()` voiding the entire bounding square of an angled track.

  - Track obstacles carry their exact segment geometry, but the stitch clearance check only tested the obstacle's AABB — for the autorouter's 45° segments that AABB is the whole square containing the diagonal, so a routed signal voided ~8×8 stitch cells above and below it instead of a thin band along the copper.
  - Stitch candidates are now measured with the same point-to-centerline (capsule) distance the routing grid's precise check uses: `distance - width/2 < via radius + clearance` blocks, everything else stitches. Orthogonal tracks are unaffected (their capsule matches their AABB).

## 1.0.0-alpha.5

### Minor Changes

- PCBA image renderer for the gerber viewer: `gerber-viewer <dir> --render pcba` renders the fab output as a flat, themed 2D "assembled board" SVG — the PcbDraw look computed from gerbers alone, with no board file, KiCad install, lighting or perspective involved.

  - The board surface is painted bottom-up by SVG compositing: substrate from the Edge.Cuts outline (traces are chained into closed contours, regions close implicitly), copper, pad flashes in the finish color, then the soldermask film with the mask gerber's openings punched through an SVG `<mask>` so pads/copper/substrate show exactly where the real openings are — followed by silkscreen and drilled holes.
  - Components are Fritzing-inspired stylized glyphs drawn from the X2 `%TO.P` pad attributes — no part library. Grouping pad flashes by reference recovers each part's layout; the package family (two-pad, dual-row IC, QFN/perimeter, generic) is inferred from the pad pattern, and each glyph gets metal leads at its pads, a rounded body, a pin-1 dot and a DIP notch for through-hole ICs. Mounting holes and single-pad test points are skipped.
  - Copper ghosting through the mask: real soldermask is translucent, so traces and pours under it render in a darker mask tone — a new `maskCopper` theme color painted over the film (still masked off at the openings, so pads keep their finish color). Every builtin theme ships a matching value. Raw copper is never painted under the film: mask-opening rings around pads reveal substrate only, so no copper-colored halo leaks around components (the `copper` color appears solely in the no-mask bare-board fallback), and the default `pads` finish is a copper tone (`#cf8a4d`) to match.
  - Netlist metadata is now auto-discovered: when no `--netlist` is passed, the pcba render looks for a sibling `*.net` beside the input directory (the typeCAD build layout: `build/gerbers` + `build/<board>.net`), so the plain command gets exact package dims, values and name-based classification. `--no-netlist` opts out. Without any netlist the pad-topology fallbacks still improved: a Y/X reference on a two-pad part renders the crystal metal can, and a perimeter pad ring classifies as QFP (long protruding gull-wing pads) versus QFN (short flush pads) by pad length, checked before the ball-array grid test so a QFP's pad lattice can't read as a BGA.
  - Chip resistors/caps draw a true top view: a sharp-cornered body with silver termination caps on its ends — `[copper pad [silver | black | silver] copper pad]` — with the board's own exposed pads visible past the part, instead of silver pads under a capsule.
  - Exact body outlines from the Fab layer: each component claims the fab ink nearest its pads (reaching 4mm past the land pattern, since bodies like terminal blocks overhang their pins), the group is stitched into closed contours with junction-aware walking (smallest-turn preference with backtracking, so tee connections such as terminal-block dividers don't break the loop), and the largest contour's bounding box becomes the body rectangle — exact package dimensions where the land pattern extends past the package (the QFN's pads peek out on all four sides). Orientation cuts in the fab drawing, like QFN pin-1 chamfered corners, are squared off rather than rendered verbatim; the pin-1 dot marks orientation. Value-text strokes and pin marks lose the area contest; footprint-name dims and pad heuristics remain the fallbacks when no Fab layer is present.
  - A package grammar now covers the common archetypes, each drawn as a procedural top-view glyph: two-terminal chips (resistor/capacitor/inductor with winding stripes/diode/LED/ferrite), axial through-hole parts, radial electrolytic cans (dark circle, centered polarity stripe), through-hole LED domes (tinted, die dot), SOT small transistors, SOIC/TSSOP gull-wing ICs, DIPs (notch), QFN/DFN and BGA, QFP, pin headers, terminal blocks (gold screw dots), shrouded connectors (USB/barrel/JST — body extended past the pad row, shield pads as tabs), crystals, metal-can modules (oscillators/RF shields — metal lid, inset detail, no legs), TO/SOT-223 power packages (tab), trimmer potentiometers (light-blue body `bodyTrimmer`, silver screw in the bottom-right corner), slide switches (rounded internal track the actuator rides in), rotary encoders (shaft filling most of the body), pushbuttons, generic fallback. New names classify to the new families (CP_Radial→radial, USB|BarrelJack|JST→connector, Oscillator|TCXO|RF_Module→can, Potentiometer→trimmer, RotaryEncoder→rotary, SW_DIP|SW_Slide→slide, LED_D→dome) and the nameless topology fallback infers them from reference prefixes (C on two TH pads → radial, LED → dome, RV → trimmer, SW on three pads → slide; the exposed-pad exclusion now skips zero-span collinear rows).
  - Semantic appearance from the reference prefix plus the netlist value: through-hole resistors get the classic tan body (`bodyResistor` theme color) with real color bands parsed from their value ("10k" → brown black orange + gold) — SMD chips carry none, like real parts — MLCCs render beige, inductors/ferrites charcoal, diodes carry a cathode stripe at the pin-2 end, LEDs render as a tinted translucent package with a die square — all overridable through new theme keys (`bodyMlcc`, `bodyResistor`, `bodyInductor`, `stripe`, `ledTint`, `crystal`). `Resistor_THT`/axial footprint names classify as axial parts, and the SOT-223/DPAK tab starts at the body edge and reaches ~2/3 over its pad instead of covering it.
  - Component bodies size from the package when a netlist is passed (`--netlist build/board.net`, the same flag the viewer uses): footprint names like `R_0603_1608Metric` and `QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm` carry the real body dimensions (1.6×0.8mm, 4×4mm), which override the pad-geometry heuristics. Through-hole parts render as DIPs, headers, terminal blocks or axial parts instead of being skipped; only mounting holes, test points and unclassifiable through-hole patterns draw nothing. Pad geometry from KiCad's RoundRect aperture macros reads its real extent instead of a 0.3mm fallback.
  - Synthetic refdes labels use the theme's `labelFont` (`'OCR A Std', 'Courier New', monospace` by default) to match typeCAD boards; the board's own silkscreen text (including fonts like `OCR A Std`, vectorized by KiCad's plotter) renders faithfully from the gerber outlines.
  - Themes are a small PcbDraw-style JSON palette with builtins `green-enig` (default), `purple-enig`, `black-hasl` and `blue-enig`; `--theme <name|file.json>` accepts any subset override. `--side front|back` flips the render (back views mirror x, labels stay readable), and refdes labels are auto: suppressed when the silkscreen layer already carries them so they don't double the silk text (`--labels`/`--no-labels` force either way).
  - The viewer's PNG export rasterizes at ~1600px on the long edge instead of 2x viewBox units: the export clone carries explicit pixel dimensions, so the vector decodes at full target resolution — previously a ~113mm board exported as a ~230px thumbnail, and the canvas upscaled the blur.

  - Rendering internals are now shared: `renderLayerInk`/`renderDrillInk` (exported) factor the per-layer SVG emission out of `renderSvg` unchanged, and aperture-macro comment lines (primitive code 0) are skipped silently per the Gerber spec instead of warning — KiCad's `RoundRect` macro pads no longer produce spurious warnings.

  - The interactive board viewer gains a view switcher: a combo box under the project title toggles between the classic Gerber view (layer stack, visibility/opacity controls) and the new PCBA view. Both render into one SVG sharing a single coordinate frame, so pan/zoom, the measurement ruler, DRC markers, component search and the vscode cross-probing (double-click→source, source→component highlight) work in either view; the PCBA view hides the layer controls, and the selected view persists per board.

  - Render-cycle cost: zone fills were the hidden giant (~20s of every kicad-cli gerber export). The build no longer fills at all — see the zone-fills-on-demand changeset — so `npm run build` is refill-free, and the vscode panel gates on board mtime stability (never rendering kicad-cli's truncate-then-write intermediate states), cutting one full export chain per build.

  - The vscode panel's refresh is now gated, fixing the flaky "only refreshes once" behavior: the board's mtime is compared against the last render — spurious FileSystemWatcher events (Windows fires onChange loosely; anything that touches the workspace) no longer trigger a pointless export when the board didn't change — and a skipped or failed refresh self-retries, because the build's final board write can coalesce into the in-flight generate call and never fire the watcher again. A board written moments ago is given 3s to settle before its export runs, so an export never races the writer.

- `gerber-viewer serve` is removed, along with the `gerber_viewer` npm script it was wired into by `typecad-pcb create` — the VS Code extension's Board viewer now covers that loop (re-export + rerender on every `npm run build`) with cross-probing on top. The one-shot CLI (`gerber-viewer <dir> -o board.html [--netlist] [--drc] [--render pcba]`) is unchanged; the programmatic gerber-viewer exports lose `startGerberViewerServer`, `findBoardFile` (the gerber-viewer one) and `RELOAD_CLIENT`. Existing projects can delete the `gerber_viewer` script from `hw/package.json` — nothing else references it.
- Port the typeCAD HAL CLI ergonomics to `typecad-pcb` (same invocation shapes as `typecad-hal`):

  - **Watch mode** — `typecad-pcb build --watch` (or `-w`): tracks the entry file plus its local import graph (parsed with acorn, `.js` → `.ts` resolution included) and rebuilds on change, debounced. A failed rebuild prints the error and keeps watching; editors that save atomically are handled by re-arming watchers after every event.
  - **Output directory** — `--outDir=<dir>` (also `--out-dir`), accepted on every command: redirects both the library's writes (netlist, board, BOM, contract, SPICE, package `build/lib` sync) and the CLI's artifact discovery (query, drc, erc, export, edit, check, diagnostics, doctor) via the `TYPECAD_BUILD_DIR` override. Default remains `./build/`.
  - **`typecad-pcb clean`** — removes the generated build directory; refuses directories without KiCAD build artifacts unless `--force` is given, and always refuses the working directory itself. `--json` and `--outDir` supported.
  - **Bare-file invocation** — `typecad-pcb main.ts --watch` now behaves like `typecad-pcb build main.ts --watch`.
  - **`build --diagnostics` is now best-effort** like HAL's: a report-generation failure logs a warning instead of failing the build.

  Also included from the earlier diagnostics work: the `typecad-pcb diagnostics` command and `build --diagnostics` flag (markdown + JSON report with BOM, nets, pin map, mermaid graphs, ERC-lite electrical checks, kicad-cli ERC/DRC, and routing status), plus three `board_model` parsing fixes for fresh typeCAD output (fp_text references, numeric pad names) and kicad-cli-resaved boards without a global net table.

- `typecad-pcb create` now bundles the typeCAD/pcb VS Code extension into every new project (`hw/.vscode/extensions/typecad-pcb/`), zero-install like the HAL addon:

  - **Pin hovers** — hover a component variable in `src/` to see its reference, footprint, placement, and a pad-by-pad table with connected/unconnected status (net-less `np_thru_hole` pads read as mechanical). A declared component missing from the compiled board explains itself instead of hovering silent.
  - **Cross-probe board viewer** — _typeCAD/pcb: View Board_ renders the compiled board (gerbers + netlist, zones refilled) in a webview beside the editor; the hover's _view on board_ link zooms to the component (and _View Component on Board_ from the palette prompts for a designator, seeded with the word under the cursor), and double-clicking any pad or outline in the viewer jumps back to the declaring source line — traces too: `pcb.net`/`pcb.route` callsites are now stamped into the netlist (Code/Route properties) and surface through `query nets`, so a trace hover reads "net2 { source board.ts:83 }" and double-clicking a trace reveals that line (single clicks — measurement ruler points included — always stay inside the viewer). Viewport, layer settings, and highlight survive board-change reloads, and an open Board panel is restored across VS Code window reloads too — instantly from the last generated view when the board hasn't changed, or with a brief placeholder while the export reruns. While a rebuild's new render is being generated, the viewer's lower-left status text announces it — and locks the readout so the mouse-coordinate display cannot overwrite the notice — unlocking when the new view lands. The hover readout names the source variable beside the designator ("R1 { source r1 }"), and the PNG export rasterizes at ~1600 px.
  - **Editor integration** — `.vscode/extensions.json` force-installs the extension workspace-scoped; `.vscode/settings.json` hides its manifest from the NPM Scripts pane and the Explorer (ported from the HAL addon's npm-hiding settings).

  Also in this change:

  - The footprint `Code` property now always embeds the declaring `file:line` (previously only anonymous components carried it), normalized to a POSIX project-relative path so committed boards stay machine-independent. This is what the reverse cross-probe and the hover's source row read.
  - `gerber-viewer` one-shot mode gained `--netlist`/`--drc` flags, a `#typecad-probe` SVG group and a `window.typecadViewer` embedding API, board-coordinate (y-down) mouse readout, and viewport persistence across reloads.
  - `typecad-pcb export gerbers` (and `jlcpcb-export`) pass `--check-zones` on KiCad ≥ 9 — builds write zone declarations without fill geometry, so the export computes the pour copper at plot time.
  - Board lookup (`query`, `export`, `drc`, `check`) picks the newest `.kicad_pcb` in `build/` instead of refusing when stray boards share the directory.
  - A new workspace package `packages/vscode-typecad-pcb` develops the extension; `npm run bundle` ships the compiled copy into `assets/editor-extensions/` (now included in the npm `files`).

- Zone fills are no longer typeCAD's job at build time — each operation that needs fill geometry now computes it itself, so `npm run build` writes zone declarations only and skips the ~20s kicad-cli refill round-trip entirely (the rd_skeleton demo board builds in ~3.5s where it took ~30s).

  - `pcb.create()` no longer calls `materializeZoneFills` after writing the board. The board file carries zone declarations without `(filled_polygon)` geometry — valid as far as KiCad is concerned; KiCad fills zones on demand.
  - `typecad-pcb export gerbers` always passes `--check-zones` (KiCad ≥ 9), so plotted gerbers include the pour copper even though the `.kicad_pcb` never materialized it.
  - `typecad-pcb check` refills as part of its DRC pass, as before.
  - `materializeZoneFills(pcb, state)` remains exported for callers that want to force a fill-and-save on the board file itself (e.g. before handing it to a tool that can't refill).
  - The zone-fill sidecar files (`.zonefill`) are gone — with the build no longer filling, there was nothing left to record. The board viewer detects completed builds by file mtime stability instead.

### Patch Changes

- Consolidated KiCad symbol parsing into a single shared core (`src/symbol_core.ts`). The CLI add flows, the schematic renderer (`SymbolLibraryManager`), and symbol embedding (`loadSymbolLib`) now share one extends resolver and one pin walker instead of four parallel `.kicad_sym` readers. `kicad_sym_utils` is now a stateless facade (`readSymbol` / `readSymbolFile`), which removes the hidden call-order coupling between `kicad_symbol()` and `kicad_pins()`.

  Behavior improvements that come with the unified semantics:
  - Pin extraction is now fully recursive: pins hanging directly on the symbol node and deeply nested unit symbols are found (previously only one level of unit nesting was scanned).
  - `extends` parents written as `Lib:Name` now resolve across libraries (previously mangled and silently unresolved), with circular-chain detection.
  - Local `.kicad_sym` files with multiple symbols now yield the pins of the chosen symbol only — previously every symbol's pins in the file were merged into the component.
  - `typecad-pcb add package` local non-interactive mode no longer reads pins from stale internal state; the symbol is resolved properly (with a warning when it can't be found).
  - Symbols whose `Footprint` property has an empty value are now usable in the add flows (previously treated as invalid).

  No public API was removed; the changes are internal to the CLI flows and renderer.

- - `create` no longer offers a PlatformIO firmware project; the optional `./fw` is now a typeCAD HAL project (`--hal=<true|false>`, interactive question after the project name). When chosen, it runs `npx @typecad/hal create <name> --outDir fw` in the project root so HAL's own wizard picks the board, and `fw/` joins the generated `.code-workspace` whenever it exists. `--pio`/`--board` are gone from the CLI, help, and skill docs.
  - Fixed the interactive `create` flow silently skipping the firmware and git questions: the command shim assigned `undefined` to absent `--hal`/`--git` flags, which the prompt flow read as explicitly answered. All three questions (name, HAL firmware, git) now always appear when the flags aren't passed.
- - Dead code cleanup (~750 lines): removed the unused routing worker modules (`worker_pool`, `segment_worker`, `simple_routing_grid`), `pcb_board_context`, `pcb_kicad_window`, the unused `kicad-symbols` barrels and `GlobalErrorHandler`, two unused test helpers, and two orphaned ambient type declarations (`@typecad/pcb-astar`, `which`). No public API was removed.
  - `pcbRegisterRouter` is now exported from the package root. The custom-router registration point was implemented, tested, and referenced by the `layout` skill docs, but was unreachable because it was never re-exported from `index.ts`.
  - Tightened module boundaries: ~60 symbols that were only used inside their own module are no longer exported, including a dead type re-export block in `pcb.ts` and a redundant `LibraryInfo`/`SymbolInfo`/`KiCadCacheMetadata` re-export in `kicad-symbols/types`.
  - Removed unused devDependencies: `tsx`, `typedoc`, `typedoc-plugin-markdown`.
- Relative-placement fixes from a full end-to-end API exercise: footprint-string
  targets now resolve, and outline-less board reads explain themselves in the
  console instead of silently returning zeros.

  - `below()/above()/rightOf()/leftOf()` — `.by(gap, "Lib:Footprint")` now
    measures the gap against the named footprint's bounds at rotation 0.
    Previously the string was silently ignored and the new component's own
    footprint was used, contradicting the documented signature (verified
    end-to-end: `.by(2, 'Capacitor_SMD:C_0805_1608Metric' ...)` on a resistor
    now lands at the capacitor-derived coordinate).
  - Plain-number board geometry reads (`pcb.board.center.x`, `left/right/top/
bottom`, `width/height`, corners) before `pcb.outline()` now log a console
    warning — they snapshot zeros and never re-resolve, unlike `from*()` /
    `centered()` placement values which safely follow the final outline at
    `create()`. Several reads on one `pcb.board` object dedupe to a single
    warning. Unknown footprint strings passed to `.by()` already warned via
    `getFootprintBounds`; that is unchanged.
  - JSDoc corrected: `.by(gap, target)` never returned "a plain number
    immediately" — it always returns a deferred placement value; the docs now
    describe actual Component/string target semantics.
  - Docs (`board_layout` page, llms mirror, llms-full bundle): removed the
    stale `import { board } from '@typecad/pcb'` — placement lives on
    `pcb.board`, which is the only supported entry point.

- `typecad-pcb create` now scaffolds the project `tsconfig.json` with `module: "ESNext"` / `moduleResolution: "Bundler"` instead of `NodeNext`. The extensionless relative import that `add component` prints for its generated class (`import { LD3985G25R_TSOT23 } from './LD3985G25R_TSOT23';`) is now valid as-is in editors and in `typecad validate` — under NodeNext it was flagged with "Relative import paths need explicit file extensions", forcing a manual `.js` suffix even though the build (tsx) never needed one. Bundler resolution matches the actual runtime: projects are always executed through tsx's esbuild resolver and tsc only ever type-checks (`noEmit`), so nothing is ever loaded as raw Node ESM.
- Fixed `pcb.stitch()` placing body keep-out boxes at the footprint bounds center instead of the footprint origin.

  - Many footprints' origin is pin 1 or a corner (DIPs, pin headers, most THT connectors), not the body center. The stitch grid treated the origin-relative bounds box as centered on the component position, so it shadowed open board up-and-left of the part — refusing vias that would fit, e.g. the row above and the column left of a `DIP-8_W7.62mm` — while leaving the real body open down-and-right, where stitch vias could punch straight through the part.
  - Blockers are now built from the box's rotated corners anchored at the component position (mirrored about the X axis for back-side parts), matching the placement code's `rotatedBox` semantics.

- Reference-designator prefixes are now read from the symbol's `(property "Reference" ...)` — the same property KiCad editors use — instead of being guessed from the first letter of the footprint name. An ATtiny3227 in a QFN footprint now correctly becomes `U1` instead of `Q1`, with no code changes needed in existing projects.

  Precedence, highest first:
  1. an explicit `reference` (`new ATtiny3227_M('U1')` or `init.reference`)
  2. an explicit `prefix` (`u1.prefix = 'U'` or `init.prefix`)
  3. the symbol's Reference property, resolved through the global KiCad libraries or `<buildDir>/lib` (extends chains inherit the base symbol's prefix; results are cached per symbol)
  4. the previous footprint-name heuristic, now only a fallback for components without a resolvable symbol

  `typecad-pcb add component` / `add package` also pass the resolved symbol and prefix into the generated class through the `Component` init object (`super({ footprint, symbol, prefix })`), so correct designators survive even when the symbol library isn't installed at build time (e.g. CI).

  Also fixes the designator being resolved too early: pin declarations as class fields (`PA0 = this.pin(1)`) used to read the reference before the constructor body could set the symbol, which forced the footprint-name fallback and produced wrong prefixes (Q1 for a QFN-packed MCU). `Pin.reference` and `Pin.uuid` are now resolved lazily through the owning component, so inference always happens after construction completes.

  `resolveExtends` now returns a genuinely flattened symbol: graphics and pins from the extends-chain base, properties overridden by each derived level, and the node named after the requested `library:symbol` (with unit sub-symbols renamed to match). Previously the embedded `lib_symbols` entry carried the BASE symbol's name (an ATtiny3227 embedded as `ATtiny807-M`), so the placed symbol's `lib_id` had no matching definition and KiCad silently dropped the component from netlist export and ERC.

## 1.0.0-alpha.4

### Major Changes

- **`@typecad/typecad` is renamed to `@typecad/pcb`, and `@typecad/passives` is merged into it.** One package, one version line: the passives/typecad peer-pairing (and the ERESOLVE failures from mixing their stable and alpha lines) is structurally gone. Fresh projects install `tsx` + `@typecad/pcb` — nothing else.

  Migration:

  - `import ... from '@typecad/typecad'` → `from '@typecad/pcb'` (deep imports `/routing`, `/search`, `/diff`, `/docgen`, `/sexpr`, `/gerber-viewer` keep their paths under the new name)
  - `npm install @typecad/pcb` replaces both `@typecad/typecad` and `@typecad/passives`

  Passives are now built-in with a single-API redesign — sizes are constructor options, not import paths:

  ```ts
  import { PCB, Resistor, LED } from '@typecad/pcb';

  let r1 = new Resistor({ value: '10k' }); // 0603 (default)
  let r2 = new Resistor({ value: '10k', size: '0805' }); // explicit size
  ```

  - One import for everything; `size` is a typed union (`'0201' | '0402' | '0603' | '0805' | '1206' | '1210'`, Fuse excludes the two smallest) and an explicit `footprint` still always wins
  - `Testpoint` → `TestPoint`, `Tie` → `NetTie` (now on standard `ComponentInit` — `pcb`/`sch` placement instead of `xy`)
  - `Connector` gains a `series` preset (`'pin-header'` default, `'JST-SH'`) that templates symbol and footprint from `number`, so the pin count lives in one place only
  - `Package` provides `this.passives` (0603) out of the box — the `{ passives: await import("@typecad/passives/0603") }` wiring is gone; shift a whole package with `{ passiveSize: '0805' }`, or override with `passiveFactory(size)`
  - `typecad-pcb doctor` now flags legacy `@typecad/typecad`/`@typecad/passives` dependencies and points them at `@typecad/pcb`

### Minor Changes

- `route()` now errors loudly when it is called before the net's components are placed: routing captures the pads' current positions and never re-anchors when a late placement resolves at `create()`, so a `route()` above the placement code silently draws the trace at the default (0, 0) position — and the stray segments pollute the board bounds that zones and `typecad.board` placements derive from. The error names the unplaced components and states the required order: `outline() → place components (.pcb = {...}) → route() → zone()/stitch() → create()`.

## 1.0.0-alpha.3

### Patch Changes

- 9d90f35: `typecad create` now installs the alpha dependency line its scaffold requires: `@typecad/typecad@~1.0.0-alpha.2` and `@typecad/passives@~0.2.3-alpha.0`, instead of both packages' `latest` tags. The scaffolded `gerber_viewer` npm script references the `gerber-viewer` bin, which only exists in the typeCAD 1.0 line — and passives `latest` (0.2.2) declares a typecad peer of `^0.3.0`, so mixing the lines fails with an ERESOLVE error on fresh installs. Ranges use `~` rather than `^` because the Windows npm spawn goes through cmd.exe, which treats `^` as an escape character.
- doctor: new "CLI line" check — compares the RUNNING CLI's major line against the project's declared `@typecad/typecad` spec. The registry's `latest` tag is the 0.x line while alpha-line projects depend on 1.0.0-alpha.x, and the two lines register different commands (check/query/edit exist only on 1.x) — so a stale global `typecad` (installed bare from `latest`) silently hides subcommands even though the project's own node_modules copy has them. The mismatch now fails doctor with the explanation and a caret-free fix (`npm install -g @typecad/typecad@~<declared version>`, safe to paste into cmd.exe); `--fix` deliberately does not touch global installs. `npx typecad <command>` always runs the project's copy.
- doc: fix `md.utils.assign is not a function`. markdown-it-multimd-table-ext (4.2.35, the newest release) initializes against the `md.utils.assign` polyfill that markdown-it 14 removed — and we pin markdown-it ^15 — so every `typecad doc` run died at plugin load. A per-instance shim now restores the removed helper (cloned `md.utils`, no global mutation) before the plugin loads; a canary test documents that the shim can be deleted once the plugin ships a markdown-it 14+ compatible release. Verified end-to-end: `typecad doc` on a table-bearing document renders `<table>` output again.
- doctor + create: respect the two dependency lines. The registry carries a stable line (typecad 0.x `latest` + passives 0.2.2, peers ^0.3.0) and an alpha line (typecad 1.0.0-alpha.x + passives 0.2.3-alpha) that must never be mixed — a mixed package.json ERESOLVEs on `npm install`, which aborts wholesale and leaves node_modules hollow (the "Core dependencies: missing @typecad/typecad, @typecad/passives, tsx" doctor report). `typecad doctor` now computes its fix from the project's package.json: an alpha-line project gets the alpha pair installed (never bare names, which would either silently flip the project to the 0.x line — no gerber-viewer bin — or ERESOLVE), `doctor --fix` actually performs the install, and the mixed-lines state is called out in the failure output as the reason plain `npm install` fails. The dependency list is shared with `typecad create` (core-deps.ts, one source), and create's install failure now surfaces npm's actual stderr instead of "Is npm installed and on your PATH?".
- 422b2c9: Fixed ballooned TrueType text on the gerber viewer's dark canvas. The dark-theme recoloring for silkscreen/paste/drill matched every element carrying a `stroke` attribute — including region paths that carry `stroke="none"` (TrueType text glyphs, pour outlines) — which painted a ~1mm outline around each glyph. The stroke override now excludes `stroke="none"`, so filled polygon text like a board's title renders crisp while stroke-font designators keep their recolored strokes.
- 1307bb2: The gerber viewer gained a measurement tool. A ruler button in the toolbar arms it: click a start point, move the mouse to see the live distance (total plus dx/dy in board units), click again to stick the ruler; measurements accumulate so several can be compared, and `Escape` cancels the in-progress one, clears all rulers and disarms the tool. Rulers live in the pan/zoom layer, keep a constant on-screen size while zooming, and their colors follow the dark/light theme. Clicks are distinguished from pan-drags by a movement threshold, so panning still works with the tool armed.
- 53b6c2e: The gerber viewer now remembers layer settings across rebuilds. Visibility toggles and opacity sliders are stored in the browser's localStorage (keyed per board title) and re-applied when the serve-mode page reloads after a build, so a hand-tuned layer view survives the live-reload instead of snapping back to defaults. New layers added by a rebuild fall back to their defaults; All/None buttons persist too.
- 6930ebf: `gerber-viewer serve` no longer exits when its port is taken — it walks up to the next free port (up to 50 attempts from the requested one) and logs where it landed, so a dev website or a second viewer instance no longer blocks startup. The startup log and `--open` use the actual bound port. Its default port also changed from 4173 to **4273**: 4173 is `vite preview`'s default and collided with the typeCAD website dev server.
- f07505d: The gerber viewer's ruler tool gained angle snapping: holding `Shift` while measuring constrains the endpoint to 45-degree increments (0/45/90/...) from the start point, at the same radial distance. The snap applies to the live ruler while moving and to the ruler that sticks on the second click; releasing Shift restores free placement.
- 7f0ab3b: The gerber viewer gained a dark/light theme toggle in the sidebar header, and the theme now covers the board canvas too. The choice is saved in localStorage (per browser, shared across boards) and re-applied on every page load, including the serve-mode live-reload after builds; on first visit the theme follows the OS `prefers-color-scheme`. On the dark canvas, near-black layer colors (silkscreen, paste, drill) are automatically recolored — with matching sidebar chips — so they stay visible, and clear-polarity cutouts follow the canvas color instead of showing as light boxes.

## 1.0.0-alpha.2

### Major Changes

- a8c8751: Placement moved onto `pcb.board`; free functions removed.

  - `pcb.board` is the complete placement namespace: live outline bounds (`center`, edges, corners, `fromLeft()`/`fromRight()`/`fromTop()`/`fromBottom()`) plus the component-relative verbs `below(c)`, `above(c)`, `rightOf(c)`, `leftOf(c)`, `sameAs(c)`. Readable before or after `pcb.outline()`; values follow the final outline.
  - **Breaking**: the free functions (`below`, `above`, `rightOf`, `leftOf`, `sameAs`, `board`, `PlacementValue`, `isPlacementValue`) are no longer exported from the package root, and the verbs are not PCB-class methods. Replace `board(pcb).fromLeft(5)` with `pcb.board.fromLeft(5)`, `below(r1).by(3)` with `pcb.board.below(r1).by(3)`, `sameAs(r1).x` with `pcb.board.sameAs(r1)` (assignable directly). Placement _types_ (`PlacementBuilder`, `BoardBounds`, `SameAsResult`, `PlacementNumber`, `PlacementInput`) remain exported.

### Minor Changes

- 8c41df1: Deterministic builds and the agent loop. Build output is now byte-identical across runs: every UUID in the schematic and board is derived (UUIDv5) from design content — component references, net names, geometry — instead of `randomUUID()`, and auto-placed components land on stable grid cells via a seeded hash. This makes git diffs of `build/` meaningful and enables golden tests.

  Three new CLI commands form a verify-then-edit loop for agents:

  - `typecad check` — build + unconnected-pad analysis + ERC + DRC in one pass, one JSON report (`--skip-erc` / `--skip-drc` to scope). Exits non-zero on failure; in `--json` mode build output is captured so stdout stays parseable.
  - `typecad query <subject>` — inspect the compiled board as data: `summary`, `nets`, `net <name>`, `components`, `component <ref>`, `unconnected`, `power`. Component entries carry their source variable name (from the Code property); `unconnected` lists floating pads (mounting holes excluded) and single-pin nets.
  - `typecad edit <op>` — checked semantic source edits validated against the built board before anything is written: `connect R1.1 U1.3`, `connect GND C1.2 C2.2`, `move U1 --right-of=C3 --gap=2.54`, `route U1.3 R1.1 --width 0.25`, with `--dry-run`, did-you-mean suggestions, and generated code that references your variable names. Route calls are inserted before the first `create()`.

  Routing order is now a guarded contract: `route()` (and batch autorouting) after `create()` throws a `TypeCadError` with reordering guidance instead of silently returning a failed result — the board is already written at that point, so routes staged afterwards could never reach it. `typecad query routes` reports per-net copper connectivity (pads, vias, segments, pours — including pour-assisted planes and unrouted pin groups), and `typecad query zones` lists pours and keepouts.

  Skills upgrades: `typecad skills search <query>` fuzzy-finds skills; `typecad skills export --out <dir>` emits every skill as a SKILL.md for `.claude/skills`-style tooling; `typecad create` scaffolds AGENTS.md from the live skill registry (can no longer drift) and gains `--yes` for fully non-interactive project creation with defaults.

  **Zone fills are now materialized.** `pcb.zone({ fill: true })` (the default) declares a pour, and at `create()` the written board is round-tripped through `kicad-cli pcb drc --refill-zones --save-board` so the fill geometry exists in the file — fabrication exports include pour copper and DRC judges real connectivity (a stitching-via board previously reported dozens of phantom "unconnected" items; with fills materialized it reports zero). Opt out per zone with `fill: false` or globally with `new PCB(name, { fill_zones: false })`; without kicad-cli the fill is skipped with a warning. Because KiCad's resave used to invent random UUIDs for pads, base properties, and footprint graphics, typeCAD now emits deterministic UUIDs for all of them — build + refill is byte-identical across runs. `typecad check` runs its DRC with `--refill-zones --save-board` as well, and `typecad query zones` distinguishes declared pours from materialized ones (resaved `(net "NAME")` zone and pad forms are parsed).

- ada1e65: N-layer boards: the copper layer set is now a first-class, always-resolved property of the PCB.

  - `new PCB(name, { layers: N })` sets the copper-layer count at construction (2–32); `pcb.copperLayers` exposes the resolved layer names and `pcb.layerCount` the count. `pcb.stackup()` still configures stackup materials and overrides the count.
  - Routing defaults now derive from the board's layer set: `pcb.route()` uses every declared copper layer when no `layers` are passed, through-hole pads are expanded to the board's layers for obstacle avoidance, and through vias block every copper layer they span.
  - Layer references are validated when the board is written — a zone, keepout, via, or route referencing an undeclared layer (e.g. `"In1.Cu"` on a 2-layer board, or a typo like `"f.cu"`) fails with an actionable error instead of producing a `.kicad_pcb` KiCad cannot load. `pcb.route()` rejects undeclared routing layers up front.
  - `track.via()` without an explicit span now always defaults to a through via (F.Cu→B.Cu) instead of guessing a blind span from the current layer.
  - `copperLayerNames`, `validateLayerCount`, `MAX_COPPER_LAYERS`, and `MIN_COPPER_LAYERS` are exported from the package root.

- ada1e65: Honest API surface, real impedance tolerance, and complete zone round-tripping in `typecad import`.

  - Differential pair routing is non-functional, so its phantom surface is gone: user net classes no longer get hard-coded `diff_pair_gap`/`diff_pair_via_gap`/`diff_pair_width` written into the `.kicad_pro` (KiCad's DRC had been enforcing geometry nobody chose — KiCad now fills its own defaults), and the dormant differential-pairs demo test is unwired while its code is kept for when coupled routing lands.
  - `impedance.tolerance` is now a real, optional option. With a tolerance, the solved trace width snaps to a 0.01mm fabrication grid whose achieved impedance stays within `target ± tolerance` (`widthForImpedanceWithinTolerance`, also exposed as `pcb.impedanceWidth(layer, target, tolerance)`); when the design-rule floor or an explicit width forces the trace outside the band, routing warns with the achieved impedance. `tolerance` was previously accepted and never used.
  - `typecad import` now round-trips zones and rule areas instead of silently dropping them: filled pours emit `pcb.zone({...})` with polygon `points`, the grouped `fill` object, thermal/pad-connection and island settings; rule areas emit `pcb.keepout({...})` with their per-category restrictions and `placement`. Unconnected pours (KiCad net 0) import without a net — `pcb.zone()` accordingly accepts an unconnected pour (neither `pin` nor `net`), while providing both is still an error.
  - Import review fixes: legitimate zero values survive parsing (`island_removal_mode 0` — "never remove islands" — was dropped by a truthiness check); `locked` zones detect KiCad's bare-atom form; `locked`, `filledAreasThickness`, and hatch outline settings are now emitted; and rule-area codegen emits only options `pcb.keepout()` actually accepts (KiCad-authored rule areas carry `min_thickness`/`fill` blocks that previously produced non-compiling code).
  - Removed the keepout `smoothing`/`smoothingRadius` options: they were serialized as zone-level `(smoothing ...)`, a token KiCad's parser rejects (verified against KiCad 10) — setting them produced unloadable boards.

- ada1e65: Late `component.pcb = { x, y }` assignment now accepts deferred placement values.

  - The `pcb` field is a resolving accessor: assignment takes `PlacementNumber` (e.g. `board(pcb).fromLeft(5)`), resolves against the component's footprint immediately, and validates finiteness — reads always return plain numbers, so every downstream consumer (serializer, autorouter, placement) stays type-clean. Previously only the constructor accepted placement values; assigning after construction was both a type error and silently stored the unresolved value.

- ada1e65: Relative placement is order-independent — no more call-order fore-knowledge.

  - `below()`, `above()`, `rightOf()`, `leftOf()` no longer bake the source component's position into a number at `.by()` time: every placement value re-reads the source's live position and bounds when resolved. Position a component relative to another _before_ either has its final position, and the relationship holds.
  - `board(pcb)` no longer snapshots the outline at call time — all properties (`center`, `left`, `fromTop()`, ...) are re-read on every access. `board()` can be called before `pcb.outline()`; values follow the final outline.
  - `sameAs(c).x/.y` return placement values (still assignable wherever a number was) that re-read the component's position at resolve time.
  - Components re-resolve their deferred placement expressions at `create()` (fixpoint over chains: `r3` below `r2` below `r1` settles regardless of assignment order). Manually moving a component after assigning an expression freezes that axis — the manual value wins.
  - `.by(gap, target)` now returns a deferred `PlacementValue` instead of an immediately-resolved number (assignable anywhere a `PlacementNumber` is expected; `resolvePlacement(value, footprint)` is exported for manual resolution).
  - `pcb` coordinates now accept the placement helpers directly: `j1.pcb = { x: sameAs(mh1), y: below(mh1) }` works without `.x` / `.by()` — a builder resolves with its default gap, and a `sameAs` result picks the axis being assigned. `PlacementInput` is the accepted union.
  - Edge-to-edge math is now origin-relative and rotation-faithful: footprint bounds carry the occupied box relative to the footprint origin (`minX/minY/maxX/maxY` — many origins are pin 1 or a corner, not the body center), and placement rotates the full box with the same transform KiCad uses for pads before computing edges. `below(mh1).by(0.1)` now yields exactly a 0.1mm physical gap for a rotated, off-center part like a terminal block — previously the gap was silently off by several mm. Create()-time re-resolution passes the component's rotation (fixed a bug where it re-resolved unrotated).

- ada1e65: Font selection for board text.

  - Component text layouts (`referenceLayout`, `valueLayout`, `fabLayout`, and `text` entries) accept `font` — a TrueType face name written as KiCad's `(face "Name")` inside the text effects. Omit it for KiCad's default stroke font. Example: `r1.referenceLayout = { x: 0, y: -1.5, font: 'Arial', bold: true }`.
  - Fixed `bold` and `italic` on component text being dead options: they are now emitted as the font-block symbols (previously accepted and silently dropped).
  - `pcb.text({ font })` already emitted `(face ...)` and is unchanged; both paths verified against the KiCad 10 parser.

- ada1e65: N-layer boards, phase 2: layer roles, net-class layer affinity, and a via manufacturing policy.

  - `pcb.plane(net, layer)` dedicates a copper layer to a net. At `create()` the plane is materialized as a board-covering filled zone on that layer (through-hole-only pad connections), and the layer is excluded from the autorouter's default routing layers. The plane extent comes from the board outline, so `pcb.outline()` must be called before `create()`; a layer can carry only one plane.
  - Net classes accept `layers: string[]` — preferred routing layers for the class's nets. The autorouter anchors the net's through-hole endpoints on the class's layer and favors it while routing. Layers must be declared copper layers; plane layers are ignored.
  - `pcb.viaPolicy({ type: 'through' | 'blind-buried', maxSpan? })` controls the spans of vias placed by the autorouter. The default is `through` (every router via spans F.Cu→B.Cu — the budget-fab-friendly choice); `blind-buried` lets the router use the exact layer pair a route transitions between, within `maxSpan` layer boundaries (default 2), falling back to through vias for deeper transitions. Previously inner-layer transitions always emitted blind/buried spans.
  - `IViaPolicy` is exported from the package root.

- ada1e65: Via stitching, teardrops, and arc graphics.

  - `pcb.stitch(net, options?)` ties a net across layers with a clearance-aware grid of vias — the standard way to connect outer-layer pours to inner planes. Candidates on a pitch grid over the board outline (inset by `margin`) or an explicit `area` are skipped when they would violate clearance against existing copper (pads, tracks, vias, zones, keepouts) on any layer the stitch spans; same-net pours and tracks never block (connecting through them is the point), while same-net pads/vias still enforce hole-to-hole spacing. Components block stitches regardless of net — including components that are only net-registered and not yet placed (discovered from the schematic) — so stitches never land on footprints. A partial `layers` span emits blind vias over exactly that span, and a pitch below via size + clearance is rejected. Options: `layers` (span, default all copper), `pitch` (default 1.5mm), `size`/`drill`, `area`, `margin`. Returns the number of vias placed.
  - `pcb.teardrops(options?)` reinforces track-to-via junctions. It writes KiCad's teardrop tool configuration (`teardrop_options`/`teardrop_parameters`, fixture-verified shape) to the `.kicad_pro`, and — for vias placed by the autorouter — generates the teardrop geometry itself as tapered side segments on each layer the via's tracks arrive and leave, part of the routed net. Options: `vias`/`throughHolePads`/`smdPads`/`trackEnds` targets, `shape: 'round' | 'rect'`, `maxLength` (default 1mm), `maxHeight` (default 2mm).
  - `pcb.arc({ start, mid, end, layer, width })` draws arcs on any board layer — KiCad's three-point arc definition — completing the graphics set alongside line/circle/rect/poly.
  - The `Default` net class seed in `.kicad_pro` output no longer carries hard-coded `diff_pair_*` values (matching the earlier fix for user classes).
  - Text blocks stitches: `pcb.text()` elements, component reference/value/fab text (explicit layouts, text entries, and the footprint's default positions — transformed for rotation and back-side placement), and reference designators all keep stitch vias off their bounding boxes on the side of the board they occupy.

- 8efc912: Rectangle-geometry APIs accept a `bounds` object — `pcb.board` passes straight through.

  - `pcb.zone()`, `pcb.keepout()`, `pcb.rect()`, and `pcb.stitch({ area })` accept `bounds`/`area` as a bounds-style rectangle: `{ left, top, width, height }` (e.g. `pcb.board`) or `{ x, y, width, height }`. `pcb.zone({ net: 'GND', bounds: pcb.board, layers: [...] })` replaces the field-by-field `x: board.left, y: board.top, width: board.width, height: board.height` mapping. Bounds shift with group offsets like the other geometry forms, and combining `bounds` with `points` or `x/y/width/height` is rejected. `IBoundsLike` is exported.

- ada1e65: N-layer boards, phase 3: stackup physics — material overrides, controlled-impedance routing, span-weighted via costs.

  - `pcb.stackup(n, { layers: { ... } })` accepts per-layer overrides (thickness, material, epsilon_r, loss_tangent, color) keyed by layer name — coppers (`"In1.Cu"`), dielectrics (`"dielectric 2"`), and masks. Overridden dielectric thickness is compensated by the remaining dielectrics so the board still totals `pcb.thickness`; unknown names and over-budget overrides throw with actionable messages.
  - Controlled impedance is now real: `pcb.impedanceWidth(layer, targetOhms)` computes the trace width for a target characteristic impedance from the board's resolved stackup geometry (microstrip on outer layers, symmetric stripline on inner). `pcb.route({ impedance: { target, tolerance } })` applies it automatically — the trace widens to hit the target, never below the design-rule floor. `impedanceOfWidth`, `widthForImpedance`, and `stackupImpedanceGeometry` are exported for custom calculations. Engineering-grade accuracy (typically within fab tolerance).
  - Under the `blind-buried` via policy the router's via cost now scales with the number of layer boundaries a transition crosses, so it prefers shallow blind/buried vias over deep ones.
  - Fixed a pre-existing docgen bug where stackup extraction (`extractStackup`) could not parse any board file — symbol-headed S-expression nodes were never matched, so the rendered stackup was always empty. Inner copper layers now parse correctly, and the gitdiff inner-layer detection (`detectInnerCopperLayers`) is covered by tests.

- ada1e65: `pcb.stitch()` is now declarative — no `pcb.add()` or ordering knowledge needed.

  - `pcb.stitch(net, options)` records a request (validating net, pitch, and layers at the call) and the vias are placed at `create()` time against the complete board contents. Every component passed to `create()` is visible to the stitcher — netted or not — so mounting holes and other mechanical parts no longer need `pcb.add()` beforehand, matching how `pcb.plane()` already works. Repeated `create()` calls replace previously placed stitch vias instead of duplicating them.
  - **Breaking**: `stitch()` no longer returns the via count (placement is deferred); count vias in the generated board if needed. Region errors (no outline and no `area`) surface at `create()` instead of at the call.

- 92bfaa1: Placement DX: targeted errors, live arithmetic, body-centering, bounds warnings.

  - Bad coordinate assignments now fail with actionable messages instead of cryptic ones — passing an un-called helper (`y: pcb.board.fromLeft` instead of `fromLeft(5)`) reports `pcb.y received the function "fromLeft" — did you mean to call it?`; strings, null, and keyless objects report the axis and what was received.
  - `PlacementValue.plus(n)` / `.minus(n)` return new deferred values — `x: pcb.board.sameAs(r1).x.plus(2)` nudges while staying live (re-resolves at `create()` if r1 moves). `sameAs(c).x/.y` are typed `PlacementValue` so the chain type-checks.
  - `pcb.board.centered()` returns `{ x, y }` placement values that center the component's occupied box (rotation- and origin-aware), unlike `board.center` which centers the origin point: `u1.pcb = { ...pcb.board.centered() }`.
  - A footprint whose bounds cannot be resolved (bad name/library path) warns once per name the first time any placement math uses it, instead of silently collapsing to zero-size.

- 327f04e: Footprint text overrides become fully optional and autocompletable. `TextEntry.property` now suggests the conventional KiCad property names (`Reference`, `Value`, `Footprint`, `Datasheet`, `Description`, `MPN`) while still accepting any custom name. All other entry fields (`text`, `x`, `y`, rotation, layer, font, visibility) are optional: omitted fields keep the footprint's own layout instead of being reset, and `show: false` on `referenceLayout`/`valueLayout` now actually hides the designator (three-state — omitting `show` leaves footprint visibility untouched). Via stitching no longer reserves avoidance boxes for hidden text, and text entries without a position no longer produce degenerate boxes.
- ada1e65: Zone property coverage: polygon geometry and previously dead or missing options.

  - `pcb.zone()` accepts its fill settings grouped in an optional `fill` object (mirroring KiCad's `(fill ...)` block): `mode`, `arcSegments`, `thermalGap`, `thermalBridgeWidth`, `smoothing`/`smoothingRadius`, `islandRemovalMode`/`islandAreaMin`, and the seven `hatch*` options. `fill: false` creates an unfilled zone outline. The existing flat fill options remain supported; when both are given, the `fill` object wins per field. `IZoneFillOptions` is exported from the package root.
  - `pcb.zone()` and `pcb.keepout()` accept an explicit polygon via `points` (≥ 3 vertices) as an alternative to the `x`/`y`/`width`/`height` rectangle — L-shaped and irregular pours/keepouts are now expressible. Providing both forms (or neither) is rejected with an error. The zone's bounding box fields stay consistent, so obstacle building and board math work identically.
  - `filledAreasThickness` is now serialized as `(filled_areas_thickness yes|no)` — it was accepted but silently dropped before.
  - `islandRemovalMode` now actually defaults to 2 (remove islands below `islandAreaMin`), matching the documented behavior; the value is emitted to the board.
  - Fixed hatched zones producing boards KiCad cannot load: the fill mode was serialized as `(mode hatched)`, but KiCad's parser only accepts `hatch` (or `polygon`/`segment`). Hatched zones now emit `(mode hatch)` — verified against the KiCad 10 parser.
  - Keepouts (rule areas) accept `placement` (also applies to footprints placed from a schematic sheet), serialized as `(placement (enabled ...) (sheetname ""))` — verified against the KiCad 10 parser.
  - `hatchWidth` is accepted as an alias of `hatchThickness` (flat and in the `fill` object) — KiCad's zone dialog labels the setting "Hatch width" while the file token is `hatch_thickness`; the file-token name wins when both are given at the same level.

### Patch Changes

- ada1e65: Via stitching keeps clear of mechanical footprints' full keep-clear zones.

  - `pcb.stitch()` body blockers now use the footprint's **full graphical extent** (pads + silkscreen/courtyard geometry, rotation-aware via `getFootprintBounds`) instead of the pad bounding box — a mounting hole's pad is drill-sized while its screw-head keep-clear zone is the footprint outline. Falls back to pad bounds when the footprint file can't resolve.
  - Netless components (`pcb.add()`ed mechanical parts like mounting holes) are now discovered for stitching via `schematic.components` — previously only net-referenced components were found, so parts with no net were invisible to the stitcher.

- Board viewer, built in: a zero-dependency Gerber (RS-274X) + Excellon parser now lives in this package (`@typecad/typecad/gerber-viewer` for programmatic use; `parseGerber`, `parseExcellon`, `detectLayer`, `renderSvg`, `buildViewerFromFiles`, `startGerberViewerServer`). The `gerber-viewer` CLI ships with the package: `gerber-viewer <dir> -o view.html` renders a self-contained interactive viewer, and `gerber-viewer serve` watches a project's `build/*.kicad_pcb`, re-exports gerbers via `typecad export`, and live-reloads the page on every `npm run build`. `typecad create` scaffolds every new project with a `gerber_viewer` npm script wired to it (http://localhost:4173); the generated `.gitignore` excludes `build/serve/` and the generated AGENTS.md documents the script.

## 1.0.0-alpha.1

### Major Changes

- #### No-postinstall package file sync

  Component packages no longer need an npm `postinstall` script to install their KiCad files. When a `Package` subclass is constructed during a build, typeCAD automatically syncs the package's bundled `build/lib/` (symbols, footprints, 3D models) into the project's `./build/lib/` — mtime-guarded so repeat builds skip unchanged files. Works with any package name, registry layout, `file:` dependencies, and monorepo links.

  - `Package` subclasses get the sync automatically in the constructor
  - Hand-rolled classes can call the new exported `syncThisPackageBuildLib()` helper
  - `typecad add package` no longer generates a `postinstall.js`

  #### Irregular board outlines

  New Edge.Cuts shape builders beyond the filleted rectangle:

  - `outlinePolygon(points)` — arbitrary polygon boards
  - `outlineCircle(cx, cy, r)` — circular boards
  - `cutout(points)` / `cutoutCircle(cx, cy, r)` — internal cutouts (milled slots, mounting holes)
  - `outlinePath(x, y)` builder with `.lineTo()`, `.arcTo()`, `.close()` for free-form mixed line/arc contours

  #### Fixes
  - Re-exported `Schematic` (restores the public API expected by `@typecad/passives/tie`)
  - `registerReference` is now idempotent — components constructed by a `Package` keep their references when `create()` registers them again, instead of being renamed
  - Schematic rendering: via components (which have no symbol by design) are skipped instead of erroring; net-label pin owners are backfilled for standalone `new Pin(...)` declarations; power-symbol lookups no longer warn for auto-generated net names
  - Updated dependencies: chalk 6, markdown-it 15 (types now bundled; `@types/markdown-it` removed), vitest 4, ESLint 10, changesets 3
