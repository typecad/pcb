import { MCPServer } from '../server';

export function registerCreateNamedNetTool(server: MCPServer) {
  server.registerTool({
    name: 'create_named_net',
    description: 'Provides instructions on how to create named connections between pins in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'create_named_net') return;
    try {
      const instructions = `Use the typeCAD PCB.named().net() method to create named connections between pins.

Examples:
import { PCB } from '@typecad/typecad';

let typecad = new PCB('project_name');

// Create named connections
typecad.named('power').net(u1.VCC, c1.pin(1), r1.pin(1));
typecad.named('ground').net(u1.GND, c1.pin(2), r1.pin(2));
typecad.named('signal').net(u1.PB1, led1.pin(1));

// Regular unnamed connections (will be labeled as net#)
typecad.net(u1.PB2, r2.pin(1));

Notes: Named nets appear with the specified name in KiCAD, making board layout easier. You can connect multiple pins in a single net() call. If nets are merged later, the name may change and you'll see a warning. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}