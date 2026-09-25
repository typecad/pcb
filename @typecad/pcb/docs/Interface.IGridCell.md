[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / IGridCell

# Interface: IGridCell

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:42](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L42)

Represents a single cell in the routing grid.

## Properties

### absoluteBlock?

> `optional` **absoluteBlock?**: `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:62](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L62)

If true, this cell blocks routing for all nets (e.g., keepouts, board outline)

***

### clearance?

> `optional` **clearance?**: `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:71](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L71)

Maximum obstacle-required clearance (mm) affecting this cell

***

### cost

> **cost**: `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:68](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L68)

Cost multiplier for routing through this cell (1.0 = normal, higher = discouraged)

***

### isManualRoute?

> `optional` **isManualRoute?**: `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:59](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L59)

If true, this cell is from a manual route and blocks routing even on the same net

***

### layer

> **layer**: `string`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:50](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L50)

Layer this cell is on

***

### net?

> `optional` **net?**: `string`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:56](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L56)

If occupied, which net owns this cell (null if not net-specific)

***

### obstacleHalfWidthMm?

> `optional` **obstacleHalfWidthMm?**: `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:78](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L78)

For track obstacles, the half width (mm) of the occupying geometry.
Used to enforce edge-to-edge clearance by requiring the new centerline
to stay at least (obstacleHalfWidth + centerlineClearance) away.

***

### obstacleIds?

> `optional` **obstacleIds?**: `string`[]

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:81](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L81)

IDs of obstacles occupying this cell for precise geometry lookups

***

### occupied

> **occupied**: `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:53](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L53)

Whether this cell is blocked by an obstacle

***

### pad?

> `optional` **pad?**: `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:65](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L65)

If true, this cell belongs to a pad area (for via placement rules)

***

### x

> **x**: `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:44](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L44)

Grid column index

***

### y

> **y**: `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:47](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L47)

Grid row index
