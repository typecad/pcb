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
import { runERC } from '@typecad/typecad';

// Programmatic ERC
let report = await runERC('./build/my-board.kicad_sch');
console.log(report);

// CLI ERC
// typecad erc
// typecad erc -- --severity-all

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

Notes: ERC uses kicad-cli sch erc. Requires KiCad to be installed. Use Power objects to automatically set correct pin types. For shared pins (like ground in regulators), manually set to 'passive' to avoid conflicts. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}
