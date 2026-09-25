[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / DebugVisualizer

# Class: DebugVisualizer

Defined in: [@typecad/pcb/src/routing/utils/debug\_visualizer.ts:21](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/utils/debug_visualizer.ts#L21)

Generates debug visualizations of routing grids and paths.
Creates simple PPM (Portable PixMap) images that can be viewed with most image viewers.

## Constructors

### Constructor

> **new DebugVisualizer**(): `DebugVisualizer`

#### Returns

`DebugVisualizer`

## Methods

### visualizeAllLayers()

> `static` **visualizeAllLayers**(`grid`, `obstacles`, `paths`, `filename?`, `cellSize?`, `steinerPoints?`, `debug?`): `void`

Defined in: [@typecad/pcb/src/routing/utils/debug\_visualizer.ts:469](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/utils/debug_visualizer.ts#L469)

Visualize multiple layers side by side.

#### Parameters

##### grid

[`RoutingGrid`](Class.RoutingGrid.md)

The routing grid

##### obstacles

[`IRoutingObstacle`](Interface.IRoutingObstacle.md)[]

Array of obstacles

##### paths

`IRoutePath`[]

Array of routed paths

##### filename?

`string` = `'routing_debug_all_layers'`

Output filename (without extension)

##### cellSize?

`number` = `2`

Pixels per grid cell (default: 2)

##### steinerPoints?

`ISteinerPoint`[]

##### debug?

`boolean` = `false`

#### Returns

`void`

***

### visualizeRouting()

> `static` **visualizeRouting**(`grid`, `obstacles`, `paths`, `filename?`, `layer?`, `cellSize?`, `steinerPoints?`, `debug?`): `void`

Defined in: [@typecad/pcb/src/routing/utils/debug\_visualizer.ts:38](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/utils/debug_visualizer.ts#L38)

Generate a debug visualization of the routing grid with obstacles and paths.

#### Parameters

##### grid

[`RoutingGrid`](Class.RoutingGrid.md)

The routing grid

##### obstacles

[`IRoutingObstacle`](Interface.IRoutingObstacle.md)[]

Array of obstacles

##### paths

`IRoutePath`[]

Array of routed paths

##### filename?

`string` = `'routing_debug'`

Output filename (without extension)

##### layer?

`string`

Which layer to visualize (default: first layer in grid)

##### cellSize?

`number` = `1`

Pixels per grid cell (default: 1, max 2 for large grids)

##### steinerPoints?

`ISteinerPoint`[]

Optional Steiner points to highlight

##### debug?

`boolean` = `false`

#### Returns

`void`

#### Example

```ts
DebugVisualizer.visualizeRouting(grid, obstacles, [path], 'debug_route', 'F.Cu', 1);
```
