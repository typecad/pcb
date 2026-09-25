[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / KiCAD

# Class: KiCAD

Defined in: [@typecad/pcb/src/kicad.ts:30](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L30)

## Constructors

### Constructor

> **new KiCAD**(): `KiCAD`

Defined in: [@typecad/pcb/src/kicad.ts:44](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L44)

#### Returns

`KiCAD`

## Accessors

### cliPath

#### Get Signature

> **get** `static` **cliPath**(): `string` \| `undefined`

Defined in: [@typecad/pcb/src/kicad.ts:169](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L169)

Detected kicad-cli executable path.

##### Returns

`string` \| `undefined`

***

### instance

#### Get Signature

> **get** `static` **instance**(): `KiCAD`

Defined in: [@typecad/pcb/src/kicad.ts:37](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L37)

##### Returns

`KiCAD`

***

### isFlatpak

#### Get Signature

> **get** `static` **isFlatpak**(): `boolean`

Defined in: [@typecad/pcb/src/kicad.ts:175](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L175)

Whether the detected installation is a Flatpak.

##### Returns

`boolean`

***

### path

#### Get Signature

> **get** `static` **path**(): `string` \| `undefined`

Defined in: [@typecad/pcb/src/kicad.ts:163](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L163)

Detected KiCAD installation path.

##### Returns

`string` \| `undefined`

## Methods

### getLibraryPaths()

> **getLibraryPaths**(): `object`

Defined in: [@typecad/pcb/src/kicad.ts:184](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L184)

#### Returns

`object`

##### footprints

> **footprints**: `string`

##### symbols

> **symbols**: `string`

***

### getSymbolsPath()

> **getSymbolsPath**(): `string` \| `undefined`

Defined in: [@typecad/pcb/src/kicad.ts:218](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L218)

#### Returns

`string` \| `undefined`

***

### hasLocalSymbols()

> **hasLocalSymbols**(): `Promise`\<`boolean`\>

Defined in: [@typecad/pcb/src/kicad.ts:226](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L226)

#### Returns

`Promise`\<`boolean`\>

***

### isFlatpakInstallation()

> **isFlatpakInstallation**(): `boolean`

Defined in: [@typecad/pcb/src/kicad.ts:180](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad.ts#L180)

#### Returns

`boolean`
