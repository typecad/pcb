<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

# Board Layout

**type**CAD can help with board layout. Component locations can be set in code.

## PCB Coordinates

Each `Component` has a `pcb` property that contains `{x, y, rotation, side}`.

<ScrollArea orientation="both">

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

</ScrollArea>

`side` defaults to `'front'` and can be set to `'back'` to place a component on the bottom of the board.

## Relative Placement

Instead of hard-coding millimeter coordinates, use the placement helpers to position components relative to each other and the board edges. All gaps are measured **courtyard edge to courtyard edge**.

### `board()`

Get the board's physical dimensions from the outlines you've defined. Use it to place components at the center, or a fixed distance from any edge.

<ScrollArea orientation="both">

```ts
import { PCB, board } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');
pcb.outline(0, 0, 60, 45);

const b = board(pcb);

let u1 = new Component({ footprint: '...' });
u1.pcb = { x: b.center.x, y: b.center.y }; // center of the board
```

</ScrollArea>

`board()` returns a `BoardBounds` object with these properties:

| Property | Description |
|----------|-------------|
| `center` | `{ x, y }` center point |
| `left`, `right`, `top`, `bottom` | Edge coordinates in mm |
| `width`, `height` | Board dimensions in mm |
| `topLeft`, `topRight`, `bottomLeft`, `bottomRight` | Corner coordinates |

### Edge-relative placement with `fromLeft()`, `fromRight()`, `fromTop()`, `fromBottom()`

Place a component a fixed distance from a board edge, accounting for the component's own footprint size:

<ScrollArea orientation="both">

```ts
import { PCB, Component, board } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');
pcb.outline(0, 0, 60, 45);
const b = board(pcb);

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

</ScrollArea>

The margin defaults to **2mm** if omitted: `b.fromLeft()` places the component 2mm from the left edge.

### Directional placement: `below()`, `above()`, `rightOf()`, `leftOf()`

Place components relative to each other with a specified gap. Each returns a builder — call `.by(gap)` to set the edge-to-edge distance in mm (defaults to **2mm**).

<ScrollArea orientation="both">

```ts
import { PCB, Component, below, above, rightOf, leftOf, sameAs, board } from '@typecad/typecad';
import { Resistor, Capacitor, LED } from '@typecad/passives/0603';

let pcb = new PCB('typecad_docs');
pcb.outline(0, 0, 60, 45);
const b = board(pcb);

// MCU at center
let mcu = new Component({ footprint: 'Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm' });
mcu.pcb = { x: b.center.x, y: b.center.y };

// Decoupling cap 3mm below MCU, aligned in X
let c1 = new Capacitor({ value: '100nF', pcb: {
  x: sameAs(mcu).x,
  y: below(mcu).by(3),
}});

// Pull-up resistor 2mm right of the cap, same row
let r1 = new Resistor({ value: '10k', pcb: {
  x: rightOf(c1).by(2),
  y: sameAs(c1).y,
}});

// LED 8mm above the MCU
let led1 = new LED({ value: 'Red', pcb: {
  x: sameAs(mcu).x,
  y: above(mcu).by(8),
}});

// Current-limiting resistor 4mm left of the LED
let r2 = new Resistor({ value: '330', pcb: {
  x: leftOf(led1).by(4),
  y: sameAs(led1).y,
}});

// Default 2mm gap
let c2 = new Capacitor({ value: '10uF', pcb: {
  x: sameAs(r1).x,
  y: below(r1).by(),
}});

pcb.create(mcu, c1, r1, led1, r2, c2);
```

</ScrollArea>

### `sameAs()`

Align a component's X or Y coordinate with another component:

<ScrollArea orientation="both">

```ts
import { sameAs } from '@typecad/typecad';

// Same X as r1, custom Y
let c1 = new Capacitor({ pcb: { x: sameAs(r1).x, y: 20 } });

// Same Y as r1, custom X
let r2 = new Resistor({ pcb: { x: 30, y: sameAs(r1).y } });
```

</ScrollArea>

## Component Text Positioning

Each component has silkscreen and fabrication text labels (reference designator, value, and fab text). You can control their position and style using layout properties:

| Property | Default Layer | Description |
|----------|--------------|-------------|
| `referenceLayout` | F.SilkS | Controls the reference designator text (e.g. "R1") |
| `valueLayout` | F.Fab | Controls the value text (e.g. "1kohm") |
| `fabLayout` | F.Fab | Controls fabrication text; `text` defaults to `${REFERENCE}` |

All three accept an `ITextPositioning` object and can be set at construction or assigned later:

<ScrollArea orientation="both">

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
</ScrollArea>

<br>

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | `number` | Yes | X position in mm |
| `y` | `number` | Yes | Y position in mm |
| `rotation` | `number` | No | Rotation in degrees |
| `layer` | `string` | No | KiCad layer name |
| `width` | `number` | No | Font width in mm |
| `height` | `number` | No | Font height in mm |
| `fontSize` | `number` | No | Font size |
| `thickness` | `number` | No | Text stroke thickness |
| `bold` | `boolean` | No | Bold font style |
| `italic` | `boolean` | No | Italic font style |
| `justify` | `object` | No | `{ horizontal?: 'left'\|'right'\|'center', vertical?: 'top'\|'bottom'\|'middle', mirror?: boolean }` |
| `show` | `boolean` | No | Visibility toggle |

`fabLayout` additionally accepts an optional `text` field (`string`) that defaults to `${REFERENCE}` when omitted.

## Group or Place Components

In KiCAD, you can group components together. They will move around together when you click and drag anywhere in the group. There is also a labeled box around the components.

To accomplish this for a group of related components:
<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let r1 = new Resistor({ value: '1kohm', reference: 'R1' });
let pcb = new PCB('typecad_docs');

r1.pcb = { x: 10, y: 10, rotation: 0 };
pcb.group('typecad_docs', r1); // [!code highlight]
pcb.create();
```

</ScrollArea>

Or to place them:

<ScrollArea orientation="both">

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

</ScrollArea>

## Vias

Vias can be created, placed and connected like any other component. Vias are connected through `pin(1)`.

<ScrollArea orientation="both">

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

</ScrollArea>

### Power aware

Vias can be created with the optional `powerInfo` object. This allows **type**CAD to check that the current draw through the via is within the limits of the via's rating using the IPC-2221 standard. `maxTempRise` is the maximum wanted rise in temperature of the via, default is 10 C. `thickness` is the thickness of the via's copper in microns. 35 is the default (1 oz).

## Outlines

Board outlines can be created.

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

pcb.outline(100, 100, 50, 50, 1);   // x, y, w, h, fillet


pcb.create();
```

</ScrollArea>

Parameters are:
- **x** — x position of the top-left corner
- **y** — y position of the top-left corner
- **width** — board width in mm
- **height** — board height in mm
- **fillet** — (optional) corner fillet radius in mm

## Tracks

Traces can be created manually using `pcb.track()` for point-to-point routing with vias:

<ScrollArea orientation="both">

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

</ScrollArea>

Tracks are created by going from point to point, using vias to transition between layers. Nets and connections are not required to be specified. KiCAD will connect any track that touches an element with a net.

### Auto-routing

For automatic pin-to-pin routing, use `pcb.route()`:

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

let tracks = await pcb.route({
  from: r1.pin(1),
  to: r2.pin(2),
});

pcb.create(r1, r2, ...tracks);
```

</ScrollArea>

`route()` finds an optimized path between the `from` and `to` pins. Options include:
- _from_ / _to_ — pin or array of pins (required)
- _width_ — trace width in mm (calculated from `powerInfo` if omitted)
- _layers_ — restrict to specific copper layers (e.g. `['F.Cu', 'B.Cu']`)
- _powerInfo_ — `{ current, maxTempRise, thickness }` for automatic IPC-2221 trace width calculation
- _waypoints_ — array of `{ x, y }` points to guide the path
- _clearance_ — minimum clearance from other objects in mm


## Zones

Filled copper zones (e.g., ground pours) and keepout areas can be added to the board:

<ScrollArea orientation="both">

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

</ScrollArea>

## Graphics

Draw graphical elements on the PCB:

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('graphics_example');

pcb.line({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, layer: 'F.SilkS', width: 0.15 });
pcb.circle({ center: { x: 25, y: 25 }, radius: 5, layer: 'F.SilkS', width: 0.15 });
pcb.rect({ x: 0, y: 0, width: 20, height: 15, layer: 'Edge.Cuts', strokeWidth: 0.15 });
pcb.text({ text: 'REV 1.0', x: 5, y: 5, layer: 'F.SilkS', width: 1, height: 1 });

pcb.create();
```

</ScrollArea>

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

