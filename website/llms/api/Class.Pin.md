[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / Pin

# Class: Pin

Defined in: [pin.ts:16](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pin.ts#L16)

Class representing a pin in a schematic.

 Pin

## Constructors

### Constructor

> **new Pin**(`reference`, `number`, `type?`, `owner?`, `powerInfo?`): `Pin`

Defined in: [pin.ts:37](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pin.ts#L37)

Initializes a new pin with a given reference, number, and optional type.

#### Parameters

##### reference

`string`

The reference identifier for the pin.

##### number

The pin number or identifier.

`string` | `number`

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

Defined in: [pin.ts:17](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pin.ts#L17)

***

### owner

> **owner**: `null` \| [`Component`](Class.Component.md)

Defined in: [pin.ts:20](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pin.ts#L20)

***

### powerInfo?

> `optional` **powerInfo**: [`IPinPowerInfo`](Interface.IPinPowerInfo.md)

Defined in: [pin.ts:21](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pin.ts#L21)

***

### reference

> **reference**: `string` = `''`

Defined in: [pin.ts:18](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pin.ts#L18)

***

### type

> **type**: `TPinType`

Defined in: [pin.ts:19](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pin.ts#L19)
