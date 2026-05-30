# BOM

**type**CAD provides a built in BOM export function. 

## Bill-of-Material
**type**CAD can export a CSV file from a `Schematic` object.

```ts
import { Component, PCB, Power } from '@typecad/typecad';
let typecad = new PCB('bom');

// add components

typecad.create();
typecad.bom();
```

The output will be a `bom.csv` in the `./build` folder and will look something like this:

```csv
Reference,Value,Datasheet,Footprint,MPN
U1,,,lib:ESP32S3MINI1N8,C2913206
C3,22uF,,Capacitor_SMD:C_0603_1608Metric,
C4,0.1uF,,Capacitor_SMD:C_0603_1608Metric,
C6,1uF,,Capacitor_SMD:C_0603_1608Metric,
R2,10kΩ,,Resistor_SMD:R_0603_1608Metric,
C1,22uF,,Capacitor_SMD:C_0603_1608Metric,
C2,10uF,,Capacitor_SMD:C_0603_1608Metric,
VR1,,https://www.mouser.com/datasheet/2/698/REN_isl9120ir_DST_20050421-1998698.pdf,lib:QFN50P300X300X75-13N-D,ISL9120IRTNZ
L1,1uH,https://www.mouser.com/datasheet/2/281/1/J_E_TE243A_0011-2303275.pdf,lib:1285ASH1R0MP2,1285AS-H-1R0M=P2
BT1,,,Battery:BatteryHolder_Keystone_3008_1x2450,3008TR
```

Each field, `value`, `datasheet`, `footprint`, and `MPN` can all be set for each `Component` object.

## Extending BOM 
**type**CAD is entirely TypeScript, so you can extending or changing the function is simple. You'll want to look at how the BOM function is implemented in [schematic.ts](https://github.com/typecad/typecad/blob/1a63964eece0fc98053e426192e770c35577a14d/schematic.ts#L96).

This is the bulk of the function and is simple to change.

```ts
bom += 'Reference,Value,Datasheet,Footprint,MPN\n';
this.components.forEach(component => {
	bom += `${component.reference},${component.value},${component.datasheet},${component.footprint},${component.mpn}\n`;
});
```