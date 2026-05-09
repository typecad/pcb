# Routing Module

Comprehensive PCB autorouting functionality for TypeCAD.

## Directory Structure

```
routing/
├── astar/                      # A* routing algorithm
│   ├── astar_router.ts        # Core A* pathfinding implementation
│   └── steiner_optimizer.ts   # Steiner tree optimization for multi-terminal nets
├── negotiated/                 # Negotiated congestion routing
│   └── negotiated_router.ts   # Rip-up and retry with history-based cost
├── shared/                     # Shared routing utilities
│   ├── routing_grid.ts        # Grid-based spatial representation
│   ├── obstacle_builder.ts    # Obstacle detection from PCB elements
│   └── pad_resolver.ts        # Pin/pad position resolution
├── utils/                      # Utility functions
│   └── debug_visualizer.ts    # Debug visualization (PPM image generation)
├── router_registry.ts          # Router factory and algorithm selection
└── index.ts                    # Module exports
```

## Usage

### Basic Import

```typescript
import { RouterRegistry, RoutingAlgorithm, RoutingGrid } from './routing';
```

Or import specific components:

```typescript
import { AStarRouter } from './routing/astar/astar_router';
import { NegotiatedRouter } from './routing/negotiated/negotiated_router';
```

### Creating a Router

```typescript
// Using the registry (recommended)
const router = RouterRegistry.create(
    RoutingAlgorithm.AStar,
    grid,
    {
        traceWidth: 0.2,
        clearance: 0.2,
        allowedLayers: ['F.Cu', 'B.Cu'],
        preferredLayers: ['F.Cu']
    }
);

// Direct instantiation
const astarRouter = new AStarRouter(grid, options);
```

## Algorithms

### A* Router (`astar/`)

Grid-based pathfinding using the A* algorithm with:
- Configurable trace width and clearance
- Layer preference and via cost penalties
- Through-hole pad optimization (free layer changes)
- Bend cost penalties for routing direction changes
- MST-based multi-terminal net routing
- Optional Steiner tree optimization

**Best for:** Most general-purpose routing, single-pass pathfinding

### Negotiated Router (`negotiated/`)

Congestion-aware routing with rip-up and retry:
- History-based cost accumulation
- Multiple routing rounds with cost decay
- Handles congested boards better than A*

**Best for:** Dense boards with many nets, scenarios requiring rerouting

### Steiner Optimizer (`astar/`)

Post-routing optimization for multi-terminal nets:
- Finds optimal junction points (Steiner points)
- Reduces total trace length
- Only applied when beneficial (configurable threshold)

## Shared Components

### RoutingGrid (`shared/routing_grid.ts`)

Discretizes PCB space into a uniform grid for pathfinding:
- Configurable grid resolution
- Multi-layer support
- Occupancy tracking with net-aware collision detection
- Cost field for biasing routes

### ObstacleBuilder (`shared/obstacle_builder.ts`)

Extracts obstacles from PCB elements:
- Component pads (with net assignment)
- Existing tracks
- Filled zones and keepout zones
- Board outlines

### PadResolver (`shared/pad_resolver.ts`)

Resolves pin objects to physical pad positions:
- Footprint parsing
- Coordinate transformation (footprint → board space)
- Through-hole vs SMD pad detection
- Layer assignment

## Configuration Constants

Routing behavior can be tuned via constants defined in each router:

**AStarRouter.ROUTING_CONSTANTS:**
- `MAX_THROUGH_HOLE_PROXIMITY`: 5.0mm - Maximum distance to search for through-hole waypoints
- `MIN_WAYPOINT_SEPARATION`: 3.0mm - Minimum separation between waypoints
- `VERY_CLOSE_THRESHOLD`: 0.5mm - Distance to consider points directly connected
- `FREE_VIA_LAYER_CHANGE_PENALTY`: 10.0 - Heuristic penalty for layer changes at free vias
- `NON_PREFERRED_LAYER_PENALTY`: 10.0 - Cost penalty for non-preferred layers
- `DEFAULT_VIA_SIZE`: 0.6mm - Default via diameter for clearance calculations
- `WAYPOINT_ROUTING_OVERHEAD`: 1.2 - Overhead factor for waypoint routing

**SteinerOptimizer.OPTIMIZATION_CONSTANTS:**
- `MAX_TERMINAL_SPAN`: 50mm - Maximum span for terminals worth optimizing
- `MIN_STEINER_SAVINGS`: 2.0mm - Minimum savings to use a Steiner point
- `MAX_TERMINAL_DISTANCE`: 20mm - Maximum distance from terminal to Steiner point
- `ROUTING_OVERHEAD_FACTOR`: 1.4 - A* routing overhead factor
- `COMPLEXITY_PENALTY`: 0.5mm - Penalty for adding each Steiner point
- `MAX_STEINER_POINTS`: 2 - Maximum Steiner points to add

## Debug Visualization

The `DebugVisualizer` utility generates PPM images for debugging:

```typescript
import { DebugVisualizer } from './routing/utils/debug_visualizer';

DebugVisualizer.visualizeRouting(
    grid,
    obstacles,
    [path],
    'debug_route',
    'F.Cu',  // layer
    2        // cell size in pixels
);
```

Output: `debug_route.ppm` (viewable in most image viewers)

## Error Handling

ObstacleBuilder now tracks component processing failures:
- Counts failed components
- Reports summary with component references
- Continues processing despite individual failures

## Performance Considerations

- **Grid Resolution:** Smaller cells = more accurate but slower routing
- **Max Iterations:** Increase for complex boards (default: 500,000 for A*)
- **Via Cost:** Higher cost = fewer vias but potentially longer routes
- **Layer Preferences:** Strongly affects routing efficiency on multi-layer boards

## Migration from Old Structure

Old imports:
```typescript
import { AStarRouter } from './pcb_astar_router';
import { RoutingGrid } from './pcb_routing_grid';
```

New imports:
```typescript
import { AStarRouter } from './routing/astar/astar_router';
import { RoutingGrid } from './routing/shared/routing_grid';
```

Or use the module index:
```typescript
import { AStarRouter, RoutingGrid } from './routing';
```
