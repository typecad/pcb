[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / exportContract

# Function: exportContract()

> **exportContract**(`pcb`, `options?`): `void`

Defined in: @typecad/pcb/src/contract.ts:114

Exports a hardware contract JSON file describing which MCU pins are wired
in the circuit. The firmware toolchain (TypeHAL) consumes this contract to
generate a board wrapper that only exposes connected pins and peripherals.

Requires `mcuReference` in options to identify the target MCU.

## Parameters

### pcb

[`PCB`](Class.PCB.md)

The PCB instance to analyze.

### options

[`ContractOptions`](Interface.ContractOptions.md)

Contract generation options. `mcuReference` is required.

## Returns

`void`
