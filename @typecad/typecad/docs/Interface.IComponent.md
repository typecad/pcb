[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IComponent

# Interface: IComponent

Defined in: [component.ts:21](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L21)

## Properties

### datasheet?

> `optional` **datasheet**: `string`

Defined in: [component.ts:27](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L27)

***

### description?

> `optional` **description**: `string`

Defined in: [component.ts:27](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L27)

***

### dnp?

> `optional` **dnp**: `boolean`

Defined in: [component.ts:28](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L28)

***

### fab?

> `optional` **fab**: `ITextPositioning` \| \[`undefined` \| `null` \| `string`, `ITextPositioning`\]

Defined in: [component.ts:25](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L25)

***

### footprint?

> `optional` **footprint**: `string`

Defined in: [component.ts:26](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L26)

***

### mpn?

> `optional` **mpn**: `string`

Defined in: [component.ts:28](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L28)

***

### pcb?

> `optional` **pcb**: `object`

Defined in: [component.ts:29](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L29)

#### rotation?

> `optional` **rotation**: `number`

#### side?

> `optional` **side**: `"front"` \| `"back"`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### pins?

> `optional` **pins**: [`Pin`](Class.Pin.md)[]

Defined in: [component.ts:29](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L29)

***

### prefix?

> `optional` **prefix**: `string`

Defined in: [component.ts:27](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L27)

***

### reference?

> `optional` **reference**: `string` \| `ITextPositioning` \| \[`undefined` \| `null` \| `string`, `ITextPositioning`\]

Defined in: [component.ts:23](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L23)

***

### sch?

> `optional` **sch**: `object`

Defined in: [component.ts:30](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L30)

#### rotation

> **rotation**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### simulation?

> `optional` **simulation**: `object`

Defined in: [component.ts:30](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L30)

#### include

> **include**: `boolean`

#### model?

> `optional` **model**: `string`

***

### sourceInfo?

> `optional` **sourceInfo**: `SourceInfo`

Defined in: [component.ts:32](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L32)

***

### symbol?

> `optional` **symbol**: `string`

Defined in: [component.ts:22](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L22)

***

### text?

> `optional` **text**: `object`[]

Defined in: [component.ts:33](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L33)

#### bold?

> `optional` **bold**: `boolean`

#### fontSize?

> `optional` **fontSize**: `number`

#### height?

> `optional` **height**: `number`

#### italic?

> `optional` **italic**: `boolean`

#### justify?

> `optional` **justify**: `object`

##### justify.horizontal?

> `optional` **horizontal**: `"center"` \| `"left"` \| `"right"`

##### justify.mirror?

> `optional` **mirror**: `boolean`

##### justify.vertical?

> `optional` **vertical**: `"top"` \| `"bottom"` \| `"middle"`

#### layer?

> `optional` **layer**: `string`

#### property

> **property**: `string`

#### rotation?

> `optional` **rotation**: `number`

#### show?

> `optional` **show**: `boolean`

#### text

> **text**: `string`

#### thickness?

> `optional` **thickness**: `number`

#### width?

> `optional` **width**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### uuid?

> `optional` **uuid**: `string`

Defined in: [component.ts:28](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L28)

***

### value?

> `optional` **value**: `string` \| `ITextPositioning` \| \[`string`, `ITextPositioning`\]

Defined in: [component.ts:24](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L24)

***

### via?

> `optional` **via**: `boolean`

Defined in: [component.ts:29](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L29)

***

### viaData?

> `optional` **viaData**: `IVia`

Defined in: [component.ts:31](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L31)

***

### voltage?

> `optional` **voltage**: `string`

Defined in: [component.ts:27](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L27)

***

### wattage?

> `optional` **wattage**: `string`

Defined in: [component.ts:28](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L28)
