<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

# Passives
To simplify adding components, the most common components: resistors, capacitors, etc, are built into [@typecad/pcb](https://www.npmjs.com/package/@typecad/pcb). No extra package is needed — import them from the same place as `PCB`.

## Sizes
Passives are sized with the `size` option, which defaults to `'0603'`.

<ScrollArea orientation="both">

```ts
import { Resistor, LED, Capacitor, Diode, Inductor, Fuse } from '@typecad/pcb'

let r1 = new Resistor({ value: '1kohm', reference: 'R1', size: '0805' });
```
</ScrollArea>

Will create components in the 0805 size.

To use the default 0603 size, simply omit the option:

<ScrollArea orientation="both">

```ts
let r1 = new Resistor({ value: '1kohm' }); // 0603 (default) // [!code word:0603:1]
```
</ScrollArea>

All of the sizes are:

- `'1210'`
- `'1206'`
- `'0805'`
- `'0603'` (default)
- `'0402'`
- `'0201'` **no fuses**

### Multi-sizes
To work with multiple sizes at once, use the `passiveFactory` helper:

<ScrollArea orientation="both">

```ts
// [!code word:passiveFactory('0603')]
// [!code word:passiveFactory('0805')]
import { passiveFactory } from '@typecad/pcb';
const _0603 = passiveFactory('0603');
const _0805 = passiveFactory('0805');

let r1 = new _0603.Resistor({ value: '1kohm' }); 
let c2 = new _0805.Capacitor({ value: '1uF' });
```
</ScrollArea>
<br >

> [!tip]
> `_0603` and `_0805` can be changed to any TypeScript-legal name.

## Reference Designators
KiCAD tracks components by their reference designator. This is the name that appears on the schematic and the PCB. For passives, the `reference` property is how components are referenced. It is not a required property of any passive component, if it is not passed, one will automatically generated.

Auto-generation works as follows:
- if `reference` is passed, it will be used. If there is a name conflict, it will be renamed and a warning will be logged in the build output.
- if `reference` is not passed, it will create one using the `prefix` property and an internal counter by type of component. ie the first resistor will be `R1`, the second resistor will be `R2`, etc. 
- if the `prefix` property is not passed, it will be `R` by default for resistors, `C` for capacitors, `L` for inductors, etc.

<br >

> [!warning]
> Because ultimately, KiCAD is tracking components by reference designator, components will sometimes swap reference designators with each other based on when the **type**CAD build process encounters it during the build process. This only happens when a similar component is created before an already laid-out component. **This is avoided by only using one or the other: auto-generation or explicit reference passing.**

## Unique Footprints
Sometimes, passive components will have a unique footprint. To use that footprint:
1. copy the footprint file (.kicad_mod) into ./hw/src/build/lib/footprints
2. use it in your `new` component:

<ScrollArea orientation="both">

```ts
import { Inductor } from '@typecad/pcb'
let l1 = new Inductor({ value: '1uH', footprint: 'unique_inductor_footprint', size: '0805' });
```
</ScrollArea>
