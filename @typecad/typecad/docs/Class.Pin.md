[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / Pin

# Class: Pin

Defined in: @typecad/typecad/src/pin.ts:15

Class representing a pin in a schematic.

 Pin

## Constructors

### Constructor

> **new Pin**(`reference`, `number`, `type?`, `owner?`, `powerInfo?`): `Pin`

Defined in: @typecad/typecad/src/pin.ts:37

Initializes a new pin with a given reference, number, and optional type.

#### Parameters

##### reference

`string`

The reference identifier for the pin.

##### number

`string` \| `number`

The pin number or identifier.

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

> **number**: `string` \| `number` = `''`

Defined in: @typecad/typecad/src/pin.ts:16

***

### owner

> **owner**: [`Component`](Class.Component.md)

Defined in: @typecad/typecad/src/pin.ts:19

***

### powerInfo?

> `optional` **powerInfo?**: [`IPinPowerInfo`](Interface.IPinPowerInfo.md)

Defined in: @typecad/typecad/src/pin.ts:20

***

### reference

> **reference**: `string` = `''`

Defined in: @typecad/typecad/src/pin.ts:17

***

### type

> **type**: `TPinType`

Defined in: @typecad/typecad/src/pin.ts:18

***

### uuid?

> `optional` **uuid?**: `string`

Defined in: @typecad/typecad/src/pin.ts:21
