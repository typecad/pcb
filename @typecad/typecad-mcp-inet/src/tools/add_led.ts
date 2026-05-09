import { MCPServer } from '../server';

export function registerAddLedTool(server: MCPServer) {
  server.registerTool({
    name: 'add_led',
    description: 'Provides comprehensive instructions on how to add an LED component using the @typecad/passives package',
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
    if (name !== 'add_led') return;
    try {
      const size = args.size || '0603';
      const prompt = `# Adding an LED Component to typeCAD

## Overview
Light Emitting Diodes (LEDs) are semiconductor devices that emit light when current flows through them. In typeCAD, LEDs are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { LED } from '@typecad/passives/${size}';
\`\`\`

## Basic Usage
\`\`\`typescript
import { LED } from '@typecad/passives/${size}';

// Create a basic LED
let led = new LED({ 
  voltage: "3.3 V"
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { LED } from '@typecad/passives/${size}';

let led = new LED({ 
  voltage: "3.3 V",              // Forward voltage (required)
  datasheet: "https://example.com/datasheet.pdf",  // Link to datasheet
  description: "High brightness red LED for status indication", 
  mpn: "LITEON-LTST-C193KGKT",  // Manufacturer part number
  simulation: "led_model",       // ngspice simulation model
  uuid: "unique-identifier",     // Unique identifier (optional)
  pcb: "custom_layout_info"      // PCB layout information
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| voltage | string | Yes | Forward voltage | "1.8 V", "2.1 V", "3.3 V" |
| datasheet | string | No | Link to component datasheet | "https://example.com/datasheet.pdf" |
| description | string | No | Component description | "High brightness red LED" |
| mpn | string | No | Manufacturer part number | "LITEON-LTST-C193KGKT" |
| simulation | string | No | ngspice simulation model | "led_model" |
| uuid | string | No | Unique identifier | "unique-id" |
| pcb | string | No | PCB layout information | "custom_layout_info" |

## Available Sizes
- **1210**: 3.2mm × 2.5mm (highest brightness, up to 100mA)
- **1206**: 3.2mm × 1.6mm (high brightness, up to 50mA)
- **0805**: 2.0mm × 1.25mm (standard brightness, up to 30mA)
- **0603**: 1.6mm × 0.8mm (default, most common, up to 20mA)
- **0402**: 1.0mm × 0.5mm (compact, up to 10mA)
- **0201**: 0.6mm × 0.3mm (smallest, up to 5mA)

## Common LED Types and Colors

### Standard LEDs
\`\`\`typescript
// Red LED (most common, ~2.1V forward voltage)
let red_led = new LED({ voltage: "2.1 V" });

// Green LED (~2.1V forward voltage)
let green_led = new LED({ voltage: "2.1 V" });

// Blue LED (~3.3V forward voltage)
let blue_led = new LED({ voltage: "3.3 V" });

// White LED (~3.3V forward voltage)
let white_led = new LED({ voltage: "3.3 V" });
\`\`\`

### High Brightness LEDs
\`\`\`typescript
// High brightness red LED
let bright_red = new LED({ voltage: "2.1 V" });

// Power LED (higher current)
let power_led = new LED({ voltage: "3.3 V" });
\`\`\`

### Special Purpose LEDs
\`\`\`typescript
// Infrared LED
let ir_led = new LED({ voltage: "1.4 V" });

// UV LED
let uv_led = new LED({ voltage: "3.6 V" });
\`\`\`

## Connecting LEDs
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Basic LED connection with current limiting resistor
let current_resistor = new Resistor({ value: "330 Ω", wattage: "0.25 W" });

typecad.net(led.pin(1), current_resistor.pin(1));  // Anode
typecad.net(current_resistor.pin(2), power_supply.pin(1));
typecad.net(led.pin(2), ground.pin(1));            // Cathode

// Multiple LEDs in series
typecad.net(led1.pin(2), led2.pin(1));
typecad.net(led2.pin(2), led3.pin(1));
typecad.net(led3.pin(2), ground.pin(1));
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (D1, D2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Pin Orientation**: Pin 1 is the anode (positive), Pin 2 is the cathode (negative)

4. **Current Limiting**: LEDs require current limiting resistors to prevent damage

5. **Forward Voltage**: Different LED colors have different forward voltages:
   - Red/Green: ~2.1V
   - Blue/White: ~3.3V
   - Infrared: ~1.4V
   - UV: ~3.6V

6. **Current Rating**: Typical LED current is 10-20mA, but check datasheet for specific ratings

7. **Simulation**: The simulation property provides ngspice models for circuit simulation

8. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Always use current limiting resistors with LEDs
- Choose forward voltage based on LED color and datasheet
- Consider brightness requirements when selecting package size
- Use appropriate current ratings for your application
- Consider viewing angle for indicator applications
- For high-power LEDs, consider thermal management

## Current Limiting Resistor Calculation
\`\`\`typescript
// Example: 3.3V supply, 2.1V LED, 20mA current
// R = (V_supply - V_led) / I_led
// R = (3.3V - 2.1V) / 0.02A = 60Ω
// Use standard value: 68Ω

let led = new LED({ voltage: "2.1 V" });
let resistor = new Resistor({ value: "68 Ω", wattage: "0.25 W" });

// Power dissipation in resistor: P = I²R = (0.02A)² × 68Ω = 0.027W
// 0.25W resistor is sufficient
\`\`\`

## Common Applications

### Status Indicators
\`\`\`typescript
// Power indicator LED
let power_led = new LED({ voltage: "2.1 V" });
let power_resistor = new Resistor({ value: "1 kΩ", wattage: "0.25 W" });

// Activity indicator LED
let activity_led = new LED({ voltage: "2.1 V" });
let activity_resistor = new Resistor({ value: "330 Ω", wattage: "0.25 W" });
\`\`\`

### RGB LEDs
\`\`\`typescript
// RGB LED with separate current limiting resistors
let red_led = new LED({ voltage: "2.1 V" });
let green_led = new LED({ voltage: "2.1 V" });
let blue_led = new LED({ voltage: "3.3 V" });

let red_resistor = new Resistor({ value: "330 Ω", wattage: "0.25 W" });
let green_resistor = new Resistor({ value: "330 Ω", wattage: "0.25 W" });
let blue_resistor = new Resistor({ value: "150 Ω", wattage: "0.25 W" });
\`\`\`

## Error Handling
If you encounter issues:
1. Verify the size parameter is one of the supported values
2. Ensure voltage property is specified
3. Check that the import path matches your package structure
4. Use the 'validate_design' tool to check for connectivity issues
5. Verify current limiting resistors are properly sized
6. Check that forward voltage matches your power supply voltage`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}