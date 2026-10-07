---
'@typecad/pcb': minor
---

`typecad-pcb viewer` — the board-viewer render pipeline as ONE command, and
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







