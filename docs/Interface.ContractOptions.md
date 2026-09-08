[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / ContractOptions

# Interface: ContractOptions

Defined in: @typecad/pcb/src/contract.ts:67

Options passed to pcb.contract()

## Properties

### mcuReference?

> `optional` **mcuReference?**: `string`

Defined in: @typecad/pcb/src/contract.ts:77

Exact reference designator of the target MCU (e.g. 'U1').

***

### outputPath?

> `optional` **outputPath?**: `string`

Defined in: @typecad/pcb/src/contract.ts:90

Output file path (default: "./build/<boardname>.contract.json")

***

### peripheralPins?

> `optional` **peripheralPins?**: `object`

Defined in: @typecad/pcb/src/contract.ts:84

Peripheral pin requirements (board pin names)

#### i2c?

> `optional` **i2c?**: `string`[]

#### spi?

> `optional` **spi?**: `string`[]

#### uart?

> `optional` **uart?**: `string`[]

***

### pinMapping?

> `optional` **pinMapping?**: [`McuPinMapping`](Interface.McuPinMapping.md)[]

Defined in: @typecad/pcb/src/contract.ts:82

Pin mapping table for the MCU (legacy — only needed when the component
has no typehal property and you need board names in the output).
