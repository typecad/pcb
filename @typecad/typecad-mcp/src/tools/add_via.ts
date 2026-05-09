import { MCPServer } from '../server';

export function registerAddViaTool(server: MCPServer) {
  server.registerTool({
    name: 'add_via',
    description: 'Provides instructions on how to add vias to PCB layouts in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_via') return;
    try {
      const instructions = `Use the typeCAD PCB.via() method to create vias for layer transitions.

Example:
import { PCB } from '@typecad/typecad';

let typecad = new PCB('project_name');

// Create a via with position, size, and drill specifications
let via = typecad.via({
  at: { x: 10, y: 10 },           // Position on PCB
  size: 0.6,                      // Via diameter in mm
  drill: 0.3,                     // Drill size in mm
  powerInfo: {                    // Optional power specifications
    current: 1,                   // Maximum current in amps
    maxTempRise: 5,              // Max temperature rise in °C
    thickness: 35                 // Copper thickness in microns (35 = 1 oz)
  }
});

// Connect the via to other components
typecad.net(r1.pin(1), via.pin(1));

// Include via in PCB creation
typecad.create(via);

Notes: Vias connect through pin(1). powerInfo is optional but enables current/thermal checking using IPC-2221 standard. Default maxTempRise is 10°C, default thickness is 35 microns. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}