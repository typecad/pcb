# **type**CAD monorepo

[**type**CAD](https://typecad.net) — programmatically create hardware designs with TypeScript and the npm ecosystem, targeting KiCad.

This repository contains the published `@typecad/` packages, example hardware projects, and the documentation website.

## Packages

| Package                                              | What it does                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@typecad/typecad`](./@typecad/typecad)             | Core library: schematics, PCBs, placement, autorouting, zones, stitching, simulation, diffing, the `typecad` / `kicad-symbols` / `kicad2typecad` CLIs, and the built-in `gerber-viewer` board viewer |
| [`@typecad/passives`](./@typecad/passives)           | Ready-made resistors, capacitors, inductors, diodes, LEDs, connectors, and more per footprint size                                                        |
| [`@typecad/wiring`](./@typecad/wiring)               | Wiring-harness diagrams (WireViz-style) from code                                                                                                         |
| [`@typecad/graphviz`](./@typecad/graphviz)           | Graphviz visualizations of schematics (connectivity, power hierarchy)                                                                                     |
| [`@typecad/jlcpcb-parts`](./@typecad/jlcpcb-parts)   | `jlcpcb-search` CLI for fuzzy-searching the JLCPCB parts catalog                                                                                          |
| [`@typecad/jlcpcb-export`](./@typecad/jlcpcb-export) | `jlcpcb-export` CLI for generating JLCPCB fab outputs (BOM/CPL/gerbers)                                                                                   |

## Example projects

- [`rd_skeleton/`](./rd_skeleton) — reference skeleton board (multilayer, zones, stitching)
- [`rd_isl9120_demo/`](./rd_isl9120_demo) — ISL9120 boost converter demo (the clean example layout)
- [`demo/`](./demo) — assorted demos and benchmarks

## Getting started

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
