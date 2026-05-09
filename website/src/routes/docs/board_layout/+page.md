<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";

    let { data }: { data: PageData } = $props();
</script>

# Board Layout

**type**CAD can help with board layout. Component locations can be set in code and then reused.

## Recommended workflow

1. If you're using a **type**CAD package that includes a board layout
2. `import` and configure as usual
3. At the end of the main file, include the package's components in `PCB::create(...package.components)`.
4. Call `PCB::create();` to generate the KiCAD board file.

<br />


When you open the board in KiCAD, you'll see the components placed.

## `PCB`

Here is the minimal code to create a PCB.

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
let pcb = new PCB('typecad_docs');

// add components to the PCB
pcb.create();
```

</ScrollArea>

After running the code, there will be a `typecad_docs.kicad_pcb` file in `./build`.

## PCB Coordinates

Each `Component` has a `pcb` property that contains `{x, y, rotation}`. That's how the component's location is specified. You can take them directly from KiCAD when you're finished laying out the components.

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let pcb = new PCB('typecad_docs');
let r1 = new Resistor({ value: '1kohm', reference: 'R1' });

r1.pcb = { x: 10, y: 10, rotation: 0 }; // [!code highlight]
pcb.create();
```

</ScrollArea>

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

// create a via with a diameter of 0.6mm and a drill size of 0.3mm
let via = typecad.via({
  at: { x: 10, y: 10 },
  size: 0.6,
  drill: 0.3,
  powerInfo: { current: 1, maxTempRise: 5, thickness: 35 },
});

// connect the resistor and via together
typecad.net(r1.pin(1), via.pin(1));

// group it
typecad.group('typecad_docs', r1, via);

// create it like any other component
typecad.create(r1, via);
```

### Power aware

Vias can be created with the optional `powerInfo` object. This allows **type**CAD to check that the current draw through the via is within the limits of the via's rating using the IPC-2221 standard. `maxTempRise` is the maximum wanted rise in temperature of the via, default is 10 C. `thickness` is the thickness of the via's copper in microns. 35 is the default (1 oz).

</ScrollArea>

## Outlines

Board outlines can be created.

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

// create an outline x=100, y=100, width=50, height=50, with a corner fillet of 1mm
pcb.outline(100, 100, 50, 50, 1);

pcb.create();
```

</ScrollArea>

_The corner fillet is optional and can be omitted._

## Tracks

Tracks are created using the `TrackBuilder` object.

<ScrollArea orientation="both">

```ts
import { PCB, TrackBuilder } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

let power_track: TrackBuilder = this.pcb
  .track()
  .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 }) // optional power information
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2) // Start on F.Cu, 0.2mm wide (these are the defaults and can be omitted)
  .to({ x: 110, y: 100 }) // go to 110, 100
  .via({ size: 0.8, drill: 0.4 }) // create a via at 110, 100
  .to({ x: 110, y: 120, layer: 'B.Cu' }); // Continues on B.Cu

pcb.group('typecad_docs', power_track); // add the TrackBuilder to the group

pcb.create();
```

</ScrollArea>

Using the above method, tracks can be created by going from point to point, using vias to transition between layers. Nets and connections are not required to be specified. KiCAD will connect any track that touches an element with a net, ie. a track that touches a pad connected to the 'gnd' net will make the entire track also connected to the 'gnd' net.

### Power aware

`TrackBuilder` objects can be created with the optional `powerInfo` object. This allows **type**CAD to check that the current draw through the track is within the limits of the track's rating using the IPC-2221 standard. `maxTempRise` is the maximum wanted rise in temperature of the track, default is 10 C. `thickness` is the thickness of the track's copper in microns. 35 is the default (1 oz).

<br />

> [!note] There is an easier way
> `kicad2typecad` (bundled with [@typecad/typecad](https://www.npmjs.com/package/@typecad/typecad)) is a command-line tool that can be used to convert a KiCAD board file into **type**CAD code snippets. It will give component locations, TrackBuilder objects and vias.<br>
> This is particularly useful for [package](/docs/package/overview) creation. You can lay out the entire package in KiCAD; components placed, tracks drawn, and vias added. Then use `kicad2typecad` to generate the code snippets to create them programmatically in the package.
