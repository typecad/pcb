import { MCPServer } from '../server';

export function registerAddMountingHoleTool(server: MCPServer) {
  server.registerTool({
    name: 'add_mounting_hole',
    description: 'Provides comprehensive instructions on how to add a mounting hole component using the @typecad/passives package',
    inputSchema: {
      type: 'object',
      properties: {
        size: {
          type: 'string',
          description: 'Mounting hole size. Available sizes: M2, M2.5, M3, M4, M5, M6, M8 (default: M2)',
          enum: ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8']
        }
      },
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_mounting_hole') return;
    try {
      const size = args.size || 'M2';
      const prompt = `# Adding a Mounting Hole Component to typeCAD

## Overview
Mounting holes are PCB features that provide mechanical attachment points for securing the board to an enclosure or chassis. In typeCAD, mounting holes are implemented using the @typecad/passives package.

## Import Statement
\`\`\`typescript
import { MountingHole } from '@typecad/passives/mounting_hole';
\`\`\`

## Basic Usage
\`\`\`typescript
import { MountingHole } from '@typecad/passives/mounting_hole';

// Create an M2 mounting hole (default)
let mh1 = new MountingHole();

// Create an M3 mounting hole
let mh2 = new MountingHole({ size: 'M3' });
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { MountingHole } from '@typecad/passives/mounting_hole';

let mh = new MountingHole({
  size: '${size}',                    // Hole size: M2, M2.5, M3, M4, M5, M6, M8
  footprint: 'MountingHole:MountingHole_3.2mm_M3_Pad',  // Override footprint (optional)
  pcb: { x: 10, y: 10, rotation: 0 },  // PCB placement
});
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| size | string | No | Hole size (default: M2) | 'M2', 'M3', 'M4' |
| footprint | string | No | Custom footprint specification | 'MountingHole:MountingHole_3.2mm_M3_Pad' |
| pcb | object | No | PCB placement coordinates | { x: 10, y: 10, rotation: 0 } |

## Available Sizes and Default Footprints

| Size | Default Footprint |
|------|-------------------|
| M2 | MountingHole:MountingHole_2.2mm_M2 |
| M2.5 | MountingHole:MountingHole_2.7mm_M2.5 |
| M3 | MountingHole:MountingHole_3.2mm_M3 |
| M4 | MountingHole:MountingHole_4.3mm_M4 |
| M5 | MountingHole:MountingHole_5.3mm_M5 |
| M6 | MountingHole:MountingHole_6.4mm_M6 |
| M8 | MountingHole:MountingHole_8.4mm_M8 |

## Common Patterns

### Four-Corner Mounting
\`\`\`typescript
let mh1 = new MountingHole({ size: 'M3', pcb: { x: 5, y: 5, rotation: 0 } });
let mh2 = new MountingHole({ size: 'M3', pcb: { x: 95, y: 5, rotation: 0 } });
let mh3 = new MountingHole({ size: 'M3', pcb: { x: 5, y: 95, rotation: 0 } });
let mh4 = new MountingHole({ size: 'M3', pcb: { x: 95, y: 95, rotation: 0 } });
\`\`\`

### Custom Footprint
\`\`\`typescript
// Through-hole pad for heavier mounting
let mh = new MountingHole({ footprint: 'MountingHole:MountingHole_3.2mm_M3_Pad' });
\`\`\`

## Important Notes

1. **Reference Assignment**: Do not specify the 'reference' property - typeCAD automatically assigns references (MH1, MH2, etc.)

2. **Default Size**: If no size is specified, M2 is used

3. **Footprint Selection**: The default footprint is automatically chosen based on the size parameter

4. **No Electrical Connections**: Mounting holes typically do not connect to nets, but can be connected to ground if needed using mh.pin(1)

5. **Package Selection**: Always use the @typecad/passives package for mounting holes`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}
