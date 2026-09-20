# Gerber / Drill Export Spec — Phase 0 capture

Ground truth for replacing `kicad-cli pcb export gerbers|drill` with a native
plotter. Everything below is **observed**, not assumed: it was captured by
re-plotting the fixture boards with the same flags the current pipeline
ships, then diffing against the project's own output.

> **Status update — Phases 1+2 complete:** a native writer now exists at
> `@typecad/pcb/src/gerber_export/` and reaches **byte parity** with the
> kicad-cli goldens on the features board (all 4 copper layers + every
> non-text graphics layer) and structural parity on rd_skeleton (pours within
> KiCad's own refill variance). Remaining: silk/fab/user **text strokes**
> (Phase 4), drill + job files (Phase 3). Run `npx tsx gerber_spec/tools/parity.ts`.
> The findings below are encoded in that writer; new landmines found during
> parity work are marked **[parity]**.

## Environment & method

- **KiCad:** `kicad-cli 10.0.0` (`C:/Program Files/KiCad/10.0/bin/kicad-cli.exe`), win32
- **Flags (identical to the shipping pipeline):**
  - `pcb export gerbers --output <dir> --check-zones <board>.kicad_pcb` — everything else default
  - `pcb export drill --output <dir> <board>.kicad_pcb` — all defaults
  - These match `@typecad/jlcpcb-export/src/index.ts:332` and
    `@typecad/pcb/src/cli/typecad/commands/export.ts` (the `--check-zones`
    gate is KiCad ≥ 9). **The fab naming spec is: kicad-cli defaults.**
- **Reproduce:** `tools/capture.sh` re-plots both boards and verifies determinism.

### Fixtures

| Board | Layers | Notable content |
|---|---|---|
| `boards/rd_skeleton` (full project copy) | 2 | GND zone pour, 0402/0603/QFN-type parts, NPTH slots (castellated/mousebite), refdes silk |
| `boards/demo/autoroute_test.kicad_pcb` | **4** | inner copper (`In1_Cu`, `In2_Cu`), vias, routed tracks |
| `boards/features/features.kicad_pcb` (hand-authored) | **4** | **gap coverage:** oval + trapezoid + custom pads (all primitive types), oval-drill slot, rotated footprint (37°) + rotated rect pad (30°), arc tracks on 3 layers, rounded-corner Edge.Cuts, silk arc, fab circle/poly, stroke **and** TTF text, through + blind + buried + micro vias, inner-layer pour |

### Determinism findings

- Back-to-back plots of the same board are **byte-identical except embedded
  timestamps**: `%TF.CreationDate`, the `G04 Created by KiCad (PCBNEW …) date …`
  comment (gerbers), and the `; DRILL file KiCad … date` / `; #@! TF.CreationDate`
  lines (excellon). Nothing else varies.
- The project's already-shipped `rd_skeleton/hw/build/gerbers/` are
  content-identical to a fresh default plot (all 26 files, timestamps stripped).
  → golden fixtures are stable and representative of production output.
- **One exception observed:** the features board's *first-ever* capture showed
  real content drift across all four copper layers on the immediate replot;
  two subsequent full re-captures were clean (timestamps-only). Suspect the
  zone filler's first-run state (the features board was plotted before its
  zone had ever been filled/refilled in place). Re-check in the Phase 1 diff
  harness; if it recurs, always discard a board's first plot before freezing
  goldens.

## File set & naming

Output name pattern: `<boardname>-<LayerName>.<ext>` (dash separator), plus
`<boardname>.drl` and `<boardname>-job.gbrjob`. Default export emits **every
layer with drawable content** — including Courtyard/Fab/Adhesive/Margin/User
layers (26 files for rd_skeleton). Extension map (KiCad canonical):

| Layer | Ext | | Layer | Ext |
|---|---|---|---|---|
| F_Cu | `.gtl` | | B_Cu | `.gbl` |
| In1_Cu / In2_Cu | `.g1` / `.g2` | | (In*N* → `.gN`) | |
| F_Paste / B_Paste | `.gtp` / `.gbp` | | F_Mask / B_Mask | `.gts` / `.gbs` |
| F_Silkscreen / B_Silkscreen | `.gto` / `.gbo` | | Edge_Cuts | `.gm1` |
| F_Adhesive / B_Adhesive | `.gta` / `.gba` | | everything else (Fab, Courtyard, Margin, User_*) | `.gbr` |

`jlcpcb-export` consumes this default set verbatim (gerbers dir → `gerbers.zip`);
JLCPCB accepts it as-is.

## .kicad_pcb format rules that bite plotters **[parity]**

These were discovered the hard way while reaching byte parity:

- **A pad's `(at x y angle)` angle is its ABSOLUTE orientation** — footprint
  rotation must already be baked into every pad's angle by the board writer.
  The pad **position** is relative to the footprint and IS rotated by the
  footprint angle at load, with the matrix `(x cosθ + y sinθ, −x sinθ + y cosθ)`.
  Evidence: typeCAD's own boards (demo) write pad angle 270 under a 90°
  footprint; a hand-authored board that wrote 0 under 37° plotted unrotated
  shapes at rotated positions (kicad-cli plots exactly what the codes say).
  `boards/rot_probe/rot_probe.kicad_pcb` is the semantics-proof fixture.
- **Pad SHAPE rotation uses the transposed matrix** (cosθ, −sinθ / sinθ,
  cosθ) relative to the position matrix — verified numerically on rotated
  roundrect corners and HorizOval end caps.
- **Net codes with gaps get remapped at load.** A board declaring
  `(net 0)(net 1)(net 2)(net 15)` resolves *bare* `(net 1)` references on
  vias/tracks against a rebuilt (alphabetical) table — net 1 became GND.
  Pads/zones carry inline names and are immune. Contiguous codes (all real
  typeCAD boards) are safe. The features fixture was renumbered to 0–3.
- **kicad-cli `--save-board` reserializes aggressively**: net declarations
  lose their codes (`(net "GND")`), zones use singular `(layer …)` with
  per-polygon layer tags, layer-table ids are renumbered (In1 got id 4).
  Layer identity is only stable by NAME. Both forms must be parsed.
- **Through vias flash annuli on EVERY copper layer** — the via's `type`
  (absent = through) governs; the `layers` span is metadata for through
  vias. Only typed blind/micro vias restrict to their span.
- **NPTH pads with size == drill are not flashed on copper** (pure
  mechanical holes; observed on J5's empty-number pad).
- **Inner-copper pads carry `%TO.N` + `%TO.C,ref` (no `%TO.P`)**; outer
  layers carry `%TO.P` + `%TO.N`. `%TD*%` closes each footprint's pad group.
- **Aperture taxonomy**: smd + both dims < 0.254 → `BGAPad,CuDef`; smd +
  both dims > 2.54 → `HeatsinkPad`; smd else `SMDPad,CuDef`; thru_hole →
  `ComponentPad`. Tracks/zones → `Conductor`.
- **Segments plot before arcs** within a layer (separate collections), and
  `G01*` is emitted right after every arc `D01`.
- **Item-order variance**: the first plot after a board edit can reorder
  net-attribute groups (observed on B_Cu) — harnesses must canonicalize or
  re-plot; geometry never varies.

Header block, in order (verbatim from `rd_skeleton-F_Cu.gtl`):

```
%TF.GenerationSoftware,KiCad,Pcbnew,10.0.0*%
%TF.CreationDate,<ISO8601 with TZ>*%
%TF.ProjectId,<boardname>,<uuid-ish GUID>,rev?*%
%TF.SameCoordinates,Original*%
%TF.FileFunction,Copper,L1,Top*%        (per-layer, see table)
%TF.FilePolarity,Positive*%             (per-layer, see table)
%FSLAX46Y46*%                           ← 4 integer + 6 decimal digits, absolute, leading-zero-omitted
G04 Gerber Fmt 4.6, Leading zero omitted, Abs format (unit mm)*
%MOMM*%                                 ← always millimeters
%LPD*%                                  ← dark polarity at file level
G01*
G04 APERTURE LIST*
```

- **Coordinates:** X/Y integers scaled by 10^6 (mm, 6 decimals). **Y is
  negated** relative to the `.kicad_pcb` file (plot flips Y; board Y-up →
  gerber Y-down). e.g. `X16825000Y-15000000` = (16.825, −15.000) mm.
- **Per-layer FileFunction/FilePolarity:**

| Layer kind | FileFunction | FilePolarity |
|---|---|---|
| F_Cu | `Copper,L1,Top` | Positive |
| B_Cu | `Copper,L2,Bot` | Positive (inner: `Copper,L2,Inr` — observed on `In1_Cu.g1`) |
| F/B_Mask | `Soldermask,Top/Bot` | **Negative** |
| F/B_Paste | `Paste,Top/Bot` | Positive |
| F/B_Silkscreen | `Legend,Top/Bot` | Positive |
| Edge_Cuts | `Profile,NP` | Positive |
| F/B_Adhesive | `Glue,Top/Bot` | Positive |
| Courtyard/Fab/Margin/User | `Other,<LayerName>,Top/Bot/`? | Positive |

### Apertures

- Standard shapes observed: `C,<dia>` (circles — all track/via drawing and
  round pads), `R,<w>X<h>` (axis-aligned rect pads), `O,<w>X<h>` (oval pads —
  SMD and thru-hole alike), plus four **aperture macros**: `RoundRect`,
  `RotRect`, `Outline4P`, `FreePoly*`. 47 apertures on rd_skeleton F_Cu.

**`RoundRect`** — every rounded-rect pad; emitted once per file, verbatim:

```
%AMRoundRect*
0 Rectangle with rounded corners*
0 $1 Rounding radius*
0 $2 $3 $4 $5 $6 $7 $8 $9 X,Y pos of 4 corners*
4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*   ← body polygon (4 corners, closed)
1,1,$1+$1,$2,$3*                          ← corner circles ×4
20,1,$1+$1,$2,$3,$4,$5,0*                 ← corner filler rects ×4
… (repeat for corners 2–4; see any golden copper file for the exact body)
```

Instantiation passes corner coords + rotation: `%ADD10RoundRect,0.200000X0.200000X0.275000X…X0*%`
(params: `$1`=radius, `$2..$9`=4 corner XY pairs, last=rotation degrees).
**Rotation param is always 0** — the corner pairs are arbitrary XY, so
rotation is baked into pre-rotated corners (a non-square roundrect at an odd
angle gets rotated corner coords; the features board's square roundrect under
a 37° footprint plots axis-aligned because it's rotation-invariant — the
mechanism is pre-rotation either way). KiCad quirk: coordinates like `0.249999`
appear (float rounding), e.g. `%ADD17RoundRect,0.249999X-0.850001X…`.

**`RotRect`** — plain rect pads rotated to a **non-orthogonal** angle. This is
the one aperture that carries an explicit rotation parameter:

```
%AMRotRect* … 21,1,$1,$2,0,0,$3*%        ← single exposed line prim, $3 = CCW degrees
%ADD11RotRect,2.000000X1.000000X30.000000*%   ← pad "2" (rect 2×1 @ 30°)
```

(An axis-aligned `R` stays `R`; a 90°-rotated rect is presumably `R` with
swapped dims — unverified.)

**`Outline4P`** — trapezoid pads: free 4-corner polygon + rotation param
(`%ADD13Outline4P,-0.75X-1.25X0.75X-0.75X0.75X0.75X-0.75X1.25X0*%`).

**`FreePoly<N>`** — custom-pad primitives, one numbered macro per primitive
(N counts up within the file). Each primitive is **polygonized** into a
`4,1,<n>,<x>,<y>,…,$1` prim and flashed; curved primitives become vertex
lists, not gerber arcs. Observed polygonization (features pad 5, r=0.5
circle, small arc/rect/line):

| Primitive | Vertices | Becomes |
|---|---|---|
| `gr_poly` (filled) | 3 + closure | exact polygon macro |
| `gr_circle` r=0.5 | 21 | regular 21-gon |
| `gr_arc` (small) | 37 | flattened arc |
| `gr_rect` stroked (w=0.05) | 52 | rounded-corner *ring* (outline, not filled) |
| `gr_line` stroked (w=0.2) | 24 | capsule (round-ended stroke) |

A custom pad plots as **multiple flashes under one attribute block** — the
anchor pad shape first, then one flash per primitive (aperture select
`D15*`, `D16*`, … between flashes), all under the same `%TO.P`/`%TO.N`.

- **Aperture attributes** (`%TA.AperFunction,…*%` emitted as **TA → ADD →
  TD triplets**, one per aperture). Observed values:
  `ViaPad`, `ComponentPad`, `SMDPad,CuDef`, `BGAPad,CuDef`, `HeatsinkPad`,
  `Conductor` (tracks). Mask/paste variants use e.g. `SMDPad,MaskDef`.
  Zones carry an object-level `%TA.AperFunction,Conductor*%` in the body,
  closed with `%TD.AperFunction*%` after the region.

### Object attributes & flashes

Pad/via flashes carry X2 object attributes immediately before the `D03` and
are cleared with `%TD*%` when the object changes:

```
%TA.AperFunction,ViaPad*%      (aperture-context, once per aperture switch)
%TO.N,VCC*%                    ← net
X16825000Y-15000000D03*
%TO.P,R1,2*%                   ← refdes + pad number (pads only)
%TO.N,net5*%
X15175000Y-15000000D03*
%TD*%
```

`%TO.C`/`TO.R` (component/refdes grouping) appear in KiCad output for some
footprint graphics; **not observed in these fixtures** (0 hits). Net names are
the board's net names verbatim (`GND`, `VCC`, `net5`, `/sub/sheet nets`, `N/C`).

### Drawing operations

- Tracks: `D02` move → `D01` stroke with a `C` aperture; width = aperture dia.
- **Arcs** (copper arc tracks, `gr_arc`/`fp_arc` graphics, Edge.Cuts corner
  arcs): one `G75*` (multi-quadrant mode) is issued when the file first needs
  an arc, then each arc is `G02`/`G03` + `D01` with **I/J relative center
  offsets**: `G75*` … `G02*` `X62000000Y-62000000I2000000J0D01*`. KiCad emits
  single `G74` only for single-quadrant arcs; observed output used `G75` for
  all arcs including quarter-circle edge corners.
- Zone pours: one `G36 … G37` region per pour — the filled polygon at
  10 nm-ish resolution (rd_skeleton's GND pour ≈ 93,900 segments; the features
  board's simple inner pour ≈ 570). New contours inside a region start with a
  `D02`. Holes/cutouts rely on even-odd contour overlap. Works the same on
  inner layers (`In1_Cu.g1`).
- Silkscreen text, **stroke font**: pen strokes (`D01`s, ~1,700 for
  rd_skeleton's refdes set) plus `G36` regions for filled glyph shapes.
  **TTF font** (`face "Arial"`): each glyph renders as its own **filled
  `G36` region** (outline contours, no stroking) — 6 letters → 6 regions.
  No flashes on silk either way.

## Graphics-layer conventions **[parity — Phase 2]**

Verified byte-exact against goldens on both fixtures:

- **Item order**: board-level `gr_*` graphics first, then footprint `fp_*`
  items and pads, everything in file order. (Segments-before-arcs remains a
  copper-track rule.)
- **`gr_arc`/`fp_arc` are 3-point form** (`start`/`mid`/`end` are three
  consecutive points on the arc — NOT center-form; the Phase 0 fixture was
  re-authored accordingly). Every arc is emitted as `G75` + `G02/G03` + I/J
  center offset + `G01` reset — G75 is re-issued per arc.
- **Edge.Cuts arcs normalize to clockwise (G02) traversal**: an arc authored
  CCW plots reversed (end→start) with identical geometry. Other layers keep
  authored direction.
- **Arc center floats differ from the raw circumcenter** by 1–16nm (KiCad's
  internal arc representation); the parity harness tolerates ±50nm on I/J.
- **Rects canonicalize to min-corner-first**, clockwise, regardless of
  authored start/end, with a repeated closing vertex.
- **Circles** render as two G02 semicircle arcs. Unfilled: path at item
  radius from the authored end point, pen = stroke width. **Filled**: fat
  pen of `r + w/2` on a half-radius path starting at angle 0 (covers the
  disk plus half-stroke growth, matching filled-poly semantics). `(fill no)`
  is NOT filled — KiCad writes `yes`/`no`/`solid`.
- **Filled polys** render as a stroked outline (with closure) AND a `G36`
  region of the same points.
- **Attribute grouping**: footprint graphics open `%TO.C,ref*%` groups that
  replace each other with **no `%TD*%` between footprints** and exactly one
  trailing `%TD*%` (only when any group opened). Graphics: attribute BEFORE
  aperture select; **mask/paste pad flashes: aperture select first, then
  `%TO.C`, one `%TD*%` per footprint**. Board-level `gr_*` carry no object
  attributes; Edge apertures carry `TA.AperFunction,Profile`.
- **Mask/paste openings equal the copper pad shapes exactly** (no swell or
  shrink observed on boards without explicit margins — an open question for
  boards that configure them). Mask includes NPTH pads; `*.Mask`/`*.Paste`
  wildcards on pad layers must be honored.
- **Per-layer FileFunctions** incl. quirks: courtyard/margin/User.1–4 =
  `Other,User`; User_Drawings = `OtherDrawing,Comment` (sic); User_Comments
  = `Other,Comment`; Eco1/Eco2 = `Other,ECO1/2`; Fab = `AssemblyDrawing,Top/Bot`.
  Files without polarity (edge/courtyard/fab/user) omit the `%TF.FilePolarity`
  line entirely. KiCad emits ALL 27 standard layer files by default, empty
  ones included (header + empty aperture list + M02).



```
## Excellon drill (`.drl`)

```
M48
; DRILL file KiCad 10.0.0 date <ISO8601>
; FORMAT={-:-/ absolute / metric / decimal}
; #@! TF.CreationDate,…            ← X2 attributes carried as ; #@! comments
; #@! TF.GenerationSoftware,Kicad,Pcbnew,10.0.0
; #@! TF.FileFunction,MixedPlating,1,2      ← mixed PTH+NPTH, copper layers span
FMAT,2
METRIC
; #@! TA.AperFunction,Plated,PTH,ViaDrill
T1C0.150
; #@! TA.AperFunction,NonPlated,NPTH,ComponentDrill
T10C1.500
…
%
G90
G05
T1
X31.037Y-24.037              ← plain decimal mm, absolute, Y negated (same flip as gerbers)
T10
X107.85Y-62.9G85X109.15Y-62.9   ← ROUTED SLOT: G85 = slot mode (mill), coords = from→to
G05
M30
```

- Tools sorted by diameter, plated first; each carries `TA.AperFunction`
  (`Plated,PTH,ViaDrill` / `Plated,PTH,ComponentDrill` / `NonPlated,NPTH,ComponentDrill`).
- Slots are routed (`G85 … G05`), never stamped as overlapping hits. An **oval
  pad drill** (`drill oval 0.6 1.8`) becomes a routed slot with a
  minor-diameter tool: `T4C0.600` + `X59.593Y-59.205G85X59.593Y-60.405`
  (span = major − minor, along the rotated major axis), attributed
  `Plated,PTH,ComponentDrill`.
- Single merged file (PTH+NPTH together) — this is the kicad-cli default and
  what JLCPCB expects from the current bundle.
- **⚠ Blind/buried/micro vias are merged into the same file with no layer-span
  marking.** The features board's blind (F→In1), buried (In1→In2), and micro
  (F→In1) vias all appear as plain `Plated,PTH,ViaDrill` hits alongside the
  through vias; `TF.FileFunction,MixedPlating,1,4` is the only span hint.
  KiCad's GUI would emit separate per-span drill files; kicad-cli defaults do
  not. For a fab this is underspecified — **decision point for the native
  exporter**: match kicad-cli parity (current bundle behavior) or emit
  per-layer-pair files (what fabs actually want for non-through vias).
  typeCAD boards today are effectively all-through-via, so parity is safe
  until blind/buried vias become user-facing.

## Job file (`-job.gbrjob`)

JSON with `Header` (software/date), `GeneralSpecs` (ProjectId, board Size,
LayerNumber, BoardThickness, Finish), `DesignRules[]` (min clearances/width),
and `FilesAttributes[]` listing every gerber with `Path`, `FileFunction`,
`FilePolarity`. Straightforward to synthesize from board data.

### Job-file conventions **[parity — Phase 3]**

All verified byte-exact against goldens:

- **FilesAttributes omits courtyard and margin files** (23 of 26 for
  features), in a fixed order: copper F/In…/B, adhesive, paste, silk, mask,
  drawings, comments, eco, edge, fab, User 1–4. **Every entry carries
  `FilePolarity`** (Positive except mask Negative) — even layers whose
  gerber file omits the polarity line (edge/fab/user).
- **The job's FileFunction dialect differs from the gerber headers**:
  paste → `SolderPaste`, mask → `SolderMask` (capital M), edge → `Profile`
  (no `,NP`), all user/courtyard-style layers → `Other,User`.
- **Size** = Edge.Cuts bbox with each item expanded by half its OWN stroke
  (features: 35 bbox + 0.05×2 = 35.1; rd with 0.05 strokes: 104.05).
- **LayerNumber** = copper count; **BoardThickness** from `(general)`;
  **Finish** from the stackup's `copper_finish`.
- **DesignRules**: one `Outer` entry (+ `Inner` when inner copper exists);
  clearances from the default net class (0.2), `MinLineWidth` = min track
  width on that layer set, `TrackToRegion`/`RegionToRegion` = the zone
  clearance there (keys omitted when no zones exist on the set).
- **MaterialStackup** mirrors the board's stackup block (physical-layer
  rows take the stackup `type` as their Name; dielectrics get
  `Name: "F.Cu/In1.Cu"` + a `Notes` line, and named colors like
  `FR4 natural` become RGB e.g. `R109G116B75`). **Boards without a stackup
  block get the synthesized default 2-layer set** (mask 0.01, copper 0.035,
  dielectric = thickness − 0.09).
- Whole-number `Thickness` values keep a decimal (`1.0`, not `1`).

## Excellon drill — additional parity findings **[Phase 3]**

- **Coordinate formatting** (the deep one): KiCad computes
  `xt = position_nm × 1e-6` as a **double multiply** and prints with fmt's
  `{:.3f}` = **round-half-even on the exact double**. The multiply's
  rounding direction is value-dependent — `31037500 × 1e-6` lands BELOW the
  .0375 tie (prints `31.037`) while `40037500 × 1e-6` lands ABOVE (prints
  `40.038`) — so exact ties can round either way. Verified against 16
  probe + golden data points; the writer replicates nm→double→half-even.
- **Tools number sequentially** T1..Tn in emission order (vias ascending,
  then component drills ascending, then NPTH) — no special NPTH base.
- **The body is written in two passes**: every tool's plain hits first
  (vias → component drills → NPTH), then routed slots grouped by tool — a
  tool number can appear twice.
- **Within a section**, hits and slots sort by (x asc, gerber-y desc).
- **Slot endpoints**: `(drill oval A B)` = A along pad-local X, B along
  local Y; the axis rotates with the pad's ABSOLUTE angle via the position
  matrix (local x → (cos θ, −sin θ), local y → (sin θ, cos θ)) — note this
  is the position matrix, NOT the shape matrix used for pad outlines.


## Text rendering **[Phase 4]**

- **Stroke font**: KiCad's built-in newstroke font, decoded per
  `common/font/stroke_font.cpp`: glyph strings start with a (startX, endX)
  width pair; point pairs code `value + 'R'`; `" R"` = pen up;
  `x = (c0-'R')/21 - startX`, `y = (c1-'R'-8)/21`. NOTE: the C++ source
  escapes backslashes — extraction must unescape `\` → `\` (a corrupted
  pair alignment shifts every coordinate after any `\`).
  U+0020–U+00FF are embedded in `stroke_font_data.json` (6.4 KB).
- **Glyph frame**: decoded y is used directly in the y-up file frame —
  baseline ≈ −0.95, cap top ≈ +0.05 (the FONT_OFFSET −8 convention).
- **File `(size H W)`**: the FIRST value scales y (height), the SECOND
  scales x (width). Square sizes look symmetric so this is easy to miss.
- **Vertical placement** (probe-verified, KiCad 10):
  `offsetY = sy − 0.052·th + max(0, 0.013·(0.8·sy − w))`, then
  center: `− height/2`, top: `−0`, bottom: `− height`, with
  `height = KiROUND(sy × 1.17)` in integer nm. The condensed-width term
  (0.013 × shortfall below the font's natural 0.8 aspect) was invisible in
  KiCad's published source — found by sweeping w at fixed sy.
- **Horizontal**: left: `+th/1.52`; center: `−ext/2`; right:
  `−(ext + th/1.52)`; `ext` = Σ KiROUND(glyphWidth × sx) per char
  (space = KiROUND(spaceWidth × sx)).
- **Rotation**: text angles are ABSOLUTE in the file (properties carry the
  total incl. footprint rotation), but rotate in KiCad's y-down internal
  frame — in a y-up file-frame renderer the rotation angle must be NEGATED,
  around the text anchor.
- **Emission**: one MoveTo/LineTo pair per contour segment (D02 + D01,
  repeated D02 coords); pen = explicit thickness, default = size.y/8 for
  stroke texts. Point conversion TRUNCATES double→nm (C++ (int) semantics),
  unlike the Excellon writer's half-even — different KiCad code paths.
- **Item selection**: only `property` texts render (legacy `fp_text user`
  is skipped); `(hide yes)` parses `yes` as a SYMBOL not a string — token
  compares must read `Sym.name`. Hidden typeCAD metadata properties
  (KiLib_Generator, Code) must be skipped.
- **Ordering**: board `gr_*` items (incl. gr_text) in file order, then a
  FOOTPRINT TEXTS pass (all properties, bare — no `%TO.C`), then the
  graphics pass with one `%TO.C` per footprint.
- **TTF texts**: boards carry `(render_cache "text" angle (polygon (pts …)))`
  with ABSOLUTE board coordinates — render each polygon as a `G36` region
  only (KiCad selects the pen aperture but never strokes; pen =
  thickness ?? size.y/8). No font engine needed for saved boards.
- **Remaining gaps** (tracked): sub-10nm rounding differences on rotated
  text; a few rd_skeleton refdes ordering/pen residuals (fab default pens);
  multi-line interline spacing unverified.

## Text residuals — final state (post font-10.0 + placeholder work)

**features: 26/26 files MATCH** (byte/tolerance parity across copper,
graphics, drill, job, silk, fab). rd_skeleton matches everywhere except:

- **silk ≈ 30 lines**: one filled-triangle ring rotation (identical
  geometry; KiCad's ring start is Clipper-internal — starts observed at
  index 0, 1 and 2 across three fixtures, no vertex-order rule fits all)
  plus ±1–2nm tie rounding.
- **fab ≈ 80 lines**: ±2–6nm tie rounding on substituted-text strokes,
  one swapped fp_arc pair, and a few small segment groups at
  `${REFERENCE}` substitution anchors.

Fixes that closed the rest: glyph data re-extracted from the **10.0
branch** (7 glyphs differ from master); `gr_text` text lives in `raw[1]`
(raw[2] is the `at` node — indexing it rendered the literal string
"at,52,48,0"); `${REFERENCE}`/`${VALUE}` fp_text placeholders are
SUBSTITUTED at plot time, not skipped; the plotted pen is clamped
`min(thickness, W/4)` (ClampTextPenSize) while POSITION math uses the
unclamped thickness — the two must be allowed to differ; filled-poly
rings drop the repeated closing vertex; ring starts canonicalized
(max vertex) for regions. The harness gained a soft-equal (±2 quantized
buckets on 2nm-quantized text strokes) and region ring-start
canonicalization.



## Native zone fill (Phase 6)

`@typecad/pcb/src/pcb/pcb_zone_fill_engine.ts` computes copper pours with
Clipper (clipper-lib, Boost license — Apache-compatible):

- **Obstacles**: pads (circle/rect/roundrect/trapezoid/oval, rotated with
  the position matrix), track segments and arcs (capsule strokes via
  ClipperOffset open-round on the integer-nm grid), vias (through vias
  span every copper layer; typed blind/buried restrict to their span).
- **Clearance**: foreign copper inflated by the zone's
  `connect_pads clearance`; same-net copper connects via thermal relief.
- **Thermals**: four analytic annular sectors whose angular span excludes
  the spoke half-angle (spoke width = the zone's
  `thermal_bridge_width`, gap = `thermal_gap`). Built directly as clip
  polygons — no boolean spoke-union (that approach produced incorrect
  winding with clipper-lib).
- **Edge pullback**: Edge.Cuts lines+arcs are chained into a closed
  outline (open chains skip pullback), inflated by 0.3mm, intersected
  with the zone.
- **Output**: keyhole-merged single rings per island (KiCad's
  `filled_polygon` encoding — KiCad re-reads our refilled boards), holes
  classified by Clipper's negative-area convention.
- **Net resolution**: both kicad-cli name-only `(net "GND")` and raw
  typeCAD coded `(net 3)` forms (code→name map from the net table).
- **Export integration**: `export gerbers` REFILLS all zones on export
  (--check-zones semantics — saved fills go stale after board edits);
  `--saved-fills` opts out. Stale fills are stripped (balanced-paren
  removal) before fresh ones are injected into the temp filled board.
- **Island removal**: reads `island_removal_mode` / `island_area_min`;
  default mode drops islands with no same-net connection point inside
  (pad/via centers), mode 1 keeps all, mode 2 also drops below the area
  minimum.
- **Hatch fills**: `(mode hatch)` zones fill as border + lines, matching
  KiCad's construction — every region outline stroked as a closed ring
  (`hatch_thickness` wide, round joins) plus parallel 45°/135° hatch lines
  (`hatch_orientation` 0 = 45°) at pitch `thickness + hatch_gap`, each line
  an end-rounded capsule; both intersected with the region and unioned.
  `hatch_min_hole_area` (mm²) fills stray holes below the threshold;
  effective line width is `max(hatch_thickness, min_thickness)`. The mode
  token is a Sym (`(mode hatch)` parses as `Sym { name: 'hatch' }`, not a
  string) and the island key is `island_area_min` (not `min_island_area`).
- **Keepouts**: zones carrying `(keepout …)` never fill and their
  polygons punch holes in fills on the same layer.
- **Custom pads**: obstacle built from the pad's `primitives`
  (poly/rect/circle, rotated by the pad's absolute angle); polygon
  obstacles inflate via ClipperOffset (closed-polygon round join), not a
  centroid approximation.
- **Stress**: rd_skeleton's pour (65 footprints, 4k tracks) fills in
  ~0.11 s solid / ~0.66 s hatch vs kicad-cli's ~6 s refill. Hatch parity
  on rd (shoelace copper area, same method both sides): F.Cu 4785.8 mm²
  ours vs 4064.4 kicad (+18%, denser hatch lines near obstacles), B.Cu
  2891.2 vs 4185.6 (−31%, region fragmentation differs); pour geometry
  falls in the parity harness's tolerance class by design.
- **Pitfall**: source-splice helpers must not match `(zone` as a bare
  substring — `(zone_defaults` and pad `(zone_connect` also contain it,
  which silently injected fills into the setup block (fills vanished from
  the gerbers). typeCAD's own serializer additionally puts the node name on
  its own line (`(\n  zone`), which the substring misses entirely (the
  refill then never runs). The matchers use `/\(\s*zone(?![\w-])/` and a
  regression test (`export-refill.test.ts`, serializer-style fixture)
  locks injection into the real zone.
- **Remaining gaps**: multi-poly custom pads use only the first primitive;
  hatch border always uses the `hatch_thickness` algorithm (KiCad's
  Smoothing-Level border variant is not modeled).

## Performance (bench.py, Win11, i7, KiCad 10.0.0)

Full fabrication set (gerbers + drill + job), median of 3 (kicad) / 7 (native):

| Board | kicad-cli refill+drill | kicad-cli plain+drill | native cold (tsx) | native warm |
|---|---|---|---|---|
| features (4L) | 1.13 s | 0.87 s | 1.12 s | **0.015 s** |
| rd_skeleton (2L, pours) | 16.7 s | 10.9 s | 1.63 s | **0.54 s** |
| demo (4L) | 1.14 s | 0.86 s | 1.04 s | **0.03 s** |
| synthetic (4L, 800fp/4k trk) | 3.50 s | 1.28 s | 1.42 s | **0.29 s** |

- Native wins 12–74× warm, and even beats kicad-cli cold on every board
  with pours despite paying ~1 s tsx/node startup (a compiled CLI would
  drop that).
- kicad-cli's zone refill alone costs ~6 s on rd_skeleton (16.7 vs 10.9);
  the native path plots SAVED fills (policy difference, see zone notes).
- Native time is dominated by plotting (~0.33 s of 0.39 s on the synthetic);
  parse and drill/job are minor.
- Synthetic-board sanity check surfaced one NEW cosmetic gap: odd-angle
  oval pads can emit HorizOval end-caps in swapped order vs KiCad at some
  quadrant combinations — the macro is symmetric under end1↔end2, so the
  geometry is identical; only the ADD parameter string differs. Not
  exercised by either fixture (their ovals sit at fixture-friendly angles).

## Coverage status after the features board

**Now covered** (all via `boards/features`): arcs (`G75` + `G02/G03` with I/J
offsets, on copper/edge/silk/fab), oval pads (`O` aperture, SMD + thru-hole),
oval drills (routed `G85` slots), trapezoid pads (`Outline4P`), custom pads
(every primitive type → `FreePoly*`, multi-flash under one `%TO.P`),
rotated footprint (37°) and rotated rect pad (`RotRect`), TTF text
(glyph-outline regions), inner-layer pours, blind/buried/micro vias (drill
behavior — see the caveat above).

**Still uncovered / open questions:**

- Standard `P` (polygon) aperture: **never observed in any KiCad output** —
  KiCad appears to always use macros (`Outline4P`/`FreePoly`) for polygonal
  shapes. The native plotter probably never needs `P`; note and move on.
- Rect pad rotated exactly 90° (presumably plain `R` with swapped dims — the
  writer emits that; not yet golden-verified).
- The features fixture was corrected during Phase 1 (pad angles now carry the
  absolute total angle incl. the 37° footprint; nets renumbered contiguous;
  zone fill materialized into the file via `--refill-zones --save-board`,
  mirroring what `typecad-pcb check` does to project boards). The rot_probe
  board intentionally keeps the WRONG authoring (angle 0 under rotated
  footprints) as the semantics-proof artifact.
- Zone pours: golden uses kicad-cli's in-memory `--check-zones` refill; the
  native plotter plots saved fills. Same geometry, but tessellation differs
  by a few vertices out of ~92k (nm-level rounding paths) — pour comparison
  is µm-rounded/tolerance-based in the parity harness; exact geometric
  equality is Phase 5's render-diff job.

## Native-plotter acceptance baseline

1. `tools/capture.sh` remains green (kicad-cli output = golden, timestamps aside).
2. Native output for both fixtures parses with the in-house
   `gerber_viewer` parser and renders to SVG within pixel tolerance of the
   kicad-cli-rendered golden.
3. Drill hit count / tool table matches golden exactly; aperture inventory
   matches modulo macro naming.
4. Real gate: order a board fabricated from native gerbers.
