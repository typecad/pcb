---
'@typecad/pcb': minor
---

ngspice simulation now runs the whole circuit without per-component ceremony, headlessly, with a fully featured analysis API:

- `simulate()` takes no arguments: passives (R/C/L/D references) are netlisted automatically — no `simulation: { include: true }` opt-ins — and power rails are discovered from the `Power` objects already attached to the circuit (voltage ratings stamped on pins). Passing `Power` objects explicitly still works and wins. `simulation: { exclude: true }` opts a component out.
- `.tran()` no longer opens ngspice plot windows and blocks until you quit them — transient analysis runs in batch mode (`ngspice_con` on Windows) and returns the parsed `NgspiceResult` waveform, just like `.op()` (a final-value summary table replaces the per-point dump). Pass `openPlots = true` as the last argument to get the old interactive plot windows back.
- New analyses: `.dc(source, start, stop, increment)` sweeps a named source (name one with `new Power({ …, name: 'VS' })`; auto sources are `V1`, `V2`, …), `.ac(sweep, points, fstart, fstop)` runs a small-signal frequency sweep — sources gain an `ac:` magnitude, and complex results come back with `getMagnitude` / `getDb` / `getPhaseDeg` for Bode-style checks. Sweep axes are the `v(v-sweep)` and `frequency` variables.
- Custom devices: `simulation.model` emits a `.model` card (e.g. `'DLED D (IS=1a RS=3.3 N=1.8)'`), `simulation.subckt` + `simulation.library` instantiate `.subckt` parts from vendor-style `.lib` files (the `.include` path is rewritten relative to the generated netlist), `simulation.pinOrder` maps component pins onto model/subckt terminals, and `simulation.params` appends instance parameters (`'m=2'`, area factors, `W=/L=` …). Device cards now emit every connected pin, so multi-terminal parts work.
- `Power` sources got `name`, `ac` (small-signal magnitude) and `waveform` (raw ngspice source expression such as `PULSE(0 5 1m 1u 1u 5m 20m)` or `SIN(0 1 1k)`).
- Results API: `getWaveform(name)` for full data columns, `getAt(name, index)` for a point, plus `getMagnitude` / `getDb` / `getPhaseDeg` over the new `imaginary` arrays.
- Fixed `.model` emission: the component's `value` was inserted before the model name on the device card, so modeled devices generated invalid SPICE and failed to converge. Model-based cards now reference the model name directly.
- Fixed diode card pin order: KiCad's Device library numbers diodes `1=K` (cathode) and `2=A` (anode), but the ngspice `D` card lists anode first — every auto-netlisted diode/LED solved reverse-biased relative to its schematic symbol. The netlister now flips the pair; an explicit `simulation.pinOrder` still names the card order directly.
- Fixed the ngspice ASCII parser to reset per data point — previously only the first point of a multi-point result was captured.
- Per-device `.probe` vectors (`i(ref)`, `ref:power`) are now collected in every analysis mode, including headless transients.
- Values are validated to a single token: ngspice 44+ strictly rejects extra tokens on device cards, so a `value: '10k ohm'` (or `'100nF X7R'`) would abort the whole simulation with a cryptic parser error — the netlister now warns and skips such components instead, with a message pointing at the whitespace.

Known ngspice 44.2 strictness: named instance parameters (`area=2`, `m=2`, `off`, `temp=25`) parse fine, but *positional* tokens on device cards (`D1 a c MODEL 2`) are rejected with "could not find a valid modelname" — use named forms in `simulation.params`.
