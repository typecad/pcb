[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / ParsedParameters

# Interface: ParsedParameters

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:132](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L132)

Contains all parameters extracted from a search query.
Used by the fuzzy scoring algorithm to match against component specifications.

 ParsedParameters

## Example

```typescript
// From query: "10k resistor 0603 ±1% 50V"
const params: ParsedParameters = {
  value: { value: 10000, unit: "Ω", originalText: "10k" },
  voltage: { value: 50, unit: "V", originalText: "50V" },
  tolerance: "±1%",
  package: "0603",
  componentType: "resistor",
  keywords: ["resistor", "thick", "film"]
};
```

## Properties

### componentType?

> `optional` **componentType?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:146](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L146)

Component type identifier (e.g., "resistor", "capacitor")

***

### keywords?

> `optional` **keywords?**: `string`[]

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:149](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L149)

Additional keywords from the search query

***

### package?

> `optional` **package?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:143](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L143)

Component package type (e.g., "0603", "SOT-23")

***

### tolerance?

> `optional` **tolerance?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:140](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L140)

Tolerance specification (e.g., "±1%", "±5%")

***

### value?

> `optional` **value?**: [`ElectricalValue`](Interface.ElectricalValue.md)

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:137](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L137)

Primary electrical value (resistance, capacitance, inductance)

***

### voltage?

> `optional` **voltage?**: [`ElectricalValue`](Interface.ElectricalValue.md)

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:134](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L134)

Voltage rating parameter (e.g., 50V, 3.3V)
