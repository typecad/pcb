<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

> [!warning]
> This is where a more in-depth knowledge of TypeScript will be useful.

# Code
If we continue to use the ATtiny3227 as an example, the generated `index.ts` extends the `Package` base class and implements a `build()` method:

<ScrollArea orientation="both">

```ts
import { Package, PackageOptions, Component } from '@typecad/typecad';
import { ATtiny3227_M } from './ATtiny3227_M';

/**
 * ### TypecadPackage - Description
 *
 * #### Input Connections
 *
 * #### Output Connections
 *
 */
export class TypecadPackage extends Package {
    declare ATtiny3227_M: ATtiny3227_M;
    declare r1: Component;

    build(options: PackageOptions) {
        this.ATtiny3227_M = new ATtiny3227_M(this.reference);
        this.ATtiny3227_M.pcb = { x: 0, y: 0, rotation: 0 };

        // Passives
        this.r1 = new this.passives.Resistor({ value: '10k' });

        // Nets
        // this.net(this.ATtiny3227_M.pin(1), this.r1.pin(1));

        // Vias
        // let v1 = this.via({ x: 0, y: 0 });

        // Tracks
        // this.add(this.track().from({ x: 0, y: 0 }).to({ x: 1, y: 1, layer: 'F.Cu', width: 0.2 }));
    }
}
```
</ScrollArea>

Let's break it into smaller pieces and describe what it does.

## `import`
<ScrollArea orientation="both">

```ts
import { Package, PackageOptions, Component } from '@typecad/typecad';
import { ATtiny3227_M } from './ATtiny3227_M';
```
</ScrollArea>

This imports the `Package` base class and `PackageOptions` type from `@typecad/typecad`, and the `ATtiny3227_M` component from the file the tooling created.

## `extends Package`
<ScrollArea orientation="both">

```ts
export class TypecadPackage extends Package {
```
</ScrollArea>

The package **extends `Package`** instead of managing everything manually. The `Package` base class handles:
- Offset positioning 
- Auto-collecting all `Component` and `TrackBuilder` properties assigned to `this`
- Grouping components on the PCB
- Providing `this.passives` (defaults to `@typecad/passives/0603`)

## `declare` properties
<ScrollArea orientation="both">

```ts
    declare ATtiny3227_M: ATtiny3227_M;
    declare r1: Component;
```
</ScrollArea>

Components are `declare`d as class properties. This makes them accessible from outside the package (e.g. `package.ATtiny3227_M`). Any `Component` or `TrackBuilder` property assigned to `this` inside `build()` is automatically collected — no manual `this.components.push()` needed.

## `build()`
<ScrollArea orientation="both">

```ts
    build(options: PackageOptions) {
        this.ATtiny3227_M = new ATtiny3227_M(this.reference);
        this.ATtiny3227_M.pcb = { x: 0, y: 0, rotation: 0 };

        this.r1 = new this.passives.Resistor({ value: '10k' });

        this.net(this.ATtiny3227_M.PA1, this.r1.pin(1));

        this.add(this.track().from({ x: 0, y: 0 }).to({ x: 1, y: 1 }));
    }
```
</ScrollArea>

All component creation, connections, and routing happen in `build()`. The base class calls this method after setting up the offset context, so all coordinates are relative to the `x`, `y` position passed in the constructor.

Key methods available inside `build()`:
- `this.net(...pins)` — connect pins
- `this.track()` — start a track chain (register with `this.add()`)
- `this.via({ x, y })` — place a via (auto-registered)
- `this.passives.Resistor/Capacitor/...` — create passives
- `this.add(...items)` — manually register tracks or array-stored components

## Adding tracks

Tracks aren't stored as named properties, so they need to be registered with `this.add()`:

<ScrollArea orientation="both">

```ts
this.add(this.track().from({ x: 0, y: 0 }).to({ x: 1, y: 1 }));
```
</ScrollArea>

There is a CLI tool to make this step easier. `typecad import` (bundled with [@typecad/typecad](https://www.npmjs.com/package/@typecad/typecad)) will read a .kicad_pcb file and convert component locations and tracks to typeCAD code. See the [Import](/docs/import) page for details.

## Using it
The use of this package is similar to an individual component.

<ScrollArea orientation="both">

```ts
import { PCB } from "@typecad/typecad"
import { TypecadPackage } from "./typecad_package";

let typecad = new PCB('new');
let tiny = new TypecadPackage({ pcb: typecad, x: 10, y: 10 });
typecad.create(tiny.components);
```
</ScrollArea>

All the components and tracks are collected into the `components` array automatically. Pass it directly to `create()`.

## Variations
There are many ways to create packages. This is just one example.

