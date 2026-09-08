<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

# Connections
In **type**CAD, connections are created by calling the `PCB::net()` function. Connections are made between components in the same `PCB`. 

The `net()` function takes a list of `Pin` objects.

## Connecting Pins
<ScrollArea orientation="both">

```ts
import { ATtiny85_20S } from './ATtiny85_20S';
import { PCB, Capacitor } from '@typecad/pcb';

let typecad = new PCB('typecad_docs');
let u1 = new ATtiny85_20S();
let c1 = new Capacitor({ value: '1uF', size: '0805' });

typecad.net(u1.VCC, c1.pin(1));     // power [!code highlight]
typecad.net(u1.GND, c1.pin(2));     // ground [!code highlight]
```
</ScrollArea>

We've connected pin 1 of the capacitor to the VCC pin of the ATtiny85 and pin 2 to the GND pin.

`::net()` takes any number of `Pin` objects, so you can connect multiple pins at once.

### Named Connections
Sometimes it is useful to name the connection. The net name will be visible in KiCAD, it can be useful when laying out the board. Some **type**CAD utility functions will only pay attention to named connections as well. If you don't name the connection, it will be `net#`.


<ScrollArea orientation="both">

```ts
typecad.net(u1.VCC, c1.pin(1)); // [!code --]
typecad.named('power').net(u1.VCC, c1.pin(1)); // [!code ++]
```
</ScrollArea>

The connection in KiCAD will now be labled `power`.

## Common Connection Patterns

### Power Distribution
Connect multiple components to the same power rail:
<ScrollArea orientation="both">

```ts
// Power distribution pattern
typecad.named('VCC').net(
  microcontroller.VDD,
  cap1.pin(1),
  cap2.pin(1),
  connector.pin(1)
);
```
</ScrollArea>

### Ground Distribution
Connect multiple ground pins together:
<ScrollArea orientation="both">

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
</ScrollArea>

### Signal Connections
Connect signal pins between components:
<ScrollArea orientation="both">

```ts
// Signal connections
typecad.named('SDA').net(microcontroller.PB0, sensor.SDA);
typecad.named('SCL').net(microcontroller.PB1, sensor.SCL);
```
</ScrollArea>

<br />

> [!WARNING]
> **type**CAD merges nets with similar `Pin` connections. If you make a connection to an already connected pin, that newer net will be merged into the existing net. This will mean your `named` net may not keep the name you give it if it is merged with another net later. You'll see a warning in the build output if this happens. 
