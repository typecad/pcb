[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / LibraryInfo

# Interface: LibraryInfo

Defined in: @typecad/typecad/src/kicad-symbols/types/kicad.ts:22

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

Defined in: @typecad/typecad/src/kicad-symbols/types/kicad.ts:30

Optional description of the library contents

***

### name

> **name**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/kicad.ts:24

Library name (e.g., "4xxx", "Analog", "MCU_Microchip_ATtiny")

***

### url

> **url**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/kicad.ts:27

Full URL to the library's symbol page
