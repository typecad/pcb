[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / Component

# Class: Component

Defined in: @typecad/typecad/src/component.ts:74

Represents a component in an electronic circuit.

## Constructors

### Constructor

> **new Component**(`options?`): `Component`

Defined in: @typecad/typecad/src/component.ts:108

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

Defined in: @typecad/typecad/src/component.ts:78

Link to component datasheet.

***

### description

> **description**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:79

Description of the component.

***

### dnp

> **dnp**: `boolean` = `false`

Defined in: @typecad/typecad/src/component.ts:84

True if Do Not Place.

***

### fab?

> `optional` **fab?**: `object`

Defined in: @typecad/typecad/src/component.ts:96

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

### footprint

> **footprint**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:77

Component footprint (e.g., Resistor_SMD:R_0603_1608Metric).

***

### groups

> **groups**: `string`[] = `[]`

Defined in: @typecad/typecad/src/component.ts:93

***

### mpn

> **mpn**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:82

Manufacturer Part Number.

***

### pcb

> **pcb**: `object`

Defined in: @typecad/typecad/src/component.ts:83

PCB placement details (x, y, rotation).

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

Defined in: @typecad/typecad/src/component.ts:87

Array of component pins.

***

### reference

> **reference**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:75

Reference designator (e.g., R1) or a tuple with positioning info (e.g., ['U2', {x: 1, y: 1, rotation: 0}]).
                      When provided as a tuple, the positioning controls where the reference text appears in KiCad.

***

### sch

> **sch**: `object`

Defined in: @typecad/typecad/src/component.ts:92

#### rotation?

> `optional` **rotation?**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### simulation

> **simulation**: `object`

Defined in: @typecad/typecad/src/component.ts:90

Simulation details.

#### include

> **include**: `boolean`

#### model

> **model**: `string`

***

### sourceInfo?

> `optional` **sourceInfo?**: `SourceInfo`

Defined in: @typecad/typecad/src/component.ts:94

Source code location and instantiation details where the component was created, parsed via AST.
                         Includes file path, line number, variable name (if in declaration like `let r1 = new Component()`),
                         and fully structured parameters (supports nested objects/arrays from `{value: '10k', sim: {include: true}}`).

***

### symbol?

> `optional` **symbol?**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:91

***

### text

> **text**: `object`[] = `[]`

Defined in: @typecad/typecad/src/component.ts:95

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

### value

> **value**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:76

Component value (e.g., 1 kOhm) or a tuple with positioning info (e.g., ['10k', {x: 0, y: 5, rotation: 0}]).
                  When provided as a tuple, the positioning controls where the value text appears in KiCad.

***

### valueFootprint?

> `optional` **valueFootprint?**: `object`

Defined in: @typecad/typecad/src/component.ts:97

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

#### rotation?

> `optional` **rotation?**: `number`

#### show?

> `optional` **show?**: `boolean`

#### thickness?

> `optional` **thickness?**: `number`

#### width?

> `optional` **width?**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### via

> **via**: `boolean` = `false`

Defined in: @typecad/typecad/src/component.ts:88

True if the component is a via.

***

### viaData?

> `optional` **viaData?**: `IVia`

Defined in: @typecad/typecad/src/component.ts:89

***

### voltage

> **voltage**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:80

***

### wattage

> **wattage**: `string` = `''`

Defined in: @typecad/typecad/src/component.ts:81

## Accessors

### uuid

#### Get Signature

> **get** **uuid**(): `string`

Defined in: @typecad/typecad/src/component.ts:318

Get the UUID for this component. If not explicitly set, it will be generated
consistently based on component properties.

##### Returns

`string`

#### Set Signature

> **set** **uuid**(`value`): `void`

Defined in: @typecad/typecad/src/component.ts:341

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

Defined in: @typecad/typecad/src/component.ts:387

Get all groups this component belongs to.

#### Returns

`string`[]

Array of group names this component is a member of.

***

### isInGroup()

> **isInGroup**(`groupName`): `boolean`

Defined in: @typecad/typecad/src/component.ts:379

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

Defined in: @typecad/typecad/src/component.ts:350

Returns a [Pin](Class.Pin.md) object from the component.

#### Parameters

##### number

`string` \| `number`

The pin number or identifier.

#### Returns

[`Pin`](Class.Pin.md)

The pin object.
