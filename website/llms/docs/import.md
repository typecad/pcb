# Import from KiCAD

The `typecad import` command converts an existing KiCAD `.kicad_pcb` file into typeCAD TypeScript code. This is useful for importing existing designs or creating typeCAD packages from boards you've already laid out in KiCAD.

## Usage

```bash
typecad import build/board.kicad_pcb
```

This will output TypeScript code snippets for:

- **Component declarations** with positions (`pcb: { x, y, rotation }`)
- **TrackBuilder objects** for all traces on the board
- **Via definitions** with size, drill, and location
- **Net names** extracted from the board

### Example Output

```ts
// Components
let c1 = new Capacitor({ value: '100nF', reference: 'C1', pcb: { x: 120.5, y: 85.3, rotation: 0 } });
let r1 = new Resistor({ value: '10kohm', reference: 'R1', pcb: { x: 135.2, y: 80.1, rotation: 90 } });

// Tracks
this.pcb.track().from({ x: 120.5, y: 85.3 }, 'F.Cu', 0.25).to({ x: 135.2, y: 80.1 });
this.pcb.track().from({ x: 135.2, y: 80.1 }, 'F.Cu', 0.25).to({ x: 140.0, y: 80.1 });

// Vias
this.pcb.via({ at: { x: 140.0, y: 80.1 }, size: 0.8, drill: 0.4 });
```

## Interactive Apply Mode

Use `--apply` to interactively sync coordinates back to your source files:

```bash
typecad import build/board.kicad_pcb --apply
```

In this mode, `kicad2typecad` will:
1. Read the PCB file
2. Match components against your existing typeCAD source
3. Show you the differences
4. Let you choose which coordinates to update in your source files

This is especially useful when you've moved components in KiCAD and want to capture those changes in your typeCAD code.

## Variable Names

Component variable names in the generated code are sourced from the footprint's `Code` property in KiCAD if available, falling back to the KiCAD reference designator (e.g., `C1`, `R1`).

## What Gets Imported

- **Components** — footprints, positions, rotation, front/back side
- **Tracks and vias** — as `pcb.track()` chains with nets
- **Zones and rule areas** — filled pours as `pcb.zone()` (polygon geometry, fill settings via the grouped `fill` object) and keepouts as `pcb.keepout()` with their restrictions; unconnected pours import without a net
- **Board outline** — rectangles, polygons, circles on `Edge.Cuts`
- **Layer stackup** — as `pcb.stackup(N)` when the board declares one
- **Text elements** — as `pcb.text()` calls

## Use Cases

### Package Creation

The most common use case is creating [packages](/docs/package/overview). You can:

1. Lay out an entire circuit in KiCAD — components placed, tracks drawn, vias added
2. Run `typecad import` to generate the code snippets
3. Copy the snippets into your package's `index.ts`

### Importing Existing Designs

If you have an existing KiCAD project, you can import it into typeCAD to get the benefits of code-based design while preserving your existing layout.