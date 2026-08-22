# Concepts

Instead of using the KiCAD schematic editor, you write code and then build it into a KiCAD project.

**type**CAD uses TypeScript. You don't need an extensive knowledge of TypeScript to get started. 

If you're familiar with any programming language, you can pick up the basics of TypeScript pretty quickly. 

> [!faq]- Why TypeScript?
> One of the long-term goals of **type**CAD was to integrate hardware design into the realm of AI. Most AI-based tools understand TypeScript very well and don't need special training to use it effectively.
> TypeScript is also relatively simple to learn and use. 

## KiCAD
The normal flow in KiCAD is:
1. Create a project with a schematic and board
2. Add components
3. Make connections
4. Layout the board

## **type**CAD
**type**CAD replaces steps 1-3. Instead of clicking and dragging to place components and make connections, TypeScript code is used. 

This is how a PCB is created.

```ts 
import { PCB } from '@typecad/typecad';
let typecad = new PCB('typecad');
typecad.create();
```

That code will create a KiCAD board file, schematic file, netlist and BOM in `./build/typecad.kicad_pcb`, `./build/typecad.kicad_sch`, `./build/typecad.net`, and `./build/typecad.csv`.

### Build
Run `typecad build` from your project's `hw/` directory to build. You can configure the build using a `typecad.conf.ts` file in the `hw/` directory. 

### Workflow
The new layout becomes:
1. Create a **type**CAD project
2. Edit the code to add components and make connections
3. Build it
4. Open the board in KiCAD to layout

Design rules (minimum clearances, track/via dimensions) default to the JLCPCB
no-surcharge standard and are written to the project file for DRC; see
[Board Layout → Design Rules](/docs/board_layout#design-rules). You only need
to open KiCad for the final visual layout pass.