# Bundled KiCad libraries

Libraries shipped inside `@typecad/pcb` itself, resolved as a last resort
after the install/conf paths and the project's `build/lib/` — so boards
build on machines with no KiCad install at all.

- `power.kicad_sym` — the renderer's power-symbol/PWR_FLAG generation
  depends on it (`power:GND`, `power:PWR_FLAG`, every rail glyph).

Source: KiCad 10.0 official symbol library
(<https://gitlab.com/kicad/libraries/kicad-symbols>), licensed
CC-BY-SA-4.0 — KiCad's library license, attribution here. The bundled copy
is a convenience fallback; an installed/conf-configured library always
takes precedence.
