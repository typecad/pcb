[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IPadGeometry

# Interface: IPadGeometry

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:12

Geometry information for a component pad on the PCB.

## Properties

### center

> **center**: `object`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:14

Absolute center position on the PCB in mm

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### componentRef?

> `optional` **componentRef?**: `string`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:41

Component reference (for debugging)

***

### layer

> **layer**: `string`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:29

Layer the pad is on (e.g., 'F.Cu', 'B.Cu'). For through-hole pads, this is the primary layer but the pad exists on all layers

***

### layers

> **layers**: `string`[]

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:32

All layers this pad exists on (for through-hole pads, includes all copper layers)

***

### net?

> `optional` **net?**: `string`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:38

Net name this pad belongs to (for net-aware routing)

***

### number

> **number**: `string` \| `number`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:35

Pad number/name

***

### rotation

> **rotation**: `number`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:26

Absolute rotation in degrees

***

### shape

> **shape**: `"circle"` \| `"rect"` \| `"oval"` \| `"roundrect"` \| `"custom"`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:17

Pad shape type

***

### size

> **size**: `object`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:23

Pad size in mm

#### height

> **height**: `number`

#### width

> **width**: `number`

***

### type

> **type**: `"smd"` \| `"thru_hole"` \| `"np_thru_hole"` \| `"connect"`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:20

Pad type (SMD or through-hole)
