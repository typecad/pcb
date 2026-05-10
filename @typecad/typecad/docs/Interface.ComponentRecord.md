[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / ComponentRecord

# Interface: ComponentRecord

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:24

Represents a complete component record from the database.
Contains all available information about an electronic component including
identification, specifications, availability, and pricing.

For KiCad symbols, this contains mapped symbol data in compatible format.

 ComponentRecord

## Example

```typescript
// KiCad symbol example
const kicadSymbol: ComponentRecord = {
  lcsc: "4xxx:14528",
  category: "4xxx",
  description: "Dual 4-bit latch, 3-state outputs",
  manufacturer: "KiCad",
  package: "Symbol",
  // ... other fields with default values
};
```

## Properties

### assembly\_process

> **assembly\_process**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:74

Assembly process type (e.g., "SMT", "THT")

***

### attrition\_qty

> **attrition\_qty**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:80

Attrition quantity for assembly as string

***

### basic

> **basic**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:50

Basic part flag ("0" or "1") - indicates if part is in basic library

***

### category

> **category**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:32

Main component category (e.g., "Resistors", "Capacitors")

***

### category\_id

> **category\_id**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:29

Internal category ID for component classification

***

### datasheet

> **datasheet**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:59

URL to component datasheet

***

### description

> **description**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:56

Full component description with specifications

***

### extra

> **extra**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:71

Additional component data as JSON string

***

### joints

> **joints**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:44

Number of pins/joints as string

***

### last\_on\_stock

> **last\_on\_stock**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:65

Timestamp of last stock update

***

### lcsc

> **lcsc**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:26

Component identifier (KiCad: "library:symbol")

***

### manufacturer

> **manufacturer**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:47

Manufacturer company name

***

### mfr

> **mfr**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:38

Manufacturer part number

***

### min\_order\_qty

> **min\_order\_qty**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:77

Minimum order quantity as string

***

### package

> **package**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:41

Component package type (e.g., "0603", "SOT-23")

***

### preferred

> **preferred**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:53

Preferred part flag ("0" or "1") - indicates if part is preferred for assembly

***

### price

> **price**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:68

Pricing information as JSON string

***

### stock

> **stock**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:62

Current stock quantity as string

***

### subcategory

> **subcategory**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:35

Detailed subcategory (e.g., "Chip Resistor - Surface Mount")
