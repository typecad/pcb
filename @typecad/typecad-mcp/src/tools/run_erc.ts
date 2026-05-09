import { MCPServer } from '../server';

export function registerRunErcTool(server: MCPServer) {
  server.registerTool({
    name: 'run_erc',
    description: 'Provides instructions on how to run Electrical Rules Check (ERC) in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'run_erc') return;
    try {
      const instructions = `Use typeCAD's ERC (Electrical Rules Check) to validate electrical connections and pin compatibility.

ERC Validation in typeCAD:
import { PCB, Power } from '@typecad/typecad';

let typecad = new PCB('project_name');

// ERC checks are performed automatically during build
// Set up proper pin types for effective ERC:

// Power pins - use Power objects to set pin types
let power_source = new Power({
  power: battery.pin(1),    // Sets pin type to 'power_out'
  gnd: battery.pin(2),      // Sets pin type to 'power_out'
  voltage: 3.7,
  direction: 'output'
});

let power_input = new Power({
  power: mcu.pin(8),        // Sets pin type to 'power_in'
  gnd: mcu.pin(4),          // Sets pin type to 'power_in'
  voltage: 3.3,
  direction: 'input'
});

// Manual pin type setting for custom components
mcu.pin(1).type = 'input';
mcu.pin(2).type = 'output';
mcu.pin(3).type = 'bidirectional';
mcu.pin(4).type = 'passive';

// ERC runs during build process
typecad.create();

Pin Types for ERC:
- 'power_in': Receives power (set by input Power objects)
- 'power_out': Supplies power (set by output Power objects)
- 'input': Digital/analog input
- 'output': Digital/analog output
- 'bidirectional': Can be input or output
- 'passive': No drive capability (resistors, capacitors)

ERC Checks:
- Power connections: power_out connects to power_in
- Signal compatibility: outputs connect to inputs
- Floating pins: unconnected pins that should be connected
- Short circuits: incompatible pin types connected

Notes: ERC runs automatically during the build process. Use Power objects to automatically set correct pin types. For shared pins (like ground in regulators), manually set to 'passive' to avoid conflicts. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}