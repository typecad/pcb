# Bundled KiCad libraries

Libraries shipped inside `@typecad/pcb` itself, resolved as a last resort
after the install/conf paths and the project's `build/lib/` — so boards
build on machines with no KiCad install at all.

- `power.kicad_sym` — the renderer's power-symbol/PWR_FLAG generation
  depends on it (`power:GND`, `power:PWR_FLAG`, every rail glyph).
- `Device.kicad_sym` — the six chip-passive symbols the size tables
  default to (`R_Small`, `C_Small`, `L_Small`, `D_Small`, `LED_Small`,
  `Fuse_Small`), so `new Resistor()`/`new Capacitor()`/… work out of the
  box.
- `footprints/*.kicad_mod` — the 34 chip footprints the passive size
  tables reference (R/C/L/D/LED in 0201–1210, Fuse in 0603–1210).

Source: KiCad 10.0 official libraries
(<https://gitlab.com/kicad/libraries/kicad-symbols> and
`kicad-footprints`), licensed CC-BY-SA-4.0 — KiCad's library license,
attribution here. The bundled copies are convenience fallbacks; an
installed/conf-configured library always takes precedence. Footprint 3D
model references keep their upstream `${…3DMODEL_DIR}` form — fetch
models per project with `typecad-pcb lib add --footprint …` when the 3D
view matters.
