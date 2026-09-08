[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / exportPCB

# Function: exportPCB()

> **exportPCB**(`pcbPath`, `outputPath`, `format`, `options?`): `Promise`\<`string`\>

Defined in: [@typecad/pcb/src/kicad\_commands.ts:109](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad_commands.ts#L109)

Export PCB to various formats

## Parameters

### pcbPath

`string`

### outputPath

`string`

### format

`"gerber"` \| `"svg"` \| `"pdf"` \| `"step"` \| `"dxf"`

### options?

[`KiCADCommandOptions`](Interface.KiCADCommandOptions.md) = `{}`

## Returns

`Promise`\<`string`\>
