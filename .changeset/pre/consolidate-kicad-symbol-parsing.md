---
'@typecad/pcb': patch
---

Consolidated KiCad symbol parsing into a single shared core (`src/symbol_core.ts`). The CLI add flows, the schematic renderer (`SymbolLibraryManager`), and symbol embedding (`loadSymbolLib`) now share one extends resolver and one pin walker instead of four parallel `.kicad_sym` readers. `kicad_sym_utils` is now a stateless facade (`readSymbol` / `readSymbolFile`), which removes the hidden call-order coupling between `kicad_symbol()` and `kicad_pins()`.

Behavior improvements that come with the unified semantics:
- Pin extraction is now fully recursive: pins hanging directly on the symbol node and deeply nested unit symbols are found (previously only one level of unit nesting was scanned).
- `extends` parents written as `Lib:Name` now resolve across libraries (previously mangled and silently unresolved), with circular-chain detection.
- Local `.kicad_sym` files with multiple symbols now yield the pins of the chosen symbol only — previously every symbol's pins in the file were merged into the component.
- `typecad-pcb add package` local non-interactive mode no longer reads pins from stale internal state; the symbol is resolved properly (with a warning when it can't be found).
- Symbols whose `Footprint` property has an empty value are now usable in the add flows (previously treated as invalid).

No public API was removed; the changes are internal to the CLI flows and renderer.
