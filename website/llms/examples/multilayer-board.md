# Multilayer Boards

**type**CAD treats the copper layer count as a first-class property of the board. Declare it once and everything derives from it: the stackup that gets written to the `.kicad_pcb`, the layers the autorouter uses, where through-hole pads exist, and which layer references are valid.

This example builds a typical 4-layer board — ground and power planes on the inner layers, an impedance-controlled bus, and budget-fab-friendly vias.

## Declare the stack

Pass `layers` to the PCB constructor. That single number is the source of truth:

```ts
import { PCB } from '@typecad/typecad';

let pcb = new PCB('sensor_board', { layers: 4 });

pcb.copperLayers; // ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']
```

Components go on the outer layers as usual. Routing defaults to every declared copper layer, so inner layers are used without any extra configuration.

To control the physical construction — dielectric thicknesses, materials, dielectric constants — call `pcb.stackup()` with per-layer overrides:

```ts
pcb.stackup(4, {
  layers: {
    'dielectric 1': { thickness: 0.21, epsilon_r: 4.4 },
    'dielectric 2': { material: 'Rogers 4350B', epsilon_r: 3.48, loss_tangent: 0.0037 },
  },
});
```

Any dielectric budget left over is redistributed across the non-overridden layers, so the board still totals `pcb.thickness` (1.6mm by default).

## Dedicate the inner layers to planes

`pcb.plane()` turns a copper layer into a power or ground plane. At `create()` each plane becomes a board-covering filled zone on its layer, and the autorouter stops routing signals there:

```ts
pcb.outline(0, 0, 60, 45); // plane extent comes from the outline

pcb.plane('GND', 'In1.Cu');
pcb.plane('+3V3', 'In2.Cu');
```

The plane extent comes from the board outline, so call `pcb.outline()` before `create()`. SMD pads reach a plane through vias; through-hole pads connect solidly.

## Route at a controlled impedance

With the planes owning the inner layers, signals route on F.Cu/B.Cu by default. Pass an `impedance` constraint and the autorouter widens the trace to hit the target — computed from the board's stackup geometry (microstrip on outer layers, symmetric stripline on inner ones):

```ts
// check a width without routing:
pcb.impedanceWidth('F.Cu', 50); // width in mm for 50Ω on this stackup

// autoroute with impedance control (the trace only ever widens,
// never below the design-rule floor)
pcb.route(spi_clk, { impedance: { target: 50, tolerance: 5 } });
```

## Going deeper: signal layers between planes

On a 6-layer board you can put signal layers between two ground planes — the classic stack for a fast bus. Net classes claim the preferred layer, and the impedance target is computed as stripline between the planes:

```ts
let pcb = new PCB('fast_board', { layers: 6 });

pcb.outline(0, 0, 60, 45);
pcb.plane('GND', 'In1.Cu');
pcb.plane('+3V3', 'In3.Cu');
pcb.plane('GND', 'In4.Cu');

// the memory bus lives on the inner signal layer
pcb.netClass('mem', { layers: ['In2.Cu'] });
pcb.assign(dq0, 'mem');

// stripline impedance, computed from this stackup
pcb.route(dq0, { impedance: { target: 50, tolerance: 5 } });
```

## Control via manufacturing

By default every via the autorouter places is a through via (F.Cu→B.Cu) — always manufacturable at budget fabs. If your fab does blind/buried vias, opt in:

```ts
// router vias use the exact layer pair a route transitions
// between, up to 2 layer boundaries; deeper transitions fall
// back to through vias, and via cost scales with span depth
pcb.viaPolicy({ type: 'blind-buried', maxSpan: 2 });
```

## Create the board

```ts
pcb.route(spi_clk, { impedance: { target: 50, tolerance: 5 } });
pcb.route(spi_mosi);
pcb.route(spi_miso);

// tie the outer ground pours to the GND plane with a via grid,
// and reinforce every router via with teardrops
pcb.teardrops();
pcb.zone({ net: 'GND', layers: ['F.Cu', 'B.Cu'], x: 0, y: 0, width: 60, height: 45 });
pcb.stitch('GND', { pitch: 1.5 });

pcb.create();
```

When the board is written, every layer reference — zones, keepouts, vias, routes — is validated against the declared layer set. Referencing `"In3.Cu"` on this 4-layer board fails with an error telling you exactly what to change, instead of producing a broken `.kicad_pcb`.

## Complete example

```ts
import { PCB } from '@typecad/typecad';

// 4-layer board: signals outside, GND and +3V3 inside
let pcb = new PCB('sensor_board', { layers: 4, thickness: 1.6 });

pcb.stackup(4, {
  layers: { 'dielectric 2': { thickness: 1.1, epsilon_r: 4.5 } },
});

pcb.outline(0, 0, 60, 45);
pcb.plane('GND', 'In1.Cu');
pcb.plane('+3V3', 'In2.Cu');

// components and nets (see the other examples)
pcb.add(mcu, sensor, regulator, connector);
const spi_clk = pcb.named('SPI_CLK').net(mcu.SCK, sensor.SCK);
// ...

pcb.teardrops();
pcb.route(spi_clk, { impedance: { target: 50, tolerance: 5 } });
pcb.route(spi_mosi);
pcb.route(spi_miso);
pcb.route(sensor_int);

// ground pours on the outer layers, stitched to the plane
pcb.zone({ net: 'GND', layers: ['F.Cu', 'B.Cu'], x: 0, y: 0, width: 60, height: 45 });
pcb.stitch('GND', { pitch: 1.5 });

pcb.create();
```