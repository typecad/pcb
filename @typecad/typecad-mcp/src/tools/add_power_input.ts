import { MCPServer } from '../server';

export function registerAddPowerInputTool(server: MCPServer) {
  server.registerTool({
    name: 'add_power_input',
    description: 'Provides instructions on how to define power input requirements for components in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_power_input') return;
    try {
      const instructions = `Use the typeCAD Power class with direction: 'input' to define power requirements for components.

Example:
import { Component, Power } from '@typecad/typecad';

// Define a component that needs power
let u1 = new Component({ footprint: 'Package_SO:SOIC-8_5.3x5.3mm_P1.27mm' });

// Define its power input requirements
let vin = new Power({
  power: u1.pin(8),        // Pin that receives power
  gnd: u1.pin(4),          // Pin that receives ground
  voltage: 5.0,            // Required voltage
  direction: 'input'       // Indicates this is a power consumer
});

// Connect to a power source
typecad.net(vin.power, power_source.power);
typecad.net(vin.gnd, power_source.gnd);

// For shared ground pins in regulators, set to passive to avoid ERC conflicts
u1.pin(4).type = 'passive';

Notes: direction: 'input' sets pin types to 'power_in' for ERC. Use this for components that consume power. For voltage regulators with shared ground pins, manually set the ground pin type to 'passive' to avoid ERC conflicts. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}