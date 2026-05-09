[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IRoutingObstacle

# Interface: IRoutingObstacle

Defined in: [routing/shared/routing\_grid.ts:85](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L85)

Represents an obstacle in the routing space.

## Properties

### bounds

> **bounds**: `object`

Defined in: [routing/shared/routing\_grid.ts:90](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L90)

Bounding box in world coordinates (mm)

#### maxX

> **maxX**: `number`

#### maxY

> **maxY**: `number`

#### minX

> **minX**: `number`

#### minY

> **minY**: `number`

***

### clearance

> **clearance**: `number`

Defined in: [routing/shared/routing\_grid.ts:104](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L104)

Required clearance around this obstacle in mm

***

### isManualRoute?

> `optional` **isManualRoute**: `boolean`

Defined in: [routing/shared/routing\_grid.ts:110](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L110)

If true, this obstacle blocks routing even on the same net (for manual routes)

***

### layers

> **layers**: `string`[]

Defined in: [routing/shared/routing\_grid.ts:98](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L98)

Layers this obstacle exists on

***

### net?

> `optional` **net**: `string`

Defined in: [routing/shared/routing\_grid.ts:101](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L101)

Net assignment - obstacles on same net don't block each other

***

### padShape?

> `optional` **padShape**: `object`

Defined in: [routing/shared/routing\_grid.ts:116](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L116)

Optional pad geometry for precise rasterization

#### center

> **center**: `object`

##### center.x

> **x**: `number`

##### center.y

> **y**: `number`

#### height

> **height**: `number`

#### rotation

> **rotation**: `number`

#### shape

> **shape**: `"circle"` \| `"rect"` \| `"oval"` \| `"roundrect"`

#### width

> **width**: `number`

***

### polygon?

> `optional` **polygon**: `object`

Defined in: [routing/shared/routing\_grid.ts:125](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L125)

Optional polygon geometry (zones, keepouts) for precise rasterization

#### points

> **points**: `object`[]

***

### priority?

> `optional` **priority**: `number`

Defined in: [routing/shared/routing\_grid.ts:107](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L107)

Priority - higher priority obstacles block lower priority ones

***

### segment?

> `optional` **segment**: `object`

Defined in: [routing/shared/routing\_grid.ts:113](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L113)

Optional geometric description for precise rasterization (used for tracks)

#### width

> **width**: `number`

#### x1

> **x1**: `number`

#### x2

> **x2**: `number`

#### y1

> **y1**: `number`

#### y2

> **y2**: `number`

***

### type

> **type**: `"component"` \| `"pad"` \| `"track"` \| `"zone"` \| `"keepout"` \| `"outline"`

Defined in: [routing/shared/routing\_grid.ts:87](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L87)

Type of obstacle for debugging/visualization
