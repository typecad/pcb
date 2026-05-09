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
      const instructions = `# How to Run Electrical Rules Check (ERC) in typeCAD

IMPORTANT: This tool only provides instructions on how to run ERC. It does not actually execute the ERC process.

## Running ERC in typeCAD:
\`\`\`typescript
import { PCB, Power } from '@typecad/typecad';

let typecad = new PCB('project_name');

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

// First create the design
typecad.create();

// Then explicitly run ERC - this step is required!
const ercResults = typecad.erc();

// Analyze the ERC results
if (ercResults.errors.length > 0) {
  console.log('ERC found errors:', ercResults.errors);
}
if (ercResults.warnings.length > 0) {
  console.log('ERC found warnings:', ercResults.warnings);
}
\`\`\`

## Pin Types for ERC:
- 'power_in': Receives power (set by input Power objects)
- 'power_out': Supplies power (set by output Power objects)
- 'input': Digital/analog input
- 'output': Digital/analog output
- 'bidirectional': Can be input or output
- 'passive': No drive capability (resistors, capacitors)

## ERC Checks:
- Power connections: power_out connects to power_in
- Signal compatibility: outputs connect to inputs
- Floating pins: unconnected pins that should be connected
- Short circuits: incompatible pin types connected

## Important Notes: 
- ERC does NOT run automatically during the build process
- You MUST explicitly call \`typecad::erc()\` after \`create()\`
- Always analyze the returned results to identify and fix issues
- Use Power objects to automatically set correct pin types
- For shared pins (like ground in regulators), manually set to 'passive' to avoid conflicts
- For more details, refer to the typeCAD documentation which can be downloaded with 'download_typecad_docs'`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}