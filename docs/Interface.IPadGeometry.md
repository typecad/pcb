[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / IPadGeometry

# Interface: IPadGeometry

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:13](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L13)

Geometry information for a component pad on the PCB.

## Properties

### center

> **center**: `object`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:15](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L15)

Absolute center position on the PCB in mm

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### componentRef?

> `optional` **componentRef?**: `string`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:42](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L42)

Component reference (for debugging)

***

### layer

> **layer**: `string`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:30](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L30)

Layer the pad is on (e.g., 'F.Cu', 'B.Cu'). For through-hole pads, this is the primary layer but the pad exists on all layers

***

### layers

> **layers**: `string`[]

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:33](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L33)

All layers this pad exists on (for through-hole pads, includes all copper layers)

***

### net?

> `optional` **net?**: `string`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:39](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L39)

Net name this pad belongs to (for net-aware routing)

***

### number

> **number**: `string` \| `number`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:36](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L36)

Pad number/name

***

### rotation

> **rotation**: `number`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:27](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L27)

Absolute rotation in degrees

***

### shape

> **shape**: `"circle"` \| `"rect"` \| `"roundrect"` \| `"oval"` \| `"custom"`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:18](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L18)

Pad shape type

***

### size

> **size**: `object`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:24](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L24)

Pad size in mm

#### height

> **height**: `number`

#### width

> **width**: `number`

***

### type

> **type**: `"thru_hole"` \| `"smd"` \| `"connect"` \| `"np_thru_hole"`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:21](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L21)

Pad type (SMD or through-hole)
