import { MCPServer } from '../server';

export function registerAddResistorTool(server: MCPServer) {
    server.registerTool({
        name: 'add_resistor',
        description: 'Provides comprehensive instructions on how to add a resistor component using the @typecad/passives package',
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
        if (name !== 'add_resistor') return;
        try {
            const size = args.size || '0603';
            const prompt = `# Adding a Resistor Component to typeCAD

## Overview
Resistors are passive electronic components that limit current flow and create voltage drops in circuits. In typeCAD, resistors are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { Resistor } from '@typecad/passives/${size}';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Resistor } from '@typecad/passives/${size}';

// Create a basic resistor
let resistor = new Resistor({ 
  value: "4.7 kΩ", 
  wattage: "0.25 W"
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Resistor } from '@typecad/passives/${size}';

let resistor = new Resistor({ 
  value: "4.7 kΩ",              // Resistance value (required)
  wattage: "0.25 W",            // Power rating (required)
  voltage: "100 V",             // Voltage rating
  datasheet: "https://example.com/datasheet.pdf",  // Link to datasheet
  description: "High precision 1% tolerance resistor", 
  mpn: "CRCW06034K70FKEA",      // Manufacturer part number
  simulation: "resistor_model",  // ngspice simulation model
  uuid: "unique-identifier",    // Unique identifier (optional)
  pcb: "custom_layout_info"     // PCB layout information
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| value | string | Yes | Resistance value | "4.7 kΩ", "100 Ω", "1 MΩ" |
| wattage | string | Yes | Power rating | "0.25 W", "0.5 W", "1 W" |
| voltage | string | No | Voltage rating | "100 V", "200 V", "500 V" |
| datasheet | string | No | Link to component datasheet | "https://example.com/datasheet.pdf" |
| description | string | No | Component description | "High precision 1% tolerance resistor" |
| mpn | string | No | Manufacturer part number | "CRCW06034K70FKEA" |
| simulation | string | No | ngspice simulation model | "resistor_model" |
| uuid | string | No | Unique identifier | "unique-id" |
| pcb | string | No | PCB layout information | "custom_layout_info" |

## Available Sizes
- **1210**: 3.2mm × 2.5mm (highest power handling, up to 1W)
- **1206**: 3.2mm × 1.6mm (high power handling, up to 0.5W)
- **0805**: 2.0mm × 1.25mm (standard power handling, up to 0.25W)
- **0603**: 1.6mm × 0.8mm (default, most common, up to 0.25W)
- **0402**: 1.0mm × 0.5mm (compact, up to 0.125W)
- **0201**: 0.6mm × 0.3mm (smallest, up to 0.05W)

## Common Resistor Values and Applications

### Standard Values (E24 Series)
\`\`\`typescript
// Common pull-up/pull-down resistors
let pullup = new Resistor({ value: "10 kΩ", wattage: "0.25 W" });
let pulldown = new Resistor({ value: "100 kΩ", wattage: "0.25 W" });

// Current limiting resistors
let led_current = new Resistor({ value: "330 Ω", wattage: "0.25 W" });
let bias = new Resistor({ value: "1 kΩ", wattage: "0.25 W" });

// Voltage dividers
let divider1 = new Resistor({ value: "10 kΩ", wattage: "0.25 W" });
let divider2 = new Resistor({ value: "10 kΩ", wattage: "0.25 W" });
\`\`\`

### Power Resistors
\`\`\`typescript
// High power applications
let power_resistor = new Resistor({ value: "0.1 Ω", wattage: "2 W" });
let sense_resistor = new Resistor({ value: "0.01 Ω", wattage: "1 W" });
\`\`\`

## Connecting Resistors
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Connect resistor in series
typecad.net(resistor.pin(1), power_supply.pin(1));
typecad.net(resistor.pin(2), load.pin(1));

// Connect as pull-up resistor
typecad.net(pullup.pin(1), vcc.pin(1));
typecad.net(pullup.pin(2), signal.pin(1));

// Connect in voltage divider
typecad.net(divider1.pin(1), input.pin(1));
typecad.net(divider1.pin(2), divider2.pin(1));
typecad.net(divider2.pin(2), ground.pin(1));
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (R1, R2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Value Format**: Use standard units (Ω, kΩ, MΩ) with space between number and unit

4. **Power Rating**: Choose wattage rating higher than calculated power dissipation (P = I²R or P = V²/R)

5. **Tolerance**: Standard resistors are typically 5% tolerance unless specified otherwise

6. **Simulation**: The simulation property provides ngspice models for circuit simulation

7. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Use standard E24 series values when possible
- Choose power ratings at least 2x calculated dissipation
- Consider temperature coefficients for precision applications
- Use appropriate package sizes for your power requirements
- For current sensing, use low-value resistors with high precision
- For voltage dividers, use resistors with similar values for better accuracy

## Power Calculation Examples
\`\`\`typescript
// Calculate power dissipation for current limiting resistor
// LED with 2V forward voltage, 3.3V supply, 20mA current
// R = (3.3V - 2V) / 0.02A = 65Ω
// P = I²R = (0.02A)² × 65Ω = 0.026W (use 0.25W resistor)

let led_resistor = new Resistor({ value: "68 Ω", wattage: "0.25 W" });
\`\`\`

## Error Handling
If you encounter issues:
1. Verify the size parameter is one of the supported values
2. Ensure value and wattage properties are specified
3. Check that the import path matches your package structure
4. Use the 'validate_design' tool to check for connectivity issues
5. Verify power ratings are sufficient for your application`;
            resolve(prompt);
        } catch (error) {
            reject(error);
        }
    });
}