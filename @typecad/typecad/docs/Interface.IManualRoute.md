[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / IManualRoute

# Interface: IManualRoute

Defined in: [pcb/pcb\_interfaces.ts:326](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_interfaces.ts#L326)

Pre-specified manual route for a specific connection.
When provided, the autorouter will use this exact path instead of calculating one.

## Properties

### from?

> `optional` **from**: [`Pin`](Class.Pin.md)

Defined in: [pcb/pcb\_interfaces.ts:331](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_interfaces.ts#L331)

Source pin (optional if can be inferred from route endpoints and net pins)
If not provided, will attempt to match route start position to a pin in the net

***

### route

> **route**: `IRoutePath` \| `IAutorouteResult`

Defined in: [pcb/pcb\_interfaces.ts:346](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_interfaces.ts#L346)

The pre-defined route to use for this connection.
Can be:
- An IRoutePath object (low-level path with nodes)
- An IAutorouteResult from a previous autoroute() or route() call
  (will use the first route's path)

***

### to?

> `optional` **to**: [`Pin`](Class.Pin.md)

Defined in: [pcb/pcb\_interfaces.ts:337](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/pcb/pcb_interfaces.ts#L337)

Destination pin (optional if can be inferred from route endpoints and net pins)
If not provided, will attempt to match route end position to a pin in the net
