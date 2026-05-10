[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IComponent

# Interface: IComponent

Defined in: @typecad/typecad/src/component.ts:32

## Properties

### datasheet?

> `optional` **datasheet?**: `string`

Defined in: @typecad/typecad/src/component.ts:38

***

### description?

> `optional` **description?**: `string`

Defined in: @typecad/typecad/src/component.ts:38

***

### dnp?

> `optional` **dnp?**: `boolean`

Defined in: @typecad/typecad/src/component.ts:39

***

### fab?

> `optional` **fab?**: `ITextPositioning` \| \[`string`, `ITextPositioning`\]

Defined in: @typecad/typecad/src/component.ts:36

***

### footprint?

> `optional` **footprint?**: `string`

Defined in: @typecad/typecad/src/component.ts:37

***

### mpn?

> `optional` **mpn?**: `string`

Defined in: @typecad/typecad/src/component.ts:39

***

### pcb?

> `optional` **pcb?**: `object`

Defined in: @typecad/typecad/src/component.ts:40

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

Defined in: @typecad/typecad/src/component.ts:40

***

### prefix?

> `optional` **prefix?**: `string`

Defined in: @typecad/typecad/src/component.ts:38

***

### reference?

> `optional` **reference?**: `string` \| `ITextPositioning` \| \[`string`, `ITextPositioning`\]

Defined in: @typecad/typecad/src/component.ts:34

***

### sch?

> `optional` **sch?**: `object`

Defined in: @typecad/typecad/src/component.ts:41

#### rotation

> **rotation**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### simulation?

> `optional` **simulation?**: `object`

Defined in: @typecad/typecad/src/component.ts:41

#### include

> **include**: `boolean`

#### model?

> `optional` **model?**: `string`

***

### sourceInfo?

> `optional` **sourceInfo?**: `SourceInfo`

Defined in: @typecad/typecad/src/component.ts:43

***

### symbol?

> `optional` **symbol?**: `string`

Defined in: @typecad/typecad/src/component.ts:33

***

### text?

> `optional` **text?**: `object`[]

Defined in: @typecad/typecad/src/component.ts:44

#### bold?

> `optional` **bold?**: `boolean`

#### fontSize?

> `optional` **fontSize?**: `number`

#### height?

> `optional` **height?**: `number`

#### italic?

> `optional` **italic?**: `boolean`

#### justify?

> `optional` **justify?**: `object`

##### justify.horizontal?

> `optional` **horizontal?**: `"center"` \| `"left"` \| `"right"`

##### justify.mirror?

> `optional` **mirror?**: `boolean`

##### justify.vertical?

> `optional` **vertical?**: `"top"` \| `"bottom"` \| `"middle"`

#### layer?

> `optional` **layer?**: `string`

#### property

> **property**: `string`

#### rotation?

> `optional` **rotation?**: `number`

#### show?

> `optional` **show?**: `boolean`

#### text

> **text**: `string`

#### thickness?

> `optional` **thickness?**: `number`

#### width?

> `optional` **width?**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### uuid?

> `optional` **uuid?**: `string`

Defined in: @typecad/typecad/src/component.ts:39

***

### value?

> `optional` **value?**: `string` \| `ITextPositioning` \| \[`string`, `ITextPositioning`\]

Defined in: @typecad/typecad/src/component.ts:35

***

### via?

> `optional` **via?**: `boolean`

Defined in: @typecad/typecad/src/component.ts:40

***

### viaData?

> `optional` **viaData?**: `IVia`

Defined in: @typecad/typecad/src/component.ts:42

***

### voltage?

> `optional` **voltage?**: `string`

Defined in: @typecad/typecad/src/component.ts:38

***

### wattage?

> `optional` **wattage?**: `string`

Defined in: @typecad/typecad/src/component.ts:39
