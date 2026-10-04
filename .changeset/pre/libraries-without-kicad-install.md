---
'@typecad/pcb': minor
---

KiCad symbols and footprints no longer require a KiCad install. Library
resolution is decoupled from the kicad-cli binary: symbols resolve from
the install, then `typecad.conf.ts` (`symbols_path`/`footprints_path`
override the install), then the project's `build/lib/`, then the `power`
library now bundled inside @typecad/pcb (the renderer's power-symbol and
PWR_FLAG generation always works). A machine with no install builds from
`build/lib/` alone — component packages already sync there.

New `typecad-pcb lib` command fills `build/lib/` on demand from the
official KiCad library repos: `lib add Device Connector` fetches whole
symbol libraries, `lib add Device:R_Small` fetches a single symbol,
`lib add power` copies the bundled library offline, and `lib list` shows
the active sources. Fetching a footprint also downloads its 3D model(s)
from kicad-packages3D into `build/lib/3dshapes/` and rewrites the
footprint's reference to `${KIPRJMOD}/lib/3dshapes/…`, so the KiCad GUI
3D viewer and kicad-cli raytrace renders find the project-owned models
with no environment setup. Downloads go through a user-level cache
(`~/.typecad/cache/kicad-libs`) and land inside the project (committable;
the board builds offline from then on). Builds never fetch — resolution
failures now point at `lib add` instead of "install KiCad".
`doctor` reports all active library sources and marks the CLI as optional
for the native flow.
