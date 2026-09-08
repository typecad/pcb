[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / HwContract

# Interface: HwContract

Defined in: @typecad/pcb/src/contract.ts:47

The top-level contract object written to disk

## Properties

### availablePeripherals

> **availablePeripherals**: `object`

Defined in: @typecad/pcb/src/contract.ts:59

#### i2c

> **i2c**: `boolean`

#### spi

> **spi**: `boolean`

#### uart

> **uart**: `boolean`

***

### connectedPins

> **connectedPins**: `Record`\<`string`, [`ContractPin`](Interface.ContractPin.md)\>

Defined in: @typecad/pcb/src/contract.ts:58

***

### mcu

> **mcu**: `object`

Defined in: @typecad/pcb/src/contract.ts:49

#### datasheet

> **datasheet**: `string`

#### description

> **description**: `string`

#### footprint

> **footprint**: `string`

#### mpn

> **mpn**: `string`

#### reference

> **reference**: `string`

#### symbol

> **symbol**: `string`

#### value

> **value**: `string`

***

### version

> **version**: `1`

Defined in: @typecad/pcb/src/contract.ts:48
