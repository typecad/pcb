---
title: Route your boards
description: Use AI to create reference designs from a datasheet
date: '2025-5-25'
categories:
  - tools
  - routing
  - tracks
  - board
  - pcb
  - code-as-schematic
published: true
cover: https://unsplash.com/photos/FwzhysPCQZc/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8MzF8fHdpcmVzfGVufDB8MHx8fDE3NDgxODk5OTh8MA&force=true&w=640
---

# Create tracks with typeCAD

One of the last parts of board design was routing and that is largely accomplished now with the newest release. 

## `TrackBuilder`
The `TrackBuilder` object lets you create tracks with a fluent API.

```ts
import { PCB, TrackBuilder } from '@typecad/typecad';

let pcb = new PCB('typecad_docs');

let power_track: TrackBuilder = this.pcb.track()
    .from({x: 100, y: 100}, "F.Cu", 0.2)    // Start on F.Cu, 0.2mm wide (these are the defaults and can be omitted)
    .to({x: 110, y: 100})                   // go to 110, 100
    .via({size: 0.8, drill: 0.4})           // create a via at the 110, 100
    .to({x: 110, y: 120, layer: "B.Cu"});   // Continues on B.Cu

pcb.group('typecad_docs', power_track);     // add the TrackBuilder to the group

pcb.create();
```

This method fits in nicely with the rest of the **type**CAD API. 

### Connections
`TrackBuilder` objects don't take any connection information. This is because KiCAD will connect any track that touches an element with a net, ie. a track that touches a pad connected to the 'gnd' net will make the entire track also connected to the 'gnd' net. Since there's no use for an unconnected track, this simplifies to process.

## kicad2typecad
`kicad2typecad` (bundled with [@typecad/typecad](https://www.npmjs.com/package/@typecad/typecad)) is a tool to simplify making tracks. This is particularly useful for making packages. You can lay out the entire package in KiCAD; components placed, tracks drawn, and vias added. Then use `kicad2typecad` to generate the code snippets to create them programmatically in the package.

### Making a package
The workflow for creating a reusable package is:
1. Create a package, add components and connections
2. Layout the board in KiCAD using tracks and vias
3. Use `kicad2typecad` to generate the code snippets
4. Add the code snippets to the package

An example output for a small package looks like this:

```bash
Reading from File: .\typecad_docs.kicad_pcb
Found 6 segments. Generating TrackBuilder chains from File: .\Reading from File: .\typecad_docs.kicad_pcb.

--- Generated typeCAD TrackBuilder Code from File: .\typecad_docs.kicad_pcb ---
this.pcb.track().from({ x: 152.05, y: 96.87 }, "F.Cu", 0.2)
  .to({ x: 152.4, y: 96.52, layer: "F.Cu", width: 0.2 });
this.pcb.track().from({ x: 151.1, y: 99.665 }, "F.Cu", 0.2)
  .to({ x: 151.765, y: 100.33, layer: "F.Cu", width: 0.2 })
  .to({ x: 152.273, y: 99.822, layer: "F.Cu", width: 0.2 })
  .to({ x: 153.67, y: 99.822, layer: "F.Cu", width: 0.2 }); 
this.pcb.track().from({ x: 150.6, y: 99.175 }, "F.Cu", 0.2)
  .to({ x: 151.1, y: 99.175, layer: "F.Cu", width: 0.2 })
  .to({ x: 151.1, y: 99.665, layer: "F.Cu", width: 0.2 });

---------------------------------------------------------
Found 4 footprints. Generating placement code from File: .\typecad_docs.kicad_pcb.

--- Generated Component Placement Code from File: .\typecad_docs.kicad_pcb ---
this.C1.pcb = { x: 153.67, y: 99.047, rotation: -90 };
this.C2.pcb = { x: 153.67, y: 95.986, rotation: -90 };
this.VR1.pcb = { x: 150.6, y: 97.725, rotation: 0 };
this.L1.pcb = { x: 147.32, y: 97.828, rotation: 90 };
-------------------------------------------------------------
Found 3 vias. Generating typeCAD code from File: .\typecad_docs.kicad_pcb.

--- Generated typeCAD Via Code from File: .\typecad_docs.kicad_pcb ---
this.v1 = this.pcb.via({ at: { x: 110, y: 100 }, size: 0.8, drill: 0.4 });
this.v2 = this.pcb.via({ at: { x: 152.4, y: 96.52 }, size: 0.6, drill: 0.3 });
this.v3 = this.pcb.via({ at: { x: 151.765, y: 100.33 }, size: 0.6, drill: 0.3 });
-----------------------------------------------------
```

### Using the code
The `TrackBuilder` objects can be used within a package directly. That's why they are prefixed with `this`. One modification would be to place the return value of each `this.pcb.track` into a `TrackBuilder` object which can then be used to place in a package group. 

The vias can also be used directly, or you can just take their location data. 

For `Component` objects, the package doesn't read your code so it doesn't know what the variable names for your components are. It just uses the reference to show the code snippet.