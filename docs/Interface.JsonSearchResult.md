[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / JsonSearchResult

# Interface: JsonSearchResult

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:366](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L366)

Clean interface for JSON output that ensures consistent serialization.
Contains the same essential information as SearchResult but optimized for JSON format.

 JsonSearchResult

## Example

```typescript
// JLCPCB component JSON result
const jlcJsonResult: JsonSearchResult = {
  id: "C25804",
  description: "10kΩ ±1% 0603 Thick Film Resistor",
  score: 185.0,
  matchSummary: "Exact resistance match (100 pts), Package match (80 pts)"
};

// KiCad symbol JSON result
const kicadJsonResult: JsonSearchResult = {
  id: "4xxx:14528",
  description: "Dual 4-bit latch, 3-state outputs",
  score: 150.0,
  matchSummary: "Symbol name match (100 pts), Library match (50 pts)"
};
```

## Properties

### description

> **description**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:371](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L371)

Full component description

***

### id

> **id**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:368](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L368)

Component identifier (KiCad: "library:symbol")

***

### matchSummary

> **matchSummary**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:377](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L377)

Human-readable summary of why this component matched

***

### score

> **score**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:374](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L374)

Total match score as number
