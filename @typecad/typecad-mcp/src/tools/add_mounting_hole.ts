import { MCPServer } from '../server';

export function registerAddMountingHoleTool(server: MCPServer) {
  server.registerTool({
    name: 'add_mounting_hole',
    description: 'Provides instructions on how to add a mounting hole component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {
        size: {
          type: 'string',
          description: 'Mounting hole size. Available sizes: M2, M2.5, M3, M4, M5, M6, M8 (default: M2)',
          enum: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8']
        }
      },
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_mounting_hole') return;
    try {
      const instructions = `Use the @typecad/passives package to add a new mounting hole. Available options: size, footprint, pcb.

Examples:
// Create an M2 mounting hole (default)
let mh = new MountingHole();

// Create an M3 mounting hole
let mh = new MountingHole({ size: 'M3' });

// Create a mounting hole with custom footprint
let mh = new MountingHole({
  footprint: 'MountingHole:MountingHole_3.2mm_M3_Pad'
});

Import:
import { MountingHole } from '@typecad/passives/mounting_hole';

Available sizes: M2 (default), M2.5, M3, M4, M5, M6, M8.

Notes: Reference is auto-assigned (MH1, MH2, etc.). Do not use the 'Component' class, always use the 'passives' package. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}
