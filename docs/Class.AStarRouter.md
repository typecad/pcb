[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / AStarRouter

# Class: AStarRouter

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:28](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L28)

A* pathfinding algorithm for PCB routing.
Finds optimal paths on a routing grid while avoiding obstacles.

## Constructors

### Constructor

> **new AStarRouter**(`grid`, `options`): `AStarRouter`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:92](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L92)

Create a new A* router.

#### Parameters

##### grid

`IRoutingGrid`

The routing grid to search on

##### options

`IRoutingOptions`

Routing options

#### Returns

`AStarRouter`

#### Example

```ts
const router = new AStarRouter(grid, {
  traceWidth: 0.2,
  clearance: 0.2,
  allowedLayers: ['F.Cu'],
  viaCost: 5.0,
  bendCost: 0.5
});
```

## Accessors

### routingOptions

#### Get Signature

> **get** **routingOptions**(): `NormalizedRoutingOptions`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:71](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L71)

##### Returns

`NormalizedRoutingOptions`

## Methods

### invalidateCaches()

> **invalidateCaches**(`scope?`): `void`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:1143](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L1143)

geometry changes outside of this router (e.g., manual edits).

#### Parameters

##### scope?

###### occupancy?

`boolean`

###### paths?

`boolean`

###### windows?

`boolean`

#### Returns

`void`

***

### optimizeWithSteiner()

> **optimizeWithSteiner**(`path`, `terminals`, `useSteinerOptimization?`): `IRoutePath`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:391](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L391)

Optimize a routed path using Steiner Minimum Tree algorithm.
Adds Steiner points (intermediate junctions) to reduce total trace length.

#### Parameters

##### path

`IRoutePath`

Initial routed path from MST

##### terminals

`object`[]

Original connection points

##### useSteinerOptimization?

`boolean` = `false`

Whether to apply Steiner optimization

#### Returns

`IRoutePath`

Optimized path or original if no improvement found

***

### resetCaches()

> **resetCaches**(`scope?`): `void`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:1151](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L1151)

Alias for cache invalidation so hosts can uniformly reset router internals
when board obstacles change.

#### Parameters

##### scope?

###### occupancy?

`boolean`

###### paths?

`boolean`

###### windows?

`boolean`

#### Returns

`void`

***

### route()

> **route**(`start`, `end`, `directives?`): `IRoutePath`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:350](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L350)

Route from start to end point.

#### Parameters

##### start

Starting position in world coordinates (mm)

###### layer

`string`

###### x

`number`

###### y

`number`

##### end

Ending position in world coordinates (mm)

###### layer

`string`

###### x

`number`

###### y

`number`

##### directives?

`IRouteDirectives` \| `IAutorouteWaypoint`[]

Optional routing directives (waypoints or vias)

#### Returns

`IRoutePath`

Routing result with path and metadata

***

### routeNet()

> **routeNet**(`points`, `useSteinerOptimization?`): `IRoutePath`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:431](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L431)

Route an entire net with multiple connection points using MST (Minimum Spanning Tree).
This finds the optimal routing order to minimize total trace length.

#### Parameters

##### points

`object`[]

Array of connection points to route

##### useSteinerOptimization?

`boolean` = `false`

Whether to apply Steiner optimization after MST

#### Returns

`IRoutePath`

Routing result with merged path and metadata

***

### routeSegment()

> **routeSegment**(`start`, `end`): `IRoutePath`

Defined in: [@typecad/pcb/src/routing/router/astar\_router.ts:1028](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/router/astar_router.ts#L1028)

Route a single segment using A*.
Made public to allow Steiner optimizer to re-route through Steiner points.

#### Parameters

##### start

###### layer

`string`

###### x

`number`

###### y

`number`

##### end

###### layer

`string`

###### x

`number`

###### y

`number`

#### Returns

`IRoutePath`
