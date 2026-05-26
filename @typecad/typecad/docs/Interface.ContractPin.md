[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / ContractPin

# Interface: ContractPin

Defined in: @typecad/typecad/src/contract.ts:36

Info about a single connected MCU pin

## Properties

### boardName?

> `optional` **boardName?**: `string`

Defined in: @typecad/typecad/src/contract.ts:41

Board framework pin name (e.g. "D13") — populated when typehal.pinLookup is provided

***

### externalComponents

> **externalComponents**: [`ContractComponent`](Interface.ContractComponent.md)[]

Defined in: @typecad/typecad/src/contract.ts:43

***

### net

> **net**: `string`

Defined in: @typecad/typecad/src/contract.ts:42

***

### pinName

> **pinName**: `string`

Defined in: @typecad/typecad/src/contract.ts:37

***

### pinType

> **pinType**: `string`

Defined in: @typecad/typecad/src/contract.ts:39

Pin electrical type from KiCAD symbol (e.g. "bidirectional", "power_in", "passive", "input", "output")
