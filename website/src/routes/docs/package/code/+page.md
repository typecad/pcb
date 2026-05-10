<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { buttonVariants } from "$lib/components/ui/button";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    let { data }: { data: PageData } = $props();
</script>

> [!warning] 
> This is where a more in-depth knowledge of TypeScript will be useful.

# Code
If we continue to use the ATtiny3227 as an example, we can see the code that is generated for the component in `index.ts`.

<ScrollArea orientation="both">

```ts
import * as _0603 from '@typecad/passives/0603';
import { PCB, Component, TrackBuilder } from '@typecad/typecad';
import { ATtiny3227_M } from './ATtiny3227_M';
import { Resistor } from '@typecad/passives/0603';

export interface TypecadPackageOptions {
    reference?: string;
    passives?: typeof _0603;
    pcb: PCB;
}

export class TypecadPackage {
    #passives: typeof _0603;
    readonly pcb: PCB;
    readonly U1: ATtiny3227_M;
    readonly R1: Resistor;
    readonly components: (Component | TrackBuilder)[] = [];

    constructor({ reference, passives, pcb }: TypecadPackageOptions) {
        this.#passives = passives || _0603;
        this.pcb = pcb;

        // create the components
        this.U1 = new ATtiny3227_M(reference);
        this.U1.pcb = { x: 172.72, y: 99.06, rotation: 0 };
        this.R1 = new this.#passives.Resistor({ value: '470ohm', pcb: { x: 169.355, y: 93.98, rotation: 180 } });
        
        // connect the components
        this.pcb.net(this.U1.PA1, this.R1.pin(1));

        // create the tracks
        this.components.push(this.pcb.track().from({ x: 170.18, y: 95.8325 }).to({ x: 171.47, y: 97.1225 }));
        this.components.push(this.pcb.track().from({ x: 170.18, y: 93.98 }).to({ x: 170.18, y: 95.8325 }));

        // add the components to the pcb and group them
        this.components.push(this.U1, this.R1);
        this.pcb.group('ATtiny3227_M', this.U1, this.R1);
    }
}
```
</ScrollArea>

It seems like a lot of code. Let's break it into smaller pieces and describe what it does.

## `import`
<ScrollArea orientation="both">

```ts
import * as _0603 from '@typecad/passives/0603';
import { PCB, Component, TrackBuilder } from '@typecad/typecad';
import { ATtiny3227_M } from './ATtiny3227_M';
import { Resistor } from '@typecad/passives/0603';
```
</ScrollArea>

This is importing the PCB class from the `@typecad/typecad` package, and the ATtiny3227_M component from the `./ATtiny3227_M` file the tooling created. All packages import 0603-sized passives by default. This can be changed as we'll discuss later.

## `interface`
<ScrollArea orientation="both">

```ts
...
export interface TypecadPackageOptions {
    reference?: string;
    passives?: typeof _0603;
    pcb: PCB;
}
...
    constructor({ reference, passives, pcb }: TypecadPackageOptions)
...
```
</ScrollArea>

This is the code needed to provide an optional parameters interface. It allows the end user to accept defaults or override them without needing to modify the behavior of the other parameters. 

In this example, when a `new` typecad_package is created and the `constructor` is called, a reference, passives, and pcb object can be provided. If not provided, the default behavior will be used.

## `constructor`
<ScrollArea orientation="both">

```ts
export class TypecadPackage {
    #passives: typeof _0603;
    readonly pcb: PCB;
    readonly U1: ATtiny3227_M;
    readonly R1: Resistor;
    readonly components: (Component | TrackBuilder)[] = [];

    constructor({ reference, passives, pcb }: TypecadPackageOptions = {}) {
        ...
    }
...
}
```
</ScrollArea>

The `constructor` is where everything happens. It's called when a `new` instance is created. The existing code is mostly boilerplate; assigning the `passives` to the default if not provided, assigning the `pcb`, and creating the `U1` component.

You'll see that the `U1` component is declared as a class property. This is important for allowing it to be changed outside the package. When you create this package in your implementation code, you can access it like this: `package.U1`. You can change any `U1` property this way, avoiding the need to edit this file directly to make changes. It is suggested that all components be created in this way.

If there were additional passives needed, pullup/pulldown resistors, capacitors, etc., they would be added here. 

## Connect the components
<ScrollArea orientation="both">

```ts
    ...
    this.pcb.net(this.U1.PA1, this.R1.pin(1));
    ...
```
</ScrollArea>

After the components are created, make all the connections. Access the pcb using `this.pcb` and use `::net()` to connect the pins. 

## Create the tracks
<ScrollArea orientation="both">

```ts
    ...
    this.components.push(this.pcb.track().from({ x: 170.18, y: 95.8325 }).to({ x: 171.47, y: 97.1225 }));
    this.components.push(this.pcb.track().from({ x: 170.18, y: 93.98 }).to({ x: 170.18, y: 95.8325 }));
    ...
```
</ScrollArea>

Use the `TrackBuilder` object to create tracks to connect the components in the PCB. Then add them to `this.components`. 

There is a CLI tool to make this step easier. `kicad2typecad` (bundled with [@typecad/typecad](https://www.npmjs.com/package/@typecad/typecad)) will read a .kicad_pcb file and convert component locations and tracks to typeCAD code.

## Add and group
<ScrollArea orientation="both">

```ts
    ...
    this.components.push(this.U1, this.R1);
    this.pcb.group('ATtiny3227_M', this.U1, this.R1);
    ...
```
</ScrollArea>

Push the components to `this.components` and group them. 

## Using it
The use of this package is similar to an individual component. 

<ScrollArea orientation="both">

```ts
    import { PCB } from "@typecad/typecad"
    import { TypecadPackage } from "./typecad_package";

    let typecad = new PCB('new');
    let tiny = new TypecadPackage({ pcb: typecad });
    typecad.create(...tiny.components);
```
</ScrollArea>

You'll remember that all the components and tracks were added to the `components` array. Using the spread operator (`...`), we can pass them all to `::create()` in one line. 

## Variations
There are many ways to create packages. This is just one example. 

<div class="relative">
<br/>
<br/>
<br/>
    <p class="absolute right-0">
       <a href="/docs/package/use" class={buttonVariants({ variant: "outline" })}>Use<ChevronRight /></a>
    </p>
</div>