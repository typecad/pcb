import { MCPServer } from '../server';

export function registerAddLedTool(server: MCPServer) {
  server.registerTool({
    name: 'add_led',
    description: 'Provides instructions on how to add an LED component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_led') return;
    try {
      const instructions = `Use the @typecad/passives package to add a new LED. Available options: reference, datasheet, description, voltage, mpn, simulation, uuid, pcb.

Example:
let led = new LED({ 
  reference: "D2", 
  datasheet: "link/to/datasheet", 
  description: "High brightness LED", 
  voltage: "100 V", 
  mpn: "123456", 
  simulation: "simulation/model", 
  uuid: "unique-id", 
  pcb: "pcb/layout" 
});

Notes: voltage is the voltage rating, mpn is the manufacturer part number, simulation provides an ngspice model, uuid is generally not needed to be specified, pcb passes layout information for the part. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'. For an LED, do not use the 'Component' class, always use the 'passives' package.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}