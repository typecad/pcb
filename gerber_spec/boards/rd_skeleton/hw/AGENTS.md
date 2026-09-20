# typeCAD Project

This is a typeCAD project. typeCAD is a TypeScript framework for programmatically
creating PCB designs that output KiCad files.

## AI Reference: typecad skills

The `typecad` CLI includes a knowledge lookup system. Use it before writing typeCAD code:

- `npx typecad skills` — list all available topics
- `npx typecad skills get <name>` — detailed API patterns and examples for a topic
- `npx typecad skills get <name> --json` — machine-readable JSON output

Use skills to look up: components, pins, nets, power, buses, passives (resistor,
capacitor, inductor, diode, LED, fuse, connector, testpoint, mounting-hole, net-tie),
PCB layout (tracks, vias, zones, keepout, outlines, autoroute, placement),
graphics, text, validation (ERC, DRC), packages, contracts, BOM, simulation,
config, KiCad integration, and project commands.

## npm Scripts

- `npm run build` — generate KiCad files from typeCAD source
- `npm run gerber_viewer` — board viewer dev server (`gerber-viewer serve`, http://localhost:4273): re-exports gerbers and refreshes the page on every `npm run build`
- `npm run add_component` — add a component interactively
- `npm run add_package` — create a reusable component package
- `npm run kicad-search` — search KiCad symbol libraries
