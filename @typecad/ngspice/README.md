# ngspice Simulation for typeCAD
Use typeCAD to design your hardware and run simulations with ngspice with the same codebase. 

## Getting Started

### Prerequisites

- a working [typeCAD](https://typecad.net) project
- [ngspice](https://ngspice.sourceforge.io/download.html) installed and in your `PATH`

### Installation
Run the following command in your project directory, where your typeCAD package.json file is located:

```npm i @typecad/ngspice```

## Usage
Below is a simple voltage-divider circuit.
```ts
import { Schematic, Power } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0603';
import { ngspiceSimulator } from '@typecad/ngspice';

let typecad = new Schematic('vdiv');
let r1 = new Resistor({ value: '1k', simulation: { include: true } });
let r2 = new Resistor({ value: '1k', simulation: { include: true } });
let vin = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 3.3 });
let ngspice = new ngspiceSimulator(typecad, vin);

typecad.named('in').net(r1.pin(1));
typecad.named('vdiv').net(r1.pin(2), r2.pin(1));
typecad.named('gnd').net(r2.pin(2));

typecad.create(r1, r2);
ngspice.op();
```

### Notes
- The `ngspiceSimulator` constructor takes a schematic and all power source as parameters, ie. if more than one power source is used, they can all be passed.

```ts
let ngspice = new ngspiceSimulator(typecad, battery, regulated_3v3);
```
- to include a component, fill the `simulation` property of the component with `{ include: true }`
- ensure the `value` field contains a valid ngspice expression (no spaces, proper units, etc.).

- only `named` nets are included in the simulation

    - `gnd` is a special net in ngspice and is associated with ground or `0`

## DC Analysis
- to run a DC analysis, call the `op` method on the simulator
```ts
ngspice.op();
```
The output from the above example is:
```bash
🌶️  running ngspice
┌────────────────────┬───────────────┬────────────────────┐
│ Variable           │ Type          │ Value              │
├────────────────────┼───────────────┼────────────────────┤
│ r1:power           │ power         │ 2.7225 mW          │
├────────────────────┼───────────────┼────────────────────┤
│ v(in)              │ voltage       │ 3.3000 V           │
├────────────────────┼───────────────┼────────────────────┤
│ i(r1)              │ current       │ 1.6500 mA          │
├────────────────────┼───────────────┼────────────────────┤
│ i(r2)              │ current       │ 1.6500 mA          │
├────────────────────┼───────────────┼────────────────────┤
│ r2:power           │ power         │ 2.7225 mW          │
├────────────────────┼───────────────┼────────────────────┤
│ i(v1)              │ current       │ -1.6500 mA         │
├────────────────────┼───────────────┼────────────────────┤
│ v(vdiv)            │ voltage       │ 1.6500 V           │
└────────────────────┴───────────────┴────────────────────┘
```
Each component is listed with its power and current use and each node is listed with its voltage.

## Transient Analysis
- To run a transient analysis, call the `tran` method on the simulator
```ts
ngspice.tran('1us', '100ms');
```
There are additional parameters that can be passed to the `tran` method and are explained best in the [ngspice documentation](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf), section _11.3.10 .TRAN: Transient Analysis_.

The output from the above example opens an ngspice plot window for each component and all nodes.