# Import a KiCAD Board

The `typecad-pcb import` command converts an existing KiCAD `.kicad_pcb` file into typeCAD TypeScript code. This is useful for importing existing designs or extracting layout information.

## Basic Import

```bash
typecad-pcb import build/board.kicad_pcb
```

This outputs TypeScript code for all components, tracks, and vias found on the board.

## Using the Output

The generated code can be used directly in your typeCAD project or in a [package](/docs/package/overview):

```ts
// Paste the output into your package's index.ts

// Components with positions from the PCB
let c1 = new Capacitor({ value: '100nF', reference: 'C1', pcb: { x: 120.5, y: 85.3, rotation: 0 } });
let r1 = new Resistor({ value: '10kohm', reference: 'R1', pcb: { x: 135.2, y: 80.1, rotation: 90 } });

// Tracks
this.pcb.track().from({ x: 120.5, y: 85.3 }, 'F.Cu', 0.25).to({ x: 135.2, y: 80.1 });

// Vias
this.pcb.via({ at: { x: 140.0, y: 80.1 }, size: 0.8, drill: 0.4 });
```

## Interactive Apply

Use `--apply` to sync coordinates from KiCAD back to your source files:

```bash
typecad-pcb import build/board.kicad_pcb --apply
```

This will:
1. Match components in the PCB against your existing source code
2. Show coordinate differences
3. Let you choose which to update

This is useful after moving components in KiCAD and wanting to capture those changes in code.

## Typical Workflow for Package Creation

1. Design your circuit in **type**CAD
2. Build and open in KiCAD: `typecad-pcb build`
3. Lay out the package in KiCAD — place components, draw tracks, add vias
4. Import the layout back: `typecad-pcb import build/board.kicad_pcb`
5. Copy the generated code into your package