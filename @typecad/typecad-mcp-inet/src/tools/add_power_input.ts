import { MCPServer } from '../server';

export function registerAddPowerInputTool(server: MCPServer) {
  server.registerTool({
    name: 'add_power_input',
    description: 'Provides comprehensive instructions on how to define power input requirements for components in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_power_input') return;
    try {
      const prompt = `# Adding Power Input Requirements to typeCAD

## Overview
Power inputs define the power requirements for components that consume electrical energy. In typeCAD, power inputs are implemented using the Power class with direction: 'input', which specifies the power and ground connections along with voltage requirements for Electrical Rules Checking (ERC).

## Import Statement
\`\`\`typescript
import { Component, Power } from '@typecad/typecad';
\`\`\`

## Basic Usage
\`\`\`typescript
import { Component, Power } from '@typecad/typecad';

// Define a component that needs power
let microcontroller = new Component({ 
  footprint: 'Package_QFP:QFP-32_7x7mm_P0.8mm' 
});

// Define its power input requirements
let power_input = new Power({
  power: microcontroller.pin(8),        // Pin that receives power
  gnd: microcontroller.pin(4),          // Pin that receives ground
  voltage: 5.0,                         // Required voltage
  direction: 'input'                   // Indicates this is a power consumer
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { Component, Power } from '@typecad/typecad';

// Create the component
let component = new Component({ 
  footprint: 'Package_SO:SOIC-8_5.3x5.3mm_P1.27mm',
  description: '5V microcontroller'
});

// Define power input with all properties
let power_input = new Power({
  power: component.pin(8),        // Power pin (required)
  gnd: component.pin(4),          // Ground pin (required)
  voltage: 5.0,                   // Required voltage (required)
  direction: 'input'             // Power direction (required)
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| power | Pin | Yes | Pin that receives power | component.pin(8) |
| gnd | Pin | Yes | Pin that receives ground | component.pin(4) |
| voltage | number | Yes | Required voltage in volts | 3.3, 5.0, 12.0 |
| direction | string | Yes | Power direction | 'input' |

## Common Power Input Types

### Microcontroller Power Inputs
\`\`\`typescript
// 5V microcontroller
let mcu_5v = new Component({ 
  footprint: 'Package_QFP:QFP-32_7x7mm_P0.8mm' 
});
let mcu_power = new Power({
  power: mcu_5v.pin(8),    // VCC
  gnd: mcu_5v.pin(4),      // GND
  voltage: 5.0,
  direction: 'input'
});

// 3.3V microcontroller
let mcu_3v3 = new Component({ 
  footprint: 'Package_QFP:QFP-32_7x7mm_P0.8mm' 
});
let mcu_3v3_power = new Power({
  power: mcu_3v3.pin(8),   // VCC
  gnd: mcu_3v3.pin(4),     // GND
  voltage: 3.3,
  direction: 'input'
});
\`\`\`

### Sensor Power Inputs
\`\`\`typescript
// 5V sensor
let sensor_5v = new Component({ 
  footprint: 'Package_SO:SOIC-8_5.3x5.3mm_P1.27mm' 
});
let sensor_power = new Power({
  power: sensor_5v.pin(1),  // VCC
  gnd: sensor_5v.pin(4),    // GND
  voltage: 5.0,
  direction: 'input'
});

// 3.3V sensor
let sensor_3v3 = new Component({ 
  footprint: 'Package_SO:SOIC-8_5.3x5.3mm_P1.27mm' 
});
let sensor_3v3_power = new Power({
  power: sensor_3v3.pin(1), // VCC
  gnd: sensor_3v3.pin(4),   // GND
  voltage: 3.3,
  direction: 'input'
});
\`\`\`

### Motor Driver Power Inputs
\`\`\`typescript
// High voltage motor driver
let motor_driver = new Component({ 
  footprint: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm' 
});
let motor_power = new Power({
  power: motor_driver.pin(1),  // VM (motor voltage)
  gnd: motor_driver.pin(8),    // GND
  voltage: 12.0,
  direction: 'input'
});

// Logic power for motor driver
let logic_power = new Power({
  power: motor_driver.pin(16), // VCC (logic voltage)
  gnd: motor_driver.pin(8),    // GND (shared)
  voltage: 5.0,
  direction: 'input'
});
\`\`\`

## Connecting Power Inputs
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Connect power input to a power source
typecad.net(power_input.power, power_source.power);
typecad.net(power_input.gnd, power_source.gnd);

// Connect to voltage regulator output
typecad.net(power_input.power, regulator.output.pin(1));
typecad.net(power_input.gnd, regulator.gnd.pin(1));

// Connect to power distribution bus
typecad.net(power_input.power, power_bus.pin(1));
typecad.net(power_input.gnd, ground_bus.pin(1));
\`\`\`

## Important Notes

1. **Pin Types**: The Power class automatically sets pin types to 'power_in' for ERC

2. **Direction**: Always use 'input' for power consumers (they receive power from the circuit)

3. **Voltage Specification**: The voltage property is used for ERC to check for voltage mismatches

4. **Component Creation**: First create the physical component, then define its power requirements

5. **Pin Access**: Use component.pin(n) to access pins, then pass them to the Power constructor

6. **Shared Ground Pins**: For components with shared ground pins (like voltage regulators), manually set the ground pin type to 'passive' to avoid ERC conflicts

7. **ERC Integration**: Power inputs integrate with typeCAD's Electrical Rules Checking system

8. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Use appropriate voltage specifications for your components
- Consider power requirements when designing power distribution
- Use consistent voltage specifications across your design
- Plan for power sequencing if required
- Consider power filtering and decoupling
- Use appropriate voltage regulators for different voltage requirements

## Common Applications

### Microcontroller Systems
\`\`\`typescript
// Main microcontroller
let mcu = new Component({ 
  footprint: 'Package_QFP:QFP-32_7x7mm_P0.8mm' 
});
let mcu_power = new Power({
  power: mcu.pin(8),
  gnd: mcu.pin(4),
  voltage: 5.0,
  direction: 'input'
});

// Connect to voltage regulator
typecad.net(mcu_power.power, regulator.output.pin(1));
typecad.net(mcu_power.gnd, regulator.gnd.pin(1));
\`\`\`

### Sensor Networks
\`\`\`typescript
// Multiple sensors with different voltage requirements
let sensor1 = new Component({ footprint: 'Package_SO:SOIC-8_5.3x5.3mm_P1.27mm' });
let sensor2 = new Component({ footprint: 'Package_SO:SOIC-8_5.3x5.3mm_P1.27mm' });

let sensor1_power = new Power({
  power: sensor1.pin(1),
  gnd: sensor1.pin(4),
  voltage: 5.0,
  direction: 'input'
});

let sensor2_power = new Power({
  power: sensor2.pin(1),
  gnd: sensor2.pin(4),
  voltage: 3.3,
  direction: 'input'
});

// Connect to appropriate power rails
typecad.net(sensor1_power.power, v5v_rail.pin(1));
typecad.net(sensor2_power.power, v3v3_rail.pin(1));
typecad.net(sensor1_power.gnd, ground_rail.pin(1));
typecad.net(sensor2_power.gnd, ground_rail.pin(1));
\`\`\`

### Motor Control Systems
\`\`\`typescript
// Motor driver with dual power inputs
let driver = new Component({ 
  footprint: 'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm' 
});

// Motor power (high voltage)
let motor_power = new Power({
  power: driver.pin(1),
  gnd: driver.pin(8),
  voltage: 12.0,
  direction: 'input'
});

// Logic power (low voltage)
let logic_power = new Power({
  power: driver.pin(16),
  gnd: driver.pin(8),  // Shared ground
  voltage: 5.0,
  direction: 'input'
});

// Set shared ground pin to passive to avoid ERC conflicts
driver.pin(8).type = 'passive';

// Connect to power sources
typecad.net(motor_power.power, motor_supply.pin(1));
typecad.net(logic_power.power, logic_supply.pin(1));
typecad.net(motor_power.gnd, ground.pin(1));
\`\`\`

## Power Input Selection Guidelines

### Voltage Requirements
\`\`\`typescript
// Low voltage (3.3V and below)
let low_voltage_input = new Power({
  power: component.pin(1),
  gnd: component.pin(2),
  voltage: 3.3,
  direction: 'input'
});

// Standard voltage (5V)
let standard_input = new Power({
  power: component.pin(1),
  gnd: component.pin(2),
  voltage: 5.0,
  direction: 'input'
});

// High voltage (12V and above)
let high_voltage_input = new Power({
  power: component.pin(1),
  gnd: component.pin(2),
  voltage: 12.0,
  direction: 'input'
});
\`\`\`

### Power Consumption Considerations
\`\`\`typescript
// Low power (sensors, logic)
let low_power_input = new Power({
  power: sensor.pin(1),
  gnd: sensor.pin(2),
  voltage: 3.3,
  direction: 'input'
});

// Medium power (microcontrollers)
let medium_power_input = new Power({
  power: mcu.pin(1),
  gnd: mcu.pin(2),
  voltage: 5.0,
  direction: 'input'
});

// High power (motors, displays)
let high_power_input = new Power({
  power: motor.pin(1),
  gnd: motor.pin(2),
  voltage: 12.0,
  direction: 'input'
});
\`\`\`

## Error Handling
If you encounter issues:
1. Ensure all required properties (power, gnd, voltage, direction) are specified
2. Verify that the component pins exist before referencing them
3. Use the 'validate_design' tool to check for connectivity issues
4. Check that voltage specifications match your component requirements
5. Ensure power and ground pins are correctly identified
6. Verify that direction is set to 'input' for power consumers
7. For shared ground pins, set the pin type to 'passive' to avoid ERC conflicts`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}