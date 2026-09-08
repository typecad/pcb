# **type**CAD

> Design real, manufacturable PCBs in TypeScript. Code in — KiCad out.

[**type**CAD](https://typecad.net) turns hardware design into programming: describe your circuit and board in plain TypeScript, and it generates the `.kicad_sch`, `.kicad_pcb`, netlist, and BOM that KiCad and your fab already understand. No clicking and dragging — a line of code places a component, another connects it, and your board's entire history lives in git.

```ts
import { PCB, Component, Resistor, LED } from '@typecad/pcb';

const board = new PCB('first-board');
const battery = new Component({ footprint: 'Battery:BatteryHolder_Keystone_500' });
const r1 = new Resistor({ value: '1 kOhm' });        // passives built in — size is an option
const d1 = new LED({ size: '0805' });

board.named('vin').net(battery.pin(1), r1.pin(1));
board.net(r1.pin(2), d1.pin(2));
board.named('gnd').net(d1.pin(1), battery.pin(2));

board.create(battery, r1, d1);                        // writes ./build/ — schematic, PCB, netlist, BOM
```

## Start in one command

```bash
npx @typecad/pcb create
```

That scaffolds a working project — TypeScript setup, KiCad project files, npm scripts — then:

```bash
npm run build        # generate the board into ./build/
npm run open_board   # edit it in KiCad
```

`npx @typecad/pcb doctor` checks your whole toolchain (Node, npm, KiCad, symbol libraries, ngspice) and tells you exactly what to fix — `--fix` repairs what it can.

## What you can build with it

- **Schematics and boards as code** — components, nets, power rails (`Power`), buses (`I2C`, `UART`, `USB`), all generated as real KiCad files.
- **Ready-made passives** — `Resistor`, `Capacitor`, `Inductor`, `Diode`, `LED`, `Fuse` with SMD size presets (`{ size: '0603' }`), plus `Connector` (footprint templated from pin count), `TestPoint`, `MountingHole`, and `NetTie`. One import; an explicit `footprint` always wins.
- **Layout without a mouse** — placement expressions (`board.fromLeft(2.5)`, `board.below(mh1).by(1)`), multilayer stackups, zones and planes, via stitching, teardrops, impedance-controlled trace widths.
- **Autorouting** — a built-in grid router, or register your own.
- **Verify before you fab** — ERC and DRC through `kicad-cli`, ngspice simulation, and git-style diffs between builds.
- **See your board** — a zero-dependency gerber viewer ships with it (`npx gerber-viewer serve` live-reloads on every build, with net highlighting, a fab report, and DRC markers).
- **Reuse anything** — wrap a circuit in a `Package` once, publish it to npm, import it into every future board. Peripherals like the `rd_isl9120ir` regulator module are just packages.

The docs at [typecad.net](https://typecad.net) cover all of it — start with [Getting Started](https://typecad.net/getting-started).

## Coming from the old packages?

`@typecad/typecad` is now **`@typecad/pcb`**, and `@typecad/passives` is merged into it (passives are built in, sized via the `size` option). The CLI command is now `typecad-pcb`. Swap the package name in your imports and dependencies, replace `@typecad/passives/0603` imports with the root import, and everything else carries over.

## In this repository

| Path | What it is |
| --- | --- |
| [`@typecad/pcb/`](./@typecad/pcb) | The core library and `typecad-pcb` CLI — everything above |
| [`rd_skeleton/`](./rd_skeleton) | Reference board: multilayer, zones, stitching — a good read |
| [`rd_isl9120_demo/`](./rd_isl9120_demo) | A complete regulator project built the recommended way |
| [`demo/`](./demo) | Assorted demos and routing benchmarks |
| [`website/`](./website) | The [typecad.net](https://typecad.net) docs site (SvelteKit) |

Companion packages in `@typecad/`: `kicad-symbols` (search KiCad libraries from the CLI), `kicad2typecad` (convert an existing board into typeCAD code), `gerber-viewer`, `wiring` (harness diagrams), `graphviz` (schematic visualizations), `jlcpcb-parts` / `jlcpcb-export` (JLCPCB search and fab outputs).

## Contributing

```bash
npm install          # install all workspaces
npm run build        # build every package
npm test             # run the test suites
npm run lint         # eslint
npm run format:check # prettier
```

Releases go through [changesets](https://github.com/changesets/changesets) — see [RELEASING.md](./RELEASING.md). The core package is currently on the `1.0.0-alpha` line.

Questions or showing off a board? [r/typecad](https://www.reddit.com/r/typecad/). If typeCAD saves you a weekend, you can [support it](https://www.buymeacoffee.com/typecad).

Licensed under Apache-2.0.
