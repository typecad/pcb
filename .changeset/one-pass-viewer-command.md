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
+ `download` (an SVG/PNG export path whose button left an earlier
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
