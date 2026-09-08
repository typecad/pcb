# [**type**CAD](https://typecad.net)

##  KiCAD + TypeScript + npm = **type**CAD
> typeCAD is a way to programmatically create hardware designs.

It's done with TypeScript and all the awesomeness of the npm/Node.js ecosystem.

- npm packages can be imported into your projects
- create portable/importable/shareable packages
- semantic version control

The schematic portion of hardware design is replaced with a few simple TypeScript classes. Rather than clicking and dragging, a line of code creates a component, and another line connects it. Sections of code can be turned into reusable modules and those modules can be turned into npm packages.

Code can be version controlled, status tracked, git push/pull/PR/issues can be used, and all the typical tools for software design can be used for hardware design now

## Example
_This **type**CAD code..._
```ts
import { Component, PCB, Resistor, LED } from '@typecad/pcb'

let typecad = new PCB('typecad');
let bt1 = new Component({ footprint: 'Battery:BatteryHolder_Keystone_500' });
let r1 = new Resistor({ value: '1 kOhm', size: '0805' });
let d1 = new LED();

typecad.named('vin').net(bt1.pin(1), r1.pin(1));
typecad.net(r1.pin(2), d1.pin(2));
typecad.named('gnd').net(d1.pin(1), bt1.pin(2));

typecad.create(r1, d1, bt1);
```

_...is the same as this schematic._

![simple circuit](https://typecad.net/led.png)

>The difference is that code can be copied, turned into reusable packages, version controlled, and used within the npm/Node.js system.

## Passives

Resistors, capacitors, inductors, diodes, LEDs, and fuses are built in — no second package. The SMD package size is a constructor option (default `0603`), and an explicit `footprint` always wins:

```ts
import { PCB, Resistor, Capacitor, Connector, TestPoint, MountingHole, NetTie } from '@typecad/pcb'

let r1 = new Resistor({ value: '4.7 kOhm' });                 // 0603 (default)
let r2 = new Resistor({ value: '10 kOhm', size: '0805' });    // explicit size
let c1 = new Capacitor({ value: '100 nF', voltage: '6.3 V' });
let j1 = new Connector({ number: 4, series: 'JST-SH' });      // footprint templated from the pin count
```

Sizes: `'0201' | '0402' | '0603' | '0805' | '1206' | '1210'` (fuses from `'0603'` up). Inside a `Package`, `this.passives.Capacitor(...)` works out of the box; shift a whole package with `{ passiveSize: '0805' }`.

## Get started
Read through the [documentation](https://typecad.net/getting-started) for a full walkthrough:

```bash
npx @typecad/pcb create
```

## Board viewer

This package ships a built-in, zero-dependency Gerber (RS-274X) + Excellon viewer:

```bash
# one-shot: render a fab-output directory to a self-contained interactive HTML file
npx gerber-viewer gerbers/ -o board-view.html --open

# dev server inside a typeCAD project: watches build/*.kicad_pcb, re-exports
# gerbers via `typecad-pcb export`, and live-reloads on every `npm run build`
npx gerber-viewer serve            # http://localhost:4273 (walks up to the
                                   # next free port when 4273 is taken)
```

A ruler button in the toolbar arms a measurement mode: click a start point, move the mouse to
see the live distance, click again to stick the ruler — measurements accumulate, and `Esc`
clears them all. Hold `Shift` while measuring to snap the endpoint to 0/45/90-degree angles.
Rulers scale and pan with the board, keep a constant on-screen size while
zooming, and follow the dark/light theme.

The viewer also understands what it is showing: KiCad's X2 object attributes (`%TO.N` net,
`%TO.P` component/pin) are parsed, so hovering copper shows the net and pad in the readout,
and clicking highlights the whole net (pad→net comes from the project netlist in serve mode).
A search box locates components — type `U3`, press Enter, and the view zooms to its pads. A
collapsible *fab report* panel lists board dimensions, per-layer trace lengths and min/max
widths, and the drill table. In serve mode, DRC violations from the build's `_drc.json` are
drawn as red markers (hover for the message, toggle with the `DRC` button, refreshed on every
rebuild). The `SVG`/`PNG` buttons export the current view — theme, layer visibility and
highlight included — as a vector or 2× raster image.

Programmatic use (parsing, layer detection, SVG rendering, the dev server):

```ts
import {
  parseGerber, parseExcellon, detectLayer, renderSvg,
  buildViewerFromFiles, startGerberViewerServer,
} from '@typecad/pcb/gerber-viewer';
```

Projects created with `typecad-pcb create` get a `gerber_viewer` npm script wired to `gerber-viewer serve`. Layer visibility and opacity settings persist across rebuilds — they're stored in your browser (localStorage, keyed per board) and re-applied when the page reloads. A dark/light theme toggle sits in the sidebar header; the theme (including the board canvas) is saved per browser and follows your OS preference on first visit. On the dark canvas, near-black layer colors (silkscreen, paste, drill) are automatically recolored so they stay visible, and clear-polarity cutouts follow the canvas color.

---
## Support
<a href="https://www.buymeacoffee.com/typecad" target="_blank" title="buymeacoffee">
  <img src="https://iili.io/JoQl86x.md.png"  alt="buymeacoffee-green-badge" style="width: 204px;">
</a>