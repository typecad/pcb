---
'@typecad/pcb': patch
---

Every file typeCAD writes is now marked `(generator "typeCAD/pcb")` with
`(generator_version …)` auto-numbered from the package's real version, so
any board, schematic, or library file can be traced to the exact writer
build. Previously boards and schematics claimed `generator "typecad"` with
a hardcoded `0.1.0`, and the new-project template even claimed `pcbnew`,
which the KiCad file spec reserves for KiCad itself.

- Board writer, schematic renderer, footprint upgrades (the project's local
  `build/lib` copies), symbol-library merges, and the create-project
  template all stamp the shared identity.
- A rebuild re-stamps the board even when kicad-cli resaves (zone fills,
  DRC) had rewritten the marker to `pcbnew` — the regenerated file is our
  output, and preserving a stale pcbnew marker misattributed every rebuild
  to KiCad.
- Local library footprints carrying the legacy `typecad` marker are
  re-stamped in place; upstream KiCad footprints keep their own generator
  (they are not ours to claim).
- `generatorVersion()` resolves from package.json at runtime (src/ and
  dist/ layouts both work), falling back to `0.0.0-dev` only when the
  manifest is unreadable.
