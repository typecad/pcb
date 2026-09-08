[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / runApplication

# Function: runApplication()

> **runApplication**(`args`, `options?`): `Promise`\<`void`\>

Defined in: [@typecad/pcb/src/kicad-symbols/app/index.ts:160](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/app/index.ts#L160)

Creates and runs the application

## Parameters

### args

`string`[]

Command-line arguments (process.argv)

### options?

Application options

#### cacheDir?

`string`

#### cacheExpirationHours?

`number`

#### localCachePath?

`string`

#### programName?

`string`

#### useSharedCache?

`boolean`

## Returns

`Promise`\<`void`\>

Promise that resolves when the application completes
