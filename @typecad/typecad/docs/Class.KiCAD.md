[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / KiCAD

# Class: KiCAD

Defined in: [kicad.ts:12](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/kicad.ts#L12)

## Constructors

### Constructor

> **new KiCAD**(): `KiCAD`

Defined in: [kicad.ts:31](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/kicad.ts#L31)

#### Returns

`KiCAD`

## Methods

### detectFlatpakInstallation()

> **detectFlatpakInstallation**(): `boolean`

Defined in: [kicad.ts:93](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/kicad.ts#L93)

Detect if KiCAD is installed via flatpak

#### Returns

`boolean`

***

### getLibraryPaths()

> **getLibraryPaths**(): `object`

Defined in: [kicad.ts:144](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/kicad.ts#L144)

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

Defined in: [kicad.ts:137](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/kicad.ts#L137)

Check if current installation is flatpak

#### Returns

`boolean`
