/**
 * Routing module - shared infrastructure for PCB autorouting.
 *
 * The core package now only provides registries and utilities.
 * Algorithm implementations are distributed as standalone plugins (e.g., @typecad/@typecad-astar).
 */

export { AStarRouter } from './router/astar_router.js';
export { LengthMatcher } from './length_matching/length_matcher.js';
export { configureGridResolution } from './grid_resolution_policy.js';

// Shared utilities
export { RoutingGrid } from './shared/routing_grid.js';
export type { IGridCell, IRoutingObstacle } from './shared/routing_grid.js';

export { ObstacleBuilder } from './shared/obstacle_builder.js';
export { PadResolver } from './shared/pad_resolver.js';
export type { IPadGeometry, IPadResolutionFailure } from './shared/pad_resolver.js';

// Debug utilities
export { DebugVisualizer } from './utils/debug_visualizer.js';
