[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / TrackBuilder

# Class: TrackBuilder

Defined in: [pcb/pcb\_track\_builder.ts:6](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_track_builder.ts#L6)

## Constructors

### Constructor

> **new TrackBuilder**(`pcb`, `options?`): `TrackBuilder`

Defined in: [pcb/pcb\_track\_builder.ts:19](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_track_builder.ts#L19)

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

Defined in: [pcb/pcb\_track\_builder.ts:27](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_track_builder.ts#L27)

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

Defined in: [pcb/pcb\_track\_builder.ts:378](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_track_builder.ts#L378)

#### Returns

`IGeneratedElement`[]

***

### powerInfo()

> **powerInfo**(`info`): `this`

Defined in: [pcb/pcb\_track\_builder.ts:37](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_track_builder.ts#L37)

#### Parameters

##### info

`IPowerInfo`

#### Returns

`this`

***

### to()

> **to**(`endPos`): `this`

Defined in: [pcb/pcb\_track\_builder.ts:84](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_track_builder.ts#L84)

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

> **via**(`params`): `this`

Defined in: [pcb/pcb\_track\_builder.ts:280](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_track_builder.ts#L280)

#### Parameters

##### params

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
