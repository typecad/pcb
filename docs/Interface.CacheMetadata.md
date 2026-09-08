[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / CacheMetadata

# Interface: CacheMetadata

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:283](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L283)

Metadata about cached component database files.
Used for cache validation and management.

 CacheMetadata

## Example

```typescript
const metadata: CacheMetadata = {
  lastDownload: new Date('2024-01-15T10:30:00Z'),
  fileSize: 52428800, // ~50MB
  recordCount: 500000,
  checksum: "sha256:abc123..."
};
```

## Extended by

- [`KiCadCacheMetadata`](Interface.KiCadCacheMetadata.md)

## Properties

### checksum?

> `optional` **checksum?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:294](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L294)

Optional checksum for cache integrity verification

***

### fileSize

> **fileSize**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:288](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L288)

Size of the cached file in bytes

***

### lastDownload

> **lastDownload**: `Date`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:285](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L285)

Timestamp when the cache was last updated

***

### recordCount

> **recordCount**: `number`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:291](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L291)

Number of component records in the cache
