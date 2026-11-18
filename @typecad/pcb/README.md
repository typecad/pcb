# [typeCAD/pcb](https://github.com/typeCAD/pcb)

🤖 programmatically 💥 create 🛰️ hardware

**typeCAD** is a way to programmatically create hardware designs — KiCAD + TypeScript + npm. `@typecad/pcb` is the core package: schematics, PCB layout, placement, autorouting, zones, stitching, simulation, KiCad project import, native ERC/DRC checks, multi-board projects, and a built-in gerber board viewer, with passives built in.

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

## Get started
Read through the [documentation](https://typecad.net/getting-started) for a full walkthrough:

```bash
npx @typecad/pcb create
```

Requires Node.js 18+; Node 22 is what the toolchain is developed and tested on.

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

## Board artwork

`Image` places an image on the board as artwork, mapped onto the three inks a fabricated board actually has: **exposed copper**, **silkscreen**, and **solder-mask openings**. The fab's mask color (black, red, matte green...) is the background — you don't paint it, you order it.

```ts
import { PCB, Image } from '@typecad/pcb';

let pcb = new PCB('badge');
let art = new Image({
  file: 'logo.png',       // PNG (8/16-bit gray, RGB, palette, or RGBA; not interlaced) or SVG
  at: [50, 30],           // artwork center in mm — [x, y] or { x, y }
  size: 40,               // mm width (height follows the aspect), or [w, h]
                          // for a bounding box the art FITS INSIDE, aspect
                          // preserved and centered (a square logo in [40, 30]
                          // places at 30×30)
  side: 'front',          // 'back' mirrors the artwork and uses B.* layers
  resolution: 0.1,        // mm per raster cell (default 0.1)
});
pcb.create(art);            // mixes freely with components and TrackBuilders
```

Each pixel takes the nearest ink color; anything else is background:

| Pixel color | Ink | Emits onto |
| --- | --- | --- |
| red `#FF0000` | copper | `F.Cu`, plus an `F.Mask` opening so it's visible (grown by `maskExpansion`, default 0.05mm) |
| white `#FFFFFF` | silkscreen | `F.SilkS` |
| blue `#0000FF` | mask opening | `F.Mask` — bare substrate, or gold where copper sits under it |

Colors are remappable per ink (`inks: { copper: '#00FF00', silk: null, mask: '#FF00FF' }`), and `tolerance` (default 100, Euclidean RGB distance) sets how far a pixel may sit from an ink color and still match — export flat colors / antialiasing off for crisp results.

**Custom inks — layer stacks.** A fabbed board is three binary layers: copper, mask opening, silk. The three presets are fixed points in that cube; `inks.custom` maps any additional pixel color to any other combination:

```ts
let art = new Image({
  file: 'logo.png', at: [50, 30], size: 30,
  inks: {
    custom: [
      { color: '#000000', stack: { copper: true } },              // hidden copper — electrically real, visually absent
      { color: '#800080', stack: { maskPaint: true } },           // paints mask BACK (two-tone mask art)
      { color: '#FFC107', stack: { copper: true, mask: true, silk: true }, },  // silk on gold — see the caveat
    ],
  },
});
```

Valid combinations: copper, silk, and mask openings in any mix — plus `maskPaint`, the subtractive channel that closes openings (painting mask over exposed copper keeps the metal but hides it again; that's the precedence). One combination is rejected at construction — silk stacked over a mask opening — because most fabs strip silkscreen over openings. Set `allowExposedSilk: true` on the Image if your fab will print it.

**Geometry.** Raster art is classified per cell (`resolution`) and traced into **contour rings by default** — each ink becomes a handful of polygons with holes bridged in as hairline keyhole slits (the same trick KiCad's own image converter uses), so a 20mm logo is a few hundred bytes of gerber, not megabytes. `mode: 'rects'` gives the v1 merged-rectangle shape instead, and `smooth` (default half the resolution, `0` off) straightens grid staircases with Douglas-Peucker. Letter counters and logo holes stay holes. SVG input (`file: 'logo.svg'`) is vector end to end: `path`/`rect`/`circle`/`ellipse`/`polygon` with presentation attributes and transforms flatten to rings (curves sampled deterministically), subpaths nest even-odd so a donut is one path, and `mode` doesn't apply (there is no grid). An SVG shape with **no** `fill` attribute anywhere on its chain is the artwork itself — it lands on the copper ink; `fill="none"` and off-palette colors are background. Strokes, text, `use`/`symbol` refs, clips, and CSS `<style>` blocks are not read.

**Packages.** Artwork ships inside reusable `Package` modules like any component: assign an `Image` to a `this.` property (or `this.add(...)` it) inside `build()`, authored in package-local coordinates — the package's x/y offset shifts it along with the parts, and `pcb.create(myPackage.components)` puts it on the board.

Two things to know: copper artwork is non-net copper — keep it clear of real nets yourself (DRC flags collisions), and dense artwork triggers `silk_overlap` DRC warnings against itself; art-heavy boards usually set `silk_overlap: ignore` in the conf severities.

## Command line

Everything is driven by the `typecad-pcb` CLI — the package also installs `pcb`, `gerber-viewer`, `kicad-symbols`, and `kicad2typecad` bins. `npx @typecad/pcb create` scaffolds a project with npm scripts wired up (`npm run build` → `typecad-pcb build`, `npm run kicad_sync` → watch-mode import, ...):

| Command | What it does |
| --- | --- |
| `create` | create a new typeCAD project |
| `add component` / `add package` | add a component to the project / create a reusable component package |
| `build` | build KiCAD output from typeCAD source |
| `clean` | remove the generated build directory |
| `check` | build + ERC + DRC in one pass, one report |
| `erc` / `drc` | electrical rules / design rule checks on their own |
| `diagnostics` | full design report — BOM, nets, graphs, ERC/DRC (markdown) |
| `query` | inspect the compiled board (nets, pins, placement) |
| `edit` | checked semantic edits (connect, move) |
| `search` | search KiCad symbols and footprints |
| `import` | convert a KiCad PCB file to typeCAD code |
| `diff` | compare two KiCad PCB files visually |
| `doc` | generate PCB documentation from markdown |
| `lib add` / `lib list` | fetch/list KiCad libraries into `build/lib` |
| `export gerbers` / `export drill` | export fabrication outputs (native) |
| `export pos` | placement (centroid) CPL file |
| `export bom` | bill of materials CSV |
| `export assembly` | one-shot zipped provider package for JLCPCB, PCBWay, Seeed, OpenPnP, kicad, generic: gerbers + pos + bom |
| `viewer` | build the interactive board viewer page |
| `check-sync` | report board-vs-source drift |
| `validate` | validate project source without a full build |
| `doctor` | check your environment for common issues |
| `package` | browse and install typeCAD packages from npm |
| `skills` | list and query typeCAD skills and API patterns |

Every command takes `--json` for machine-readable output and `--help` for details.

### Checks without a KiCad install

ERC and DRC run on a native engine — the build computes them from the design itself, and `check` rolls build + ERC + DRC into one report. The legacy kicad-cli checks remain available with `--kicad`. Builds automatically download missing symbols and footprints from the official KiCad libraries into `build/lib`. Commit those files to build offline on another machine. Use `lib add` to prefetch a library or include a footprint’s 3D models.

Pins you intentionally leave unconnected (unused GPIOs, a power-only USB connector's data pins) should be marked with `pcb.dnc(pin, ...)` — the no-connect (X) flag — so ERC doesn't report them; `MountingHole`s are marked automatically.

### KiCad import

Existing boards come across with `typecad-pcb import <board>.kicad_pcb` — placement, nets, tracks and zones become typeCAD code. With `--watch --auto` (the scaffold wires this up as `npm run kicad_sync`) the KiCad file and the typeCAD source stay in sync while you work in either.

### Multi-board projects

A project can carry more than one board — mother/daughter, board/jig. Every `new PCB('<name>')` the build produces gets its own `build/<name>.kicad_pcb`, recorded in a build manifest; `--board <name>` targets one board of the set, and commands default to the active (most recent) board.

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
npx gerber-viewer gerbers/ --render pcba --style blueprint -o board-drawing.svg
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

Themes are a small PcbDraw-style palette (`green-enig` — the classic green
default, plus `typecad` — the house look: deep teal mask, champagne-gold
pads — `purple-enig`, `black-hasl`, `blue-enig`) or your own JSON (`--theme my-theme.json` overrides any subset of the
colors, including `maskCopper`). Refdes labels default to auto: off when the
silkscreen layer already carries them (a synthetic label would double the silk
text — and the board's own text renders faithfully since KiCad vectorizes fonts
like `OCR A Std` into the gerber), on when there is none — `--labels`/`--no-labels`
forces either way. Synthetic labels use the theme's `labelFont`
(`'OCR A Std', 'Courier New', monospace` by default) to match typeCAD boards.
Every render carries an engineering title block below the board — name, date,
dimensions, and a "made with typeCAD" wordmark; `--no-title-block` renders a
clean image. `--style blueprint` draws the board as an engineering drawing
instead of an assembled render: blueprint paper, board
and component outlines in ink, outlined pads, drill marks, and the title block in
drawing ink; designators come from the fab layer (synthetic labels only without one).

A combo box under the board title switches between **Gerber view** (the classic per-layer stack with
visibility/opacity controls), **PCBA view** (the flat assembled render described above), and **Blueprint
view** (the engineering drawing). All views share one
coordinate frame, so pan/zoom, the measurement ruler, DRC markers, component search and the vscode cross-probing
(double-click a component to jump to its source line; select one in the editor to highlight it here) all work in either
view. The PCBA view hides the layer controls — there is only one layer stack to show — and the choice is remembered
per board.

Inside VS Code, the bundled typeCAD/pcb extension renders this viewer (gerbers + netlist + DRC) in a Board panel that refreshes on every `npm run build` and cross-probes both ways with the source — see the package docs. Layer visibility and opacity settings persist across rebuilds — they're stored in your browser (localStorage, keyed per board) and re-applied when the page reloads. A dark/light theme toggle sits in the sidebar header; the theme (including the board canvas) is saved per browser and follows your OS preference on first visit. On the dark canvas, near-black layer colors (silkscreen, paste, drill) are automatically recolored so they stay visible, and clear-polarity cutouts follow the canvas color.

The viewer's **Layout view** is interactive: drag parts (KiCad's M), nudge, rotate (R), flip to the other side (Shift+F), route TrackBuilder-faithful chains, slide segments, draw rectangle **zones** (copper pours on a net, or keepouts) and edit the **board outline** (x/y/width/height) — one **apply & rebuild** gesture writes everything back to the TypeScript source (placement literals, `_sync.ts` sidecar inserts, `.outline()` rewrites) and rebuilds the board. The `?` keys overlay lists every binding.