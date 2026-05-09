import { MCPServer } from '../server';

export function registerAddTrackTool(server: MCPServer) {
  server.registerTool({
    name: 'add_track',
    description: 'Provides comprehensive instructions on how to add PCB tracks with power-aware routing in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_track') return;
    try {
      const prompt = `# Adding PCB Tracks to typeCAD

## Overview
PCB tracks are conductive paths that connect components on a printed circuit board. In typeCAD, tracks are created using the TrackBuilder class, which provides power-aware routing capabilities with automatic current and thermal calculations based on IPC-2221 standards.

## Import Statement
\`\`\`typescript
import { PCB, TrackBuilder } from '@typecad/typecad';
\`\`\`

## Basic Usage
\`\`\`typescript
import { PCB, TrackBuilder } from '@typecad/typecad';

let pcb = new PCB('project_name');

// Create a basic track
let track: TrackBuilder = pcb
  .track()
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2)  // Start point, layer, width
  .to({ x: 110, y: 100 });                 // End point
\`\`\`

## Complete Example with All Options
\`\`\`typescript
import { PCB, TrackBuilder } from '@typecad/typecad';

let pcb = new PCB('project_name');

// Create a track with power specifications
let power_track: TrackBuilder = pcb
  .track()
  .powerInfo({                          // Power specifications
    current: 1.0,                       // Maximum current in amps
    maxTempRise: 10,                   // Max temperature rise in °C
    thickness: 35                       // Copper thickness in microns
  })
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2)  // Start point, layer, width
  .to({ x: 110, y: 100 })                 // Route to point
  .via({ size: 0.8, drill: 0.4 })         // Add via for layer change
  .to({ x: 110, y: 120, layer: 'B.Cu' }); // Continue on back copper

// Include track in PCB
pcb.group('track_group', power_track);
pcb.create();
\`\`\`

## Available Methods

| Method | Parameters | Description | Example |
|--------|------------|-------------|---------|
| from() | position, layer, width | Start point of track | .from({ x: 100, y: 100 }, 'F.Cu', 0.2) |
| to() | position, layer? | Route to point | .to({ x: 110, y: 100 }) |
| via() | size, drill | Add via for layer transition | .via({ size: 0.8, drill: 0.4 }) |
| powerInfo() | current, maxTempRise, thickness | Set power specifications | .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 }) |

## Common Track Types and Applications

### Signal Tracks
\`\`\`typescript
// Basic signal track
let signal_track: TrackBuilder = pcb
  .track()
  .from({ x: 50, y: 50 }, 'F.Cu', 0.2)
  .to({ x: 100, y: 50 });

// High-speed signal track
let high_speed_track: TrackBuilder = pcb
  .track()
  .from({ x: 50, y: 60 }, 'F.Cu', 0.15)  // Thinner for impedance control
  .to({ x: 100, y: 60 });
\`\`\`

### Power Tracks
\`\`\`typescript
// Power supply track
let power_track: TrackBuilder = pcb
  .track()
  .powerInfo({
    current: 2.0,        // 2A current
    maxTempRise: 10,    // 10°C temperature rise
    thickness: 35       // 1 oz copper
  })
  .from({ x: 0, y: 0 }, 'F.Cu', 0.5)  // Wider for power
  .to({ x: 50, y: 0 });

// Ground plane connection
let ground_track: TrackBuilder = pcb
  .track()
  .powerInfo({
    current: 1.5,
    maxTempRise: 10,
    thickness: 35
  })
  .from({ x: 0, y: 10 }, 'F.Cu', 0.4)
  .to({ x: 50, y: 10 });
\`\`\`

### Multi-Layer Tracks
\`\`\`typescript
// Track with layer transitions
let multi_layer_track: TrackBuilder = pcb
  .track()
  .from({ x: 100, y: 100 }, 'F.Cu', 0.2)
  .to({ x: 150, y: 100 })
  .via({ size: 0.8, drill: 0.4 })           // Transition to back layer
  .to({ x: 150, y: 150, layer: 'B.Cu' })    // Continue on back copper
  .via({ size: 0.8, drill: 0.4 })           // Transition back to front
  .to({ x: 200, y: 150, layer: 'F.Cu' });   // Continue on front copper
\`\`\`

## Power-Aware Routing

### Current Capacity Calculation
\`\`\`typescript
// Track designed for specific current
let current_track: TrackBuilder = pcb
  .track()
  .powerInfo({
    current: 1.0,        // 1A current requirement
    maxTempRise: 10,    // 10°C maximum temperature rise
    thickness: 35       // 35 microns (1 oz copper)
  })
  .from({ x: 0, y: 0 }, 'F.Cu', 0.3)  // Width calculated automatically
  .to({ x: 100, y: 0 });

// High current track
let high_current_track: TrackBuilder = pcb
  .track()
  .powerInfo({
    current: 5.0,        // 5A current
    maxTempRise: 20,    // 20°C temperature rise
    thickness: 70       // 70 microns (2 oz copper)
  })
  .from({ x: 0, y: 10 }, 'F.Cu', 1.0)  // Wide track for high current
  .to({ x: 100, y: 10 });
\`\`\`

### Thermal Management
\`\`\`typescript
// Track with thermal considerations
let thermal_track: TrackBuilder = pcb
  .track()
  .powerInfo({
    current: 2.0,
    maxTempRise: 5,     // Low temperature rise for sensitive areas
    thickness: 35
  })
  .from({ x: 0, y: 0 }, 'F.Cu', 0.6)
  .to({ x: 100, y: 0 });
\`\`\`

## Track Routing Techniques

### Straight Tracks
\`\`\`typescript
// Simple straight track
let straight_track: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 0 }, 'F.Cu', 0.2)
  .to({ x: 100, y: 0 });

// Vertical track
let vertical_track: TrackBuilder = pcb
  .track()
  .from({ x: 50, y: 0 }, 'F.Cu', 0.2)
  .to({ x: 50, y: 100 });
\`\`\`

### Complex Routing
\`\`\`typescript
// Multi-segment track
let complex_track: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 0 }, 'F.Cu', 0.2)
  .to({ x: 50, y: 0 })      // Horizontal segment
  .to({ x: 50, y: 50 })     // Vertical segment
  .to({ x: 100, y: 50 })    // Horizontal segment
  .to({ x: 100, y: 100 });  // Final vertical segment
\`\`\`

### Differential Pairs
\`\`\`typescript
// Differential signal pair
let diff_pair_1: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 0 }, 'F.Cu', 0.15)
  .to({ x: 100, y: 0 });

let diff_pair_2: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 0.3 }, 'F.Cu', 0.15)  // 0.3mm spacing
  .to({ x: 100, y: 0.3 });
\`\`\`

## Important Notes

1. **Layer Specification**: Use standard KiCad layer names ('F.Cu', 'B.Cu', 'In1.Cu', etc.)

2. **Units**: All measurements are in millimeters (mm)

3. **Power Calculations**: Power-aware routing uses IPC-2221 standards for current capacity

4. **Via Specifications**: Vias require both size (outer diameter) and drill (inner diameter)

5. **Track Width**: Minimum width depends on PCB manufacturer capabilities

6. **Thermal Considerations**: Higher current requires wider tracks or thicker copper

7. **Documentation**: For detailed API reference, use the 'download_typecad_docs' tool

## Best Practices

- Use appropriate track widths for your current requirements
- Consider thermal management for high-current tracks
- Plan layer transitions carefully to minimize via count
- Use power-aware routing for all power and ground connections
- Consider impedance control for high-speed signals
- Group related tracks together for better organization

## Common Applications

### Power Distribution
\`\`\`typescript
// Main power bus
let power_bus: TrackBuilder = pcb
  .track()
  .powerInfo({
    current: 3.0,
    maxTempRise: 10,
    thickness: 35
  })
  .from({ x: 0, y: 0 }, 'F.Cu', 0.8)
  .to({ x: 200, y: 0 });

// Ground plane connection
let ground_connection: TrackBuilder = pcb
  .track()
  .powerInfo({
    current: 3.0,
    maxTempRise: 10,
    thickness: 35
  })
  .from({ x: 0, y: 10 }, 'F.Cu', 0.8)
  .to({ x: 200, y: 10 });
\`\`\`

### Signal Routing
\`\`\`typescript
// Digital signal tracks
let digital_signals: TrackBuilder[] = [
  pcb.track().from({ x: 0, y: 20 }, 'F.Cu', 0.2).to({ x: 100, y: 20 }),
  pcb.track().from({ x: 0, y: 25 }, 'F.Cu', 0.2).to({ x: 100, y: 25 }),
  pcb.track().from({ x: 0, y: 30 }, 'F.Cu', 0.2).to({ x: 100, y: 30 })
];

// Analog signal track
let analog_track: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 40 }, 'F.Cu', 0.15)  // Thinner for analog
  .to({ x: 100, y: 40 });
\`\`\`

### High-Speed Design
\`\`\`typescript
// Controlled impedance track
let controlled_impedance: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 50 }, 'F.Cu', 0.12)  // Specific width for impedance
  .to({ x: 100, y: 50 });

// Clock signal track
let clock_track: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 55 }, 'F.Cu', 0.15)
  .to({ x: 100, y: 55 });
\`\`\`

## Track Width Guidelines

### Signal Tracks
\`\`\`typescript
// Low-speed digital (0.2mm typical)
let low_speed: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 0 }, 'F.Cu', 0.2)
  .to({ x: 100, y: 0 });

// High-speed digital (0.15mm typical)
let high_speed: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 10 }, 'F.Cu', 0.15)
  .to({ x: 100, y: 10 });

// Analog signals (0.15mm typical)
let analog: TrackBuilder = pcb
  .track()
  .from({ x: 0, y: 20 }, 'F.Cu', 0.15)
  .to({ x: 100, y: 20 });
\`\`\`

### Power Tracks
\`\`\`typescript
// Low current (0.3mm typical)
let low_current: TrackBuilder = pcb
  .track()
  .powerInfo({ current: 0.5, maxTempRise: 10, thickness: 35 })
  .from({ x: 0, y: 0 }, 'F.Cu', 0.3)
  .to({ x: 100, y: 0 });

// Medium current (0.5mm typical)
let medium_current: TrackBuilder = pcb
  .track()
  .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 })
  .from({ x: 0, y: 10 }, 'F.Cu', 0.5)
  .to({ x: 100, y: 10 });

// High current (1.0mm+ typical)
let high_current: TrackBuilder = pcb
  .track()
  .powerInfo({ current: 3.0, maxTempRise: 10, thickness: 35 })
  .from({ x: 0, y: 20 }, 'F.Cu', 1.0)
  .to({ x: 100, y: 20 });
\`\`\`

## Error Handling
If you encounter issues:
1. Ensure all coordinates are positive numbers
2. Verify layer names match your PCB stackup
3. Check that track widths are within manufacturer limits
4. Use the 'validate_design' tool to check for connectivity issues
5. Verify via specifications are appropriate for your design
6. Consider thermal and current requirements for power tracks
7. Ensure proper layer transitions with vias`;
      resolve(prompt);
    } catch (error) {
      reject(error);
    }
  });
}