---
'@typecad/pcb': minor
---

The board viewer gains a fifth view — **Copper ΔT** — answering "given this operating point, where is the layout thermally stressed?":

- Wires are colored by estimated temperature rise from the inverted IPC-2221 formula — the same constants the `powerInfo` width sizer uses — applied to each wire's solved current (the flow graph's per-edge value) and its real gerber width. A wire sized for its current reads exactly its rated rise; a neck-down carrying the same amps lights up.
- Zone pours get a 2D sheet-resistance solve over the actual fill polygon (0.6 mm raster, red-black SOR, 1.724e-8 Ω·m at 35 µm), driven by the per-pad current injections — so heating appears where the copper truly funnels, and stitch-via bottlenecks show up as hot rings. Pours render as a clipped heat image; confidence is visually distinct from the per-wire computation.
- The board renders near-monochrome graphite with an incandescent ramp (muted copper → warm → orange → near-white) instead of the electrical purple ramp; zero-current copper stays inert. Controls: ambient temperature (ΔT → absolute), allowed rise, and a color-by-margin mode; the legend shows the board's own ΔT range.
- Copper-loss estimate only, and labeled as such: external-layer constants throughout, no component self-heating, no enclosure or lateral spreading. In parallel with a pour, a routed wire's share of the current is not modeled (the flow graph sends pad current along wires; the pour solve spreads the same injections over the sheet).

Known follow-ups: per-via currents from the coupled two-layer solve, inner-layer constants from the stackup, and a hover report card (width/copper/current/resistance/loss/ΔT/margin).

Via modeling: netted ref-less copper pads are vias — their current is an equal share of the net's total injection (stated in the legend; a coupled two-layer pour solve would give the true split), rated by the inverted IPC-2152 barrel formula on the drill diameter found in the drill marks, and their pads color like wires so a stressed via ring reads at a glance. Library-side, `TrackBuilder.via()` now inherits the builder's `net` option (vias previously landed un-netted) and the powerInfo solve is clamped to the board's fabrication floors — a modest current at 35 µm plating solved to sub-fab drills like 0.072 mm.
