---
'@typecad/pcb': patch
---

Pad manifest: net names now survive every `(net …)` reference form a board can carry. The manifest read only the pad node's inline name — KiCad's `(net N "name")` — so a board last saved in kicad-cli's reserialized name-only form (`(net "name")`) or the legacy coded form (`(net N)`, names only in the top-level table) produced a manifest with pin numbers but no net names: the viewer's pad labels dropped to numbers-only after such a sync, until a full typeCAD rebuild rewrote the inline names. Both writers (build and the export/viewer-path healer) now resolve through the board's net table, so labels keep their net names regardless of which tool saved the board last.
