import { MCPServer } from '../server';

export function registerAddInductorTool(server: MCPServer) {
  server.registerTool({
    name: 'add_inductor',
    description: 'Provides instructions on how to add an inductor component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_inductor') return;
    try {
      const instructions = `Use the @typecad/passives package to add a new inductor. Available options: reference, value, datasheet, description, mpn, simulation, uuid, pcb.

Example:
let inductor = new Inductor({ 
  reference: "L1", 
  value: "2.2 uH", 
  datasheet: "link/to/datasheet", 
  description: "High inductance inductor", 
  mpn: "123456", 
  simulation: "simulation/model", 
  uuid: "unique-id", 
  pcb: "pcb/layout" 
});

Notes: value is the inductance value, mpn is the manufacturer part number, simulation provides an ngspice model, uuid is generally not needed to be specified, pcb passes layout information for the part. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'. For an inductor, do not use the 'Component' class, always use the 'passives' package.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}