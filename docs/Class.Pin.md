[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / Pin

# Class: Pin

Defined in: [@typecad/pcb/src/pin.ts:15](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L15)

Class representing a pin in a schematic.

 Pin

## Constructors

### Constructor

> **new Pin**(`reference`, `number`, `type?`, `owner?`, `powerInfo?`): `Pin`

Defined in: [@typecad/pcb/src/pin.ts:37](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L37)

Initializes a new pin with a given reference, number, and optional type.

#### Parameters

##### reference

`string`

The reference identifier for the pin.

##### number

`string` \| `number`

The pin number or identifier. Stored as string internally.

##### type?

`TPinType`

The type of the pin. Defaults to 'passive'.

##### owner?

[`Component`](Class.Component.md)

The owner component of this pin.

##### powerInfo?

[`IPinPowerInfo`](Interface.IPinPowerInfo.md)

Power characteristics of the pin.

#### Returns

`Pin`

#### Example

```ts
let pin = new Pin('R1', 1, 'input');
let powerPin = new Pin('U1', 5, 'power_in', this, { minimum_voltage: -0.3, maximum_voltage: 6.5, current: 2 });
```

## Properties

### number

> **number**: `string` = `''`

Defined in: [@typecad/pcb/src/pin.ts:16](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L16)

***

### owner

> **owner**: [`Component`](Class.Component.md) \| `null`

Defined in: [@typecad/pcb/src/pin.ts:19](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L19)

***

### powerInfo?

> `optional` **powerInfo?**: [`IPinPowerInfo`](Interface.IPinPowerInfo.md)

Defined in: [@typecad/pcb/src/pin.ts:20](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L20)

***

### reference

> **reference**: `string` = `''`

Defined in: [@typecad/pcb/src/pin.ts:17](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L17)

***

### type

> **type**: `TPinType`

Defined in: [@typecad/pcb/src/pin.ts:18](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L18)

***

### uuid?

> `optional` **uuid?**: `string`

Defined in: [@typecad/pcb/src/pin.ts:21](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pin.ts#L21)
