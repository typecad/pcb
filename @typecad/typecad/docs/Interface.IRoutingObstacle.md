[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IRoutingObstacle

# Interface: IRoutingObstacle

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:87

Represents an obstacle in the routing space.

## Properties

### bounds

> **bounds**: `object`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:92

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

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:106

Required clearance around this obstacle in mm

***

### isManualRoute?

> `optional` **isManualRoute?**: `boolean`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:112

If true, this obstacle blocks routing even on the same net (for manual routes)

***

### layers

> **layers**: `string`[]

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:100

Layers this obstacle exists on

***

### net?

> `optional` **net?**: `string`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:103

Net assignment - obstacles on same net don't block each other

***

### padShape?

> `optional` **padShape?**: `object`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:118

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

> `optional` **polygon?**: `object`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:127

Optional polygon geometry (zones, keepouts) for precise rasterization

#### points

> **points**: `object`[]

***

### priority?

> `optional` **priority?**: `number`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:109

Priority - higher priority obstacles block lower priority ones

***

### segment?

> `optional` **segment?**: `object`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:115

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

> **type**: `"pad"` \| `"component"` \| `"track"` \| `"zone"` \| `"keepout"` \| `"outline"`

Defined in: @typecad/typecad/src/routing/shared/routing\_grid.ts:89

Type of obstacle for debugging/visualization
