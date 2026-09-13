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
```

A ruler button in the toolbar arms a measurement mode: click a start point, move the mouse to
see the live distance, click again to stick the ruler — measurements accumulate, and `Esc`
clears them all. Hold `Shift` while measuring to snap the endpoint to 0/45/90-degree angles.
Rulers scale and pan with the board, keep a constant on-screen size while
zooming, and follow the dark/light theme.

The viewer also understands what it is showing: KiCad's X2 object attributes (`%TO.N` net,
`%TO.P` component/pin) are parsed, so hovering copper shows the net and pad in the readout,
and clicking highlights the whole net (pad→net comes from the project netlist, passed with
`--netlist`). A search box locates components — type `U3`, press Enter, and the view zooms to
its pads. A collapsible *fab report* panel lists board dimensions, per-layer trace lengths and
min/max widths, and the drill table. DRC violations from the build's `_drc.json` are drawn as
red markers when passed with `--drc` (hover for the message, toggle with the `DRC` button).
The `SVG`/`PNG` buttons export the current view — theme, layer visibility and highlight
included — as a vector file or a ~1600-pixel raster image.

Programmatic use (parsing, layer detection, SVG rendering):

```ts
import {
  parseGerber, parseExcellon, detectLayer, renderSvg,
  buildViewerFromFiles,
} from '@typecad/pcb/gerber-viewer';
```

### PCBA image render

The same gerbers can be rendered as a flat, themed 2D "assembled board" image — the
PcbDraw look, computed from gerbers alone (no board file, no KiCad install, no
lighting or perspective). The substrate is the stitched Edge.Cuts outline, the
soldermask film is composited over copper with its openings punched through an SVG
mask so pads show in the finish color, copper traces and pours ghost through the
film in a darker mask tone (`maskCopper` theme color — real mask is translucent),
and components are stylized Fritzing-style glyphs (body, metal leads, pin-1 dot,
DIP notch) inferred from the X2 `%TO.P` pad attributes — no part library needed:

```bash
npx gerber-viewer gerbers/ --render pcba -o board-pcba.svg
npx gerber-viewer gerbers/ --render pcba --theme purple-enig --side back
```

A sibling netlist is picked up automatically when it sits next to the gerber
directory (the typeCAD build layout: `build/gerbers` + `build/<board>.net`) — pass
`--netlist` to point at one explicitly, or `--no-netlist` to render from pad
topology alone.

With a KiCad netlist (`--netlist`, the same flag the viewer uses), each ref's
footprint name and value select the glyph: names map to a package grammar —
chips (`R_0603_1608Metric` renders the real 1.6 × 0.8 mm body), SOIC/TSSOP,
DIPs with a notch, QFN/DFN and BGA, QFP, SOT/TO transistors with tabs, pin
headers, terminal blocks with screw dots, shrouded connectors (USB, barrel
jacks, JST), crystals, metal-can modules (oscillators, RF shields), trimmer
pots, slide switches, rotary encoders, radial electrolytic cans, TH LED domes,
pushbuttons — and pad topology classifies anything the name table doesn't
know, with reference prefixes picking up the slack (an `RV` on three TH pads
is a trimmer, an `LED` on two is a dome). When the fab gerber
(`F_Fab`/`B_Fab`) is in the set, the exact body dimensions come from there: the
largest closed fab contour per component supplies the body rectangle (orientation
cuts like QFN pin-1 chamfers are squared off — the pin-1 dot marks orientation),
so land-pattern pads peek past the package exactly as on the real part. The
reference prefix and value then choose the appearance: through-hole resistors
get the classic tan body with real color bands ("10k" → brown black orange +
gold), MLCCs render beige, inductors charcoal with winding stripes, diodes
carry a cathode stripe, LEDs a translucent tint. Without a netlist everything
still renders from pad geometry alone, just without exact body dims and
decorations.

Themes are a small PcbDraw-style palette (`green-enig`, `purple-enig`, `black-hasl`,
`blue-enig`) or your own JSON (`--theme my-theme.json` overrides any subset of the
colors, including `maskCopper`). Refdes labels default to auto: off when the
silkscreen layer already carries them (a synthetic label would double the silk
text — and the board's own text renders faithfully since KiCad vectorizes fonts
like `OCR A Std` into the gerber), on when there is none — `--labels`/`--no-labels`
forces either way. Synthetic labels use the theme's `labelFont`
(`'OCR A Std', 'Courier New', monospace` by default) to match typeCAD boards.

A combo box under the board title switches between **Gerber view** (the classic per-layer stack with
visibility/opacity controls) and **PCBA view** (the flat assembled render described above). Both views share one
coordinate frame, so pan/zoom, the measurement ruler, DRC markers, component search and the vscode cross-probing
(double-click a component to jump to its source line; select one in the editor to highlight it here) all work in either
view. The PCBA view hides the layer controls — there is only one layer stack to show — and the choice is remembered
per board.

Inside VS Code, the bundled typeCAD/pcb extension renders this viewer (gerbers + netlist + DRC) in a Board panel that refreshes on every `npm run build` and cross-probes both ways with the source — see the package docs. Layer visibility and opacity settings persist across rebuilds — they're stored in your browser (localStorage, keyed per board) and re-applied when the page reloads. A dark/light theme toggle sits in the sidebar header; the theme (including the board canvas) is saved per browser and follows your OS preference on first visit. On the dark canvas, near-black layer colors (silkscreen, paste, drill) are automatically recolored so they stay visible, and clear-polarity cutouts follow the canvas color.

---
## Support
<a href="https://www.buymeacoffee.com/typecad" target="_blank" title="buymeacoffee">
  <img src="https://iili.io/JoQl86x.md.png"  alt="buymeacoffee-green-badge" style="width: 204px;">
</a>