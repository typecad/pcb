[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IPadGeometry

# Interface: IPadGeometry

Defined in: [routing/shared/pad\_resolver.ts:11](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L11)

Geometry information for a component pad on the PCB.

## Properties

### center

> **center**: `object`

Defined in: [routing/shared/pad\_resolver.ts:13](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L13)

Absolute center position on the PCB in mm

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### componentRef?

> `optional` **componentRef**: `string`

Defined in: [routing/shared/pad\_resolver.ts:40](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L40)

Component reference (for debugging)

***

### layer

> **layer**: `string`

Defined in: [routing/shared/pad\_resolver.ts:28](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L28)

Layer the pad is on (e.g., 'F.Cu', 'B.Cu'). For through-hole pads, this is the primary layer but the pad exists on all layers

***

### layers

> **layers**: `string`[]

Defined in: [routing/shared/pad\_resolver.ts:31](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L31)

All layers this pad exists on (for through-hole pads, includes all copper layers)

***

### net?

> `optional` **net**: `string`

Defined in: [routing/shared/pad\_resolver.ts:37](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L37)

Net name this pad belongs to (for net-aware routing)

***

### number

> **number**: `string` \| `number`

Defined in: [routing/shared/pad\_resolver.ts:34](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L34)

Pad number/name

***

### rotation

> **rotation**: `number`

Defined in: [routing/shared/pad\_resolver.ts:25](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L25)

Absolute rotation in degrees

***

### shape

> **shape**: `"circle"` \| `"rect"` \| `"oval"` \| `"roundrect"` \| `"custom"`

Defined in: [routing/shared/pad\_resolver.ts:16](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L16)

Pad shape type

***

### size

> **size**: `object`

Defined in: [routing/shared/pad\_resolver.ts:22](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L22)

Pad size in mm

#### height

> **height**: `number`

#### width

> **width**: `number`

***

### type

> **type**: `"smd"` \| `"thru_hole"` \| `"np_thru_hole"` \| `"connect"`

Defined in: [routing/shared/pad\_resolver.ts:19](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L19)

Pad type (SMD or through-hole)
