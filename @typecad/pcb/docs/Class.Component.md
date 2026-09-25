[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / Component

# Class: Component

Defined in: [@typecad/pcb/src/component.ts:63](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L63)

## Constructors

### Constructor

> **new Component**(`__namedParameters?`): `Component`

Defined in: [@typecad/pcb/src/component.ts:106](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L106)

#### Parameters

##### \_\_namedParameters?

[`IComponent`](Interface.IComponent.md) = `{}`

#### Returns

`Component`

## Properties

### datasheet

> **datasheet**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:82](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L82)

***

### description

> **description**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:83](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L83)

***

### dnp

> **dnp**: `boolean` = `false`

Defined in: [@typecad/pcb/src/component.ts:88](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L88)

***

### fab?

> `optional` **fab?**: `FabEntry`

Defined in: [@typecad/pcb/src/component.ts:101](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L101)

***

### footprint

> **footprint**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:81](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L81)

***

### groups

> **groups**: `string`[] = `[]`

Defined in: [@typecad/pcb/src/component.ts:97](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L97)

***

### mpn

> **mpn**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:86](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L86)

***

### pcb

> **pcb**: `object`

Defined in: [@typecad/pcb/src/component.ts:87](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L87)

#### rotation?

> `optional` **rotation?**: `number`

#### side?

> `optional` **side?**: `"front"` \| `"back"`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### pins

> **pins**: [`Pin`](Class.Pin.md)[] = `[]`

Defined in: [@typecad/pcb/src/component.ts:91](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L91)

***

### reference

> **reference**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:79](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L79)

***

### sch

> **sch**: `object`

Defined in: [@typecad/pcb/src/component.ts:96](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L96)

#### rotation?

> `optional` **rotation?**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### simulation

> **simulation**: `object`

Defined in: [@typecad/pcb/src/component.ts:94](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L94)

#### include

> **include**: `boolean`

#### model

> **model**: `string`

***

### sourceInfo?

> `optional` **sourceInfo?**: `SourceInfo`

Defined in: [@typecad/pcb/src/component.ts:98](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L98)

***

### symbol?

> `optional` **symbol?**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:95](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L95)

***

### text

> **text**: `TextEntry`[] = `[]`

Defined in: [@typecad/pcb/src/component.ts:100](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L100)

***

### typehal?

> `optional` **typehal?**: [`ITypeHalInfo`](Interface.ITypeHalInfo.md)

Defined in: [@typecad/pcb/src/component.ts:99](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L99)

***

### value

> **value**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:80](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L80)

***

### valueFootprint?

> `optional` **valueFootprint?**: `ITextPositioning`

Defined in: [@typecad/pcb/src/component.ts:102](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L102)

***

### via

> **via**: `boolean` = `false`

Defined in: [@typecad/pcb/src/component.ts:92](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L92)

***

### viaData?

> `optional` **viaData?**: `IVia`

Defined in: [@typecad/pcb/src/component.ts:93](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L93)

***

### voltage

> **voltage**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:84](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L84)

***

### wattage

> **wattage**: `string` = `''`

Defined in: [@typecad/pcb/src/component.ts:85](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L85)

## Accessors

### footprintHash

#### Get Signature

> **get** **footprintHash**(): `string`

Defined in: [@typecad/pcb/src/component.ts:238](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L238)

##### Returns

`string`

***

### uuid

#### Get Signature

> **get** **uuid**(): `string`

Defined in: [@typecad/pcb/src/component.ts:227](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L227)

##### Returns

`string`

#### Set Signature

> **set** **uuid**(`value`): `void`

Defined in: [@typecad/pcb/src/component.ts:234](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L234)

##### Parameters

###### value

`string`

##### Returns

`void`

## Methods

### footprint\_lib()

> **footprint\_lib**(`footprint`): `string`

Defined in: [@typecad/pcb/src/component.ts:276](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L276)

#### Parameters

##### footprint

`string`

#### Returns

`string`

***

### getGroups()

> **getGroups**(): `string`[]

Defined in: [@typecad/pcb/src/component.ts:272](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L272)

#### Returns

`string`[]

***

### isInGroup()

> **isInGroup**(`groupName`): `boolean`

Defined in: [@typecad/pcb/src/component.ts:268](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L268)

#### Parameters

##### groupName

`string`

#### Returns

`boolean`

***

### pin()

> **pin**(`number`): [`Pin`](Class.Pin.md)

Defined in: [@typecad/pcb/src/component.ts:248](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L248)

#### Parameters

##### number

`string` \| `number`

#### Returns

[`Pin`](Class.Pin.md)

***

### symbol\_lib()

> **symbol\_lib**(`symbol`): `string`

Defined in: [@typecad/pcb/src/component.ts:282](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L282)

#### Parameters

##### symbol

`string`

#### Returns

`string`

***

### getActiveCounter()

> `static` **getActiveCounter**(): `ReferenceCounter`

Defined in: [@typecad/pcb/src/component.ts:71](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L71)

#### Returns

`ReferenceCounter`

***

### setActiveCounter()

> `static` **setActiveCounter**(`counter`): `void`

Defined in: [@typecad/pcb/src/component.ts:67](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/component.ts#L67)

#### Parameters

##### counter

`ReferenceCounter` \| `null`

#### Returns

`void`
