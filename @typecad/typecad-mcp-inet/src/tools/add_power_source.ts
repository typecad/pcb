import { MCPServer } from '../server';

export function registerAddPowerSourceTool(server: MCPServer) {
  server.registerTool({
    name: 'add_power_source',
    description: 'Provides comprehensive instructions on how to add a power source using typeCAD Power class',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_power_source') return;
    try {
      const prompt = `# Adding a Power Source to typeCAD

## Overview
Power sources are components that supply electrical energy to a circuit. In typeCAD, power sources are implemented using the Power class, which defines the power and ground connections along with voltage specifications for Electrical Rules Checking (ERC).

## Import Statement
\`\`\`typescript
import { Component, Power } from '@typecad/typecad';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Component, Power } from '@typecad/typecad';

// Create a battery component
let battery = new Component({ 
  footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450' 
});

// Define it as a power source
let power_source = new Power({
  power: battery.pin(1),    // Pin that supplies power
  gnd: battery.pin(2),      // Pin that supplies ground
  voltage: 3.7,             // Voltage of power source
  direction: 'output'       // Indicates this is a power source
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Component, Power } from '@typecad/typecad';

// Create the power component
let battery = new Component({ 
  footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450',
  description: '3.7V Li-ion battery holder'
});

// Define power source with all properties
let power_source = new Power({
  power: battery.pin(1),        // Power pin (required)
  gnd: battery.pin(2),          // Ground pin (required)
  voltage: 3.7,                 // Nominal voltage (required)
  direction: 'output'           // Power direction (required)
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| power | Pin | Yes | Pin that supplies power | component.pin(1) |
| gnd | Pin | Yes | Pin that supplies ground | component.pin(2) |
| voltage | number | Yes | Nominal voltage in volts | 3.7, 5.0, 12.0 |
| direction | string | Yes | Power direction | 'output' |

## Common Power Source Types

### Battery Power Sources
\`\`\`typescript
// Li-ion battery (3.7V)
let li_battery = new Component({ 
  footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450' 
});
let li_power = new Power({
  power: li_battery.pin(1),
  gnd: li_battery.pin(2),
  voltage: 3.7,
  direction: 'output'
});

// Coin cell battery (3V)
let coin_cell = new Component({ 
  footprint: 'Battery:BatteryHolder_Keystone_3034_1x20' 
});
let coin_power = new Power({
  power: coin_cell.pin(1),
  gnd: coin_cell.pin(2),
  voltage: 3.0,
  direction: 'output'
});
\`\`\`

### USB Power Sources
\`\`\`typescript
// USB Type-C power
let usb_c = new Component({ 
  footprint: 'Connector_USB:USB_C_Receptacle_USB2.0' 
});
let usb_power = new Power({
  power: usb_c.pin(1),  // VBUS
  gnd: usb_c.pin(5),    // GND
  voltage: 5.0,
  direction: 'output'
});

// Micro USB power
let micro_usb = new Component({ 
  footprint: 'Connector_USB:USB_Micro-B_Molex-105017-0001' 
});
let micro_power = new Power({
  power: micro_usb.pin(1),  // VBUS
  gnd: micro_usb.pin(5),    // GND
  voltage: 5.0,
  direction: 'output'
});
\`\`\`

### External Power Sources
\`\`\`typescript
// Barrel jack power input
let barrel_jack = new Component({ 
  footprint: 'Connector_BarrelJack:BarrelJack_CUI_PJ-102AH_Horizontal' 
});
let barrel_power = new Power({
  power: barrel_jack.pin(1),
  gnd: barrel_jack.pin(2),
  voltage: 12.0,
  direction: 'output'
});

// Terminal block power
let terminal = new Component({ 
  footprint: 'Connector_ScrewTerminal_01x02:ScrewTerminal_01x02_P3.5mm_Vertical' 
});
let terminal_power = new Power({
  power: terminal.pin(1),
  gnd: terminal.pin(2),
  voltage: 24.0,
  direction: 'output'
});
\`\`\`

## Connecting Power Sources
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Connect power source to components
typecad.net(power_source.power, microcontroller.pin(1));  // VCC
typecad.net(power_source.gnd, microcontroller.pin(2));    // GND

// Connect to multiple components
typecad.net(power_source.power, sensor.pin(1));
typecad.net(power_source.gnd, sensor.pin(2));

// Connect to power distribution
typecad.net(power_source.power, power_bus.pin(1));
typecad.net(power_source.gnd, ground_bus.pin(1));
\`\`\`

## Important Notes

1. **Pin Types**: The Power class automatically sets pin types to 'power_out' for ERC

2. **Direction**: Always use 'output' for power sources (they supply power to the circuit)

3. **Voltage Specification**: The voltage property is used for ERC to check for voltage mismatches

4. **Component Creation**: First create the physical component, then define it as a power source

5. **Pin Access**: Use component.pin(n) to access pins, then pass them to the Power constructor

6. **ERC Integration**: Power sources integrate with typeCAD's Electrical Rules Checking system

7. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Use appropriate voltage ratings for your application
- Consider power requirements when selecting power sources
- Use consistent voltage specifications across your design
- Consider backup power sources for critical applications
- Plan for power distribution and filtering
- Use appropriate connectors for your power requirements

## Common Applications

### Battery-Powered Devices
\`\`\`typescript
// Portable device with Li-ion battery
let battery = new Component({ 
  footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450' 
});
let battery_power = new Power({
  power: battery.pin(1),
  gnd: battery.pin(2),
  voltage: 3.7,
  direction: 'output'
});

// Connect to voltage regulator
typecad.net(battery_power.power, regulator.pin(1));
typecad.net(battery_power.gnd, regulator.pin(2));
\`\`\`

### USB-Powered Devices
\`\`\`typescript
// USB-powered microcontroller board
let usb = new Component({ 
  footprint: 'Connector_USB:USB_Micro-B_Molex-105017-0001' 
});
let usb_power = new Power({
  power: usb.pin(1),
  gnd: usb.pin(5),
  voltage: 5.0,
  direction: 'output'
});

// Connect to power management
typecad.net(usb_power.power, power_mgmt.pin(1));
typecad.net(usb_power.gnd, power_mgmt.pin(2));
\`\`\`

### Industrial Power Systems
\`\`\`typescript
// 24V industrial power supply
let power_supply = new Component({ 
  footprint: 'Connector_ScrewTerminal_01x02:ScrewTerminal_01x02_P3.5mm_Vertical' 
});
let industrial_power = new Power({
  power: power_supply.pin(1),
  gnd: power_supply.pin(2),
  voltage: 24.0,
  direction: 'output'
});

// Connect to motor drivers
typecad.net(industrial_power.power, motor_driver1.pin(1));
typecad.net(industrial_power.power, motor_driver2.pin(1));
typecad.net(industrial_power.gnd, motor_driver1.pin(2));
typecad.net(industrial_power.gnd, motor_driver2.pin(2));
\`\`\`

## Power Source Selection Guidelines

### Voltage Requirements
\`\`\`typescript
// Low voltage (3.3V and below)
let low_voltage_power = new Power({
  power: source.pin(1),
  gnd: source.pin(2),
  voltage: 3.3,
  direction: 'output'
});

// Standard voltage (5V)
let standard_power = new Power({
  power: source.pin(1),
  gnd: source.pin(2),
  voltage: 5.0,
  direction: 'output'
});

// High voltage (12V and above)
let high_voltage_power = new Power({
  power: source.pin(1),
  gnd: source.pin(2),
  voltage: 12.0,
  direction: 'output'
});
\`\`\`

### Power Capacity Considerations
\`\`\`typescript
// Low power (battery applications)
let low_power_source = new Power({
  power: coin_cell.pin(1),
  gnd: coin_cell.pin(2),
  voltage: 3.0,
  direction: 'output'
});

// Medium power (USB applications)
let medium_power_source = new Power({
  power: usb.pin(1),
  gnd: usb.pin(5),
  voltage: 5.0,
  direction: 'output'
});

// High power (industrial applications)
let high_power_source = new Power({
  power: industrial.pin(1),
  gnd: industrial.pin(2),
  voltage: 24.0,
  direction: 'output'
});
\`\`\`

## Error Handling
If you encounter issues:
1. Ensure all required properties (power, gnd, voltage, direction) are specified
2. Verify that the component pins exist before referencing them
3. Use the 'validate_design' tool to check for connectivity issues
4. Check that voltage specifications match your component requirements
5. Ensure power and ground pins are correctly identified
6. Verify that direction is set to 'output' for power sources`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}