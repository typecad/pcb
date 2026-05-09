[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IRoutingEngine

# Interface: IRoutingEngine

Defined in: [routing/router\_registry.ts:12](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/router_registry.ts#L12)

Common routing engine interface implemented by all algorithms.
Allows PCB to invoke a selected router without coupling to its implementation.

## Methods

### route()

> **route**(`start`, `end`, `directives?`): `IRoutePath`

Defined in: [routing/router\_registry.ts:17](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/router_registry.ts#L17)

Compute a route from start to end, optionally passing through waypoints.
Coordinates are in world space (mm), with an explicit layer at each point.

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

##### directives?

`IRouteDirectives` | `IAutorouteWaypoint`[]

#### Returns

`IRoutePath`
