[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / ComponentScore

# Interface: ComponentScore

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:198](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L198)

A component record paired with its calculated match score and detailed explanations.
Used internally by the scoring system before converting to SearchResult.

 ComponentScore

## Example

```typescript
const scoredComponent: ComponentScore = {
  component: { lcsc: "C25804", description: "10kΩ resistor", ... },
  score: 185,
  matchDetails: [
    { parameter: "resistance", score: 100, exact: true, reason: "Exact match" },
    { parameter: "package", score: 80, exact: true, reason: "Package match: 0603" }
  ]
};
```

## Properties

### component

> **component**: [`ComponentRecord`](Interface.ComponentRecord.md)

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:200](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L200)

The component record being scored

***

### matchDetails

> **matchDetails**: [`MatchDetail`](Interface.MatchDetail.md)[]

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:206](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L206)

Detailed breakdown of how the score was calculated

***

### score

> **score**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:203](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L203)

Total calculated score for this component
