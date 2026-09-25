[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / SearchResult

# Interface: SearchResult

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:239](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L239)

Final search result formatted for display to the user.
Contains essential component information and match summary.

 SearchResult

## Example

```typescript
// JLCPCB component result
const jlcResult: SearchResult = {
  lcsc: "C25804",
  manufacturer: "UNI-ROYAL(Uniroyal Elec)",
  partNumber: "0603WAF1002T5E",
  description: "10kΩ ±1% 0603 Thick Film Resistor",
  package: "0603",
  score: 185,
  matchSummary: "Exact resistance match (100 pts), Package match (80 pts)"
};

// KiCad symbol result
const kicadResult: SearchResult = {
  lcsc: "4xxx:14528",
  manufacturer: "KiCad",
  partNumber: "14528",
  description: "Dual 4-bit latch, 3-state outputs",
  package: "Symbol",
  score: 150,
  matchSummary: "Symbol name match (100 pts), Library match (50 pts)"
};
```

## Properties

### description

> **description**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:250](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L250)

Full component description

***

### footprint?

> `optional` **footprint?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:262](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L262)

Default footprint if available

***

### fpFilters?

> `optional` **fpFilters?**: `string`[]

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:265](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L265)

Footprint filters if available

***

### lcsc

> **lcsc**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:241](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L241)

Component identifier (KiCad: "library:symbol")

***

### manufacturer

> **manufacturer**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:244](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L244)

Component manufacturer name

***

### matchSummary

> **matchSummary**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:259](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L259)

Human-readable summary of why this component matched

***

### package

> **package**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:253](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L253)

Component package type (KiCad: "Symbol")

***

### partNumber

> **partNumber**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:247](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L247)

Manufacturer's part number (KiCad: symbol name)

***

### score

> **score**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:256](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L256)

Total match score
