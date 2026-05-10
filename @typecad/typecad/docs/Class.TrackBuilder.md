[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / TrackBuilder

# Class: TrackBuilder

Defined in: @typecad/typecad/src/pcb/pcb\_track\_builder.ts:9

## Constructors

### Constructor

> **new TrackBuilder**(`pcb`, `options?`): `TrackBuilder`

Defined in: @typecad/typecad/src/pcb/pcb\_track\_builder.ts:22

#### Parameters

##### pcb

[`PCB`](Class.PCB.md)

##### options?

###### debug?

`boolean`

###### deferStaging?

`boolean`

###### locked?

`boolean`

###### net?

`string`

#### Returns

`TrackBuilder`

## Methods

### from()

> **from**(`startPos`, `layer?`, `width?`): `this`

Defined in: @typecad/typecad/src/pcb/pcb\_track\_builder.ts:30

#### Parameters

##### startPos

###### x

`number`

###### y

`number`

##### layer?

`string`

##### width?

`number`

#### Returns

`this`

***

### getElements()

> **getElements**(): `IGeneratedElement`[]

Defined in: @typecad/typecad/src/pcb/pcb\_track\_builder.ts:261

#### Returns

`IGeneratedElement`[]

***

### powerInfo()

> **powerInfo**(`info`): `this`

Defined in: @typecad/typecad/src/pcb/pcb\_track\_builder.ts:40

#### Parameters

##### info

`IPowerInfo`

#### Returns

`this`

***

### to()

> **to**(`endPos`): `this`

Defined in: @typecad/typecad/src/pcb/pcb\_track\_builder.ts:53

#### Parameters

##### endPos

###### layer?

`string`

###### width?

`number`

###### x

`number`

###### y

`number`

#### Returns

`this`

***

### via()

> **via**(`params?`): `this`

Defined in: @typecad/typecad/src/pcb/pcb\_track\_builder.ts:170

#### Parameters

##### params?

###### drill?

`number`

###### layers?

`string`[]

###### net?

`string`

###### powerInfo?

`IViaPowerInfo`

###### size?

`number`

#### Returns

`this`
