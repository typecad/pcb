<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";

    let { data }: { data: PageData } = $props();
</script>

# Package Use
Now that we've created a package, we need to know how to use it.

## Self-documenting
A benefit of TypeScript is that you can write a lot of documentation in the code itself. You'll notice the JSDoc comments in the package code. This will result in VSCode hints and tips as you write your code, explaining parameters and providing examples if fully implemented.

## `import`
The tooling gave us the `import` statement for the package.

<ScrollArea orientation="both">

```ts
import { TypecadPackage } from "./typecad_package";
```
</ScrollArea>

## `new`
Now create a new instance of the package. `pcb`, `x`, and `y` are required:

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/pcb';
import { TypecadPackage } from "./typecad_package";

let typecad = new PCB('typecad_docs');

let u1 = new TypecadPackage({ pcb: typecad, x: 50, y: 50 });
let u2 = new TypecadPackage({ pcb: typecad, x: 100, y: 50, reference: 'U2' });
let u3 = new TypecadPackage({ pcb: typecad, x: 150, y: 50, passiveSize: '0805' });
```
</ScrollArea>

Options:
- _pcb_ — the PCB instance (required)
- _x_ / _y_ — position on the board (required)
- _reference_ — reference designator for the main IC
- _name_ — name for the PCB group (defaults to the class name)
- _passiveSize_ — chip size for the package's built-in passives (defaults to `'0603'`)

## Connections
After creating the instance, you can access the pins of any component in the package:

<ScrollArea orientation="both">

```ts
u1.ATtiny3227_M.GND // the ground pin of the ATtiny3227
u1.ATtiny3227_M.VCC // the power pin of the ATtiny3227
```
</ScrollArea>

## Include the package
After the package has been pulled in with an `import` and a `new` instance created, configuration is done, and connections made, you `create` it to the schematic.

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/pcb';
import { TypecadPackage } from "./typecad_package";
let typecad = new PCB('typecad_docs');

let u1 = new TypecadPackage({ pcb: typecad, x: 50, y: 50 });

typecad.create(u1.components);
```
</ScrollArea>
The package's components will be added to the PCB.

## Do Not Populate
If a package includes a component you don't want included in the netlist or layout:

<ScrollArea orientation="both">

```ts
let u1 = new TypecadPackage({ pcb: typecad, x: 50, y: 50 });
u1.ATtiny3227_M.dnp = true;
```
</ScrollArea>
