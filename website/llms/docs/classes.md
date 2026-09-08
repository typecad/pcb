# Classes

## `PCB`

The main class that represents the entire circuit.

```ts
import { PCB } from '@typecad/pcb';
let typecad = new PCB('typecad_concepts', {thickness: 1.6, copper_thickness: 35 });
```

The only required option is the name. The name determines the name of the resulting KiCAD files (.kicad_pcb, .kicad_sch, and .net).

Optional properties are: `{thickness: 1.6, copper_thickness: 35 }`
- thickness — board thickness in mm
- copper_thickness — copper thickness in microns (1 oz = 35 microns)

These are used in power-aware calculations.

The `PCB` class is where:
- Components are added
- Connections are made between components
- Board layout is defined
- Board outlines are drawn — rectangles, polygons, circles, cutouts, and free-form line/arc paths
- Utility functions like ERC and BOM
- Routing with `route()` and `autorouteBatch()`
- Zones, keepout areas, and graphics

## `Component`

The `Component` class represents individual parts like resistors, capacitors, ICs, etc. You add a `Component` to your `PCB`.

```ts
import { Component } from '@typecad/pcb';

let R1 = new Component({ value: '1kohm' });
```

Options for the `Component` class are:

- _reference_ — reference designator
- _value_ — value of component
- _footprint_ — footprint
- _symbol_ — KiCAD symbol library path
- _prefix_ — prefix for reference designator
- _datasheet_ — link to component datasheet
- _description_ — description of component
- _voltage_ — voltage rating of component
- _wattage_ — wattage rating of component
- _mpn_ — Manufacturer Part Number
- _dnp_ — true if component is Do Not Populate, false to place component
- _simulation_ — an object with simulation data `{ include: true, model: 'ngspice-model' }`
- _pcb_ — position on the board `{ x, y, rotation }`

- _text_ — array of arbitrary text entries on the board, each with `property`, `text`, position, and styling
- _fab_ — fabrication layer text entry; accepts a positioning object or `[text, positioning]` tuple
- _referenceLayout_ — controls reference designator text position and style (defaults to **F.SilkS** layer)
- _valueLayout_ — controls value text position and style (defaults to **F.Fab** layer)
- _fabLayout_ — controls fabrication text position and style (defaults to **F.Fab** layer); `text` defaults to `${REFERENCE}` if omitted

All three layout properties accept an `ITextPositioning` object and can be set at construction or assigned after creation:

```ts
import { Component } from '@typecad/pcb';

let r1 = new Component({
  footprint: 'Resistor_SMD:R_0603_1608Metric',
  reference: 'R1',
  referenceLayout: { x: 0, y: -1.5, rotation: 90, width: 0.8, height: 0.8 },
  valueLayout: { x: 0, y: 1.5, width: 0.6, height: 0.6 },
  fabLayout: { x: 0, y: 0, text: 'R1' },
});

// Or assign after creation:
r1.referenceLayout = { x: 2, y: -1, rotation: 0 };
```

### `ITextPositioning` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | `number` | Yes | X position in mm |
| `y` | `number` | Yes | Y position in mm |
| `rotation` | `number` | No | Rotation in degrees |
| `layer` | `string` | No | KiCad layer name |
| `width` | `number` | No | Font width in mm |
| `height` | `number` | No | Font height in mm |
| `fontSize` | `number` | No | Font size |
| `thickness` | `number` | No | Text stroke thickness |
| `bold` | `boolean` | No | Bold font style |
| `italic` | `boolean` | No | Italic font style |
| `justify` | `object` | No | `{ horizontal?: 'left'\|'right'\|'center', vertical?: 'top'\|'bottom'\|'middle', mirror?: boolean }` |
| `show` | `boolean` | No | Visibility toggle |

`fabLayout` extends `ITextPositioning` with an optional `text` field (`string`) that defaults to `${REFERENCE}`.

> [!note] Syntax
> **type**CAD makes use of the above syntax style for many of its classes, ie. passing an object of optional properties. *Optional* in terms of TypeScript code, if a particular property isn't passed and **type**CAD requires it, it will throw an error during build. 

## `Power`

Represents a power source like a battery or voltage regulator. 

```ts
import { Power } from '@typecad/pcb';

let coin_cell = new Power({ power: holder.pin(1), gnd: holder.pin(2), voltage: 3.7 });
```

Options are:

- _power_ — pin on a component that supplies power
- _gnd_ — pin on a component that supplies ground
- _voltage_ — voltage of power source
- _current_ — current capacity of the power source
- _direction_ — `output` for power sources, `input` for power consumers

## `Package`

Abstract base class for creating reusable, importable hardware modules. Extend this class to encapsulate a circuit sub-design (e.g. a voltage regulator, sensor module, or MCU subsystem).

```ts
import { Package, Component } from '@typecad/pcb';

export class MyResistor extends Package {
  declare resistor: Component;

  build(options) {
    this.resistor = new this.passives.Resistor({ value: '10kohm' });
    this.resistor.pcb = { x: 100, y: 100, rotation: 0 };
  }
}
```

The constructor handles offset positioning (`x`, `y`), auto-collects all `Component` properties set on `this`, groups them on the PCB, and automatically syncs the package's bundled KiCad symbol/footprint files (its `./build/lib/`) into the project's `./build/lib/` directory — no install script required. For classes that don't extend `Package`, the exported `syncThisPackageBuildLib()` helper provides the same sync with one call.

## `TrackBuilder`

Fluent API for creating tracks on the PCB:

```ts
import { PCB, TrackBuilder } from '@typecad/pcb';

let pcb = new PCB('tracks');

let track: TrackBuilder = pcb
  .track()
  .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 })
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2)
  .to({ x: 110, y: 100 })
  .via({ size: 0.8, drill: 0.4 })
  .to({ x: 110, y: 120, layer: 'B.Cu' });

pcb.create();
```