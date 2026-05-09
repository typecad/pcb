import { MCPServer } from '../server';

export function registerValidateDesignTool(server: MCPServer) {
  server.registerTool({
    name: 'validate_design',
    description: 'Provides instructions on how to run comprehensive design validation in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'validate_design') return;
    try {
      const instructions = `Use typeCAD's built-in validation methods to check your design for errors and compatibility issues.

Available Validation Methods:
import { PCB } from '@typecad/typecad';

let typecad = new PCB('project_name');

// Power-aware validation (automatic when Power objects are defined)
// - Checks voltage compatibility between connected pins
// - Validates current capacity of tracks and vias
// - Verifies power pin types for ERC

// ERC (Electrical Rules Check) - validates pin connections
// - Checks for proper power connections
// - Validates pin type compatibility
// - Identifies floating pins and short circuits

// Component validation
// - Verifies all required pins are connected
// - Checks component power requirements
// - Validates footprint assignments

// Build validation
typecad.create(); // This runs validation during build process

Common Validation Checks:
1. Power compatibility: Voltage levels match between connected pins
2. Current capacity: Tracks and vias can handle specified current
3. Pin types: Compatible pin types are connected (power_out to power_in)
4. Reference conflicts: No duplicate component references
5. Net merging: Warns when named nets are merged

Notes: Validation runs automatically during the build process. Errors will prevent KiCAD file generation, warnings will be logged but allow build to continue. Use Power objects with powerInfo for comprehensive power validation. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}