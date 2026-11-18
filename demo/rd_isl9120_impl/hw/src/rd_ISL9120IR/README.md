## rd-ISL9120IR
> The reference design for the [ISL9120IR](https://www.mouser.com/datasheet/2/698/REN_isl9120ir_DST_20050421-1998698.pdf). A Compact High Efficiency Low Power Buck-Boost Regulator.

## Installation

```bash
npm i @typecad/rd_isl9120ir
```
### Input Connections
 - `vin: Power`: 1.8V to 5.5V power supply

### Defined Output Connections
 - `vout:Power`: 3.3V regulated output

### Components
- U1: `ISL9120IRTNZ` - Main IC
- L1: `_0603.Inductor` - Inductor
- C1: `_0603.Capacitor`- Bulk input capacitor
- C2: `_0603.Capacitor`- Bulk output capacitor

## Use

1. Import the package

```ts
import { Schematic, Power, PCB } from '@typecad/pcb';
import { rd_isl9120ir } from "@typecad/rd_isl9120ir";
```

2. Make the package.

```ts
let typecad = new PCB('rd_isl9120_impl');
let isl9120 = new rd_isl9120ir({ pcb: typecad });
```

3. `::create()` it

```ts
typecad.create(...isl9120.components);
```

### Default Layout
This package contains a default layout for all the components. 

### Passives

The default size for the passive components is 0603; shift the whole package with `passiveSize`.

```ts
let isl9120 = new rd_isl9120ir({ pcb: typecad, passiveSize: '0805' });
```