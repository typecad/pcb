---
'@typecad/pcb': patch
---

Fixes `check` silently skipping ERC ("– erc / No .kicad_sch found") when
build/ holds more than one schematic. `findBuildFile` only returns a file
when exactly one matches, so stray `.kicad_sch` files left in build/ by
earlier projects made the ERC step report "No .kicad_sch found" even though
the project's schematic was right there. The schematic is now resolved the
same way the board is: anchored on the build manifest's board stem
(`mod-ec.kicad_pcb` → `mod-ec.kicad_sch`), falling back to the lone
`.kicad_sch` only without a board to anchor on — and when several
schematics remain ambiguous, the message says so instead of claiming none
were found. `diagnostics` picks its schematic the same way.
