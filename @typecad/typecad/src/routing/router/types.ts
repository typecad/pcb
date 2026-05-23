import type { RoutingGrid } from "../contracts/routing_grid.js";
import { IImpedanceConstraint } from "../types/pcb.js";
import type { ILengthMatchConfig } from "../types/length_match.js";
import type { IPowerInfo } from '../../pcb/pcb_interfaces.js';
import type { IRoutePath as PcbRoutePath } from '../../pcb/pcb_interfaces.js';
import type { IRoutingObstacle } from '../shared/routing_grid.js';

export type { IPowerInfo } from '../../pcb/pcb_interfaces.js';
export type IRoutePath = PcbRoutePath;

/**
 * Represents a node in the A* search space.
 */
export interface IRouteNode {
  gridX: number;
  gridY: number;
  worldX?: number;
  worldY?: number;
  layer: string;
  gCost: number;
  hCost: number;
  fCost: number;
  parent: IRouteNode | null;
  directionFrom?: { dx: number; dy: number };
  viaUsed: boolean;
  layerIndex?: number;
}

/**
 * Options for the A* router (public API).
 *
 * All distances are in millimeters unless stated otherwise. Examples below are
 * intentionally simple to surface in VSCode IntelliSense.
 */
export interface IRoutingOptions {
  /** Trace width. Example: 0.2 */
  traceWidth: number;
  /** Clearance from other copper. Example: 0.2 */
  clearance: number;
  /** Allowed layers in preference order. Example: ['F.Cu', 'B.Cu'] */
  allowedLayers: string[];
  /** Cost penalty for placing a via. Higher discourages layer changes. Example: 10 */
  viaCost?: number;
  /** Clearance enforced around vias. Defaults to clearance. Example: 0.25 */
  viaClearance?: number;
  /** Cost penalty applied when changing direction. Example: 0.5 */
  bendCost?: number;
  /** Net name for same-net clearance exceptions. Example: 'GND' */
  net?: string;
  /** Impedance constraint to honor during routing. */
  impedance?: IImpedanceConstraint;
  /** Power information for trace width calculation */
  powerInfo?: IPowerInfo;
  /** Maximum search iterations before giving up. Example: 500_000 */
  maxIterations?: number;
  /** Whether the router may change layers. Default: true */
  allowVias?: boolean;
  /** Allow 45° runs instead of strictly orthogonal moves. Default: true */
  allow45DegreeRuns?: boolean;
  /** World-space via positions the router may use without extra cost. */
  freeViaLocations?: { x: number; y: number }[];
  /** Layers to favor when multiple layers are allowed. Example: ['F.Cu'] */
  preferredLayers?: string[];
  /** Emit verbose debug logging and profiling info. */
  debug?: boolean;
  /** Enable adaptive stride/jump moves to accelerate long searches. */
  useAdaptiveStride?: boolean;
  /** Maximum stride distance in grid cells when adaptive stride is on. Example: 32 */
  maxStrideCells?: number;
  /** Radius near pads where stride is disabled to preserve detail. Example: 3 */
  strideNearPadDisableRadiusMm?: number;
  /** Multiplier for the A* heuristic (higher = greedier). Example: 2 */
  heuristicWeight?: number;
  /** Length matching configuration */
  lengthMatch?: ILengthMatchConfig;
  /** The user-requested grid resolution (mm) before any fine-pitch clamp. Example: 0.1 */
  requestedGridResolution?: number;
  /**
   * The resolution to use once escape routing is complete (usually the
   * original requested value). The router will stride across multiple fine
   * cells to approximate this coarser spacing away from pads.
   * Example: 0.2
   */
  resumeGridResolution?: number;
  /**
   * Optional factory used to create a coarser routing grid (typically at the
   * originally requested resolution) so the router can switch back to a
   * faster/straighter search once it has escaped fine-pitch detail.
   */
  coarseGridFactory?: (gridResolution: number) => RoutingGrid;
  /** Obstacles (serialized) used to reconstruct grids in workers */
  gridObstacles?: IRoutingObstacle[];
  /** Grid bounds used to reconstruct a RoutingGrid instance in a worker */
  gridBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  /** Allow routing of multiple MST edges in parallel (worker count; 1 = disabled) */
  parallelMSTWorkers?: number;
  /**
   * Internal flag to disable resume-to-coarse-grid behavior (used when the
   * router recursively spawns itself for the coarse segment).
   */
  disableResumeGrid?: boolean;
}

export type NormalizedRoutingOptions =
  Required<
    Omit<
      IRoutingOptions,
      | "impedance"
      | "net"
      | "freeViaLocations"
      | "preferredLayers"
      | "debug"
      | "coarseGridFactory"
    | "parallelMSTWorkers"
      | "disableResumeGrid"
      | "powerInfo"
      | "lengthMatch"
    >
  > &
    Pick<
      IRoutingOptions,
      | "impedance"
      | "net"
      | "freeViaLocations"
      | "preferredLayers"
      | "debug"
      | "useAdaptiveStride"
      | "maxStrideCells"
      | "strideNearPadDisableRadiusMm"
      | "heuristicWeight"
      | "requestedGridResolution"
      | "resumeGridResolution"
      | "coarseGridFactory"
      | "gridObstacles"
      | "gridBounds"
      | "disableResumeGrid"
      | "powerInfo"
      | "lengthMatch"
    > & {
      preferredLayers: string[];
      useAdaptiveStride: boolean;
      maxStrideCells: number;
      strideNearPadDisableRadiusMm: number;
      heuristicWeight: number;
      allow45DegreeRuns: boolean;
      parallelMSTWorkers: number;
    };

export type RouteEndpoint = { x: number; y: number; layer: string };

/**
 * Enhanced route endpoint that includes pre-computed grid coordinates for performance.
 */
export type RouteEndpointWithGrid = { 
  x: number; 
  y: number; 
  layer: string;
  gridX: number;
  gridY: number;
};

export interface IWaypointPlan {
  waypoints: RouteEndpoint[];
  skipFirstSegment: boolean;
  skipLastSegment: boolean;
}

export interface IWaypointPlanner {
  estimateEdgeCost(p1: RouteEndpoint, p2: RouteEndpoint): number;
  planWaypoints(
    p1: RouteEndpoint,
    p2: RouteEndpoint,
    allPoints: RouteEndpoint[],
    routedPoints: Set<number>
  ): IWaypointPlan;
}

export type { IRouteDirectives } from '../../pcb/pcb_interfaces.js';

