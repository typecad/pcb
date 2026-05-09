import { MCPServer } from '../server';

export function registerAddResistorTool(server: MCPServer) {
    server.registerTool({
        name: 'add_resistor',
        description: 'Provides instructions on how to add a resistor component using the @typecad/passives package',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    });

    server.on('tool_call', async ({ name, args, resolve, reject }) => {
        if (name !== 'add_resistor') return;
        try {
            const instructions = `Use the @typecad/passives package to add a new resistor. Available options: reference, value, wattage, datasheet, description, voltage, mpn, simulation, uuid, pcb
Example:
let resistor = new Resistor({ 
  reference: "R1", 
  value: "4.7 kOhm", 
  wattage: "0.25 W", 
  datasheet: "link/to/datasheet", 
  description: "High precision resistor", 
  voltage: "100 V", 
  mpn: "123456", 
  simulation: "simulation/model", 
  uuid: "unique-id", 
  pcb: "pcb/layout" 
});

Notes: there is no tolerance property, voltage is the voltage rating, mpn is the manufacturer part number, simulation provides an ngspice model, uuid is generally not needed to be specified, pcb passes layout information for the part. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'. For a resistor, do not use the 'Component' class, always use the 'passives' package.`;
            resolve(instructions);
        } catch (error) {
            reject(error);
        }
    });
}