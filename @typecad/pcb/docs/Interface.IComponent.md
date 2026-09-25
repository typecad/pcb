[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / IComponent

# Interface: IComponent

Defined in: [@typecad/pcb/src/component.ts:39](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L39)

## Properties

### datasheet?

> `optional` **datasheet?**: `string`

Defined in: [@typecad/pcb/src/component.ts:45](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L45)

***

### description?

> `optional` **description?**: `string`

Defined in: [@typecad/pcb/src/component.ts:45](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L45)

***

### dnp?

> `optional` **dnp?**: `boolean`

Defined in: [@typecad/pcb/src/component.ts:46](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L46)

***

### fab?

> `optional` **fab?**: `ITextPositioning` \| `TextWithPositioning`

Defined in: [@typecad/pcb/src/component.ts:43](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L43)

***

### footprint?

> `optional` **footprint?**: `string`

Defined in: [@typecad/pcb/src/component.ts:44](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L44)

***

### mpn?

> `optional` **mpn?**: `string`

Defined in: [@typecad/pcb/src/component.ts:46](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L46)

***

### pcb?

> `optional` **pcb?**: `object`

Defined in: [@typecad/pcb/src/component.ts:47](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L47)

#### rotation?

> `optional` **rotation?**: `number`

#### side?

> `optional` **side?**: `"front"` \| `"back"`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### pins?

> `optional` **pins?**: [`Pin`](Class.Pin.md)[]

Defined in: [@typecad/pcb/src/component.ts:47](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L47)

***

### prefix?

> `optional` **prefix?**: `string`

Defined in: [@typecad/pcb/src/component.ts:45](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L45)

***

### reference?

> `optional` **reference?**: `TextOrPositioning`

Defined in: [@typecad/pcb/src/component.ts:41](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L41)

***

### sch?

> `optional` **sch?**: `object`

Defined in: [@typecad/pcb/src/component.ts:48](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L48)

#### rotation

> **rotation**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### simulation?

> `optional` **simulation?**: `object`

Defined in: [@typecad/pcb/src/component.ts:48](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L48)

#### include

> **include**: `boolean`

#### model?

> `optional` **model?**: `string`

***

### sourceInfo?

> `optional` **sourceInfo?**: `SourceInfo`

Defined in: [@typecad/pcb/src/component.ts:50](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L50)

***

### symbol?

> `optional` **symbol?**: `string`

Defined in: [@typecad/pcb/src/component.ts:40](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L40)

***

### text?

> `optional` **text?**: `TextEntry`[]

Defined in: [@typecad/pcb/src/component.ts:52](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L52)

***

### typehal?

> `optional` **typehal?**: [`ITypeHalInfo`](Interface.ITypeHalInfo.md)

Defined in: [@typecad/pcb/src/component.ts:51](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L51)

***

### uuid?

> `optional` **uuid?**: `string`

Defined in: [@typecad/pcb/src/component.ts:46](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L46)

***

### value?

> `optional` **value?**: `TextOrPositioning`

Defined in: [@typecad/pcb/src/component.ts:42](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L42)

***

### via?

> `optional` **via?**: `boolean`

Defined in: [@typecad/pcb/src/component.ts:47](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L47)

***

### viaData?

> `optional` **viaData?**: `IVia`

Defined in: [@typecad/pcb/src/component.ts:49](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L49)

***

### voltage?

> `optional` **voltage?**: `string`

Defined in: [@typecad/pcb/src/component.ts:45](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L45)

***

### wattage?

> `optional` **wattage?**: `string`

Defined in: [@typecad/pcb/src/component.ts:46](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L46)
