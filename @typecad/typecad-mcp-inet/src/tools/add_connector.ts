import { MCPServer } from '../server';

export function registerAddConnectorTool(server: MCPServer) {
  server.registerTool({
    name: 'add_connector',
    description: 'Provides comprehensive instructions on how to add a connector component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_connector') return;
    try {
      const prompt = `# Adding a Connector Component to typeCAD

## Overview
Connectors are mechanical components that provide electrical connections between different parts of a circuit or between a circuit and external devices. In typeCAD, connectors are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { Connector } from '@typecad/passives/connector';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Connector } from '@typecad/passives/connector';

// Create a basic connector
let connector = new Connector({ 
  number: 10
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Connector } from '@typecad/passives/connector';

let connector = new Connector({ 
  number: 10,                    // Number of pins (required)
  footprint: "Connector_JST:JST_SH_SM10B-SRSS-TB_1x10-1MP_P1.00mm_Horizontal"  // Custom footprint
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| number | number | Yes | Number of pins | 2, 5, 10, 20 |
| footprint | string | No | Custom footprint specification | "Connector_JST:JST_SH_SM10B-SRSS-TB_1x10-1MP_P1.00mm_Horizontal" |

## Common Connector Types and Applications

### Pin Headers
\`\`\`typescript
// Standard 2.54mm pin header (default)
let pin_header = new Connector({ number: 10 });

// 1.27mm pitch pin header
let fine_pitch = new Connector({ 
  number: 20,
  footprint: "Connector_PinHeader_2.54mm:PinHeader_1x20_P2.54mm_Vertical"
});

// Right-angle pin header
let right_angle = new Connector({ 
  number: 6,
  footprint: "Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Horizontal"
});
\`\`\`

### JST Connectors
\`\`\`typescript
// JST SH series (1.0mm pitch)
let jst_sh = new Connector({ 
  number: 4,
  footprint: "Connector_JST:JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal"
});

// JST PH series (2.0mm pitch)
let jst_ph = new Connector({ 
  number: 6,
  footprint: "Connector_JST:JST_PH_B6B-PH-SM4-TB_1x06-1MP_P2.00mm_Horizontal"
});
\`\`\`

### USB Connectors
\`\`\`typescript
// USB Type-C connector
let usb_c = new Connector({ 
  number: 24,
  footprint: "Connector_USB:USB_C_Receptacle_USB2.0"
});

// Micro USB connector
let micro_usb = new Connector({ 
  number: 5,
  footprint: "Connector_USB:USB_Micro-B_Molex-105017-0001"
});
\`\`\`

### Power Connectors
\`\`\`typescript
// Barrel jack connector
let barrel_jack = new Connector({ 
  number: 2,
  footprint: "Connector_BarrelJack:BarrelJack_CUI_PJ-102AH_Horizontal"
});

// Terminal block
let terminal_block = new Connector({ 
  number: 2,
  footprint: "Connector_ScrewTerminal_01x02:ScrewTerminal_01x02_P3.5mm_Vertical"
});
\`\`\`

## Connecting Connectors
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Connect individual pins
typecad.net(connector.pin(1), power_supply.pin(1));  // VCC
typecad.net(connector.pin(2), ground.pin(1));        // GND
typecad.net(connector.pin(3), signal.pin(1));        // Signal

// Connect multiple pins to a bus
for (let i = 1; i <= 8; i++) {
  typecad.net(connector.pin(i), data_bus.pin(i));
}

// Connect power and ground pins
typecad.net(connector.pin(1), vcc.pin(1));           // VCC
typecad.net(connector.pin(10), gnd.pin(1));          // GND
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (J1, J2, etc.)

2. **Package Selection**: Always use the @typecad/passives package, never the generic Component class

3. **Pin Numbering**: Pins are numbered sequentially from 1 to the specified number

4. **Default Footprint**: If no footprint is specified, a standard 2.54mm pin header is used

5. **Footprint Format**: Footprints follow the KiCad library:footprint format

6. **Pin Access**: Use connector.pin(n) to access individual pins where n is the pin number

7. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Choose appropriate pin counts for your application
- Use standard footprints when possible for better compatibility
- Consider mechanical constraints when selecting connector types
- Plan for future expansion when choosing pin counts
- Use appropriate connector types for power vs signal applications
- Consider environmental factors (moisture, vibration, etc.)

## Common Applications

### Development Boards
\`\`\`typescript
// Arduino-style pin header
let arduino_header = new Connector({ number: 14 });

// Raspberry Pi GPIO header
let gpio_header = new Connector({ number: 40 });

// ESP32 development header
let esp32_header = new Connector({ number: 30 });
\`\`\`

### Sensor Interfaces
\`\`\`typescript
// I2C sensor connector
let i2c_connector = new Connector({ 
  number: 4,
  footprint: "Connector_JST:JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal"
});

// SPI sensor connector
let spi_connector = new Connector({ 
  number: 6,
  footprint: "Connector_JST:JST_SH_SM06B-SRSS-TB_1x06-1MP_P1.00mm_Horizontal"
});
\`\`\`

### Power Distribution
\`\`\`typescript
// Main power input
let power_input = new Connector({ 
  number: 2,
  footprint: "Connector_BarrelJack:BarrelJack_CUI_PJ-102AH_Horizontal"
});

// Power distribution header
let power_header = new Connector({ number: 4 });
\`\`\`

## Footprint Selection Guidelines

### Standard Pin Headers
\`\`\`typescript
// 2.54mm pitch (most common)
let standard_header = new Connector({ number: 10 });

// 1.27mm pitch (compact)
let compact_header = new Connector({ 
  number: 20,
  footprint: "Connector_PinHeader_1.27mm:PinHeader_1x20_P1.27mm_Vertical"
});
\`\`\`

### Specialized Connectors
\`\`\`typescript
// High-density connector
let hd_connector = new Connector({ 
  number: 50,
  footprint: "Connector_FFC-FPC:FFC-0.5mm-1x50-1MP_P0.50mm_Horizontal"
});

// Coaxial connector
let coax_connector = new Connector({ 
  number: 1,
  footprint: "Connector_Coaxial:Coaxial-Conn_UFL_Molex-U.FL"
});
\`\`\`

## Error Handling
If you encounter issues:
1. Ensure number property is specified and is a positive integer
2. Check that the footprint format follows KiCad library:footprint convention
3. Verify that the specified footprint exists in your KiCad libraries
4. Use the 'validate_design' tool to check for connectivity issues
5. Ensure pin numbers don't exceed the specified connector pin count
6. Consider mechanical constraints when selecting connector types`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}