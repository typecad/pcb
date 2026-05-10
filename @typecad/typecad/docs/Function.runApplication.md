[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / runApplication

# Function: runApplication()

> **runApplication**(`args`, `options?`): `Promise`\<`void`\>

Defined in: @typecad/typecad/src/kicad-symbols/app/index.ts:160

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
