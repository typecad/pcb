---
'@typecad/pcb': minor
---

`typecad-pcb doc` now renders layer, drill-map and stackup images natively —
the gerber exporter and SVG renderer plot the board in-process, so generating
documentation no longer requires a KiCad install. `{Render/...}` 3D images
still use kicad-cli `pcb render` when it's available — when it isn't, they
are skipped with a console warning instead of failing the document (all other
images are unaffected). Each document plots the board once and reuses it across all
images instead of spawning one kicad-cli process per image, `kicad_theme`
front-matter resolves against the gerber viewer's registered board themes
(KiCad's default palette included), and back-side layer combinations keep
their mirrored bottom-view presentation. Images may name the full built-in
user-layer range (User.1–User.9) like kicad-cli did, and boards without an
authored stackup get the synthesized KiCad default for their copper count
instead of skipping the stackup image. Also fixed along the way: the
interactive gerber viewer applied the wrong color to inner copper layers when
a layer theme was selected, and inlined doc images now carry unique SVG symbol
ids so several images can coexist in one HTML file.
