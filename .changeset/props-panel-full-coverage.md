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
