import { MCPServer } from '../server';

export function registerAddTrackTool(server: MCPServer) {
  server.registerTool({
    name: 'add_track',
    description: 'Provides instructions on how to add PCB tracks with power-aware routing in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_track') return;
    try {
      const instructions = `Use the typeCAD TrackBuilder to create PCB tracks with routing and layer transitions.

Example:
import { PCB, TrackBuilder } from '@typecad/typecad';

let pcb = new PCB('project_name');

// Create a track with power-aware routing
let power_track: TrackBuilder = pcb
  .track()
  .powerInfo({                          // Optional power specifications
    current: 1.0,                       // Maximum current in amps
    maxTempRise: 10,                   // Max temperature rise in °C
    thickness: 35                       // Copper thickness in microns
  })
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2)  // Start point, layer, width
  .to({ x: 110, y: 100 })                 // Route to point
  .via({ size: 0.8, drill: 0.4 })         // Add via for layer change
  .to({ x: 110, y: 120, layer: 'B.Cu' }); // Continue on back copper

// Include track in PCB
pcb.group('track_group', power_track);
pcb.create();

Notes: Tracks automatically connect to nets when they touch component pads. powerInfo enables current/thermal checking using IPC-2221 standard. Default layer is 'F.Cu', default width is 0.2mm. Use .via() to transition between layers. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}