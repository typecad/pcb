---
'@typecad/pcb': patch
---

- Dead code cleanup (~750 lines): removed the unused routing worker modules (`worker_pool`, `segment_worker`, `simple_routing_grid`), `pcb_board_context`, `pcb_kicad_window`, the unused `kicad-symbols` barrels and `GlobalErrorHandler`, two unused test helpers, and two orphaned ambient type declarations (`@typecad/pcb-astar`, `which`). No public API was removed.
- `pcbRegisterRouter` is now exported from the package root. The custom-router registration point was implemented, tested, and referenced by the `layout` skill docs, but was unreachable because it was never re-exported from `index.ts`.
- Tightened module boundaries: ~60 symbols that were only used inside their own module are no longer exported, including a dead type re-export block in `pcb.ts` and a redundant `LibraryInfo`/`SymbolInfo`/`KiCadCacheMetadata` re-export in `kicad-symbols/types`.
- Removed unused devDependencies: `tsx`, `typedoc`, `typedoc-plugin-markdown`.
