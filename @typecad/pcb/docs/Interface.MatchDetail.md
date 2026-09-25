[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / MatchDetail

# Interface: MatchDetail

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:167](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L167)

Detailed information about how a specific parameter matched during scoring.
Used to explain why a component received a particular score.

 MatchDetail

## Example

```typescript
const matchDetail: MatchDetail = {
  parameter: "resistance",
  score: 100,
  exact: true,
  reason: "Exact resistance match: 10kΩ"
};
```

## Properties

### exact

> **exact**: `boolean`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:175](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L175)

Whether this was an exact match or approximate

***

### parameter

> **parameter**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:169](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L169)

Name of the parameter that was matched (e.g., "resistance", "package")

***

### reason

> **reason**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:178](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L178)

Human-readable explanation of the match

***

### score

> **score**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:172](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L172)

Score awarded for this parameter match (0-100+)
