---
'@typecad/pcb': patch
---

`typecad-pcb doc` (and native board plotting) no longer crash on machines
without KiCad. The temp-directory helper consulted the discovered KiCad
install to detect Flatpak, which throws when none is found — and docgen's
temp manager runs that at import time, so the command died before rendering
anything. It now falls back to the OS temp dir when KiCad isn't available.
Only `{Render/…}` 3D images still need kicad-cli, and those continue to be
skipped with a warning.
