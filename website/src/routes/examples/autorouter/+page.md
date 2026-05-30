<script lang="ts">
	import { buttonVariants } from "$lib/components/ui/button";
	import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
</script>

# Auto Router

The **type**CAD auto router generates tracks between connected pins using A* pathfinding. It respects obstacles, supports multi-pin nets, and can be configured for different grid resolutions.

## Basic Usage

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
import { Resistor, Capacitor } from '@typecad/passives/0603';

let pcb = new PCB('autorouter_example');

let r1 = new Resistor({ value: '1kohm', pcb: { x: 10, y: 10, rotation: 0 } });
let r2 = new Resistor({ value: '1kohm', pcb: { x: 20, y: 10, rotation: 0 } });
let c1 = new Capacitor({ value: '100nF', pcb: { x: 15, y: 15, rotation: 0 } });

const signal_net = pcb.named('signal').net(r1.pin(1), r2.pin(1));
const bypass_net = pcb.named('bypass').net(c1.pin(1), r1.pin(2));

pcb.route(signal_net);
pcb.route(bypass_net);

pcb.create(r1, r2, c1);
```
</ScrollArea>

## Configuration Options

<ScrollArea orientation="both">

```ts
pcb.route(signal_net, {
  gridResolution: 0.15, // Grid cell size in mm
  debug: false,          // Enable detailed logging
});
```
</ScrollArea>

## How It Works

1. **Grid Generation**: A routing grid is constructed covering the area occupied by components
2. **Obstacle Mapping**: Pad geometries and existing tracks are mapped as obstacles
3. **Path Search**: For multi-pin nets, a Minimum Spanning Tree (MST) determines connection order, then A* finds the shortest path for each edge
4. **Track Generation**: Valid paths are converted into track segments in the board file

## Batch Autorouting

Route all unconnected nets at once:

<ScrollArea orientation="both">

```ts
pcb.route(signal_net);
pcb.route(bypass_net);
pcb.route(power_net);

// All routes are computed together
pcb.create(r1, r2, c1);
```
</ScrollArea>

## Power-Aware Routing

Use `Power` objects with tracks to ensure adequate trace width:

<ScrollArea orientation="both">

```ts
import { PCB, Power } from '@typecad/typecad';

let pcb = new PCB('power_example');
let power = new Power({ power: regulator.pin(3), gnd: regulator.pin(2), voltage: 3.3 });

const vcc_net = pcb.named('VCC').net(regulator.pin(3), mcu.VCC);
pcb.route(vcc_net);
```
</ScrollArea>

The router considers power info when determining appropriate trace widths.
