import { MCPServer } from '../server';

export function registerAddTestpointTool(server: MCPServer) {
  server.registerTool({
    name: 'add_testpoint',
    description: 'Provides instructions on how to add a testpoint component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_testpoint') return;
    try {
      const instructions = `Use the @typecad/passives package to add a new testpoint. Available options: footprint.

Examples:
// Create a testpoint with default footprint
let tp = new Testpoint();

// Create a testpoint with specific footprint
let tp = new Testpoint({ 
  footprint: 'TestPoint:TestPoint_Keystone_5015_Micro_Mini'
});

Import:
import { Testpoint } from '@typecad/passives/testpoint';

Usage:
Connect a testpoint using tp.pin(1) in the ::net() method.

Notes: Default footprint is TestPoint:TestPoint_Pad_D1.0mm. You can specify a custom footprint if needed. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'. For a testpoint, do not use the 'Component' class, always use the 'passives' package.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}