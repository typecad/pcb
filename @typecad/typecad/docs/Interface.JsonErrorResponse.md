[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / JsonErrorResponse

# Interface: JsonErrorResponse

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:388

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

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:396

Optional error code for programmatic handling

***

### error

> **error**: `true`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:390

Always true to indicate this is an error response

***

### message

> **message**: `string`

Defined in: @typecad/typecad/src/kicad-symbols/types/index.ts:393

Human-readable error message
