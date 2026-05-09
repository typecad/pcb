[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / Component

# Class: Component

Defined in: [component.ts:63](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L63)

Represents a component in an electronic circuit.

## Constructors

### Constructor

> **new Component**(`options?`): `Component`

Defined in: [component.ts:97](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L97)

Creates an instance of Component.

#### Parameters

##### options?

[`IComponent`](Interface.IComponent.md) = `{}`

The component options.

#### Returns

`Component`

## Properties

### datasheet

> **datasheet**: `string` = `''`

Defined in: [component.ts:67](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L67)

Link to component datasheet.

***

### description

> **description**: `string` = `''`

Defined in: [component.ts:68](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L68)

Description of the component.

***

### dnp

> **dnp**: `boolean` = `false`

Defined in: [component.ts:73](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L73)

True if Do Not Place.

***

### fab?

> `optional` **fab**: `object`

Defined in: [component.ts:85](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L85)

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

### footprint

> **footprint**: `string` = `''`

Defined in: [component.ts:66](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L66)

Component footprint (e.g., Resistor_SMD:R_0603_1608Metric).

***

### groups

> **groups**: `string`[] = `[]`

Defined in: [component.ts:82](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L82)

***

### mpn

> **mpn**: `string` = `''`

Defined in: [component.ts:71](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L71)

Manufacturer Part Number.

***

### pcb

> **pcb**: `object`

Defined in: [component.ts:72](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L72)

PCB placement details (x, y, rotation).

#### rotation?

> `optional` **rotation**: `number`

#### side?

> `optional` **side**: `"front"` \| `"back"`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### pins

> **pins**: [`Pin`](Class.Pin.md)[] = `[]`

Defined in: [component.ts:76](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L76)

Array of component pins.

***

### reference

> **reference**: `string` = `''`

Defined in: [component.ts:64](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L64)

Reference designator (e.g., R1) or a tuple with positioning info (e.g., ['U2', {x: 1, y: 1, rotation: 0}]).
                      When provided as a tuple, the positioning controls where the reference text appears in KiCad.

***

### sch

> **sch**: `object`

Defined in: [component.ts:81](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L81)

#### rotation?

> `optional` **rotation**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### simulation

> **simulation**: `object`

Defined in: [component.ts:79](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L79)

Simulation details.

#### include

> **include**: `boolean`

#### model

> **model**: `string`

***

### sourceInfo?

> `optional` **sourceInfo**: `SourceInfo`

Defined in: [component.ts:83](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L83)

Source code location and instantiation details where the component was created, parsed via AST.
                         Includes file path, line number, variable name (if in declaration like `let r1 = new Component()`),
                         and fully structured parameters (supports nested objects/arrays from `{value: '10k', sim: {include: true}}`).

***

### symbol?

> `optional` **symbol**: `string` = `''`

Defined in: [component.ts:80](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L80)

***

### text

> **text**: `object`[] = `[]`

Defined in: [component.ts:84](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L84)

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

### value

> **value**: `string` = `''`

Defined in: [component.ts:65](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L65)

Component value (e.g., 1 kOhm) or a tuple with positioning info (e.g., ['10k', {x: 0, y: 5, rotation: 0}]).
                  When provided as a tuple, the positioning controls where the value text appears in KiCad.

***

### valueFootprint?

> `optional` **valueFootprint**: `object`

Defined in: [component.ts:86](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L86)

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

#### rotation?

> `optional` **rotation**: `number`

#### show?

> `optional` **show**: `boolean`

#### thickness?

> `optional` **thickness**: `number`

#### width?

> `optional` **width**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### via

> **via**: `boolean` = `false`

Defined in: [component.ts:77](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L77)

True if the component is a via.

***

### viaData?

> `optional` **viaData**: `IVia`

Defined in: [component.ts:78](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L78)

***

### voltage

> **voltage**: `string` = `''`

Defined in: [component.ts:69](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L69)

***

### wattage

> **wattage**: `string` = `''`

Defined in: [component.ts:70](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L70)

## Accessors

### uuid

#### Get Signature

> **get** **uuid**(): `string`

Defined in: [component.ts:738](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L738)

Get the UUID for this component. If not explicitly set, it will be generated
consistently based on component properties.

##### Returns

`string`

#### Set Signature

> **set** **uuid**(`value`): `void`

Defined in: [component.ts:761](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L761)

Set the UUID for this component

##### Parameters

###### value

`string`

##### Returns

`void`

Unique identifier.

## Methods

### getGroups()

> **getGroups**(): `string`[]

Defined in: [component.ts:808](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L808)

Get all groups this component belongs to.

#### Returns

`string`[]

Array of group names this component is a member of.

***

### isInGroup()

> **isInGroup**(`groupName`): `boolean`

Defined in: [component.ts:800](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L800)

Check if this component belongs to a specific group.

#### Parameters

##### groupName

`string`

The name of the group to check.

#### Returns

`boolean`

True if the component is in the specified group.

***

### pin()

> **pin**(`number`): [`Pin`](Class.Pin.md)

Defined in: [component.ts:770](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/component.ts#L770)

Returns a [Pin](Class.Pin.md) object from the component.

#### Parameters

##### number

The pin number or identifier.

`string` | `number`

#### Returns

[`Pin`](Class.Pin.md)

The pin object.
