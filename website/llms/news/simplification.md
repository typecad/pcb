---
title: typeCAD Simplification
description: The entire typeCAD API has been simplified and interaction between KiCAD and typeCAD has been improved.
date: '2025-5-30'
categories:
  - tools
  - command-line
  - git
  - wiring
  - code-as-schematic
published: true
cover: https://unsplash.com/photos/_SEbdtH4ZLM/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8MjN8fGVhc2llcnxlbnwwfDB8fHwxNzQ4NjY4MzA0fDA&force=true&w=640
---

# Simplification
**type**CAD was growing in features at the expense of simplicity. The entire API has been simplified and the interaction between KiCAD and typeCAD has been improved while also maintaining backwards compatibility. 

## `Schematic` and `PCB`
The `Schematic` and `PCB` classes have been merged into a single `PCB` class. The `PCB` class now has a `schematic` property that contains the schematic data. The `PCB` class also has a `create` method that takes a list of components and adds them to the schematic and board. This change was made because the schematic and board are always created together and there was no need to have two separate classes. Also, **type**CAD was the schematic, so why put any mental effort into another 'Schematic'?

Now the bare minimum code to create a board is:

```ts
import { PCB } from '@typecad/typecad';
let typecad = new PCB('typecad');
typecad.create();
```

There's no need to think about `Schematic` anymore. All the functionality is still there, but it's stubbed out in the `PCB` class. `::net` and `::named` are called from `PCB` now. So is `::bom` and `::erc`.

## KiCAD
The interaction between **type**CAD and KiCAD was getting unintuitive. Wondering if you needed to Revert to see component location changes or reimport the netlist to see other updates was confusing. 

Now, **type**CAD will automatically import the netlist after running `PCB::create()`. That means you never have to interact with the netlist file again. 

Any changes made to the board will be reflected in their entirety when you run `PCB::create()` and use the Revert function (or just reopen) the board in KiCAD. 

### More KiCAD integration to come
Soon, we'll be releasing a new version that will check for a dirty .kicad_pcb file and prompt you to revert before running `PCB::create()`. This will prevent any changes you've made in KiCAD from being lost. It will be more robust and useful that the current method which just checks for the existence of a lock file. 

## Package improvement
We've tweaked things to make packages easier to create and use. They are now created similarly to other components, and also used the same as well. Before, our example packages had `add` and `place` methods. Now, they have a property that holds everything in a `components` array. That array is passed to `PCB::create()` as a spread operator. The result is a much simpler and more intuitive package creation and use. 

## `npm update` 
Update your projects and packages to the latest version to get the latest features and improvements.