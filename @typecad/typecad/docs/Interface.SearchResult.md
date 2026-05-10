[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / SearchResult

# Interface: SearchResult

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:239

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

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:250

Full component description

***

### lcsc

> **lcsc**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:241

Component identifier (KiCad: "library:symbol")

***

### manufacturer

> **manufacturer**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:244

Component manufacturer name

***

### matchSummary

> **matchSummary**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:259

Human-readable summary of why this component matched

***

### package

> **package**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:253

Component package type (KiCad: "Symbol")

***

### partNumber

> **partNumber**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:247

Manufacturer's part number (KiCad: symbol name)

***

### score

> **score**: `number`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:256

Total match score
