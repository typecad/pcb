[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / TrackBuilder

# Class: TrackBuilder

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:9](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L9)

## Constructors

### Constructor

> **new TrackBuilder**(`pcb`, `options?`): `TrackBuilder`

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:22](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L22)

#### Parameters

##### pcb

`IPcbBoardContext`

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

## Accessors

### deferStaging

#### Get Signature

> **get** **deferStaging**(): `boolean`

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:256](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L256)

##### Returns

`boolean`

***

### net

#### Get Signature

> **get** **net**(): `string` \| `undefined`

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:257](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L257)

##### Returns

`string` \| `undefined`

## Methods

### from()

> **from**(`startPos`, `layer?`, `width?`): `this`

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:30](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L30)

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

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:249](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L249)

#### Returns

`IGeneratedElement`[]

***

### powerInfo()

> **powerInfo**(`info`): `this`

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:40](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L40)

#### Parameters

##### info

`IPowerInfo`

#### Returns

`this`

***

### to()

> **to**(`endPos`): `this`

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:53](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L53)

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

Defined in: [@typecad/pcb/src/pcb/pcb\_track\_builder.ts:164](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_track_builder.ts#L164)

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
