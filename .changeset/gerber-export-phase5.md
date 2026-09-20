---
'@typecad/pcb': minor
---

Native zone fill: copper pours are computed in-process with clipper-lib (Boost) — clearance from foreign pads/tracks/arcs/vias, thermal-relief spokes built analytically, edge pullback via chained Edge.Cuts outlines, keyhole-ring output that KiCad re-reads. Hatch-mode zones render as KiCad-style border rings plus 45°/135° capsule hatch lines (hatch_thickness/gap/orientation/min_hole_area honored). `typecad-pcb export gerbers` now refills declared-but-unfilled zones automatically (the --check-zones equivalent), so pour copper is never silently missing; boards with saved fills plot them unchanged. Also switches `export drill` to the native writer (--kicad escapes to the legacy plotter) and adds a permissive Hershey "futural" stroke font (public domain) replacing KiCad's GPL newstroke data for license compatibility — text layers diverge from kicad-cli goldens by design (structure still verified).
