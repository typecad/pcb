# **type**CAD monorepo

[**type**CAD](https://typecad.net) — programmatically create hardware designs with TypeScript and the npm ecosystem, targeting KiCad.

This repository contains the published `@typecad/` packages, example hardware projects, and the documentation website.

## Packages

| Package                                              | What it does                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@typecad/pcb`](./@typecad/pcb)                     | Core library: schematics, PCBs, placement, autorouting, zones, stitching, simulation, diffing, KiCad import, native ERC/DRC, multi-board projects, built-in passives factories, the `typecad-pcb` / `kicad-symbols` / `kicad2typecad` CLIs, and the built-in `gerber-viewer` board viewer (renamed from `@typecad/typecad`; absorbs `@typecad/passives`) |
| [`@typecad/wiring`](./@typecad/wiring)               | Wiring-harness diagrams (WireViz-style) from code                                                                                                         |
| [`@typecad/graphviz`](./@typecad/graphviz)           | Graphviz visualizations of schematics (connectivity, power hierarchy)                                                                                     |
| [`@typecad/jlcpcb-parts`](./@typecad/jlcpcb-parts)   | `jlcpcb-search` CLI for fuzzy-searching the JLCPCB parts catalog                                                                                          |
| [`@typecad/jlcpcb-export`](./@typecad/jlcpcb-export) | `jlcpcb-export` CLI for generating JLCPCB fab outputs (BOM/CPL/gerbers)                                                                                   |

## Example projects

- [`demo/rd_skeleton/`](./demo/rd_skeleton) — reference skeleton board (multilayer, zones, stitching)
- [`demo/rd_isl9120_demo/`](./demo/rd_isl9120_demo) — ISL9120 boost converter demo (the clean example layout)
- [`demo/`](./demo) — everything else: `hw` (one_hz), `spice`, `agent_demo`, `iot_sensor_demo`, `gerber-demo`, `rd_isl9120_impl` (the ISL9120 component package the demo consumes)

## Getting started

Node.js 22 is recommended (see `.nvmrc`); the published packages support Node 18+.

```bash
npm install          # installs all workspaces
npm run build        # build all packages
npm run typecheck    # typecheck all packages
npm test             # run all package tests
npm run lint         # eslint
npm run format:check # prettier
```

Docs live in [`website/`](./website) (SvelteKit + mdsvex) and are published at [typecad.net](https://typecad.net).

## Releases

Versioning and publishing go through [changesets](https://github.com/changesets/changesets); see [RELEASING.md](./RELEASING.md) — including how the current **pre-release (alpha) mode** works.
