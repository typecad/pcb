---
'@typecad/pcb': minor
---

The layout view's E properties dialog now follows the selection and covers
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
