import { MCPServer } from '../server';

export function registerCreateCustomComponentTool(server: MCPServer) {
  server.registerTool({
    name: 'create_custom_component',
    description: 'Provides instructions on how to create custom components with pins and properties in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'create_custom_component') return;
    try {
      const instructions = `Use the typeCAD Component class and Pin class to create custom components with named pins.

Example:
import { Component, Pin } from '@typecad/typecad';

export class CustomMCU extends Component {
  VCC = new Pin(this.reference, 8, 'power_in', this, {
    minimum_voltage: -0.5,
    maximum_voltage: 6,
    current: 0.2,
  });
  GND = new Pin(this.reference, 4, 'power_in', this, {
    minimum_voltage: -0.5,
    maximum_voltage: 6,
    current: 0.2,
  });
  GPIO1 = new Pin(this.reference, 1, 'bidirectional', this, {
    minimum_voltage: -0.5,
    maximum_voltage: 6,
    current: 0.04,
  });

  constructor(reference?: string) {
    super({ 
      reference, 
      footprint: 'Package_SO:SOIC-8_5.3x5.3mm_P1.27mm',
      value: 'CustomMCU',
      datasheet: 'link/to/datasheet',
      description: 'Custom microcontroller'
    });
  }
}

// Usage
let u1 = new CustomMCU('U1');
typecad.net(u1.VCC, power_source.power);

Notes: Pin types include 'power_in', 'power_out', 'bidirectional', 'input', 'output', 'passive'. powerInfo object with minimum_voltage, maximum_voltage, and current enables power-aware checking. Use 'npx @typecad/add-component' tool for automatic component generation from KiCAD libraries. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}