import { MCPServer } from '../server';

export function registerAddCapacitorTool(server: MCPServer) {
  server.registerTool({
    name: 'add_capacitor',
    description: 'Provides instructions on how to add a capacitor component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_capacitor') return;
    try {
      const instructions = `Use the @typecad/passives package to add a new capacitor. Available options: reference, value, voltage, datasheet, description, mpn, simulation, uuid, pcb.

Example:
let capacitor = new Capacitor({ 
  reference: "C1", 
  value: "100 nF", 
  voltage: "6 V", 
  datasheet: "link/to/datasheet", 
  description: "High voltage capacitor", 
  mpn: "123456", 
  simulation: "simulation/model", 
  uuid: "unique-id", 
  pcb: "pcb/layout" 
});

Notes: voltage is the voltage rating, mpn is the manufacturer part number, simulation provides an ngspice model, uuid is generally not needed to be specified, pcb passes layout information for the part. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'. For a capacitor, do not use the 'Component' class, always use the 'passives' package.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}