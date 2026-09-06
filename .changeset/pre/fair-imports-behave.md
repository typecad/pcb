---
'@typecad/typecad': minor
---

Honest API surface, real impedance tolerance, and complete zone round-tripping in `typecad import`.

- Differential pair routing is non-functional, so its phantom surface is gone: user net classes no longer get hard-coded `diff_pair_gap`/`diff_pair_via_gap`/`diff_pair_width` written into the `.kicad_pro` (KiCad's DRC had been enforcing geometry nobody chose — KiCad now fills its own defaults), and the dormant differential-pairs demo test is unwired while its code is kept for when coupled routing lands.
- `impedance.tolerance` is now a real, optional option. With a tolerance, the solved trace width snaps to a 0.01mm fabrication grid whose achieved impedance stays within `target ± tolerance` (`widthForImpedanceWithinTolerance`, also exposed as `pcb.impedanceWidth(layer, target, tolerance)`); when the design-rule floor or an explicit width forces the trace outside the band, routing warns with the achieved impedance. `tolerance` was previously accepted and never used.
- `typecad import` now round-trips zones and rule areas instead of silently dropping them: filled pours emit `pcb.zone({...})` with polygon `points`, the grouped `fill` object, thermal/pad-connection and island settings; rule areas emit `pcb.keepout({...})` with their per-category restrictions and `placement`. Unconnected pours (KiCad net 0) import without a net — `pcb.zone()` accordingly accepts an unconnected pour (neither `pin` nor `net`), while providing both is still an error.
- Import review fixes: legitimate zero values survive parsing (`island_removal_mode 0` — "never remove islands" — was dropped by a truthiness check); `locked` zones detect KiCad's bare-atom form; `locked`, `filledAreasThickness`, and hatch outline settings are now emitted; and rule-area codegen emits only options `pcb.keepout()` actually accepts (KiCad-authored rule areas carry `min_thickness`/`fill` blocks that previously produced non-compiling code).
- Removed the keepout `smoothing`/`smoothingRadius` options: they were serialized as zone-level `(smoothing ...)`, a token KiCad's parser rejects (verified against KiCad 10) — setting them produced unloadable boards.
