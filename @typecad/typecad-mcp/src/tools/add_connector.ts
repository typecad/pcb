import { MCPServer } from '../server';

export function registerAddConnectorTool(server: MCPServer) {
  server.registerTool({
    name: 'add_connector',
    description: 'Provides instructions on how to add a connector component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_connector') return;
    try {
      const instructions = `Use the @typecad/passives package to add a new connector. Available options: number, footprint.

Examples:
// Create a 10-pin connector using the JST footprint
let j1 = new Connector({ 
  number: 10, 
  footprint: "Connector_JST:JST_SH_SM10B-SRSS-TB_1x10-1MP_P1.00mm_Horizontal" 
});

// Create a 5-pin connector using a default 2.54 mm pin-header
let j2 = new Connector({ number: 5 });

Import:
import { Connector } from '@typecad/passives/connector'

Notes: number specifies the number of pins, footprint allows you to specify a custom footprint (defaults to 2.54mm pin-header if not specified). Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'. For a connector, do not use the 'Component' class, always use the 'passives' package.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}