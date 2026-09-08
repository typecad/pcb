[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / KiCAD

# Class: KiCAD

Defined in: [kicad.ts:12](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/kicad.ts#L12)

## Constructors

### Constructor

> **new KiCAD**(): `KiCAD`

Defined in: [kicad.ts:24](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/kicad.ts#L24)

#### Returns

`KiCAD`

## Methods

### detectFlatpakInstallation()

> **detectFlatpakInstallation**(): `boolean`

Defined in: [kicad.ts:83](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/kicad.ts#L83)

Detect if KiCAD is installed via flatpak

#### Returns

`boolean`

***

### getLibraryPaths()

> **getLibraryPaths**(): `object`

Defined in: [kicad.ts:118](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/kicad.ts#L118)

Get library paths based on installation type

#### Returns

`object`

##### footprints

> **footprints**: `string`

##### symbols

> **symbols**: `string`

***

### isFlatpakInstallation()

> **isFlatpakInstallation**(): `boolean`

Defined in: [kicad.ts:111](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/kicad.ts#L111)

Check if current installation is flatpak

#### Returns

`boolean`
