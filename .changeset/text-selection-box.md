---
'@typecad/pcb': patch
---

Layout view: a rotated footprint's labels anchor where KiCad actually plots
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
