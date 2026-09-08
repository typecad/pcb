[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / IGridCell

# Interface: IGridCell

Defined in: [routing/shared/routing\_grid.ts:40](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L40)

Represents a single cell in the routing grid.

## Properties

### absoluteBlock?

> `optional` **absoluteBlock**: `boolean`

Defined in: [routing/shared/routing\_grid.ts:60](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L60)

If true, this cell blocks routing for all nets (e.g., keepouts, board outline)

***

### clearance?

> `optional` **clearance**: `number`

Defined in: [routing/shared/routing\_grid.ts:69](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L69)

Maximum obstacle-required clearance (mm) affecting this cell

***

### cost

> **cost**: `number`

Defined in: [routing/shared/routing\_grid.ts:66](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L66)

Cost multiplier for routing through this cell (1.0 = normal, higher = discouraged)

***

### isManualRoute?

> `optional` **isManualRoute**: `boolean`

Defined in: [routing/shared/routing\_grid.ts:57](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L57)

If true, this cell is from a manual route and blocks routing even on the same net

***

### layer

> **layer**: `string`

Defined in: [routing/shared/routing\_grid.ts:48](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L48)

Layer this cell is on

***

### net?

> `optional` **net**: `string`

Defined in: [routing/shared/routing\_grid.ts:54](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L54)

If occupied, which net owns this cell (null if not net-specific)

***

### obstacleHalfWidthMm?

> `optional` **obstacleHalfWidthMm**: `number`

Defined in: [routing/shared/routing\_grid.ts:76](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L76)

For track obstacles, the half width (mm) of the occupying geometry.
Used to enforce edge-to-edge clearance by requiring the new centerline
to stay at least (obstacleHalfWidth + centerlineClearance) away.

***

### obstacleIds?

> `optional` **obstacleIds**: `string`[]

Defined in: [routing/shared/routing\_grid.ts:79](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L79)

IDs of obstacles occupying this cell for precise geometry lookups

***

### occupied

> **occupied**: `boolean`

Defined in: [routing/shared/routing\_grid.ts:51](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L51)

Whether this cell is blocked by an obstacle

***

### pad?

> `optional` **pad**: `boolean`

Defined in: [routing/shared/routing\_grid.ts:63](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L63)

If true, this cell belongs to a pad area (for via placement rules)

***

### x

> **x**: `number`

Defined in: [routing/shared/routing\_grid.ts:42](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L42)

Grid column index

***

### y

> **y**: `number`

Defined in: [routing/shared/routing\_grid.ts:45](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L45)

Grid row index
