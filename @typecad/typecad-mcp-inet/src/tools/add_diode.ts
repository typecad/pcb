import { MCPServer } from '../server';

export function registerAddDiodeTool(server: MCPServer) {
  server.registerTool({
    name: 'add_diode',
    description: 'Provides comprehensive instructions on how to add a diode component using the @typecad/passives package',
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
    if (name !== 'add_diode') return;
    try {
      const size = args.size || '0603';
      const prompt = `# Adding a Diode Component to typeCAD

## Overview
Diodes are semiconductor devices that allow current to flow in one direction while blocking it in the opposite direction. In typeCAD, diodes are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { Diode } from '@typecad/passives/${size}';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Diode } from '@typecad/passives/${size}';

// Create a basic diode
let diode = new Diode({ 
  voltage: "100 V"
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Diode } from '@typecad/passives/${size}';

let diode = new Diode({ 
  voltage: "100 V",              // Reverse voltage rating (required)
  datasheet: "https://example.com/datasheet.pdf",  // Link to datasheet
  description: "High efficiency Schottky diode for power applications", 
  mpn: "BAT54S",                 // Manufacturer part number
  simulation: "diode_model",     // ngspice simulation model
  uuid: "unique-identifier",     // Unique identifier (optional)
  pcb: "custom_layout_info"      // PCB layout information
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| voltage | string | Yes | Reverse voltage rating | "100 V", "200 V", "400 V" |
| datasheet | string | No | Link to component datasheet | "https://example.com/datasheet.pdf" |
| description | string | No | Component description | "High efficiency Schottky diode" |
| mpn | string | No | Manufacturer part number | "BAT54S", "1N4007" |
| simulation | string | No | ngspice simulation model | "diode_model" |
| uuid | string | No | Unique identifier | "unique-id" |
| pcb | string | No | PCB layout information | "custom_layout_info" |

## Available Sizes
- **1210**: 3.2mm × 2.5mm (highest power handling, up to 1A)
- **1206**: 3.2mm × 1.6mm (high power handling, up to 500mA)
- **0805**: 2.0mm × 1.25mm (standard power handling, up to 200mA)
- **0603**: 1.6mm × 0.8mm (default, most common, up to 150mA)
- **0402**: 1.0mm × 0.5mm (compact, up to 100mA)
- **0201**: 0.6mm × 0.3mm (smallest, up to 50mA)

## Common Diode Types and Applications

### Signal Diodes
\`\`\`typescript
// General purpose signal diodes
let signal_diode = new Diode({ voltage: "75 V" });
let protection_diode = new Diode({ voltage: "100 V" });

// Logic level protection
let logic_diode = new Diode({ voltage: "30 V" });
\`\`\`

### Power Diodes
\`\`\`typescript
// Rectifier diodes
let rectifier = new Diode({ voltage: "400 V" });
let bridge_diode = new Diode({ voltage: "600 V" });

// Schottky diodes (lower forward voltage)
let schottky = new Diode({ voltage: "40 V" });
let power_schottky = new Diode({ voltage: "100 V" });
\`\`\`

### Special Purpose Diodes
\`\`\`typescript
// Zener diodes (voltage regulation)
let zener = new Diode({ voltage: "5.1 V" });
let zener_12v = new Diode({ voltage: "12 V" });

// TVS diodes (transient protection)
let tvs = new Diode({ voltage: "24 V" });
\`\`\`

## Connecting Diodes
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Basic diode connection (anode to positive, cathode to negative)
typecad.net(diode.pin(1), positive_supply.pin(1));  // Anode
typecad.net(diode.pin(2), negative_supply.pin(1));  // Cathode

// Protection diode across inductive load
typecad.net(protection.pin(1), load.pin(1));
typecad.net(protection.pin(2), load.pin(2));

// Rectifier bridge configuration
typecad.net(bridge1.pin(1), ac_input.pin(1));
typecad.net(bridge1.pin(2), bridge2.pin(1));
typecad.net(bridge2.pin(2), ac_input.pin(2));
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (D1, D2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Pin Orientation**: Pin 1 is typically the anode (positive), Pin 2 is the cathode (negative)

4. **Voltage Rating**: Choose reverse voltage rating higher than your circuit's maximum reverse voltage

5. **Current Rating**: Consider the forward current rating based on package size and application

6. **Forward Voltage**: Different diode types have different forward voltage drops:
   - Silicon diodes: ~0.7V
   - Schottky diodes: ~0.3V
   - Germanium diodes: ~0.3V

7. **Simulation**: The simulation property provides ngspice models for circuit simulation

8. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Use Schottky diodes for low-voltage applications where efficiency matters
- Choose voltage ratings at least 2x your circuit's maximum reverse voltage
- Consider reverse recovery time for high-frequency switching applications
- Use appropriate package sizes for your current requirements
- For protection circuits, ensure the diode can handle the expected transient energy
- Consider temperature effects on forward voltage and reverse leakage

## Common Applications

### Protection Circuits
\`\`\`typescript
// Reverse polarity protection
let protection = new Diode({ voltage: "100 V" });
typecad.net(protection.pin(1), power_input.pin(1));
typecad.net(protection.pin(2), power_input.pin(2));

// Inductive load protection (flyback diode)
let flyback = new Diode({ voltage: "50 V" });
typecad.net(flyback.pin(1), relay.pin(1));
typecad.net(flyback.pin(2), relay.pin(2));
\`\`\`

### Rectification
\`\`\`typescript
// Half-wave rectifier
let rectifier = new Diode({ voltage: "400 V" });
typecad.net(rectifier.pin(1), transformer.pin(1));
typecad.net(rectifier.pin(2), load.pin(1));
\`\`\`

## Error Handling
If you encounter issues:
1. Verify the size parameter is one of the supported values
2. Ensure voltage property is specified
3. Check that the import path matches your package structure
4. Use the 'validate_design' tool to check for connectivity issues
5. Verify voltage and current ratings are sufficient for your application`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}