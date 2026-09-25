---
'@typecad/pcb': minor
---

The board viewer's Copper ΔT view gets a full accuracy overhaul to its thermal/electrical math.

**Stackup-driven geometry.** The board writer now emits `build/<board>_stackup.json` (resolved from the PCB object's `stackupGeometry`), the `gerber-viewer` CLI accepts `--stackup` (and auto-discovers it beside the netlist), and the VS Code addon passes it through. The viewer uses it for per-layer copper weight (sheet resistance and the IPC rise both scale with real thickness — 2 oz halves the rise) and the real dielectric/board thickness. Absent the file, the old 35 µm / 1.6 mm defaults apply.

**Electro-thermal coupling.** Copper I²R now self-heats through the resistivity temperature coefficient (+0.39%/°C): the board field solve adds the temperature-dependent loss back into the source, so hot traces dissipate more and run hotter.

**Real boundary conditions.** The lumped h≈12 W/m²·K is replaced by an orientation-aware natural-convection correlation (vertical / horizontal-face-up / horizontal-face-down) plus linearized radiation (ε≈0.9), so the two outer faces shed heat as a function of their actual temperature excess.

**Transistor terminal currents.** The operating-point solve now probes each BJT/MOSFET/JFET terminal (`i(q1:c) i(q1:b) i(q1:e)`, etc.) and adds them to the flow-graph `branches`, so current routes through transistor pins (previously it vanished there, breaking conservation), and component heat can inject at the actual current-carrying pins. Subcircuit port currents remain unsupported (ngspice doesn't expose them via `i(x:port)`).

**Accuracy fixes.** Pour copper loss now actually heats the board (the 2D sheet solve's per-cell loss carried a stray mm²→m² factor that cancels exactly — six orders of magnitude too small); non-square pour cells use anisotropic conductance (`cellY/(Rs·cellX)` / `cellX/(Rs·cellY)`); internal layers use the internal IPC constant (k=0.024) via `data-inner`; component self-heating distributes by pad area; the component power overlay interpolates in log space (with a legend sampling the same ramp); FR4 in-plane conductivity is corrected to ~0.3 W/m·K; and SOR solvers report non-convergence ("approximate") instead of stopping silently.

The per-wire and per-via rise formulas still invert the library's `powerInfo` sizers exactly; a numeric test extracts the shipped kernels from the generated viewer and locks down their units, the sizer round-trips, the copper-weight scaling, and the convection/radiation coefficients.

Known remaining idealizations: a two-slab thermal model for multi-layer boards (per-layer current distribution needs the coupled multi-layer electrical solve), no component θ_JC/θ_JB package models (no thermal database yet), and DC copper-loss only (no skin/AC effects).
