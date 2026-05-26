[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / exportContract

# Function: exportContract()

> **exportContract**(`pcb`, `options?`): `void`

Defined in: @typecad/typecad/src/contract.ts:114

Exports a hardware contract JSON file describing which MCU pins are wired
in the circuit. The firmware toolchain (TypeHAL) consumes this contract to
generate a board wrapper that only exposes connected pins and peripherals.

When a component has a `typehal.boardPackage` property, it is auto-detected
as the MCU and pin names are read directly from the KiCAD symbol file.

## Parameters

### pcb

[`PCB`](Class.PCB.md)

The PCB instance to analyze.

### options?

[`ContractOptions`](Interface.ContractOptions.md) = `{}`

Contract generation options (all optional when typehal is set on the MCU).

## Returns

`void`
