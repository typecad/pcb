[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / McuPinMapping

# Interface: McuPinMapping

Defined in: @typecad/pcb/src/contract.ts:14

A single pin mapping entry: IC pin → MCU name → board framework name.
 Only needed for legacy usage when the component has no typehal property.

## Properties

### boardName

> **boardName**: `string`

Defined in: @typecad/pcb/src/contract.ts:17

***

### category

> **category**: `"power"` \| `"gnd"` \| `"gpio"` \| `"clock"` \| `"reset"`

Defined in: @typecad/pcb/src/contract.ts:18

***

### icPin

> **icPin**: `number`

Defined in: @typecad/pcb/src/contract.ts:15

***

### mcuName

> **mcuName**: `string`

Defined in: @typecad/pcb/src/contract.ts:16
