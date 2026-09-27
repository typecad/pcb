# typeCAD Project

This is a typeCAD project. typeCAD is a TypeScript framework for programmatically
creating PCB designs that output KiCad files.

## The agent loop

- `npx typecad-pcb skills search <query>` — find the right API pattern before writing code
- `npx typecad-pcb skills get <name> --json` — detailed patterns and examples
- `npx typecad-pcb edit connect R1.1 U1.3` — checked semantic edits to the source
- `npx typecad-pcb check --json` — build + unconnected + ERC + DRC in one report
- `npx typecad-pcb query <subject>` — inspect the compiled board (nets, pins, power, placement)

Edits are validated against the compiled board before the source is touched, and
build output is deterministic, so you can verify your changes by diffing `build/`.

## Skill categories (live from the CLI)

### workflow

circuit-design, agent-loop

### project

board-query, checked-edits, create-project, add-component, add-package, build, search, import, browse-packages

### core

pcb-structure, component, pin, net, power, buses

### passive-components

resistor, capacitor, inductor, diode, led, fuse, connector, testpoint, mounting-hole, net-tie, passive-sizes

### pcb-layout

track, via, zone, keepout, outline, autoroute, pcb-placement

### graphics

text, graphics

### validation

erc, drc, validation, export-gerbers, export-drill

### packages

package-base, custom-component

### configuration

config

### advanced

contract, bom, simulation

### kicad

kicad-integration, kicad-symbols, kicad-footprints, roundtrip

## npm Scripts

- `npm run build` — generate KiCad files from typeCAD source
- `npm run simulate` — ngspice operating point for the board viewer's ngspice view
- `npm run add_component` — add a component interactively
- `npm run add_package` — create a reusable component package
- `npm run kicad-search` — search KiCad symbol libraries
