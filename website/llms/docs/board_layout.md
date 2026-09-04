# Board Layout

**type**CAD can help with board layout. Component locations can be set in code.

## PCB Coordinates

Each `Component` has a `pcb` property that contains `{x, y, rotation, side}`.

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let pcb = new PCB('typecad_docs');
let r1 = new Resistor({ value: '1kohm', reference: 'R1' });

r1.pcb = { x: 10, y: 10, rotation: 0 }; // [!code highlight]
// Optionally place on the back side:
// r1.pcb = { x: 10, y: 10, rotation: 0, side: 'back' };
pcb.create();
```

`side` defaults to `'front'` and can be set to `'back'` to place a component on the bottom of the board.

## Relative Placement

Instead of hard-coding millimeter coordinates, use the placement helpers to position components relative to each other and the board edges. All gaps are measured **courtyard edge to courtyard edge**.

All placement helpers live on the PCB object: `pcb.board`, `pcb.sameAs(c)`, `pcb.below(c)`, `pcb.above(c)`, `pcb.rightOf(c)`, `pcb.leftOf(c)` — no separate imports. Placement values are live and order-independent: they re-read their source (component position or board outline) whenever they are resolved, and every deferred expression is re-resolved at `create()` against final positions. Assign positions in any order — `pcb.board` reads before the outline exists, `r2` below `r1` before `r1` moves — and the relationships still hold. Manually moving a component after assigning an expression freezes that axis: the manual value wins. The helpers can be assigned directly: `{ x: pcb.sameAs(mh1), y: pcb.below(mh1) }` (default gap) as well as `{ y: pcb.below(mh1).by(3) }`.

### `pcb.board`

Get the board's physical dimensions from the outlines you've defined. Use it to place components at the center, or a fixed distance from any edge. `pcb.board` reads the outline live — usable before or after `pcb.outline()`; values follow the final outline.

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');
pcb.outline(0, 0, 60, 45);

const b = pcb.board;

let u1 = new Component({ footprint: '...' });
u1.pcb = { x: b.center.x, y: b.center.y }; // center of the board
```

`pcb.board` returns a `BoardBounds` object with these properties:

| Property | Description |
|----------|-------------|
| `center` | `{ x, y }` center point |
| `left`, `right`, `top`, `bottom` | Edge coordinates in mm |
| `width`, `height` | Board dimensions in mm |
| `topLeft`, `topRight`, `bottomLeft`, `bottomRight` | Corner coordinates |

### Edge-relative placement with `fromLeft()`, `fromRight()`, `fromTop()`, `fromBottom()`

Place a component a fixed distance from a board edge, accounting for the component's own footprint size:

```ts
import { PCB, Component, board } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');
pcb.outline(0, 0, 60, 45);
const b = pcb.board;

// Connector 5mm from the left edge (courtyard-to-edge)
const j1 = new Component({
  footprint: 'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical',
  pcb: { x: b.fromLeft(5), y: b.center.y },
});

// Test point 1mm from the top-right corner (courtyard-to-edge)
const tp1 = new Component({
  footprint: 'TestPoint:TestPoint_Pad_D1.0mm',
  pcb: { x: b.fromRight(1), y: b.fromTop(1) },
});

pcb.create(j1, tp1);
```

The margin defaults to **2mm** if omitted: `b.fromLeft()` places the component 2mm from the left edge.

### Directional placement: `pcb.below()`, `pcb.above()`, `pcb.rightOf()`, `pcb.leftOf()`

Place components relative to each other with a specified gap. Each returns a builder — call `.by(gap)` to set the edge-to-edge distance in mm (defaults to **2mm**).

```ts
import { PCB, Component, below, above, rightOf, leftOf, sameAs, board } from '@typecad/typecad';
import { Resistor, Capacitor, LED } from '@typecad/passives/0603';

let pcb = new PCB('typecad_docs');
pcb.outline(0, 0, 60, 45);
const b = pcb.board;

// MCU at center
let mcu = new Component({ footprint: 'Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm' });
mcu.pcb = { x: b.center.x, y: b.center.y };

// Decoupling cap 3mm below MCU, aligned in X
let c1 = new Capacitor({ value: '100nF', pcb: {
  x: pcb.sameAs(mcu),
  y: pcb.below(mcu).by(3),
}});

// Pull-up resistor 2mm right of the cap, same row
let r1 = new Resistor({ value: '10k', pcb: {
  x: pcb.rightOf(c1).by(2),
  y: pcb.sameAs(c1),
}});

// LED 8mm above the MCU
let led1 = new LED({ value: 'Red', pcb: {
  x: pcb.sameAs(mcu),
  y: pcb.above(mcu).by(8),
}});

// Current-limiting resistor 4mm left of the LED
let r2 = new Resistor({ value: '330', pcb: {
  x: pcb.leftOf(led1).by(4),
  y: pcb.sameAs(led1),
}});

// Default 2mm gap
let c2 = new Capacitor({ value: '10uF', pcb: {
  x: pcb.sameAs(r1),
  y: pcb.below(r1),
}});

pcb.create(mcu, c1, r1, led1, r2, c2);
```

### `pcb.sameAs()`

Align a component's X or Y coordinate with another component:

```ts
import { sameAs } from '@typecad/typecad';

// Same X as r1, custom Y
let c1 = new Capacitor({ pcb: { x: pcb.sameAs(r1), y: 20 } });

// Same Y as r1, custom X
let r2 = new Resistor({ pcb: { x: 30, y: pcb.sameAs(r1).y } });
```

## Component Text Positioning

Each component has silkscreen and fabrication text labels (reference designator, value, and fab text). You can control their position and style using layout properties:

| Property | Default Layer | Description |
|----------|--------------|-------------|
| `referenceLayout` | F.SilkS | Controls the reference designator text (e.g. "R1") |
| `valueLayout` | F.Fab | Controls the value text (e.g. "1kohm") |
| `fabLayout` | F.Fab | Controls fabrication text; `text` defaults to `${REFERENCE}` |

All three accept an `ITextPositioning` object and can be set at construction or assigned later:

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let pcb = new PCB('text_layout');
let r1 = new Resistor({
  value: '1kohm',
  reference: 'R1',
  referenceLayout: { x: 0, y: -1.5, rotation: 90, width: 0.8, height: 0.8 }, // [!code highlight]
  valueLayout: { x: 0, y: 1.5, width: 0.6, height: 0.6 }, // [!code highlight]
  fabLayout: { x: 0, y: 0, text: 'R1' }, // [!code highlight]
});

r1.pcb = { x: 10, y: 10, rotation: 0 };

// Layouts can also be set after creation:
// r1.referenceLayout = { x: 2, y: -1, rotation: 0 };

pcb.create();
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | `number` | Yes | X position in mm |
| `y` | `number` | Yes | Y position in mm |
| `rotation` | `number` | No | Rotation in degrees |
| `layer` | `string` | No | KiCad layer name |
| `width` | `number` | No | Font width in mm |
| `height` | `number` | No | Font height in mm |
| `fontSize` | `number` | No | Font size |
| `font` | `string` | No | TrueType font face (KiCad `(face ...)`); omit for KiCad's default stroke font |
| `thickness` | `number` | No | Text stroke thickness |
| `bold` | `boolean` | No | Bold font style |
| `italic` | `boolean` | No | Italic font style |
| `justify` | `object` | No | `{ horizontal?: 'left'\|'right'\|'center', vertical?: 'top'\|'bottom'\|'middle', mirror?: boolean }` |
| `show` | `boolean` | No | Visibility toggle |

`fabLayout` additionally accepts an optional `text` field (`string`) that defaults to `${REFERENCE}` when omitted.

To change the silkscreen font, set a TrueType face — the font must be installed on the machine that opens the board (KiCad falls back to its stroke font otherwise):

```ts
r1.referenceLayout = { x: 0, y: -1.5, font: 'Arial', bold: true, height: 1.2 };
```

`pcb.text()` accepts the same `font` field.

## Group or Place Components

In KiCAD, you can group components together. They will move around together when you click and drag anywhere in the group. There is also a labeled box around the components.

To accomplish this for a group of related components:

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let r1 = new Resistor({ value: '1kohm', reference: 'R1' });
let pcb = new PCB('typecad_docs');

r1.pcb = { x: 10, y: 10, rotation: 0 };
pcb.group('typecad_docs', r1); // [!code highlight]
pcb.create();
```

Or to place them:

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let r1 = new Resistor({ value: '1kohm', reference: 'R1' });
let pcb = new PCB('typecad_docs');

r1.pcb = { x: 10, y: 10, rotation: 0 };
pcb.group('typecad_docs', r1); // [!code --]
pcb.place(r1); // [!code ++]
pcb.create();
```

## Vias

Vias can be created, placed and connected like any other component. Vias are connected through `pin(1)`.

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let typecad = new PCB('typecad_docs');
let r1 = new Resistor({ value: '1kohm' });

let via = typecad.via({
  at: { x: 10, y: 10 },
  size: 0.6,
  drill: 0.3,
});

typecad.net(r1.pin(1), via.pin(1));
typecad.group('typecad_docs', r1, via);
typecad.create(r1, via);
```

### Power aware

Vias can be created with the optional `powerInfo` object. This allows **type**CAD to check that the current draw through the via is within the limits of the via's rating using the IPC-2221 standard. `maxTempRise` is the maximum wanted rise in temperature of the via, default is 10 C. `thickness` is the thickness of the via's copper in microns. 35 is the default (1 oz).

## Outlines

Board outlines can be created.

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

pcb.outline(100, 100, 50, 50, 1);   // x, y, w, h, fillet

pcb.create();
```

Parameters are:
- **x** — x position of the top-left corner
- **y** — y position of the top-left corner
- **width** — board width in mm
- **height** — board height in mm
- **fillet** — (optional) corner fillet radius in mm

### Arbitrary Outlines

Beyond rectangles, typeCAD supports custom board shapes — polygons, circles,
and internal cutouts (mounting holes, milled slots). All are emitted on the
`Edge.Cuts` layer as native KiCad `gr_*` primitives.

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('board');

// custom polygon outline
pcb.outlinePolygon([
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 50, y: 100 }, { x: 0, y: 80 },
]);

// circular board
pcb.outlineCircle(50, 50, 50);   // center x, y, radius

// internal cutout (e.g. a milled rectangular pocket)
pcb.cutout([
  { x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 20, y: 40 },
]);

// circular cutout (mounting hole)
pcb.cutoutCircle(25, 25, 3);     // center x, y, radius
```

For outlines made of mixed line and arc segments (e.g. a DXF-imported shape),
use the `outlinePath()` builder:

```ts
pcb.outlinePath(0, 0)            // start point
  .lineTo(100, 0)
  .arcTo(100, 80, { x: 150, y: 40 })  // end, then a point on the arc
  .lineTo(0, 80)
  .close();                      // auto-closes back to the start
```

The `board()` bounds and edge-relative placement helpers (`fromLeft`,
`fromRight`, etc.) work off the outline's bounding box, so they remain correct
for any shape. KiCad treats nested closed contours on Edge.Cuts as cutouts —
there is no separate cutout layer.

## Design Rules

typeCAD writes board-wide design rules (minimum clearances, track/via dimensions)
into the `.kicad_pro` project file so that `typecad drc` validates against them.
The autorouter also honors these rules as its fallback clearance and track width.
You don't need to open KiCad's Board Setup dialog to configure them.

If you do nothing, rules default to the **JLCPCB no-surcharge standard** — the
most permissive values JLCPCB manufactures without a premium surcharge:

| Rule | Default |
|---|---|
| Min clearance | 0.20 mm |
| Min track width | 0.20 mm |
| Min via diameter | 0.60 mm |
| Min through-hole (drill) diameter | 0.30 mm |
| Min via annular width | 0.15 mm |
| Min copper-to-edge clearance | 0.20 mm |
| Min hole-to-hole | 0.25 mm |

Pass a `rules` option to the `PCB` constructor to override any subset; the rest
keep the JLC standard default:

```ts
import { PCB } from '@typecad/typecad';

// dense board: tighten clearance and track width
let pcb = new PCB('dense-board', {
  rules: { min_clearance: 0.15, min_track_width: 0.15 },
});

pcb.create();
```

`pcb.rules` returns the fully resolved (merged) rules — useful when you want to
read back the effective value after partial overrides:

```ts
let pcb = new PCB('board', { rules: { min_clearance: 0.15 } });

console.log(pcb.rules.min_clearance);   // 0.15  (overridden)
console.log(pcb.rules.min_track_width); // 0.2   (JLC standard default)
```

The `Default` net class in the project file is kept consistent with these
values, so the autorouter and DRC share a single source of truth. Per-route
`width` and `clearance` passed to `pcb.route()` still take precedence over the
board rules for that individual trace.

> [!note] Checking rules
> Run `typecad drc` to validate the board against these rules. See
> [Tooling](/docs/tooling#typecad-drc) and the [CLI reference](/docs/cli).

## Net Classes

Design rules apply board-wide. Net classes let you give a *specific group of
nets* their own track width, clearance, and via dimensions — for example,
wider traces and larger vias for power nets. Classes are written to the
`.kicad_pro` project file (KiCad's `net_settings.classes`), enforced by DRC,
and honored by the autorouter.

Define a class with `pcb.netClass(name, options)`:

| Option | Description |
|---|---|
| `track_width` | Trace width for nets in this class (mm). Defaults to rules min. |
| `clearance` | Copper clearance for nets in this class (mm). Defaults to rules min. |
| `via_diameter` | Via pad diameter for nets in this class (mm). Defaults to rules min. |
| `via_drill` | Via drill for nets in this class (mm). Defaults to rules min. |
| `layers` | Preferred routing layers for nets in this class (e.g. `['In1.Cu']`). Must be declared copper layers. |

Then assign a net to it with `pcb.assign(netDef, className)`. `assign` takes the
object returned by `pcb.net()` or `pcb.named().net()`, so it works for both
named and auto-named nets:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('board');

// wider traces and bigger vias for power
pcb.netClass('power', {
  track_width: 0.5,
  clearance: 0.3,
  via_diameter: 0.8,
  via_drill: 0.4,
});

// named net
const gnd = pcb.named('gnd').net(regulator.GND, mcu.GND);
pcb.assign(gnd, 'power');

// also works for auto-named nets (the common case)
const sw = pcb.net(regulator.LX, inductor.pin(1));
pcb.assign(sw, 'power');
```

On an N-layer board, a class can also claim preferred routing layers — the
autorouter anchors the net's through-hole endpoints on the class's layer and
favors it while routing (a typeCAD routing directive; not written to the
`.kicad_pro`):

```ts
let pcb = new PCB('board', { layers: 4 });

// keep the SPI bus on the first inner layer
pcb.netClass('spi', { layers: ['In1.Cu'] });
pcb.assign(spiNet, 'spi');
```

Nets you don't assign fall back to the `Default` class, which mirrors the
board [design rules](#design-rules). The autorouter resolves a net's class
automatically and uses its dimensions — a per-route `width` or `clearance`
passed to `pcb.route()` still takes precedence for that individual trace.

## Stackup

The layer stackup describes the board's physical construction — copper,
dielectric, solder mask, and silkscreen layers with their materials and
thicknesses. KiCad stores it in the `(setup (stackup ...))` block of the
`.kicad_pcb` and requires it for 4+ layer boards and impedance-controlled
routing.

The simplest way to build an N-layer board is the `layers` constructor option.
It is the single source of truth for the board's copper layer set: routing
defaults, through-hole pad clearance, and layer validation all derive from it.

```ts
import { PCB } from '@typecad/typecad';

// 4-layer board — routing may use all four copper layers
let pcb = new PCB('board', { layers: 4 });

// Inspect the resolved copper layers, top to bottom
pcb.copperLayers; // ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']
```

For control over the stackup's materials, use `pcb.stackup()`. typeCAD
generates a JLCPCB-standard stackup (FR4, 1oz copper, green mask). The total
thickness comes from `pcb.thickness` (default 1.6mm) and the copper thickness
from `pcb.copper_thickness` (default 35μm):

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('board');

// JLCPCB-standard 4-layer stackup at 1.6mm
pcb.stackup(4);

// 2-layer with a custom copper finish
pcb.stackup(2, { copper_finish: 'ENIG' });

// 6-layer, thicker board — thickness flows from the constructor
let pcb = new PCB('board', { thickness: 2.0 });
pcb.stackup(6);
```

The layer count can be any value from 2 to 32 (KiCad's maximum). Optional
overrides:

| Option | Description |
|---|---|
| `copper_finish` | Copper surface finish, e.g. `"None"`, `"HASL"`, `"ENIG"`. Default `"None"`. |
| `dielectric_constraints` | Whether dielectric constraints are enforced. Default `false`. |
| `layers` | Per-layer material overrides, keyed by layer name — see below. |

### Per-layer material overrides

Individual layers can override the JLCPCB preset's thickness, material,
dielectric constant, and loss tangent — keyed by copper layer name
(`"In1.Cu"`), dielectric name (`"dielectric 2"`), or mask/silk name. Any
remaining dielectric budget is redistributed across the non-overridden
dielectrics so the board still totals `pcb.thickness`:

```ts
let pcb = new PCB('board', { layers: 4 });

pcb.stackup(4, {
  layers: {
    'dielectric 1': { thickness: 0.21, epsilon_r: 4.4 },
    'dielectric 2': { material: 'Rogers 4350B', epsilon_r: 3.48, loss_tangent: 0.0037 },
  },
});
```

### Controlled impedance

`pcb.impedanceWidth(layer, targetOhms)` computes the trace width that hits a
target characteristic impedance on a copper layer of the board's stackup —
outer layers are modeled as microstrip, inner layers as symmetric stripline.
`pcb.route()` uses it automatically when you pass an `impedance` constraint
(the trace is only ever widened, never below the design-rule floor):

```ts
// what width hits 50Ω on the first inner layer?
pcb.impedanceWidth('In1.Cu', 50); // e.g. 0.354 (mm)

// with a ±5Ω tolerance the width snaps to a 0.01mm
// fabrication grid inside the 50±5Ω band:
pcb.impedanceWidth('F.Cu', 50, 5);

// autoroute a net at 100Ω (tolerance optional); if the design-rule
// floor forces the trace outside the band, routing warns with the
// achieved impedance
pcb.route(clk, { impedance: { target: 100, tolerance: 10 } });
```

Accuracy is engineering-grade (typically within fab tolerance), not
field-solver grade. An unreachable target (e.g. 1Ω) throws a `RangeError`.

When you configure the layer count (either way), typeCAD regenerates the
board's `(layers ...)` declaration block to match (so the layer declarations
and the stackup stay consistent) and writes the board thickness into
`(general (thickness ...))`.

Every layer referenced by a zone, keepout, via, or route is validated against
the declared layer set when the board is written — referencing `"In3.Cu"` on a
4-layer board fails with an actionable error instead of producing a broken
`.kicad_pcb`.

### Planes

`pcb.plane(net, layer)` dedicates a copper layer to a net. At `create()` the
plane becomes a board-covering filled zone on that layer (through-hole pads
connect solidly; SMD pads reach it through vias), and the layer is removed
from the autorouter's default routing layers:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('board', { layers: 4 });
pcb.outline(0, 0, 50, 40);

pcb.plane('GND', 'In1.Cu');
pcb.plane('+3V3', 'In2.Cu');
```

The plane extent comes from the board outline, so call `pcb.outline()` before
`create()`. A layer can carry only one plane; signal routes stay off plane
layers unless a `pcb.route()` call explicitly asks for them.

### Via policy

Vias placed by the autorouter follow a manufacturing policy set with
`pcb.viaPolicy()`:

```ts
// default: every router via spans F.Cu→B.Cu (through via) —
// always manufacturable at budget fabs
pcb.viaPolicy({ type: 'through' });

// opt in to blind/buried vias: the router uses the exact layer
// pair a route transitions between, up to `maxSpan` layer
// boundaries (default 2); deeper transitions fall back to through vias.
// Via cost scales with span depth, so the router prefers shallow vias.
pcb.viaPolicy({ type: 'blind-buried', maxSpan: 2 });
```

## Tracks

Traces can be created manually using `pcb.track()` for point-to-point routing with vias:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

let power_track = pcb
  .track()
  .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 })
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2)
  .to({ x: 110, y: 100 })
  .via({ size: 0.8, drill: 0.4 })
  .to({ x: 110, y: 120, layer: 'B.Cu' });

pcb.create(power_track);
```

Tracks are created by going from point to point, using vias to transition between layers. Nets and connections are not required to be specified. KiCAD will connect any track that touches an element with a net.

### Auto-routing

For automatic pin-to-pin routing, use `pcb.route()`:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

let tracks = await pcb.route({
  from: r1.pin(1),
  to: r2.pin(2),
});

pcb.create(r1, r2, ...tracks);
```

`route()` finds an optimized path between the `from` and `to` pins. Options include:
- _from_ / _to_ — pin or array of pins (required)
- _width_ — trace width in mm (calculated from `powerInfo` if omitted)
- _layers_ — restrict to specific copper layers (e.g. `['F.Cu', 'B.Cu']`)
- _powerInfo_ — `{ current, maxTempRise, thickness }` for automatic IPC-2221 trace width calculation
- _waypoints_ — array of `{ x, y }` points to guide the path
- _clearance_ — minimum clearance from other objects in mm

## Zones

Filled copper zones (e.g., ground pours) and keepout areas can be added to the board:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('zone_example');

pcb.zone({
  net: 'GND',
  layers: ['B.Cu'],
  x: 0,
  y: 0,
  width: 50,
  height: 30,
});

pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 20,
  y: 10,
  width: 20,
  height: 15,
  restrictions: { tracks: true, vias: true, copperpour: true },
});

pcb.create();
```

### Zone options

Beyond the rectangle (`x`/`y`/`width`/`height`), a zone accepts an explicit
polygon via `points` (≥ 3 vertices — provide one or the other, not both).
`net` (or `pin`) attaches the pour to a net; omitting both creates an
unconnected pour (KiCad net 0):

```ts
// L-shaped ground pour
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  points: [
    { x: 10, y: 10 },
    { x: 20, y: 10 },
    { x: 20, y: 14 },
    { x: 14, y: 14 },
    { x: 14, y: 20 },
    { x: 10, y: 20 },
  ],
});
```

Commonly used options:

| Option | Description |
|---|---|
| `points` | Arbitrary polygon geometry (≥ 3 vertices); alternative to the rectangle. |
| `fill` | Grouped fill settings (see below); `false` creates an unfilled outline. |
| `priority` | Zone priority — higher-priority zones win overlaps. Default 0. |
| `clearance` | Clearance from pads. Default 0.2mm. |
| `connectPads` | `'thru_hole_only'`, `'full'`, or `'no'` pad connections. Default: thermal relief. |
| `minThickness` | Minimum fill thickness. Default 0.1778mm. |
| `filledAreasThickness` | Whether filled areas use the minimum thickness. |
| `name` / `locked` | Zone name and lock flag. |

Fill settings can be passed grouped in a single optional `fill` object —
mirroring KiCad's `(fill ...)` block — instead of one flat option at a time:

```ts
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 50, height: 30,
  fill: {
    mode: 'hatched',        // 'solid' (default) or 'hatched'
    thermalGap: 0.3,
    thermalBridgeWidth: 0.5,
    smoothing: 'fillet',
    smoothingRadius: 0.5,
    islandRemovalMode: 2,   // 0 = keep, 1 = always remove, 2 = below islandAreaMin
    islandAreaMin: 4,
    hatchThickness: 0.2,    // hatched fill only (alias: hatchWidth —)
    hatchGap: 0.8,          // KiCad's dialog calls hatchThickness "Hatch width"
    hatchOrientation: 45,
    hatchSmoothingLevel: 1,
    hatchSmoothingValue: 0.1,
    hatchBorderAlgorithm: 'min_thickness',
    hatchMinHoleArea: 0.5,
    arcSegments: 24,
  },
});

// outline-only zone (no fill):
pcb.zone({ net: 'GND', layers: ['B.Cu'], x: 0, y: 40, width: 20, height: 10, fill: false });
```

The same settings are also accepted as flat zone options
(`fillMode`, `thermalGap`, `islandRemovalMode`, `hatchThickness`, ...); when
both are given, the `fill` object wins per field. `hatchWidth` is accepted
everywhere `hatchThickness` is — KiCad's zone dialog labels the setting
"Hatch width" while the file token is `hatch_thickness`; the file-token name
wins when both are given at the same level.

### Keepout options

Keepouts take the same geometry (rectangle or `points`) plus per-category
`restrictions` (`tracks`, `vias`, `pads`, `copperpour`, `footprints` — all
default to restricted) and the rule-area `placement` option (also applies to
footprints placed from a schematic sheet; default false).

See also [planes](#planes) for dedicating a whole copper layer to a net.

## Graphics

Draw graphical elements on the PCB:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('graphics_example');

pcb.line({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, layer: 'F.SilkS', width: 0.15 });
pcb.circle({ center: { x: 25, y: 25 }, radius: 5, layer: 'F.SilkS', width: 0.15 });
pcb.rect({ x: 0, y: 0, width: 20, height: 15, layer: 'Edge.Cuts', strokeWidth: 0.15 });
pcb.arc({ start: { x: 10, y: 10 }, mid: { x: 13.5, y: 13.5 }, end: { x: 15, y: 10 }, layer: 'F.SilkS', width: 0.15 });
pcb.text({ text: 'REV 1.0', x: 5, y: 5, layer: 'F.SilkS', width: 1, height: 1 });

pcb.create();
```

Arcs use KiCad's three-point definition: `start`, `mid` (a point on the arc),
and `end`.

## Via Stitching

`pcb.stitch(net, options?)` ties a net across layers with a grid of vias —
the standard way to connect outer-layer pours to inner [planes](#planes).
Like `pcb.plane()`, stitching is a declaration: the vias are placed at
`create()` time against the complete board contents — every component
passed to `create()` is considered, net or no net, so nothing needs to be
registered beforehand. Candidates on a pitch grid are skipped when they
would violate clearance against existing copper (pads, tracks, vias, zones,
keepouts) on any layer the stitch spans; same-net pours never block.
Component footprints block stitches regardless of net (full keep-clear
extent — a mounting hole's screw-head zone, not just its pad), and board
text blocks stitches on its side of the board so silkscreen stays readable.
A `pitch` smaller than the via size plus clearance is rejected at the call.

```ts
pcb.plane('GND', 'In2.Cu');
pcb.zone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 50, height: 30 });

pcb.stitch('GND', { pitch: 1.5 }); // vias placed at create()
```

| Option | Description |
|---|---|
| `layers` | The layers the vias span (default: all copper layers, i.e. through vias). A partial span like `['F.Cu', 'In1.Cu']` emits blind vias over exactly that range. |
| `pitch` | Grid spacing in mm. Default 1.5. Must be at least `size` + clearance. |
| `size` / `drill` | Via dimensions. Default: design-rule minimums. |
| `area` | Restrict stitching to a region (default: the board outline). |
| `margin` | Inset from the board edge in mm. Default 0.5. |

## Teardrops

`pcb.teardrops(options?)` reinforces track-to-via junctions. It writes
KiCad's teardrop tool settings to the `.kicad_pro` (so boards open
preconfigured) and, for vias placed by the autorouter, generates the teardrop
geometry itself — tapered side segments on each layer the via connects:

```ts
pcb.teardrops();                                  // defaults: vias + pads, round, ≤1mm
pcb.teardrops({ maxLength: 0.8, shape: 'rect' }); // straight-sided wedges
```

| Option | Description |
|---|---|
| `vias` / `throughHolePads` / `smdPads` / `trackEnds` | Which junctions get teardrops. Defaults: all but `trackEnds`. |
| `shape` | `'round'` (curved sides, default) or `'rect'` (straight-sided). |
| `maxLength` / `maxHeight` | Wedge caps in mm. Defaults 1.0 / 2.0. |

## Round-Trip Editing with `typecad import`

You can lay out components, draw tracks, and place vias in the KiCAD interactive editor, then sync those changes back into your **type**CAD source code using `typecad import`.

### Snippet Mode

Print generated **type**CAD code snippets for the board layout:

```bash
typecad import ./build/board.kicad_pcb
```

This outputs component positions, `TrackBuilder` chains, vias, and outlines as TypeScript snippets you can copy into your code.

### Apply Mode (Round-Trip Sync)

Interactively apply layout changes from a `.kicad_pcb` file back to your source `.ts` files:

```bash
typecad import ./build/board.kicad_pcb --apply
```

This compares the KiCAD board file against your **type**CAD source, shows coordinate and side changes for each component, and lets you select which ones to write back.

This is particularly useful for [packages](/docs/package/overview): lay out the entire package in KiCAD, then round-trip the positions back into your package code.