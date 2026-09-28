---
'@typecad/pcb': minor
---

The scaffolded starter is now a complete circuit instead of a lone resistor: a 3 V CR2450 coin cell (Keystone 3008 holder, `Device:Battery_Cell` symbol, `BT` prefix) lights a red 0603 LED through a 150 Ω resistor, wired over named nets `+BATT`/`led_a`/`GND` with a `Power` source for simulation. A fresh project therefore exercises every board-view view on first open — real nets to drag and route in the layout view, and an ngspice deck that solves (3 V rail, ~8.4 mA). The starter's footer comments and the scaffolded `AGENTS.md` document the new `simulate` script, and `create` adds it to `hw/package.json`.

The bundled VS Code extension now runs `typecad-pcb simulate` itself during viewer generation — best-effort, only when `build/<board>_op.json` is missing or older than the netlist — so the ngspice view has hover voltages/currents without a manual simulate step (previously nothing in the build or export pipeline produced the op file). A failure (ngspice not installed, entry error) only logs and skips; the viewer still generates. Net names matter for the auto power symbols: nets named like KiCad's power library entries (`GND`, `+BATT`) get schematic power glyphs, so the starter uses those.
