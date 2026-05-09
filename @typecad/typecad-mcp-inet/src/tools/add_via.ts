import { MCPServer } from '../server';

export function registerAddViaTool(server: MCPServer) {
  server.registerTool({
    name: 'add_via',
    description: 'Provides comprehensive instructions on how to add vias to PCB layouts in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_via') return;
    try {
      const prompt = `# Adding Vias to PCB Layouts in typeCAD

## Overview
Vias are conductive holes that provide electrical connections between different layers of a printed circuit board. In typeCAD, vias are created using the PCB.via() method, which supports power-aware specifications for current and thermal calculations based on IPC-2221 standards.

## Import Statement
\`\`\`typescript
import { PCB } from '@typecad/typecad';
\`\`\`

## Basic Usage
\`\`\`typescript
import { PCB } from '@typecad/typecad';

let pcb = new PCB('project_name');

// Create a basic via
let via = pcb.via({
  at: { x: 10, y: 10 },    // Position on PCB
  size: 0.6,               // Via diameter in mm
  drill: 0.3               // Drill size in mm
});
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { PCB } from '@typecad/typecad';

let pcb = new PCB('project_name');

// Create a via with power specifications
let via = pcb.via({
  at: { x: 10, y: 10 },           // Position on PCB (required)
  size: 0.6,                      // Via diameter in mm (required)
  drill: 0.3,                     // Drill size in mm (required)
  powerInfo: {                    // Optional power specifications
    current: 1,                   // Maximum current in amps
    maxTempRise: 5,              // Max temperature rise in °C
    thickness: 35                 // Copper thickness in microns (35 = 1 oz)
  }
});

// Connect the via to other components
typecad.net(component.pin(1), via.pin(1));

// Include via in PCB creation
pcb.create(via);
\`\`\`

## Available Properties

| Property | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| at | {x: number, y: number} | Yes | Position on PCB | { x: 10, y: 10 } |
| size | number | Yes | Via diameter in mm | 0.6, 0.8, 1.0 |
| drill | number | Yes | Drill size in mm | 0.3, 0.4, 0.5 |
| powerInfo | object | No | Power specifications | { current: 1, maxTempRise: 5, thickness: 35 } |

## Common Via Types and Applications

### Signal Vias
\`\`\`typescript
// Standard signal via
let signal_via = pcb.via({
  at: { x: 50, y: 50 },
  size: 0.6,
  drill: 0.3
});

// Small signal via for dense layouts
let small_via = pcb.via({
  at: { x: 60, y: 60 },
  size: 0.4,
  drill: 0.2
});

// Large signal via for easy soldering
let large_via = pcb.via({
  at: { x: 70, y: 70 },
  size: 1.0,
  drill: 0.5
});
\`\`\`

### Power Vias
\`\`\`typescript
// Power via with current specifications
let power_via = pcb.via({
  at: { x: 0, y: 0 },
  size: 0.8,
  drill: 0.4,
  powerInfo: {
    current: 2.0,        // 2A current
    maxTempRise: 10,    // 10°C temperature rise
    thickness: 35       // 1 oz copper
  }
});

// High current via
let high_current_via = pcb.via({
  at: { x: 10, y: 10 },
  size: 1.2,
  drill: 0.6,
  powerInfo: {
    current: 5.0,        // 5A current
    maxTempRise: 20,    // 20°C temperature rise
    thickness: 70       // 2 oz copper
  }
});
\`\`\`

### Ground Vias
\`\`\`typescript
// Ground via for EMI shielding
let ground_via = pcb.via({
  at: { x: 20, y: 20 },
  size: 0.6,
  drill: 0.3,
  powerInfo: {
    current: 1.0,
    maxTempRise: 10,
    thickness: 35
  }
});

// Multiple ground vias for better shielding
let ground_vias = [
  pcb.via({ at: { x: 0, y: 0 }, size: 0.6, drill: 0.3 }),
  pcb.via({ at: { x: 10, y: 0 }, size: 0.6, drill: 0.3 }),
  pcb.via({ at: { x: 0, y: 10 }, size: 0.6, drill: 0.3 }),
  pcb.via({ at: { x: 10, y: 10 }, size: 0.6, drill: 0.3 })
];
\`\`\`

## Connecting Vias
\`\`\`typescript
import { typecad } from '@typecad/typecad';

// Connect via to component pin
typecad.net(component.pin(1), via.pin(1));

// Connect via to track
typecad.net(track.pin(1), via.pin(1));

// Connect via to power rail
typecad.net(power_rail.pin(1), via.pin(1));

// Connect via to ground plane
typecad.net(ground_plane.pin(1), via.pin(1));
\`\`\`

## Important Notes

1. **Pin Access**: Vias connect through pin(1) - use via.pin(1) to access the via's connection point

2. **Power Calculations**: Power-aware vias use IPC-2221 standards for current capacity calculations

3. **Size vs Drill**: The size is the outer diameter, drill is the inner diameter (hole size)

4. **Copper Thickness**: 35 microns = 1 oz copper, 70 microns = 2 oz copper

5. **Temperature Rise**: Default maxTempRise is 10°C if not specified

6. **Layer Connections**: Vias automatically connect all layers unless specified otherwise

7. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Use appropriate via sizes for your current requirements
- Consider thermal management for high-current vias
- Place ground vias strategically for EMI shielding
- Use consistent via sizes within your design
- Consider manufacturing capabilities when selecting via sizes
- Group related vias together for better organization

## Common Applications

### Layer Transitions
\`\`\`typescript
// Via for layer transition
let transition_via = pcb.via({
  at: { x: 100, y: 100 },
  size: 0.6,
  drill: 0.3
});

// Connect front layer to via
typecad.net(front_track.pin(1), transition_via.pin(1));

// Connect back layer to via
typecad.net(back_track.pin(1), transition_via.pin(1));
\`\`\`

### Power Distribution
\`\`\`typescript
// Power distribution vias
let power_vias = [
  pcb.via({
    at: { x: 0, y: 0 },
    size: 0.8,
    drill: 0.4,
    powerInfo: { current: 2.0, maxTempRise: 10, thickness: 35 }
  }),
  pcb.via({
    at: { x: 20, y: 0 },
    size: 0.8,
    drill: 0.4,
    powerInfo: { current: 2.0, maxTempRise: 10, thickness: 35 }
  })
];

// Connect to power rails
typecad.net(power_rail1.pin(1), power_vias[0].pin(1));
typecad.net(power_rail2.pin(1), power_vias[1].pin(1));
\`\`\`

### EMI Shielding
\`\`\`typescript
// Ground vias for EMI shielding
let shield_vias = [];
for (let i = 0; i < 10; i++) {
  shield_vias.push(pcb.via({
    at: { x: i * 5, y: 0 },
    size: 0.6,
    drill: 0.3
  }));
}

// Connect all to ground
shield_vias.forEach(via => {
  typecad.net(ground_plane.pin(1), via.pin(1));
});
\`\`\`

## Via Size Guidelines

### Signal Vias
\`\`\`typescript
// Small signal via (0.4mm size, 0.2mm drill)
let small_signal = pcb.via({
  at: { x: 0, y: 0 },
  size: 0.4,
  drill: 0.2
});

// Standard signal via (0.6mm size, 0.3mm drill)
let standard_signal = pcb.via({
  at: { x: 10, y: 10 },
  size: 0.6,
  drill: 0.3
});

// Large signal via (1.0mm size, 0.5mm drill)
let large_signal = pcb.via({
  at: { x: 20, y: 20 },
  size: 1.0,
  drill: 0.5
});
\`\`\`

### Power Vias
\`\`\`typescript
// Low current via (0.6mm size, 0.3mm drill)
let low_current = pcb.via({
  at: { x: 0, y: 0 },
  size: 0.6,
  drill: 0.3,
  powerInfo: { current: 0.5, maxTempRise: 10, thickness: 35 }
});

// Medium current via (0.8mm size, 0.4mm drill)
let medium_current = pcb.via({
  at: { x: 10, y: 10 },
  size: 0.8,
  drill: 0.4,
  powerInfo: { current: 1.0, maxTempRise: 10, thickness: 35 }
});

// High current via (1.2mm size, 0.6mm drill)
let high_current = pcb.via({
  at: { x: 20, y: 20 },
  size: 1.2,
  drill: 0.6,
  powerInfo: { current: 3.0, maxTempRise: 10, thickness: 35 }
});
\`\`\`

## Power-Aware Via Design

### Current Capacity Calculation
\`\`\`typescript
// Via designed for specific current
let current_via = pcb.via({
  at: { x: 50, y: 50 },
  size: 0.8,
  drill: 0.4,
  powerInfo: {
    current: 1.5,        // 1.5A current requirement
    maxTempRise: 10,    // 10°C maximum temperature rise
    thickness: 35       // 35 microns (1 oz copper)
  }
});

// Multiple vias for high current
let high_current_vias = [
  pcb.via({
    at: { x: 0, y: 0 },
    size: 0.8,
    drill: 0.4,
    powerInfo: { current: 2.0, maxTempRise: 10, thickness: 35 }
  }),
  pcb.via({
    at: { x: 5, y: 0 },
    size: 0.8,
    drill: 0.4,
    powerInfo: { current: 2.0, maxTempRise: 10, thickness: 35 }
  })
];
\`\`\`

### Thermal Management
\`\`\`typescript
// Via with thermal considerations
let thermal_via = pcb.via({
  at: { x: 100, y: 100 },
  size: 1.0,
  drill: 0.5,
  powerInfo: {
    current: 2.0,
    maxTempRise: 5,     // Low temperature rise for sensitive areas
    thickness: 35
  }
});
\`\`\`

## Error Handling
If you encounter issues:
1. Ensure all coordinates are positive numbers
2. Verify that drill size is smaller than via size
3. Check that via sizes are within manufacturer limits
4. Use the 'validate_design' tool to check for connectivity issues
5. Verify power specifications are appropriate for your design
6. Consider thermal and current requirements for power vias
7. Ensure proper via placement for layer transitions`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}