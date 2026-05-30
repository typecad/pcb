<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { buttonVariants } from "$lib/components/ui/button";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    let { data }: { data: PageData } = $props();
</script>

# Classes

## `PCB`

The main class that represents the entire circuit.

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
let typecad = new PCB('typecad_concepts', {thickness: 1.6, copper_thickness: 35 });
```
</ScrollArea>
The only required option is the name. The name determines the name of the resulting KiCAD files (.kicad_pcb, .kicad_sch, and .net).

Optional properties are: `{thickness: 1.6, copper_thickness: 35 }`
- thickness — board thickness in mm
- copper_thickness — copper thickness in microns (1 oz = 35 microns)

These are used in power-aware calculations.


The `PCB` class is where:
- Components are added
- Connections are made between components
- Board layout is defined
- Utility functions like ERC and BOM
- Routing with `route()` and `autorouteBatch()`
- Zones, keepout areas, and graphics

## `Component`

The `Component` class represents individual parts like resistors, capacitors, ICs, etc. You add a `Component` to your `PCB`.

<ScrollArea orientation="both">

```ts
import { Component } from '@typecad/typecad';

let R1 = new Component({ value: '1kohm' });
```
</ScrollArea>
Options for the `Component` class are:

- _reference_ — reference designator
- _value_ — value of component
- _footprint_ — footprint
- _symbol_ — KiCAD symbol library path
- _prefix_ — prefix for reference designator
- _datasheet_ — link to component datasheet
- _description_ — description of component
- _voltage_ — voltage rating of component
- _wattage_ — wattage rating of component
- _mpn_ — Manufacturer Part Number
- _dnp_ — true if component is Do Not Populate, false to place component
- _simulation_ — an object with simulation data `{ include: true, model: 'ngspice-model' }`
- _pcb_ — position on the board `{ x, y, rotation }`
<!-- - _typehal_ — metadata for hardware contract generation -->
- _text_ — text positioning for reference and value labels
- _fab_ — fabrication layer text positioning

<br >

> [!note] Syntax
> **type**CAD makes use of the above syntax style for many of its classes, ie. passing an object of optional properties. *Optional* in terms of TypeScript code, if a particular property isn't passed and **type**CAD requires it, it will throw an error during build. 

## `Power`

Represents a power source like a battery or voltage regulator. 

<ScrollArea orientation="both">

```ts
import { Power } from '@typecad/typecad';

let coin_cell = new Power({ power: holder.pin(1), gnd: holder.pin(2), voltage: 3.7 });
```
</ScrollArea>
Options are:

- _power_ — pin on a component that supplies power
- _gnd_ — pin on a component that supplies ground
- _voltage_ — voltage of power source
- _current_ — current capacity of the power source
- _direction_ — `output` for power sources, `input` for power consumers

## `Package`

Abstract base class for creating reusable, importable hardware modules. Extend this class to encapsulate a circuit sub-design (e.g. a voltage regulator, sensor module, or MCU subsystem).

<ScrollArea orientation="both">

```ts
import { Package, Component } from '@typecad/typecad';

export class MyResistor extends Package {
  declare resistor: Component;

  build(options) {
    this.resistor = new this.passives.Resistor({ value: '10kohm' });
    this.resistor.pcb = { x: 100, y: 100, rotation: 0 };
  }
}
```
</ScrollArea>

The constructor handles offset positioning (`x`, `y`), auto-collects all `Component` properties set on `this`, groups them on the PCB.

## `TrackBuilder`

Fluent API for creating tracks on the PCB:

<ScrollArea orientation="both">

```ts
import { PCB, TrackBuilder } from '@typecad/typecad';

let pcb = new PCB('tracks');

let track: TrackBuilder = pcb
  .track()
  .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 })
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2)
  .to({ x: 110, y: 100 })
  .via({ size: 0.8, drill: 0.4 })
  .to({ x: 110, y: 120, layer: 'B.Cu' });

pcb.create();
```
</ScrollArea>


<div class="relative">
<br/>
<br/>
<br/>
    <p class="absolute right-0">
       <a href="/docs/passives" class={buttonVariants({ variant: "outline" })}>Passives<ChevronRight /></a>
    </p>
</div>
