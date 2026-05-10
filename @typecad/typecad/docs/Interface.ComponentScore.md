[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / ComponentScore

# Interface: ComponentScore

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:198

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

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:200

The component record being scored

***

### matchDetails

> **matchDetails**: [`MatchDetail`](Interface.MatchDetail.md)[]

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:206

Detailed breakdown of how the score was calculated

***

### score

> **score**: `number`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:203

Total calculated score for this component
