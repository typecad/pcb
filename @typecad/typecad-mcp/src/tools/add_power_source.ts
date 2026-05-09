import { MCPServer } from '../server';

export function registerAddPowerSourceTool(server: MCPServer) {
  server.registerTool({
    name: 'add_power_source',
    description: 'Provides instructions on how to add a power source using typeCAD Power class',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_power_source') return;
    try {
      const instructions = `Use the typeCAD Power class to add a power source. Available options: power, gnd, voltage, direction.

Example:
import { Component, Power } from '@typecad/typecad';

let bt1 = new Component({ footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450' });
let coin_cell = new Power({
  power: bt1.pin(1),    // Pin that supplies power
  gnd: bt1.pin(2),      // Pin that supplies ground
  voltage: 3.7,         // Voltage of power source
  direction: 'output'   // Indicates this is a power source
});

Notes: power and gnd specify the pins that supply power and ground, voltage is the nominal voltage, direction should be 'output' for power sources. The Power object automatically sets pin types to 'power_out' for ERC. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}