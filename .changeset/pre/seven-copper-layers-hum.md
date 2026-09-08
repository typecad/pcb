---
'@typecad/pcb': minor
---

N-layer boards, phase 3: stackup physics — material overrides, controlled-impedance routing, span-weighted via costs.

- `pcb.stackup(n, { layers: { ... } })` accepts per-layer overrides (thickness, material, epsilon_r, loss_tangent, color) keyed by layer name — coppers (`"In1.Cu"`), dielectrics (`"dielectric 2"`), and masks. Overridden dielectric thickness is compensated by the remaining dielectrics so the board still totals `pcb.thickness`; unknown names and over-budget overrides throw with actionable messages.
- Controlled impedance is now real: `pcb.impedanceWidth(layer, targetOhms)` computes the trace width for a target characteristic impedance from the board's resolved stackup geometry (microstrip on outer layers, symmetric stripline on inner). `pcb.route({ impedance: { target, tolerance } })` applies it automatically — the trace widens to hit the target, never below the design-rule floor. `impedanceOfWidth`, `widthForImpedance`, and `stackupImpedanceGeometry` are exported for custom calculations. Engineering-grade accuracy (typically within fab tolerance).
- Under the `blind-buried` via policy the router's via cost now scales with the number of layer boundaries a transition crosses, so it prefers shallow blind/buried vias over deep ones.
- Fixed a pre-existing docgen bug where stackup extraction (`extractStackup`) could not parse any board file — symbol-headed S-expression nodes were never matched, so the rendered stackup was always empty. Inner copper layers now parse correctly, and the gitdiff inner-layer detection (`detectInnerCopperLayers`) is covered by tests.
