import { MCPServer } from '../server';

export function registerAddCapacitorTool(server: MCPServer) {
  server.registerTool({
    name: 'add_capacitor',
    description: 'Provides comprehensive instructions on how to add a capacitor component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {
        size: {
          type: 'string',
          description: 'Component size (default: 0603). Available sizes: 1210, 1206, 0805, 0603, 0402, 0201',
          enum: ['1210', '1206', '0805', '0603', '0402', '0201']
        }
      },
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_capacitor') return;
    try {
      const size = args.size || '0603';
      const prompt = `# Adding a Capacitor Component to typeCAD

## Overview
Capacitors are passive electronic components that store electrical energy in an electric field. In typeCAD, capacitors are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { Capacitor } from '@typecad/passives/${size}';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Capacitor } from '@typecad/passives/${size}';

// Create a basic capacitor
let capacitor = new Capacitor({ 
  value: "100 nF", 
  voltage: "6 V"
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Capacitor } from '@typecad/passives/${size}';

let capacitor = new Capacitor({ 
  value: "100 nF",           // Capacitance value (required)
  voltage: "6 V",            // Voltage rating (required)
  datasheet: "https://example.com/datasheet.pdf",  // Link to datasheet
  description: "High voltage ceramic capacitor for power filtering", 
  mpn: "C0603C104K5RACTU",   // Manufacturer part number
  simulation: "capacitor_model",  // ngspice simulation model
  uuid: "unique-identifier", // Unique identifier (optional)
  pcb: "custom_layout_info"  // PCB layout information
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| value | string | Yes | Capacitance value | "100 nF", "1 μF", "10 pF" |
| voltage | string | Yes | Voltage rating | "6 V", "16 V", "50 V" |
| datasheet | string | No | Link to component datasheet | "https://example.com/datasheet.pdf" |
| description | string | No | Component description | "High voltage ceramic capacitor" |
| mpn | string | No | Manufacturer part number | "C0603C104K5RACTU" |
| simulation | string | No | ngspice simulation model | "capacitor_model" |
| uuid | string | No | Unique identifier | "unique-id" |
| pcb | string | No | PCB layout information | "custom_layout_info" |

## Available Sizes
- **1210**: 3.2mm × 2.5mm (largest, highest power handling)
- **1206**: 3.2mm × 1.6mm (high power handling)
- **0805**: 2.0mm × 1.25mm (standard power handling)
- **0603**: 1.6mm × 0.8mm (default, most common)
- **0402**: 1.0mm × 0.5mm (compact, lower power)
- **0201**: 0.6mm × 0.3mm (smallest, lowest power)

## Common Capacitor Types and Values

### Ceramic Capacitors
\`\`\`typescript
// Decoupling capacitors
let decoupling = new Capacitor({ value: "100 nF", voltage: "6 V" });
let bulk = new Capacitor({ value: "10 μF", voltage: "16 V" });
\`\`\`

### Electrolytic Capacitors
\`\`\`typescript
// Power supply filtering
let filter = new Capacitor({ value: "100 μF", voltage: "25 V" });
let bulk = new Capacitor({ value: "1000 μF", voltage: "16 V" });
\`\`\`

## Connecting Capacitors
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Connect capacitor between two points
typecad.net(capacitor.pin(1), power_supply.pin(1));
typecad.net(capacitor.pin(2), ground.pin(1));

// Connect in series
typecad.net(cap1.pin(2), cap2.pin(1));
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (C1, C2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Value Format**: Use standard units (pF, nF, μF, mF) with space between number and unit

4. **Voltage Rating**: Always specify a voltage rating higher than your circuit's maximum voltage

5. **Simulation**: The simulation property provides ngspice models for circuit simulation

6. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Use ceramic capacitors for decoupling and high-frequency applications
- Use electrolytic capacitors for bulk filtering and energy storage
- Choose voltage ratings at least 2x your circuit voltage
- Consider temperature coefficients for precision applications
- Use appropriate package sizes for your power requirements

## Error Handling
If you encounter issues:
1. Verify the size parameter is one of the supported values
2. Ensure value and voltage properties are specified
3. Check that the import path matches your package structure
4. Use the 'validate_design' tool to check for connectivity issues`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}