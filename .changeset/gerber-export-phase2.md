---
'@typecad/pcb': minor
---

Native gerber export (Phase 2): graphics layers — Edge.Cuts, mask, paste, silkscreen geometry, fab geometry, courtyard, adhesive, margin and user layers now plot natively from `.kicad_pcb` board items, on top of the Phase 1 copper writer. Parity with kicad-cli 10.0.0 goldens: every non-text layer byte-exact on both fixtures (mask/paste openings, edge profiles with CW-normalized arcs, courtyard `TO.C` groups, filled-circle fat-pen rendering, canonicalized rects); silk/fab text strokes remain Phase 4. Encoded conventions include the quirky user-layer `FileFunction`s (`OtherDrawing,Comment`, `Other,ECO1`, …), gr-before-fp item ordering, and filled-poly stroke+region rendering.
