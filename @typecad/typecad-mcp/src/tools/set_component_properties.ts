import { MCPServer } from '../server';

export function registerSetComponentPropertiesTool(server: MCPServer) {
  server.registerTool({
    name: 'set_component_properties',
    description: 'Provides instructions on how to modify component properties like DNP, reference, value, etc. in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'set_component_properties') return;
    try {
      const instructions = `Modify typeCAD component properties directly by setting their properties after creation.

Available Properties:
- reference: Reference designator (R1, C1, U1, etc.)
- value: Component value
- footprint: KiCAD footprint path
- datasheet: Link to component datasheet
- description: Component description
- voltage: Voltage rating
- wattage: Power rating
- mpn: Manufacturer Part Number
- dnp: Do Not Populate (true/false)
- simulation: Simulation model object

Examples:
import { Resistor } from '@typecad/passives/0805';

let r1 = new Resistor({ value: '1kohm' });

// Modify properties after creation
r1.reference = 'R10';
r1.value = '2.2kohm';
r1.wattage = '0.5W';
r1.voltage = '100V';
r1.datasheet = 'https://example.com/datasheet.pdf';
r1.description = 'High precision resistor';
r1.mpn = 'ABC123';
r1.dnp = true;  // Mark as Do Not Populate
r1.simulation = { include: true, model: 'ngspice-model' };

// PCB layout properties
r1.pcb = { x: 10, y: 20, rotation: 90 };

Notes: DNP components appear in schematic but not in BOM or assembly. Reference designators must be unique. PCB coordinates are in mm with rotation in degrees. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}