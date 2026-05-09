# Classes

## `PCB`

The main class that represents the entire circuit.

```ts
import { PCB } from '@typecad/typecad';
let typecad = new PCB('typecad_concepts', {thickness: 1.6, copper_thickness: 35 });
```

The only required option is the name. The name determines the name of the resulting KiCAD files (.net and .kicad_pcb).

Optional properties are: `{thickness: 1.6, copper_thickness: 35 }`
- thickness — board thickness in mm
- copper_thickness — copper thickness in microns (1 oz = 35 microns)

These are used in power-aware calculations.

The `PCB` class is where:
- Components are added
- Connections are made between components
- utility functions like ERC and BOM

## `Component`

The `Component` class represents individual parts like resistors, capacitors, ICs, etc. You add a `Component` to your `PCB`.

```ts
import { Component } from '@typecad/typecad';

let R1 = new Component({ value: '1kohm' });
```

Options for the `Component` class are:

- _reference_ — reference designator
- _value_ — value of component
- _footprint_ — footprint
- _prefix_ — prefix for reference designator
- _datasheet_ — link to component datasheet
- _description_ — description of component
- _voltage_ — voltage rating of component
- _wattage_ — wattage rating of component
- _mpn_ — Manufacturer Part Number
- _dnp_ — true if component is Do Not Populate, false to place component
- _simulation_ — an object with simulation data `{ include: true, model: 'ngspice-model' }`

> [!note] Syntax
> **type**CAD makes use of the above syntax style for many of its classes, ie. passing an object of optional properties. *Optional* in terms of TypeScript code, if a particular property isn't passed and **type**CAD requires it, it will throw an error during build. 

## `Power`

Represents a power source like a battery or voltage regulator. 

```ts
import { Power } from '@typecad/typecad';

let coin_cell = new Power({ power: holder.pin(1), gnd: holder.pin(2), voltage: 3.7 });
```

Options are:

- _power_ — pin on a component that supplies power
- _gnd_ — pin on a component that supplies ground
- _voltage_ — voltage of power source

       Passives