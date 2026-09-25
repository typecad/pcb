[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / SymbolInfo

# Interface: SymbolInfo

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:48](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L48)

Represents an individual KiCad symbol with its metadata.
Contains information extracted from library symbol tables.

 SymbolInfo

## Example

```typescript
const symbol: SymbolInfo = {
  library: "4xxx",
  symbol: "14528",
  description: "Dual 4-bit latch, 3-state outputs",
  formattedName: "4xxx:14528"
};
```

## Properties

### description

> **description**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:56](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L56)

Description of the symbol's function or purpose

***

### formattedName

> **formattedName**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:59](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L59)

Formatted name in "library:symbol" format for display and search

***

### library

> **library**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:50](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L50)

Name of the library containing this symbol

***

### symbol

> **symbol**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:53](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L53)

Symbol name within the library
