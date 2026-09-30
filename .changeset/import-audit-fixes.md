---
'@typecad/pcb': patch
---

Import audit — `typecad-pcb import` fixes found by walking the full pipeline
against the rd_skeleton demo board (KiCad 9/10 writer plus kicad-cli resave
forms):

- `acorn-typescript` is now a real dependency. It was imported optionally and
  never installed, so every TypeScript source with type annotations failed to
  parse and `--apply` matched 0 components on any real project.
- Segments and vias keep their net names: the inline `(net "NAME")` form the
  kicad-cli zone-fill resave writes was silently dropped, so all 120 demo
  tracks imported as `unnamed_Track`. Tracks now group per net
  (`track_VCC.push(typecad.track({ net: 'VCC' })…)`), chain vias match by
  net identity, and standalone vias carry their net.
- Zones: the singular `(layer "F.Cu")` form produced `layers: []` in the
  generated code; `*.Cu` / `F&B.Cu` wildcards now expand against the stackup
  copper count; `(arc (start) (mid) (end))` vertices inside zone outlines are
  tessellated into polygon points; `arc_segments` fills parse and emit.
- Apply mode: an omitted `rotation` prop no longer reports a phantom move
  (unset means 0, and angles compare modulo 360, so -90 ≡ 270); rotation and
  side are inserted into the pcb object when missing instead of being
  silently dropped.
- Matching: passives (Resistor/Capacitor without an explicit footprint) match
  by exact reference; a stale Code-property file path (renamed source file)
  falls back to searching the variable name; anonymous components can no
  longer be bound to two different references; text changes scan every
  project source file, not just files that declare footprints.
- Hidden board text (`(hide yes)`) imports as `hide: true` instead of
  resurrecting as visible silkscreen.
- Elements the importer does not consume — dimensions, Edge.Cuts bezier
  curves, zones embedded in footprints — are now reported with counts
  instead of vanishing silently.
