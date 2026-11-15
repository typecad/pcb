# Connections
In **type**CAD, connections are created by calling the `PCB::net()` function. Connections are made between components in the same `PCB`. 

The `net()` function takes a list of `Pin` objects.

## Connecting Pins

```ts
import { ATtiny85_20S } from './ATtiny85_20S';
import { PCB, Capacitor } from '@typecad/pcb';

let typecad = new PCB('typecad_docs');
let u1 = new ATtiny85_20S();
let c1 = new Capacitor({ value: '1uF', size: '0805' });

typecad.net(u1.VCC, c1.pin(1));     // power [!code highlight]
typecad.net(u1.GND, c1.pin(2));     // ground [!code highlight]
```

We've connected pin 1 of the capacitor to the VCC pin of the ATtiny85 and pin 2 to the GND pin.

`::net()` takes any number of `Pin` objects, so you can connect multiple pins at once.

### Named Connections
Sometimes it is useful to name the connection. The net name will be visible in KiCAD, it can be useful when laying out the board. Some **type**CAD utility functions will only pay attention to named connections as well. If you don't name the connection, it will be `net#`.

```ts
typecad.net(u1.VCC, c1.pin(1)); // [!code --]
typecad.named('power').net(u1.VCC, c1.pin(1)); // [!code ++]
```

The connection in KiCAD will now be labled `power`.

## Common Connection Patterns

### Power Distribution
Connect multiple components to the same power rail:

```ts
// Power distribution pattern
typecad.named('VCC').net(
  microcontroller.VDD,
  cap1.pin(1),
  cap2.pin(1),
  connector.pin(1)
);
```

### Ground Distribution
Connect multiple ground pins together:

```ts
// Ground distribution pattern  
typecad.named('GND').net(
  microcontroller.GND,
  microcontroller.GND_2,  // if component has multiple ground pins
  cap1.pin(2),
  cap2.pin(2),
  connector.pin(2)
);
```

### Signal Connections
Connect signal pins between components:

```ts
// Signal connections
typecad.named('SDA').net(microcontroller.PB0, sensor.SDA);
typecad.named('SCL').net(microcontroller.PB1, sensor.SCL);
```

## Do-Not-Connect Pins (No-Connect)

Real designs leave pins intentionally unconnected — unused MCU GPIOs, a USB
connector's D+/D−/ID on a power-only board, a connector's mounting (MP) pads.
ERC reports every unconnected pin as an error, so mark the intentional ones
with `dnc()` — the equivalent of placing a no-connect (X) flag in KiCad's
schematic editor:

```ts
// power-only USB: data pins and shell stay unconnected on purpose
typecad.dnc(j1.D, j1.D_3, j1.ID, j1.Shield); // [!code highlight]
typecad.dnc(u1.XTAL1_PB3, u1.XTAL2_PB4);     // running on the internal oscillator // [!code highlight]
```

`dnc()` accepts any number of `Pin` objects. Mounting holes are marked
automatically — `new MountingHole(...)` joins the board pre-flagged and never
fails ERC.

> [!WARNING]
> **type**CAD merges nets with similar `Pin` connections. If you make a connection to an already connected pin, that newer net will be merged into the existing net. This will mean your `named` net may not keep the name you give it if it is merged with another net later. You'll see a warning in the build output if this happens.