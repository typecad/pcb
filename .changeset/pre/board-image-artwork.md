---
'@typecad/pcb': minor
---

Board artwork from an image file: `new Image({ file, at, size, ... })` +
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