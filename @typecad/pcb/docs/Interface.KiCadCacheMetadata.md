[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / KiCadCacheMetadata

# Interface: KiCadCacheMetadata

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:80](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L80)

Extended cache metadata specifically for KiCad symbol data.
Includes KiCad-specific information like the "Last updated" date from the website.

 KiCadCacheMetadata

## Example

```typescript
const metadata: KiCadCacheMetadata = {
  lastDownload: new Date('2024-01-15T10:30:00Z'),
  fileSize: 2048000,
  recordCount: 15000,
  lastUpdatedDate: new Date('2024-01-10T00:00:00Z'),
  libraryCount: 150,
  symbolCount: 15000
};
```

## Extends

- [`CacheMetadata`](Interface.CacheMetadata.md)

## Properties

### checksum?

> `optional` **checksum?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:294](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L294)

Optional checksum for cache integrity verification

#### Inherited from

[`CacheMetadata`](Interface.CacheMetadata.md).[`checksum`](Interface.CacheMetadata.md#checksum)

***

### fileSize

> **fileSize**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:288](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L288)

Size of the cached file in bytes

#### Inherited from

[`CacheMetadata`](Interface.CacheMetadata.md).[`fileSize`](Interface.CacheMetadata.md#filesize)

***

### lastDownload

> **lastDownload**: `Date`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:285](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L285)

Timestamp when the cache was last updated

#### Inherited from

[`CacheMetadata`](Interface.CacheMetadata.md).[`lastDownload`](Interface.CacheMetadata.md#lastdownload)

***

### lastUpdatedDate

> **lastUpdatedDate**: `Date`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:82](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L82)

Date extracted from "Last updated on [date]" text on the KiCad website

***

### libraryCount

> **libraryCount**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:85](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L85)

Number of symbol libraries processed

***

### recordCount

> **recordCount**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:291](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L291)

Number of component records in the cache

#### Inherited from

[`CacheMetadata`](Interface.CacheMetadata.md).[`recordCount`](Interface.CacheMetadata.md#recordcount)

***

### symbolCount

> **symbolCount**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/kicad.ts:88](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/kicad.ts#L88)

Total number of symbols across all libraries
