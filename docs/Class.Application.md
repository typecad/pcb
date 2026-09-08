[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / Application

# Class: Application

Defined in: [@typecad/pcb/src/kicad-symbols/app/index.ts:37](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/app/index.ts#L37)

Main application class that orchestrates all components

The Application class serves as the central coordinator for the KiCad symbols search system.
It manages the initialization and coordination of all major components including data management,
parameter parsing, search engine, and command-line interface.

Key responsibilities:
- Initialize and configure all system components
- Manage data loading and caching
- Coordinate search operations
- Handle application lifecycle (startup, shutdown)
- Provide error handling and logging

 Application

## Example

```typescript
// Create and run application
const app = new Application();
await app.run(process.argv);

// Or use the convenience function
await runApplication(process.argv, {
  logLevel: LogLevel.INFO,
  cacheExpirationHours: 12
});
```

## Constructors

### Constructor

> **new Application**(`localCachePath?`, `cacheDir?`, `cacheExpirationHours?`, `programName?`, `useSharedCache?`): `Application`

Defined in: [@typecad/pcb/src/kicad-symbols/app/index.ts:52](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/app/index.ts#L52)

Creates a new Application instance

#### Parameters

##### localCachePath?

`string` = `'kicad-symbols-cache.json'`

Path to local cache file (ignored when using shared cache)

##### cacheDir?

`string` = `'.'`

Directory for cache files (ignored when using shared cache)

##### cacheExpirationHours?

`number` = `24`

Cache expiration time in hours

##### programName?

`string` = `'kicad-symbols'`

Name of the program for CLI

##### useSharedCache?

`boolean` = `true`

Whether to use shared temp directory for cache files (default: true)

#### Returns

`Application`

## Methods

### getDataManager()

> **getDataManager**(): `DataManager`

Defined in: [@typecad/pcb/src/kicad-symbols/app/index.ts:149](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/app/index.ts#L149)

#### Returns

`DataManager`

***

### getSearchEngine()

> **getSearchEngine**(): [`ComponentSearchEngine`](Class.ComponentSearchEngine.md)

Defined in: [@typecad/pcb/src/kicad-symbols/app/index.ts:130](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/app/index.ts#L130)

Gets the search engine instance

#### Returns

[`ComponentSearchEngine`](Class.ComponentSearchEngine.md)

The search engine instance

***

### run()

> **run**(`args`): `Promise`\<`void`\>

Defined in: [@typecad/pcb/src/kicad-symbols/app/index.ts:95](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/app/index.ts#L95)

Runs the application with the provided command-line arguments

#### Parameters

##### args

`string`[]

Command-line arguments (process.argv)

#### Returns

`Promise`\<`void`\>

Promise that resolves when the application completes

***

### shutdown()

> **shutdown**(): `Promise`\<`void`\>

Defined in: [@typecad/pcb/src/kicad-symbols/app/index.ts:112](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/app/index.ts#L112)

Performs cleanup operations before shutdown

#### Returns

`Promise`\<`void`\>
