[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / JsonErrorResponse

# Interface: JsonErrorResponse

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:394](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L394)

Structured error response for JSON output mode.
Provides consistent error formatting when JSON format is selected.

 JsonErrorResponse

## Example

```typescript
const errorResponse: JsonErrorResponse = {
  error: true,
  message: "No search query provided",
  code: "MISSING_QUERY"
};
```

## Properties

### code?

> `optional` **code?**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:402](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L402)

Optional error code for programmatic handling

***

### error

> **error**: `true`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:396](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L396)

Always true to indicate this is an error response

***

### message

> **message**: `string`

Defined in: [@typecad/pcb/src/kicad-symbols/types/index.ts:399](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/types/index.ts#L399)

Human-readable error message
