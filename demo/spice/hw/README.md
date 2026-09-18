# typeCAD/pcb — ngspice simulation demo

A runnable tour of the SPICE simulation API in `@typecad/pcb`. No per-component
opt-in flags, no simulator object to seed: `simulate()` netlists the whole
circuit and finds the power rails by itself.

## What it shows

| Section | API exercised |
| --- | --- |
| 1. Voltage divider | bare `simulate().op()`, auto-included passives, power discovery from `Power`, `getVoltage` / `getCurrent` / `getPower` / `get` |
| 2. LED driver | `simulation: { model: 'DLED D (…)' }` ngspice device models, `simulation: { exclude: true }`, explicit `simulate(power)` |
| 3. RC transient | headless `.tran()` (batch mode — no plot windows), `uic`, full waveform via `getWaveform` |
| 4. DC sweep | `.dc(source, …)` over a named `Power`, `getWaveform` / `getAt` |
| 5. AC analysis | `.ac('dec', …)` with `Power({ ac: 1 })`, complex results via `getDb` / `getPhaseDeg` / `getMagnitude` |
| 6. Subcircuits | `simulation: { subckt, library }` with `.include` of `models/demos.lib`, `pinOrder` terminal mapping, `params` instance parameters |

Generated artifacts: `build/*.cir` (netlists, worth reading — they are plain
ngspice) and `*.out` (raw simulation data) next to this file.

## Prerequisites

- Node 20+
- [ngspice](https://ngspice.sourceforge.io/download.html) in your `PATH`.
  On Windows install both binaries (`ngspice.exe` for optional interactive
  plots, `ngspice_con.exe` for the batch runs this demo uses):
  `winget install ngspice` or the official `.zip` from ngspice.sf.io.
- `typecad-pcb doctor` checks this for you.

## Run

```bash
# from the repository root (links the workspace packages)
npm install

# from this folder
npm start            # or: npx tsx src/spice_demo.ts
```

Every section prints the ngspice results table and asserts the physics
(theory values are in the comments); the process exits non-zero if any
check fails, so it also works as a smoke test.
