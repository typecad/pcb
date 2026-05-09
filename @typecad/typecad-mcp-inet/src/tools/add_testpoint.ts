import { MCPServer } from '../server';

export function registerAddTestpointTool(server: MCPServer) {
  server.registerTool({
    name: 'add_testpoint',
    description: 'Provides comprehensive instructions on how to add a testpoint component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_testpoint') return;
    try {
      const prompt = `# Adding a Testpoint Component to typeCAD

## Overview
Testpoints are PCB features that provide convenient access points for testing, debugging, and programming circuits. They allow easy connection of oscilloscope probes, multimeter leads, or programming cables. In typeCAD, testpoints are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { Testpoint } from '@typecad/passives/testpoint';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Testpoint } from '@typecad/passives/testpoint';

// Create a basic testpoint
let testpoint = new Testpoint();
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Testpoint } from '@typecad/passives/testpoint';

let testpoint = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Keystone_5015_Micro_Mini"  // Custom footprint
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| footprint | string | No | Custom footprint specification | "TestPoint:TestPoint_Keystone_5015_Micro_Mini" |

## Common Testpoint Types and Applications

### Standard Testpoints
\`\`\`typescript
// Default testpoint (1.0mm pad)
let standard_tp = new Testpoint();

// Large testpoint for easy probing
let large_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Pad_D2.0mm"
});

// Small testpoint for dense layouts
let small_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Pad_D0.8mm"
});
\`\`\`

### Spring-Loaded Testpoints
\`\`\`typescript
// Keystone spring-loaded testpoint
let spring_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Keystone_5015_Micro_Mini"
});

// Pogo pin testpoint
let pogo_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Pogo_Pin"
});
\`\`\`

### Specialized Testpoints
\`\`\`typescript
// Edge connector testpoint
let edge_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Edge_Connector"
});

// Through-hole testpoint
let th_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_ThroughHole"
});
\`\`\`

## Connecting Testpoints
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Connect testpoint to a signal
typecad.net(testpoint.pin(1), signal.pin(1));

// Connect testpoint to power rail
typecad.net(vcc_tp.pin(1), vcc.pin(1));

// Connect testpoint to ground
typecad.net(gnd_tp.pin(1), ground.pin(1));

// Connect testpoint to component pin
typecad.net(debug_tp.pin(1), microcontroller.pin(15));
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (TP1, TP2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Pin Access**: Testpoints have a single pin accessible via testpoint.pin(1)

4. **Default Footprint**: If no footprint is specified, TestPoint:TestPoint_Pad_D1.0mm is used

5. **Footprint Format**: Footprints follow the KiCad library:footprint format

6. **Usage in Nets**: Use testpoint.pin(1) in the typecad.net() method to connect to other components

7. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Place testpoints near components you need to debug
- Use appropriate sizes for your probing equipment
- Consider accessibility when placing testpoints
- Group related testpoints together
- Use consistent naming conventions
- Consider using different testpoint types for different purposes

## Common Applications

### Power Rails
\`\`\`typescript
// VCC testpoint
let vcc_tp = new Testpoint();
typecad.net(vcc_tp.pin(1), vcc.pin(1));

// Ground testpoint
let gnd_tp = new Testpoint();
typecad.net(gnd_tp.pin(1), ground.pin(1));

// Multiple voltage rails
let v3v3_tp = new Testpoint();
let v5v_tp = new Testpoint();
typecad.net(v3v3_tp.pin(1), v3v3.pin(1));
typecad.net(v5v_tp.pin(1), v5v.pin(1));
\`\`\`

### Communication Interfaces
\`\`\`typescript
// UART testpoints
let tx_tp = new Testpoint();
let rx_tp = new Testpoint();
typecad.net(tx_tp.pin(1), uart_tx.pin(1));
typecad.net(rx_tp.pin(1), uart_rx.pin(1));

// I2C testpoints
let scl_tp = new Testpoint();
let sda_tp = new Testpoint();
typecad.net(scl_tp.pin(1), i2c_scl.pin(1));
typecad.net(sda_tp.pin(1), i2c_sda.pin(1));
\`\`\`

### Debug Interfaces
\`\`\`typescript
// Programming interface testpoints
let swdio_tp = new Testpoint();
let swclk_tp = new Testpoint();
typecad.net(swdio_tp.pin(1), swdio.pin(1));
typecad.net(swclk_tp.pin(1), swclk.pin(1));

// Reset testpoint
let reset_tp = new Testpoint();
typecad.net(reset_tp.pin(1), reset.pin(1));
\`\`\`

### Analog Signals
\`\`\`typescript
// Sensor output testpoints
let sensor_tp = new Testpoint();
typecad.net(sensor_tp.pin(1), sensor_output.pin(1));

// ADC input testpoints
let adc_tp = new Testpoint();
typecad.net(adc_tp.pin(1), adc_input.pin(1));
\`\`\`

## Footprint Selection Guidelines

### Standard Pads
\`\`\`typescript
// 1.0mm pad (default, most common)
let standard_tp = new Testpoint();

// 2.0mm pad (easy to probe)
let large_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Pad_D2.0mm"
});

// 0.8mm pad (compact)
let small_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Pad_D0.8mm"
});
\`\`\`

### Spring-Loaded Options
\`\`\`typescript
// Keystone 5015 (popular spring-loaded)
let keystone_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Keystone_5015_Micro_Mini"
});

// Pogo pin (for automated testing)
let pogo_tp = new Testpoint({ 
  footprint: "TestPoint:TestPoint_Pogo_Pin"
});
\`\`\`

## Testpoint Layout Considerations

### Accessibility
\`\`\`typescript
// Place testpoints near board edges for easy access
let edge_tp = new Testpoint();

// Group related testpoints together
let power_tps = [
  new Testpoint(),  // VCC
  new Testpoint(),  // GND
  new Testpoint()   // 3V3
];
\`\`\`

### Signal Integrity
\`\`\`typescript
// Keep testpoints close to signals being tested
let signal_tp = new Testpoint();
typecad.net(signal_tp.pin(1), critical_signal.pin(1));

// Avoid placing testpoints on high-speed signals
// Use dedicated testpoints for clock signals
let clock_tp = new Testpoint();
typecad.net(clock_tp.pin(1), clock_signal.pin(1));
\`\`\`

## Error Handling
If you encounter issues:
1. Ensure the footprint format follows KiCad library:footprint convention
2. Verify that the specified footprint exists in your KiCad libraries
3. Use the 'validate_design' tool to check for connectivity issues
4. Check that testpoint.pin(1) is used correctly in net connections
5. Consider mechanical constraints when selecting testpoint types
6. Verify testpoint placement doesn't interfere with other components`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}