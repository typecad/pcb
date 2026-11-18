---
'@typecad/pcb': patch
---

Missing-library errors now carry their own fix. When a symbol is not in the
resolved library — e.g. a bundled partial `Device.kicad_sym` on a machine
with no KiCad install — the schematic errors end with the exact command,
`Add it to the project with: typecad-pcb lib add Device:Battery_Cell`,
from both the library manager and the component-level "Cannot update
component" error (previously only the rarer missing-library-file error
suggested anything). The missing-footprint error keeps its
`lib add --footprint` hint but no longer buries it under stacked wrapper
prefixes: the loader's already-complete message is rethrown verbatim
through the footprint-node and board-creation catch blocks instead of
gaining another `[ref, value, footprint] Failed to create footprint node`
prefix on every hop, so the actionable line reads first, not last.
