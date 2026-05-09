import { MCPServer } from '../server';

export function registerAddFuseTool(server: MCPServer) {
  server.registerTool({
    name: 'add_fuse',
    description: 'Provides comprehensive instructions on how to add a fuse component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {
        size: {
          type: 'string',
          description: 'Component size (default: 0603). Available sizes: 1210, 1206, 0805, 0603, 0402 (Note: 0201 size does not have fuses)',
          enum: ['1210', '1206', '0805', '0603', '0402']
        }
      },
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_fuse') return;
    try {
      const size = args.size || '0603';
      const prompt = `# Adding a Fuse Component to typeCAD

## Overview
Fuses are safety devices that protect circuits from overcurrent conditions by breaking the circuit when current exceeds a specified threshold. In typeCAD, fuses are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { Fuse } from '@typecad/passives/${size}';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Fuse } from '@typecad/passives/${size}';

// Create a basic fuse
let fuse = new Fuse({ 
  voltage: "100 V"
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Fuse } from '@typecad/passives/${size}';

let fuse = new Fuse({ 
  voltage: "100 V",              // Voltage rating (required)
  datasheet: "https://example.com/datasheet.pdf",  // Link to datasheet
  description: "Fast-acting fuse for power supply protection", 
  mpn: "0451005.MR",            // Manufacturer part number
  simulation: "fuse_model",     // ngspice simulation model
  uuid: "unique-identifier",     // Unique identifier (optional)
  pcb: "custom_layout_info"      // PCB layout information
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| voltage | string | Yes | Voltage rating | "100 V", "250 V", "500 V" |
| datasheet | string | No | Link to component datasheet | "https://example.com/datasheet.pdf" |
| description | string | No | Component description | "Fast-acting fuse for power supply protection" |
| mpn | string | No | Manufacturer part number | "0451005.MR", "F1206H250V-1A" |
| simulation | string | No | ngspice simulation model | "fuse_model" |
| uuid | string | No | Unique identifier | "unique-id" |
| pcb | string | No | PCB layout information | "custom_layout_info" |

## Available Sizes
- **1210**: 3.2mm × 2.5mm (highest current rating, up to 10A)
- **1206**: 3.2mm × 1.6mm (high current rating, up to 5A)
- **0805**: 2.0mm × 1.25mm (standard current rating, up to 2A)
- **0603**: 1.6mm × 0.8mm (default, most common, up to 1A)
- **0402**: 1.0mm × 0.5mm (compact, up to 500mA)
- **Note**: 0201 size does not have fuse components

## Common Fuse Types and Applications

### Fast-Acting Fuses
\`\`\`typescript
// General purpose protection
let fast_fuse = new Fuse({ voltage: "100 V" });

// Power supply protection
let power_fuse = new Fuse({ voltage: "250 V" });

// Low voltage protection
let low_voltage_fuse = new Fuse({ voltage: "32 V" });
\`\`\`

### High Current Fuses
\`\`\`typescript
// High power applications
let high_current_fuse = new Fuse({ voltage: "500 V" });

// Motor protection
let motor_fuse = new Fuse({ voltage: "250 V" });
\`\`\`

### Special Purpose Fuses
\`\`\`typescript
// Automotive applications
let automotive_fuse = new Fuse({ voltage: "32 V" });

// Telecommunications
let telecom_fuse = new Fuse({ voltage: "125 V" });
\`\`\`

## Connecting Fuses
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Basic fuse connection in series with power supply
typecad.net(fuse.pin(1), power_input.pin(1));  // Input side
typecad.net(fuse.pin(2), load.pin(1));         // Output side

// Multiple fuses for different circuit branches
typecad.net(fuse1.pin(1), main_power.pin(1));
typecad.net(fuse1.pin(2), branch1.pin(1));

typecad.net(fuse2.pin(1), main_power.pin(1));
typecad.net(fuse2.pin(2), branch2.pin(1));
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (F1, F2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Pin Orientation**: Fuses are bidirectional - both pins are equivalent

4. **Voltage Rating**: Choose voltage rating higher than your circuit's maximum voltage

5. **Current Rating**: Fuse current ratings are typically specified in the description or datasheet

6. **Fuse Types**: Different fuse types have different characteristics:
   - Fast-acting: Quick response to overcurrent
   - Slow-blow: Tolerates brief overcurrent conditions
   - Resettable: Automatically resets after cooling

7. **Simulation**: The simulation property provides ngspice models for circuit simulation

8. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Choose voltage ratings at least 2x your circuit's maximum voltage
- Consider the type of load being protected when selecting fuse characteristics
- Use appropriate package sizes for your current requirements
- Consider ambient temperature effects on fuse ratings
- For critical applications, use fuses with known characteristics
- Consider using resettable fuses for applications where automatic recovery is desired

## Fuse Selection Guidelines

### Current Rating Selection
\`\`\`typescript
// Example: 5V supply, 500mA load
// Choose fuse rating slightly higher than normal current
// Use 750mA or 1A fuse for 500mA load

let power_fuse = new Fuse({ voltage: "32 V" });
// Current rating would be specified in description or datasheet
\`\`\`

### Voltage Rating Selection
\`\`\`typescript
// For 12V automotive circuit
let automotive_fuse = new Fuse({ voltage: "32 V" });

// For 120V AC circuit
let ac_fuse = new Fuse({ voltage: "250 V" });

// For 5V digital circuit
let digital_fuse = new Fuse({ voltage: "32 V" });
\`\`\`

## Common Applications

### Power Supply Protection
\`\`\`typescript
// Main power input protection
let main_fuse = new Fuse({ voltage: "250 V" });
typecad.net(main_fuse.pin(1), ac_input.pin(1));
typecad.net(main_fuse.pin(2), power_supply.pin(1));

// Secondary protection
let secondary_fuse = new Fuse({ voltage: "32 V" });
typecad.net(secondary_fuse.pin(1), power_supply.pin(2));
typecad.net(secondary_fuse.pin(2), load.pin(1));
\`\`\`

### Circuit Branch Protection
\`\`\`typescript
// Protect different circuit sections
let motor_fuse = new Fuse({ voltage: "32 V" });
let logic_fuse = new Fuse({ voltage: "32 V" });
let sensor_fuse = new Fuse({ voltage: "32 V" });

// Connect each fuse to its respective branch
typecad.net(motor_fuse.pin(1), power_bus.pin(1));
typecad.net(motor_fuse.pin(2), motor_circuit.pin(1));
\`\`\`

## Error Handling
If you encounter issues:
1. Verify the size parameter is one of the supported values (0201 not supported)
2. Ensure voltage property is specified
3. Check that the import path matches your package structure
4. Use the 'validate_design' tool to check for connectivity issues
5. Verify voltage ratings are sufficient for your application
6. Consider current ratings and fuse characteristics for your specific use case`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}