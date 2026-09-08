[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / LibraryInfo

# Interface: LibraryInfo

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:22](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L22)

Represents metadata about a KiCad symbol library.
Contains information extracted from the main symbols page.

 LibraryInfo

## Example

```typescript
const library: LibraryInfo = {
  name: "4xxx",
  url: "https://kicad.github.io/symbols/4xxx",
  description: "4000 series CMOS logic ICs"
};
```

## Properties

### description?

> `optional` **description?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:30](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L30)

Optional description of the library contents

***

### name

> **name**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:24](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L24)

Library name (e.g., "4xxx", "Analog", "MCU_Microchip_ATtiny")

***

### url

> **url**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:27](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L27)

Full URL to the library's symbol page
