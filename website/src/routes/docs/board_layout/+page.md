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

### `ITextPositioning` Fields

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

