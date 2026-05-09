import { MCPServer } from '../server';

export function registerAddDiodeTool(server: MCPServer) {
  server.registerTool({
    name: 'add_diode',
    description: 'Provides instructions on how to add a diode component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_diode') return;
    try {
      const instructions = `Use the @typecad/passives package to add a new diode. Available options: reference, datasheet, description, voltage, mpn, simulation, uuid, pcb.

Example:
let diode = new Diode({ 
  reference: "D1", 
  datasheet: "link/to/datasheet", 
  description: "High efficiency diode", 
  voltage: "100 V", 
  mpn: "123456", 
  simulation: "simulation/model", 
  uuid: "unique-id", 
  pcb: "pcb/layout" 
});

Notes: voltage is the voltage rating, mpn is the manufacturer part number, simulation provides an ngspice model, uuid is generally not needed to be specified, pcb passes layout information for the part. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'. For a diode, do not use the 'Component' class, always use the 'passives' package.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}