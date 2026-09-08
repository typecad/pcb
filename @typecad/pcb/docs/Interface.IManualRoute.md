[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / IManualRoute

# Interface: IManualRoute

Defined in: [@typecad/pcb/src/pcb/pcb\_interfaces.ts:425](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_interfaces.ts#L425)

Pre-specified manual route for a specific connection.
When provided, the autorouter will use this exact path instead of calculating one.

## Properties

### from?

> `optional` **from?**: [`Pin`](Class.Pin.md)

Defined in: [@typecad/pcb/src/pcb/pcb\_interfaces.ts:430](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_interfaces.ts#L430)

Source pin (optional if can be inferred from route endpoints and net pins)
If not provided, will attempt to match route start position to a pin in the net

***

### route

> **route**: `IAutorouteResult` \| `IRoutePath`

Defined in: [@typecad/pcb/src/pcb/pcb\_interfaces.ts:445](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_interfaces.ts#L445)

The pre-defined route to use for this connection.
Can be:
- An IRoutePath object (low-level path with nodes)
- An IAutorouteResult from a previous autoroute() or route() call
  (will use the first route's path)

***

### to?

> `optional` **to?**: [`Pin`](Class.Pin.md)

Defined in: [@typecad/pcb/src/pcb/pcb\_interfaces.ts:436](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb_interfaces.ts#L436)

Destination pin (optional if can be inferred from route endpoints and net pins)
If not provided, will attempt to match route end position to a pin in the net
