# Adding KiCAD Library Components
**type**CAD is tightly integrated with KiCAD, that means easy access to the installed KiCAD library of parts it comes with. 

### Video

## `add-component`
Using the `Add Component 🧩` NPM script to add a new component is the easiest way. It should be available to just click in the NPM Scripts section in VS Code. There are three sources of components: KiCAD, JLCPCB and local files. Both symbol and footprint files are needed to create a typeCAD component. Any source can be mixed with any other, ie. a KiCAD symbol and a local downloaded footprint. 

Click it and you should see something like the following:

```
🧩 typeCAD Create Component
? Select symbol source: (Use arrow keys)
❯ KiCAD
  local file
  EasyEDA/JLCPCB
A symbol from the installed KiCAD library
```

Choose `KiCAD` for both symbol and footprint source. The next thing it asks is the `Symbol name`. Right now, the easiest way to get that information is to add the part you want to a schematic. For this example, we'll make an ATtiny85 MCU. Open KiCAD's schematic editor and add it to a KiCAD schematic. Select it and press `e`. You should see a dialog that looks like this:

![KiCAD Symbol Properties](/docs/attiny85.png)

The highlighted `Library link` text on the bottom has the information you need. The first part, before the `:` is the symbol library name (`MCU_Microchip_ATtiny`), the second part is the symbol name (`ATtiny85-20S`). KiCAD conveniently lets you copy this text, so copy it and paste it into our terminal.

```
🧩 typeCAD Create Component
✔ Select symbol source: KiCAD
✔ Select footprint source: KiCAD
✔ Symbol name? MCU_Microchip_ATtiny:ATtiny3227-M
? Footprint name? (Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm)
```
The next question asks for the `Footprint name`. For KiCAD components, the default text will contain the symbol-specified footprint file. For some components this might not be what you want, but for this particular component, `Package_DFN_QFN:QFN-20-1EP_4x4mm_P0.5mm_EP2.6x2.6mm` is the right one. Hit enter. Footprints are defined in the sam way as symbols ([footprint_lib:footprint_name]).

```
🧩 typeCAD Add Component
✔ Select symbol source: KiCAD
✔ Select footprint source: KiCAD
✔ Symbol name? MCU_Microchip_ATtiny:ATtiny85-20M
✔ Footprint name? Package_DFN_QFN:QFN-20-1EP_4x4mm_P0.5mm_EP2.6x2.6mm
Finished component creation, use it with:
 import { ATtiny85_20M } from './ATtiny85_20M';
 let u1 = new ATtiny85_20M();
 ```

There will be a little implementation code that shows how to `import` the code and create a `new` instance of it. 

## `import`
The minimal code to use this new component looks like this:

```ts
import { PCB } from '@typecad/pcb'
import { ATtiny85_20M } from './ATtiny85_20M';

let typecad = new PCB('attiny85');
let u1 = new ATtiny85_20M();

typecad.create(u1);
```