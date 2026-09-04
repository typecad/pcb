---
'@typecad/typecad': minor
---

Zone property coverage: polygon geometry and previously dead or missing options.

- `pcb.zone()` accepts its fill settings grouped in an optional `fill` object (mirroring KiCad's `(fill ...)` block): `mode`, `arcSegments`, `thermalGap`, `thermalBridgeWidth`, `smoothing`/`smoothingRadius`, `islandRemovalMode`/`islandAreaMin`, and the seven `hatch*` options. `fill: false` creates an unfilled zone outline. The existing flat fill options remain supported; when both are given, the `fill` object wins per field. `IZoneFillOptions` is exported from the package root.
- `pcb.zone()` and `pcb.keepout()` accept an explicit polygon via `points` (≥ 3 vertices) as an alternative to the `x`/`y`/`width`/`height` rectangle — L-shaped and irregular pours/keepouts are now expressible. Providing both forms (or neither) is rejected with an error. The zone's bounding box fields stay consistent, so obstacle building and board math work identically.
- `filledAreasThickness` is now serialized as `(filled_areas_thickness yes|no)` — it was accepted but silently dropped before.
- `islandRemovalMode` now actually defaults to 2 (remove islands below `islandAreaMin`), matching the documented behavior; the value is emitted to the board.
- Fixed hatched zones producing boards KiCad cannot load: the fill mode was serialized as `(mode hatched)`, but KiCad's parser only accepts `hatch` (or `polygon`/`segment`). Hatched zones now emit `(mode hatch)` — verified against the KiCad 10 parser.
- Keepouts (rule areas) accept `placement` (also applies to footprints placed from a schematic sheet), serialized as `(placement (enabled ...) (sheetname ""))` — verified against the KiCad 10 parser.
- `hatchWidth` is accepted as an alias of `hatchThickness` (flat and in the `fill` object) — KiCad's zone dialog labels the setting "Hatch width" while the file token is `hatch_thickness`; the file-token name wins when both are given at the same level.
