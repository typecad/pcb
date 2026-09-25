[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / ElectricalValue

# Interface: ElectricalValue

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:103](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L103)

Represents an electrical parameter value with its unit and original text.
Used for storing parsed electrical values like resistance, capacitance, voltage, etc.

 ElectricalValue

## Example

```typescript
const resistance: ElectricalValue = {
  value: 10000,        // Normalized to base unit (Ohms)
  unit: "Ω",           // Base unit symbol
  originalText: "10k"  // Original text from search query
};

const capacitance: ElectricalValue = {
  value: 100e-9,       // Normalized to Farads
  unit: "F",           // Base unit
  originalText: "100nF" // Original text
};
```

## Properties

### originalText

> **originalText**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:111](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L111)

Original text from the search query before parsing

***

### unit

> **unit**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:108](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L108)

Base unit symbol (e.g., "Ω", "F", "H", "V")

***

### value

> **value**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:105](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L105)

Numerical value normalized to base unit (e.g., Ohms, Farads, Henries)
