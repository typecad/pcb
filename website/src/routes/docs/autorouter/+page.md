<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";

    let { data }: { data: PageData } = $props();
</script>

# Auto Router

The TypeCAD framework includes a grid-based auto router that generates tracks between connected pins. It uses an A* search algorithm to find valid paths while respecting obstacles.

## Usage

To use the auto router, call the `route` method on the `PCB` instance, passing a net definition.

Here is a minimal example showing how to define components, connect them, and instruct the router to generate the track.

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let typecad = new PCB('autoroute_example');

// Define components
let r1 = new Resistor({ value: '1kohm', reference: 'R1' });
let r2 = new Resistor({ value: '1kohm', reference: 'R2' });

// Place components on the board
r1.pcb = { x: 10, y: 10, rotation: 0 };
r2.pcb = { x: 20, y: 10, rotation: 0 };

// Create a net connecting the two resistors
const signal_net = typecad.named('signal').net(r1.pin(1), r2.pin(1));

// Instruct the router to connect the net
typecad.route(signal_net);

// Generate the board file
typecad.create(r1, r2);
```

</ScrollArea>

## How it works

The router performs the following steps when `route()` is called:

1. **Grid Generation**: A routing grid is constructed covering the area occupied by the components.
2. **Obstacle Mapping**: Pad geometries and existing tracks are mapped onto the grid as obstacles.
3. **Path Search**: For nets with more than two points, the router constructs a Minimum Spanning Tree (MST) to determine the order of connections. It then uses the A* algorithm to find the shortest path for each edge on the grid.
4. **Track Generation**: Valid paths are converted into track segments and written to the board file.

## Configuration

The `route` method accepts an optional configuration object to control the search behavior.

<ScrollArea orientation="both">

```ts
typecad.route(signal_net, {
    gridResolution: 0.15, // Grid cell size in mm
    debug: false          // Enable detailed search logging
});
```

</ScrollArea>

By default, the router uses a resolution derived from the trace width and clearance settings. Decreasing the resolution value increases the search space and memory usage but may help find paths in congested layouts.
