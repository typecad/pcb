---
'@typecad/pcb': minor
---

`typecad-pcb export` learns assembly outputs: `export pos`, `export bom`,
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
