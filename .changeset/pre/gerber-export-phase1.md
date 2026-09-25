---
'@typecad/pcb': minor
---

Native gerber export (Phase 1): new `gerber_export` module plots copper layers from a `.kicad_pcb` without kicad-cli. Byte-parity with kicad-cli 10.0.0 output on the `features` golden fixture (all 4 copper layers) and structural parity on `rd_skeleton` (pours equal within KiCad refill variance). Encodes the full observed KiCad convention set: aperture macros (RoundRect/HorizOval/RotRect/Outline4P/FreePoly), X2 object/aperture attributes, absolute pad angles, via/track/NPTH emission rules, and saved zone fills. Not yet wired into `typecad-pcb export` — parity harness lives in `gerber_spec/tools/parity.ts`.
