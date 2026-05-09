import { MCPServer } from '../server';

export function registerAddInductorTool(server: MCPServer) {
  server.registerTool({
    name: 'add_inductor',
    description: 'Provides comprehensive instructions on how to add an inductor component using the @typecad/passives package',
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
    if (name !== 'add_inductor') return;
    try {
      const size = args.size || '0603';
      const prompt = `# Adding an Inductor Component to typeCAD

## Overview
Inductors are passive electronic components that store energy in a magnetic field when current flows through them. They oppose changes in current and are used in filters, oscillators, and power supplies. In typeCAD, inductors are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { Inductor } from '@typecad/passives/${size}';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Inductor } from '@typecad/passives/${size}';

// Create a basic inductor
let inductor = new Inductor({ 
  value: "2.2 μH"
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Inductor } from '@typecad/passives/${size}';

let inductor = new Inductor({ 
  value: "2.2 μH",               // Inductance value (required)
  datasheet: "https://example.com/datasheet.pdf",  // Link to datasheet
  description: "High Q inductor for RF applications", 
  mpn: "LQW18AN2N2B00D",        // Manufacturer part number
  simulation: "inductor_model",  // ngspice simulation model
  uuid: "unique-identifier",     // Unique identifier (optional)
  pcb: "custom_layout_info"      // PCB layout information
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| value | string | Yes | Inductance value | "2.2 μH", "10 mH", "100 nH" |
| datasheet | string | No | Link to component datasheet | "https://example.com/datasheet.pdf" |
| description | string | No | Component description | "High Q inductor for RF applications" |
| mpn | string | No | Manufacturer part number | "LQW18AN2N2B00D" |
| simulation | string | No | ngspice simulation model | "inductor_model" |
| uuid | string | No | Unique identifier | "unique-id" |
| pcb | string | No | PCB layout information | "custom_layout_info" |

## Available Sizes
- **1210**: 3.2mm × 2.5mm (highest inductance range, up to 100μH)
- **1206**: 3.2mm × 1.6mm (high inductance range, up to 47μH)
- **0805**: 2.0mm × 1.25mm (standard inductance range, up to 22μH)
- **0603**: 1.6mm × 0.8mm (default, most common, up to 10μH)
- **0402**: 1.0mm × 0.5mm (compact, up to 4.7μH)
- **0201**: 0.6mm × 0.3mm (smallest, up to 2.2μH)

## Common Inductor Types and Applications

### RF Inductors
\`\`\`typescript
// High frequency applications
let rf_inductor = new Inductor({ value: "100 nH" });
let matching_inductor = new Inductor({ value: "220 nH" });

// Filter inductors
let filter_inductor = new Inductor({ value: "1 μH" });
let choke_inductor = new Inductor({ value: "10 μH" });
\`\`\`

### Power Inductors
\`\`\`typescript
// DC-DC converter inductors
let buck_inductor = new Inductor({ value: "22 μH" });
let boost_inductor = new Inductor({ value: "47 μH" });

// EMI suppression
let emi_inductor = new Inductor({ value: "100 μH" });
\`\`\`

### Signal Processing
\`\`\`typescript
// Audio applications
let audio_inductor = new Inductor({ value: "1 mH" });

// Oscillator circuits
let oscillator_inductor = new Inductor({ value: "2.2 μH" });
\`\`\`

## Connecting Inductors
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Basic inductor connection
typecad.net(inductor.pin(1), power_supply.pin(1));
typecad.net(inductor.pin(2), load.pin(1));

// Inductor in series with capacitor (LC filter)
typecad.net(inductor.pin(1), input.pin(1));
typecad.net(inductor.pin(2), capacitor.pin(1));
typecad.net(capacitor.pin(2), output.pin(1));

// Multiple inductors in series
typecad.net(inductor1.pin(2), inductor2.pin(1));
typecad.net(inductor2.pin(2), load.pin(1));
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (L1, L2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Pin Orientation**: Inductors are bidirectional - both pins are equivalent

4. **Value Format**: Use standard units (nH, μH, mH) with space between number and unit

5. **Current Rating**: Consider the saturation current rating for power applications

6. **Quality Factor (Q)**: Higher Q inductors have lower losses but may be more expensive

7. **Simulation**: The simulation property provides ngspice models for circuit simulation

8. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Choose inductance values based on your application requirements
- Consider current ratings for power applications
- Use appropriate package sizes for your inductance requirements
- Consider Q factor for RF and high-frequency applications
- For switching power supplies, consider saturation current
- Use shielded inductors to minimize EMI in sensitive circuits

## Common Applications

### LC Filters
\`\`\`typescript
// Low-pass filter
let filter_inductor = new Inductor({ value: "10 μH" });
let filter_capacitor = new Capacitor({ value: "100 nF", voltage: "16 V" });

// High-pass filter
let hp_inductor = new Inductor({ value: "1 μH" });
let hp_capacitor = new Capacitor({ value: "1 μF", voltage: "16 V" });
\`\`\`

### DC-DC Converters
\`\`\`typescript
// Buck converter inductor
let buck_inductor = new Inductor({ value: "22 μH" });

// Boost converter inductor
let boost_inductor = new Inductor({ value: "47 μH" });

// Flyback transformer (modeled as inductor)
let flyback_inductor = new Inductor({ value: "100 μH" });
\`\`\`

### RF Circuits
\`\`\`typescript
// Impedance matching
let matching_inductor = new Inductor({ value: "220 nH" });

// RF choke
let rf_choke = new Inductor({ value: "1 μH" });

// Oscillator tank circuit
let tank_inductor = new Inductor({ value: "2.2 μH" });
\`\`\`

## Inductor Selection Guidelines

### Value Selection
\`\`\`typescript
// For switching power supplies (Buck converter)
// L = (V_in - V_out) × V_out / (f_sw × I_ripple × V_in)
// Example: 12V to 5V, 500kHz, 100mA ripple
// L = (12V - 5V) × 5V / (500kHz × 0.1A × 12V) = 29μH
// Use standard value: 22μH or 33μH

let buck_inductor = new Inductor({ value: "22 μH" });
\`\`\`

### Package Size Selection
\`\`\`typescript
// Low inductance, high frequency: 0402 or 0603
let rf_inductor = new Inductor({ value: "100 nH" });

// Medium inductance, power applications: 0805 or 1206
let power_inductor = new Inductor({ value: "22 μH" });

// High inductance, low frequency: 1210
let audio_inductor = new Inductor({ value: "1 mH" });
\`\`\`

## Error Handling
If you encounter issues:
1. Verify the size parameter is one of the supported values
2. Ensure value property is specified
3. Check that the import path matches your package structure
4. Use the 'validate_design' tool to check for connectivity issues
5. Verify inductance values are appropriate for your application
6. Consider current ratings for power applications`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}