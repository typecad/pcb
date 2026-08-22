<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

# Auto Router

**type**CAD includes an auto router that generates tracks between connected pins.

## Usage

Call `route()` on the `PCB` instance with a net definition:

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
import { Resistor } from '@typecad/passives/0805';

let typecad = new PCB('autoroute_example');

let r1 = new Resistor({ value: '1kohm', reference: 'R1' });
let r2 = new Resistor({ value: '1kohm', reference: 'R2' });

r1.pcb = { x: 10, y: 10, rotation: 0 };
r2.pcb = { x: 20, y: 10, rotation: 0 };

const signal_net = typecad.named('signal').net(r1.pin(1), r2.pin(1));

typecad.route(signal_net);       // [!code highlight]

typecad.create(r1, r2);
```

</ScrollArea>

You can also route directly between pins without a named net:

<ScrollArea orientation="both">

```ts
let tracks = await typecad.route({
  from: r1.pin(1),
  to: r2.pin(1),
});

typecad.create(r1, r2, ...tracks);
```

</ScrollArea>

## Configuration

The `route` method accepts an optional configuration object:

<ScrollArea orientation="both">

```ts
typecad.route(signal_net, {
    gridResolution: 0.15,
    debug: false,
});
```

</ScrollArea>

By default, the router uses a resolution derived from the trace width and clearance settings. Decreasing the resolution value increases the search space and memory usage but may help find paths in congested layouts.

The router's fallback trace width and clearance come from the board's
[design rules](/docs/board_layout#design-rules) (JLCPCB no-surcharge standard by
default), or from the net's [net class](/docs/board_layout#net-classes) if it has
been assigned one. Per-route `width` and `clearance` options override them for an
individual trace.

<!-- ## Batch Autorouting

Route multiple connections together with automatic rip-up-and-retry using `autorouteBatch()`:

<ScrollArea orientation="both">

```ts
let result = await pcb.autorouteBatch([
  { from: mcu.SDA, to: sensor.SDA, name: 'SDA' },
  { from: mcu.SCL, to: sensor.SCL, name: 'SCL' },
  { from: power.pin, to: mcu.VCC, name: 'VCC' },
], {
  rounds: 3,
  reorder: 'byDistance',
});

pcb.create();
```

</ScrollArea>

It routes all items, then retries failed routes across multiple rounds with relaxed parameters and reordered priorities to negotiate congestion. Options:
- _rounds_ — number of retry rounds (default: 3)
- _reorder_ — reorder strategy: `'byDistance'` (default, longest first), `'reverse'`, or `'none'`
- _relaxViaCostPerRound_ — reduce via cost each round (default: 5)
- _increaseIterationsPerRound_ — add iterations each round (default: 25000)

## Length Matching

> [!WARNING]
> Length matching is **experimental**. The API may change.

For differential pairs that require matched lengths, `LengthMatcher.apply()` extends shorter routes with sawtooth meanders:

<ScrollArea orientation="both">

```ts
import { LengthMatcher } from '@typecad/typecad/routing';

LengthMatcher.apply(ctx, routeDetails, trackBuilders, {
  tolerance: 0.5,
});
```

</ScrollArea>

Parameters:
- _ctx_ — length match context (board context)
- _routeDetails_ — array of `{ path, success }` from routing results
- _trackBuilders_ — array of track builder arrays for each route
- _config_ — tolerance in mm (number) or `{ tolerance, pattern, minStraightSegment, debug }`

## Debug Visualization

Generate debug images of the routing grid to troubleshoot routing issues. Outputs PPM image files:

<ScrollArea orientation="both">

```ts
import { DebugVisualizer } from '@typecad/typecad/routing';

DebugVisualizer.visualizeRouting(
  grid,
  obstacles,
  paths,
  'debug_route',
  'F.Cu',
  1,
);
```

</ScrollArea>

Parameters:
- _grid_ — the routing grid
- _obstacles_ — array of routing obstacles
- _paths_ — array of routed paths
- _filename_ — output filename (without extension), saves as `.ppm`
- _layer_ — which layer to visualize
- _cellSize_ — pixels per grid cell (default: 1) -->

