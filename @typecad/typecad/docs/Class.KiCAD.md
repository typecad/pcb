[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / KiCAD

# Class: KiCAD

Defined in: @typecad/typecad/src/kicad.ts:142

## Constructors

### Constructor

> **new KiCAD**(): `KiCAD`

Defined in: @typecad/typecad/src/kicad.ts:143

#### Returns

`KiCAD`

## Accessors

### cliPath

#### Get Signature

> **get** `static` **cliPath**(): `string`

Defined in: @typecad/typecad/src/kicad.ts:159

Detected kicad-cli executable path.

##### Returns

`string`

***

### isFlatpak

#### Get Signature

> **get** `static` **isFlatpak**(): `boolean`

Defined in: @typecad/typecad/src/kicad.ts:165

Whether the detected installation is a Flatpak.

##### Returns

`boolean`

***

### path

#### Get Signature

> **get** `static` **path**(): `string`

Defined in: @typecad/typecad/src/kicad.ts:153

Detected KiCAD installation path.

##### Returns

`string`

## Methods

### getLibraryPaths()

> **getLibraryPaths**(): `object`

Defined in: @typecad/typecad/src/kicad.ts:174

#### Returns

`object`

##### footprints

> **footprints**: `string`

##### symbols

> **symbols**: `string`

***

### getSymbolsPath()

> **getSymbolsPath**(): `string`

Defined in: @typecad/typecad/src/kicad.ts:209

#### Returns

`string`

***

### hasLocalSymbols()

> **hasLocalSymbols**(): `Promise`\<`boolean`\>

Defined in: @typecad/typecad/src/kicad.ts:217

#### Returns

`Promise`\<`boolean`\>

***

### isFlatpakInstallation()

> **isFlatpakInstallation**(): `boolean`

Defined in: @typecad/typecad/src/kicad.ts:170

#### Returns

`boolean`
