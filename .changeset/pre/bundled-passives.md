---
'@typecad/pcb': minor
---

The chip passives now work out of the box on machines with no KiCad
install. @typecad/pcb bundles the six `Device` symbols the passive size
tables default to (`R_Small`, `C_Small`, `L_Small`, `D_Small`,
`LED_Small`, `Fuse_Small`) plus the 34 chip footprints those tables
reference (R/C/L/D/LED in 0201–1210, Fuse in 0603–1210), resolved as the
last resort after install/conf paths and the project's `build/lib/` —
so `new Resistor()` and friends build with zero setup. `doctor` and
`typecad-pcb lib list` report the bundled set alongside the other
sources. Bundled footprint 3D-model references keep their upstream env
form; fetch models per project with `lib add --footprint` when the 3D
view matters.
