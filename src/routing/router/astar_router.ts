import type { RoutingGrid } from '../contracts/routing_grid.js';
import { IAutorouteVia, IAutorouteWaypoint } from '../types/pcb.js';
import type { IPowerInfo } from './types.js';
import { SteinerOptimizer, ISteinerOptimizationResult } from './steiner_optimizer.js';
import chalk from 'chalk';
import logger from '../../utils/logging.js';
import { buildMST as buildSharedMST } from '../shared/mst.js';
import {
  GridSearch,
  GridSearchConstants,
  heuristicDistance,
  segmentClearOfObstacles,
  viaSpanLayers,
} from './grid_search.js';
import { WaypointPlanner } from './waypoint_planner.js';
import { appendSegmentNodes, mergeSegments, pointsEqual } from './path_assembler.js';
import { IRouteDirectives, IRoutePath, IRoutingOptions, NormalizedRoutingOptions } from './types.js';
import { ClearanceProfile } from './clearance_profile.js';
import { profiler } from '../shared/profiler.js';
import { calculateMinTraceWidth, calculateMinViaSize } from '../../pcb/pcb_routing_calculations.js';

export type { IRouteNode, IRoutePath, IRoutingOptions } from './types.js';

/**
 * A* pathfinding algorithm for PCB routing.
 * Finds optimal paths on a routing grid while avoiding obstacles.
 */
export class AStarRouter {
  // Routing algorithm tuning constants
  private static readonly ROUTING_CONSTANTS = {
    /** Maximum distance (mm) to search for through-hole waypoints */
    MAX_THROUGH_HOLE_PROXIMITY: 5.0,
    /** Minimum separation (mm) between waypoints to be useful */
    MIN_WAYPOINT_SEPARATION: 3.0,
    /** Distance threshold (mm) to consider endpoint and waypoint as directly connected */
    VERY_CLOSE_THRESHOLD: 0.5,
    /** Heuristic penalty for layer changes at free via locations */
    FREE_VIA_LAYER_CHANGE_PENALTY: 10.0,
    /** Cost penalty for routing on non-preferred layers */
    NON_PREFERRED_LAYER_PENALTY: 10.0,
    /** Default via diameter for clearance calculations (mm) */
    DEFAULT_VIA_SIZE: 0.6,
    /** When goal is a through-hole, avoid extra layer changes within this radius of goal (mm) */
    TH_GOAL_VIA_AVOID_RADIUS_MM: GridSearchConstants.TH_GOAL_VIA_AVOID_RADIUS_MM,
    /** When start is a through-hole, avoid extra layer changes within this radius of start (mm) */
    TH_START_VIA_AVOID_RADIUS_MM: GridSearchConstants.TH_START_VIA_AVOID_RADIUS_MM,
    /** Overhead factor for waypoint routing vs direct routing */
    WAYPOINT_ROUTING_OVERHEAD: 1.2,
    /** How much extra trace length a via is worth before routing around it. */
    VIA_PREFERENCE_MM: 3.0,
  } as const;

  private grid: RoutingGrid;
  private options: NormalizedRoutingOptions;
  private freeViaGridLocations: Set<string>; // Grid coordinates of free via locations
  private gridSearch: GridSearch;
  private waypointPlanner: WaypointPlanner;
  private clearanceProfile: ClearanceProfile;
  private coarseGridFactory?: (gridResolution: number) => RoutingGrid;
  private disableResumeGrid: boolean;
  private requestedGridResolution?: number;
  private resumeGridResolution?: number;
  private rawOptions: IRoutingOptions;
  private _mstRouter: AStarRouter | null = null;
  private _viaFreeRouter: AStarRouter | null = null;

  /**
   * Router instance reused for MST edge searches. Shares the grid and
   * options, but with resume-to-coarse disabled so per-edge searches never
   * recurse into hierarchical routing.
   */
  private getMstRouter(): AStarRouter {
    if (!this._mstRouter) {
      this._mstRouter = new AStarRouter(this.grid, {
        ...this.rawOptions,
        disableResumeGrid: true,
        coarseGridFactory: undefined,
      });
    }
    return this._mstRouter;
  }

  /**
   * Router clone with vias disabled, used to attempt forced-via route
   * segments on a single layer first — the forced vias are the only layer
   * changes the caller asked for, so organic hops are only acceptable when
   * the same layer genuinely cannot reach the target.
   */
  private getViaFreeRouter(): AStarRouter {
    if (!this._viaFreeRouter) {
      this._viaFreeRouter = new AStarRouter(this.grid, {
        ...this.rawOptions,
        allowVias: false,
        disableResumeGrid: true,
        coarseGridFactory: undefined,
        // A best-effort probe: an uncongested single-layer route is found in
        // a few hundred iterations, so a generous budget only pays for slow
        // failures on sealed corridors — exactly where vias are justified.
        maxIterations: Math.min(this.options.maxIterations, 40_000),
      });
    }
    return this._viaFreeRouter;
  }

  get routingOptions(): NormalizedRoutingOptions {
    return this.options;
  }

  /**
   * Create a new A* router.
   *
   * @param grid - The routing grid to search on
   * @param options - Routing options
   *
   * @example
   * ```ts
   * const router = new AStarRouter(grid, {
   *   traceWidth: 0.2,
   *   clearance: 0.2,
   *   allowedLayers: ['F.Cu'],
   *   viaCost: 5.0,
   *   bendCost: 0.5
   * });
   * ```
   */
  constructor(grid: RoutingGrid, options: IRoutingOptions) {
    this.grid = grid;
    const fineGridResolution = this.grid.getResolution();
    const requestedGridResolution = options.requestedGridResolution ?? fineGridResolution;
    const resumeGridResolution = options.resumeGridResolution ?? requestedGridResolution;
    const defaultStrideCells = 32;

    // Calculate trace width from powerInfo, prioritizing powerInfo over explicit traceWidth
    let calculatedTraceWidth = options.traceWidth;
    if (options.powerInfo) {
      const preferredLayer = options.preferredLayers?.[0] || options.allowedLayers[0] || 'F.Cu';
      const powerCalculatedWidth = calculateMinTraceWidth(
        options.powerInfo.current,
        preferredLayer,
        options.powerInfo.maxTempRise ?? 10,
        options.powerInfo.thickness ?? 35,
      );
      // Use powerInfo calculated width if it's larger than explicit traceWidth
      calculatedTraceWidth = Math.max(calculatedTraceWidth ?? 0, powerCalculatedWidth);

      if (options.debug) {
        logger.debug(chalk.blue(`[AStarRouter] PowerInfo trace width calculation:`));
        logger.debug(chalk.blue(`  Current: ${options.powerInfo.current}A`));
        logger.debug(chalk.blue(`  Layer: ${preferredLayer}`));
        logger.debug(chalk.blue(`  Original traceWidth: ${options.traceWidth}mm`));
        logger.debug(chalk.blue(`  Power calculated width: ${powerCalculatedWidth.toFixed(3)}mm`));
        logger.debug(chalk.green(`  Final traceWidth: ${calculatedTraceWidth.toFixed(3)}mm`));
      }
    } else if (options.debug) {
      logger.debug(chalk.yellow(`[AStarRouter] No powerInfo provided, using traceWidth: ${calculatedTraceWidth}mm`));
    }

    this.options = {
      traceWidth: calculatedTraceWidth,
      clearance: options.clearance,
      allowedLayers: options.allowedLayers,
      viaCost: options.viaCost ?? 20.0,
      layerOrder: options.layerOrder ?? [],
      viaClearance: options.viaClearance ?? options.clearance ?? 0.2,
      viaSize: options.viaSize ?? AStarRouter.ROUTING_CONSTANTS.DEFAULT_VIA_SIZE,
      bendCost: options.bendCost ?? 0.5,
      net: options.net,
      impedance: options.impedance,
      maxIterations: options.maxIterations ?? 500000,
      allowVias: options.allowVias ?? true,
      allow45DegreeRuns: options.allow45DegreeRuns ?? true,
      freeViaLocations: options.freeViaLocations,
      preferredLayers: options.preferredLayers ?? options.allowedLayers, // Default to all allowed layers
      debug: options.debug ?? false,
      useAdaptiveStride: options.useAdaptiveStride ?? true,
      maxStrideCells: options.maxStrideCells ?? defaultStrideCells,
      // Allow stride moves to start sooner by shrinking the near-pad disable radius.
      strideNearPadDisableRadiusMm: options.strideNearPadDisableRadiusMm ?? Math.max(1.5, resumeGridResolution * 1.5),
      heuristicWeight: options.heuristicWeight ?? 2.0,
      requestedGridResolution,
      resumeGridResolution,
      gridObstacles: options.gridObstacles ?? [],
      gridBounds: options.gridBounds ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      powerInfo: options.powerInfo,
    };

    this.rawOptions = options;
    this.coarseGridFactory = options.coarseGridFactory;
    this.disableResumeGrid = options.disableResumeGrid ?? false;
    this.requestedGridResolution = requestedGridResolution;
    this.resumeGridResolution = resumeGridResolution;

    // Convert free via locations from world to grid coordinates
    this.freeViaGridLocations = new Set<string>();
    if (options.freeViaLocations) {
      for (const loc of options.freeViaLocations) {
        const gridPos = this.grid.worldToGrid(loc.x, loc.y);
        // Store as "x:y" for quick lookup
        this.freeViaGridLocations.add(`${gridPos.x}:${gridPos.y}`);
      }
    }

    this.clearanceProfile = new ClearanceProfile({
      options: this.options,
      // Model the via the board will actually manufacture (net class /
      // rules resolved by the host), not an assumed default — otherwise
      // planned via placements under-clear the emitted pad.
      viaDiameter: this.options.viaSize,
      gridResolution: this.grid.getResolution(),
    });

    this.gridSearch = new GridSearch({
      grid: this.grid,
      options: this.options,
      freeViaGridLocations: this.freeViaGridLocations,
      clearanceProfile: this.clearanceProfile,
    });

    this.waypointPlanner = new WaypointPlanner({
      grid: this.grid,
      preferredLayer: this.options.preferredLayers[0],
      freeViaLocations: this.options.freeViaLocations,
      viaCost: this.options.viaCost,
      constants: {
        MAX_THROUGH_HOLE_PROXIMITY: AStarRouter.ROUTING_CONSTANTS.MAX_THROUGH_HOLE_PROXIMITY,
        MIN_WAYPOINT_SEPARATION: AStarRouter.ROUTING_CONSTANTS.MIN_WAYPOINT_SEPARATION,
        VERY_CLOSE_THRESHOLD: AStarRouter.ROUTING_CONSTANTS.VERY_CLOSE_THRESHOLD,
        WAYPOINT_ROUTING_OVERHEAD: AStarRouter.ROUTING_CONSTANTS.WAYPOINT_ROUTING_OVERHEAD,
      },
    });

    // Configure profiler debug mode based on router options
    profiler.setDebug(!!this.options.debug);
    profiler.setEnabled(!!this.options.debug);
  }

  private recomputePathMetrics(nodes: { x: number; y: number; layer: string }[]): { length: number; viaCount: number } {
    let length = 0;
    let viaCount = 0;
    const viaStubLength = this.clearanceProfile.getViaDiameter();

    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      length += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (prev.layer !== curr.layer) {
        viaCount++;
        length += viaStubLength;
      }
    }

    return { length, viaCount };
  }

  private findEscapeSlice(nodes: { x: number; y: number; layer: string }[], escapeRadiusMm: number) {
    let forwardIdx: number | null = null;
    let backwardIdx: number | null = null;
    let traveled = 0;

    for (let i = 1; i < nodes.length; i++) {
      traveled += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
      if (traveled >= escapeRadiusMm) {
        forwardIdx = i;
        break;
      }
    }

    traveled = 0;
    for (let i = nodes.length - 1; i > 0; i--) {
      traveled += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
      if (traveled >= escapeRadiusMm) {
        backwardIdx = i - 1;
        break;
      }
    }

    return { forwardIdx, backwardIdx };
  }

  /**
   * Enforce the via invariant on a routed path: a layer transition may only
   * happen at constant XY (that pair of nodes is the via). Merged or
   * post-processed paths can end up with adjacent nodes that change layer
   * AND position, which would emit a via disconnected from the following
   * track (and duplicate near-coincident vias). Insert the missing same-XY
   * node so the transition becomes a proper via pair.
   */
  private normalizeViaPairs(path: IRoutePath): IRoutePath {
    const nodes = path.nodes;
    let needsFix = false;
    for (let i = 1; i < nodes.length; i++) {
      if (
        nodes[i].layer !== nodes[i - 1].layer &&
        (Math.abs(nodes[i].x - nodes[i - 1].x) > 1e-6 || Math.abs(nodes[i].y - nodes[i - 1].y) > 1e-6)
      ) {
        needsFix = true;
        break;
      }
    }
    if (!needsFix) {
      return path;
    }

    const fixed: typeof nodes = [nodes[0]];
    for (let i = 1; i < nodes.length; i++) {
      const prev = fixed[fixed.length - 1];
      const cur = nodes[i];
      if (cur.layer !== prev.layer && (Math.abs(cur.x - prev.x) > 1e-6 || Math.abs(cur.y - prev.y) > 1e-6)) {
        // Bridge node on the incoming layer at the transition point: the
        // incoming track runs prev -> bridge, the via sits at bridge XY, and
        // the outgoing track continues from cur on its layer.
        fixed.push({ x: cur.x, y: cur.y, layer: prev.layer });
      }
      fixed.push(cur);
    }

    const { length, viaCount } = this.recomputePathMetrics(fixed);
    return { ...path, nodes: fixed, gridNodes: undefined, length, viaCount };
  }

  /**
   * Optionally reroute the middle of a path on a coarser grid once we've
   * escaped fine-pitch detail. This mirrors the legacy host-side behavior
   * but keeps the policy inside the plugin.
   */
  private maybeResumeOnCoarseGrid(
    path: IRoutePath,
    _start: { x: number; y: number; layer: string },
    _end: { x: number; y: number; layer: string },
  ): IRoutePath {
    const targetResolution = this.resumeGridResolution ?? this.requestedGridResolution;
    const currentResolution = this.grid.getResolution();

    if (
      this.disableResumeGrid ||
      !targetResolution ||
      currentResolution >= targetResolution - 1e-9 ||
      !this.coarseGridFactory ||
      !path?.success ||
      !path.nodes ||
      path.nodes.length < 2
    ) {
      return path;
    }

    const escapeRadiusMm = Math.max(targetResolution * 3, this.options.traceWidth * 6, this.options.clearance * 3, 0.5);
    const { forwardIdx, backwardIdx } = this.findEscapeSlice(path.nodes, escapeRadiusMm);

    if (forwardIdx === null || backwardIdx === null || forwardIdx >= backwardIdx) {
      return path;
    }

    const coarseGrid = this.coarseGridFactory(targetResolution);
    const coarseRouter = new AStarRouter(coarseGrid, {
      ...this.rawOptions,
      traceWidth: this.options.traceWidth,
      clearance: this.options.clearance,
      allowedLayers: this.options.allowedLayers,
      viaCost: this.options.viaCost,
      viaClearance: this.options.viaClearance,
      bendCost: this.options.bendCost,
      net: this.options.net,
      impedance: this.options.impedance,
      maxIterations: this.options.maxIterations,
      allowVias: this.options.allowVias,
      allow45DegreeRuns: this.options.allow45DegreeRuns,
      freeViaLocations: this.rawOptions.freeViaLocations,
      preferredLayers: this.options.preferredLayers,
      debug: this.options.debug,
      useAdaptiveStride: this.options.useAdaptiveStride,
      maxStrideCells: this.options.maxStrideCells,
      strideNearPadDisableRadiusMm: this.options.strideNearPadDisableRadiusMm,
      heuristicWeight: this.options.heuristicWeight,
      requestedGridResolution: targetResolution,
      resumeGridResolution: targetResolution,
      coarseGridFactory: undefined,
      disableResumeGrid: true,
    });

    const coarsePath = coarseRouter.route(path.nodes[forwardIdx], path.nodes[backwardIdx]);

    if (!coarsePath?.success || !coarsePath.nodes || coarsePath.nodes.length < 2) {
      if (this.options.debug) {
        logger.warn(chalk.gray(`[AStarRouter] Resume-grid reroute failed; keeping fine grid path`));
      }
      return path;
    }

    const mergedNodes: { x: number; y: number; layer: string }[] = [];
    const pushNode = (node: { x: number; y: number; layer: string }) => {
      const last = mergedNodes[mergedNodes.length - 1];
      if (!last || Math.abs(last.x - node.x) > 1e-6 || Math.abs(last.y - node.y) > 1e-6 || last.layer !== node.layer) {
        mergedNodes.push({ ...node });
      }
    };

    for (let i = 0; i <= forwardIdx; i++) pushNode(path.nodes[i]);
    for (let i = 1; i < coarsePath.nodes.length - 1; i++) pushNode(coarsePath.nodes[i]);
    for (let i = backwardIdx; i < path.nodes.length; i++) pushNode(path.nodes[i]);

    // The fine→coarse splice points create segments the fine search never
    // validated. If any merged segment violates clearance, the coarse reroute
    // is not usable — keep the fully search-validated fine path instead.
    const mergedClear = mergedNodes.every((node, i) => {
      if (i === 0) return true;
      return segmentClearOfObstacles(
        this.grid,
        this.options.net,
        this.clearanceProfile.getTraceClearance(),
        mergedNodes[i - 1],
        node,
      );
    });
    if (!mergedClear) {
      if (this.options.debug) {
        logger.warn(chalk.gray(`[AStarRouter] Resume-grid reroute violates clearance; keeping fine grid path`));
      }
      return path;
    }

    const { length, viaCount } = this.recomputePathMetrics(mergedNodes);
    if (this.options.debug) {
      logger.debug(
        chalk.blue(
          `[AStarRouter] Resumed to coarse grid (${targetResolution}mm) after escape region (~${escapeRadiusMm.toFixed(2)}mm)`,
        ),
      );
    }

    return {
      ...path,
      nodes: mergedNodes,
      gridNodes: undefined,
      length,
      viaCount,
    };
  }

  /**
   * Route from start to end point.
   *
   * @param start - Starting position in world coordinates (mm)
   * @param end - Ending position in world coordinates (mm)
   * @param directives - Optional routing directives (waypoints or vias)
   * @returns Routing result with path and metadata
   */
  route(
    start: { x: number; y: number; layer: string },
    end: { x: number; y: number; layer: string },
    directives?: IAutorouteWaypoint[] | IRouteDirectives,
  ): IRoutePath {
    let waypointList: IAutorouteWaypoint[] | undefined;
    let viaList: IAutorouteVia[] | undefined;

    if (Array.isArray(directives)) {
      waypointList = directives;
    } else if (directives) {
      waypointList = directives.waypoints;
      viaList = directives.vias;
    }

    // If waypoints specified, route through each segment
    if (waypointList && waypointList.length > 0) {
      return this.routeWithWaypoints(start, end, waypointList);
    }

    if (viaList && viaList.length > 0) {
      return this.routeWithVias(start, end, viaList);
    }

    // Single segment routing
    const startTime = performance.now();
    const result = this.routeSegment(start, end);
    const endTime = performance.now();
    this.logRouteResult(result, start, end, endTime - startTime);
    return result;
  }

  /**
   * Optimize a routed path using Steiner Minimum Tree algorithm.
   * Adds Steiner points (intermediate junctions) to reduce total trace length.
   *
   * @param path - Initial routed path from MST
   * @param terminals - Original connection points
   * @param useSteinerOptimization - Whether to apply Steiner optimization
   * @returns Optimized path or original if no improvement found
   */
  optimizeWithSteiner(
    path: IRoutePath,
    terminals: { x: number; y: number; layer: string }[],
    useSteinerOptimization: boolean = false,
  ): IRoutePath {
    return profiler.profile('AStarRouter.optimizeWithSteiner', () => {
      if (!useSteinerOptimization) {
        return path;
      }

      if (terminals.length < 3) {
        return path;
      }

      const optimizer = new SteinerOptimizer(
        this.grid,
        this.options.clearance,
        this.options.traceWidth,
        this.options.net,
        this, // Pass router instance so optimizer can re-route through Steiner points
      );

      const result = optimizer.optimize(path, terminals, 0.1); // 10% minimum improvement (conservative)

      if (result) {
        return result.path;
      } else {
        return path;
      }
    })();
  }

  /**
   * Route an entire net with multiple connection points using MST (Minimum Spanning Tree).
   * This finds the optimal routing order to minimize total trace length.
   *
   * @param points - Array of connection points to route
   * @param useSteinerOptimization - Whether to apply Steiner optimization after MST
   * @returns Routing result with merged path and metadata
   */
  routeNet(points: { x: number; y: number; layer: string }[], useSteinerOptimization: boolean = false): IRoutePath {
    const startTime = performance.now();
    return profiler.profile('AStarRouter.routeNet', () => {
      if (points.length < 2) {
        return {
          nodes: [],
          length: 0,
          viaCount: 0,
          success: false,
          error: 'Net routing requires at least 2 connection points',
        };
      }

      if (points.length === 2) {
        // Fall back to simple point-to-point routing
        return this.route(points[0], points[1]);
      }

      if (this.options.debug)
        logger.debug(chalk.blue(`[AStarRouter] Routing net with ${points.length} connection points using MST`));

      // Build MST to determine optimal routing order
      const mstEdges = this.buildMST(points);

      // If a coarse grid factory is provided and the requested grid resolution is
      // coarser than the current fine grid, attempt hierarchical routing: route
      // the net on the coarse grid (fast) and then refine each coarse segment
      // on the fine grid. This reduces the amount of expensive fine-grid search.
      if (this.coarseGridFactory) {
        try {
          const hierarchical = this.routeNetMultiResolution(points, useSteinerOptimization);
          if (hierarchical && hierarchical.success) {
            return hierarchical;
          }
        } catch (e) {
          if (this.options.debug)
            logger.warn(chalk.yellow('[AStarRouter] Hierarchical routing failed, falling back to fine-grid routing'));
        }
      }

      // Track which points have been routed (as part of the growing tree)
      const routedPoints = new Set<number>();
      const allNodes: { x: number; y: number; layer: string }[] = [];
      const allGridNodes: { gridX: number; gridY: number; layer: string }[] = [];
      const segments: IRoutePath[] = []; // Store individual segments
      let totalLength = 0;
      let totalVias = 0;
      let successCount = 0;

      // Route edges in MST order, merging each success into the tree before
      // the next edge routes — later edges can then branch into the existing
      // trunk (routeMSTEdge) instead of strictly routing pad-to-pad.
      const router = this.getMstRouter();
      for (let i = 0; i < mstEdges.length; i++) {
        const edge = mstEdges[i];
        const { from, to } = edge;
        const segmentResult = router.routeMSTEdge(points[from], points[to], points, routedPoints, allNodes);

        if (!segmentResult || !segmentResult.success) {
          // Continue with remaining edges (partial routing)
          continue;
        }

        successCount++;
        segments.push(segmentResult); // Store the individual segment

        // Merge nodes into the combined path (for visualization only)
        if (allNodes.length === 0) {
          // First successful segment - add all nodes
          allNodes.push(...segmentResult.nodes);
          if (segmentResult.gridNodes) {
            allGridNodes.push(...segmentResult.gridNodes);
          }
        } else {
          // Subsequent segments - only add nodes if they extend the tree
          // Skip the first node if it duplicates an existing connection point
          const skipFirst = pointsEqual(allNodes[allNodes.length - 1], segmentResult.nodes[0]);
          const nodesToAdd = skipFirst ? segmentResult.nodes.slice(1) : segmentResult.nodes;
          allNodes.push(...nodesToAdd);
          if (segmentResult.gridNodes) {
            const gridNodesToAdd = skipFirst ? segmentResult.gridNodes.slice(1) : segmentResult.gridNodes;
            allGridNodes.push(...gridNodesToAdd);
          }
        }
        routedPoints.add(from);
        routedPoints.add(to);

        totalLength += segmentResult.length;
        totalVias += segmentResult.viaCount;
      }

      // Check if we successfully routed all connections
      const allPointsRouted = routedPoints.size === points.length;

      if (successCount === 0) {
        const endTime = performance.now();
        const errorResult = {
          nodes: [],
          length: 0,
          viaCount: 0,
          success: false,
          error: 'Failed to route any connections in the net',
        };
        this.logNetResult(errorResult, points, endTime - startTime);
        return errorResult;
      }

      if (this.options.debug)
        logger.debug(
          chalk.green(
            `[AStarRouter] Net routing complete: ${successCount}/${mstEdges.length} edges, ${allNodes.length} total nodes, ${totalLength.toFixed(2)}mm, ${totalVias} vias`,
          ),
        );

      const initialPath: IRoutePath = {
        nodes: allNodes,
        gridNodes: allGridNodes.length > 0 ? allGridNodes : undefined,
        segments: segments, // Include individual segments for track creation
        length: totalLength,
        viaCount: totalVias,
        success: allPointsRouted,
        error: allPointsRouted ? undefined : `Partial routing: ${successCount}/${mstEdges.length} edges completed`,
      };

      // Apply Steiner optimization if requested
      if (useSteinerOptimization && allPointsRouted) {
        const optimizedPath = this.optimizeWithSteiner(initialPath, points, true);
        const endTime = performance.now();
        this.logNetResult(optimizedPath, points, endTime - startTime);
        return optimizedPath;
      }

      const endTime = performance.now();
      this.logNetResult(initialPath, points, endTime - startTime);
      return initialPath;
    })();
  }

  /**
   * Multi-resolution net routing: route the net on a coarser grid first,
   * then refine each coarse path segment on the fine grid.
   */
  private routeNetMultiResolution(
    points: { x: number; y: number; layer: string }[],
    useSteinerOptimization: boolean = false,
  ): IRoutePath {
    const fineResolution = this.grid.getResolution();
    const targetResolution = this.requestedGridResolution ?? fineResolution;
    if (!this.coarseGridFactory || targetResolution <= fineResolution + 1e-9) {
      // Nothing to do; fall back to standard routing using a router without
      // coarseGridFactory to avoid infinite recursion back into this method.
      const fallbackRouter = new AStarRouter(this.grid, {
        ...this.rawOptions,
        disableResumeGrid: true,
        coarseGridFactory: undefined,
      });
      return fallbackRouter.routeNet(points, useSteinerOptimization);
    }

    // Create a coarse grid and router with similar options but coarser resolution
    const coarseGrid = this.coarseGridFactory(targetResolution);
    const coarseRouter = new AStarRouter(coarseGrid, {
      ...this.rawOptions,
      traceWidth: this.options.traceWidth,
      clearance: this.options.clearance,
      allowedLayers: this.options.allowedLayers,
      viaCost: this.options.viaCost,
      viaClearance: this.options.viaClearance,
      bendCost: this.options.bendCost,
      net: this.options.net,
      impedance: this.options.impedance,
      maxIterations: this.options.maxIterations,
      allowVias: this.options.allowVias,
      allow45DegreeRuns: this.options.allow45DegreeRuns,
      freeViaLocations: this.rawOptions.freeViaLocations,
      preferredLayers: this.options.preferredLayers,
      debug: this.options.debug,
      useAdaptiveStride: this.options.useAdaptiveStride,
      maxStrideCells: this.options.maxStrideCells,
      strideNearPadDisableRadiusMm: this.options.strideNearPadDisableRadiusMm,
      heuristicWeight: this.options.heuristicWeight,
      requestedGridResolution: targetResolution,
      resumeGridResolution: targetResolution,
      coarseGridFactory: undefined,
      disableResumeGrid: true,
    });

    // Route the entire net on the coarse grid to get a rough route
    const coarseResult = coarseRouter.routeNet(points, useSteinerOptimization);
    if (!coarseResult.success || !coarseResult.nodes || coarseResult.nodes.length < 2) {
      if (this.options.debug)
        logger.warn(chalk.yellow('[AStarRouter] Coarse routing failed during hierarchical routing'));
      // Fallback: try full fine-grid routing using a router instance that has
      // coarseGridFactory disabled to avoid recursive hierarchy attempts.
      const fallbackRouter = new AStarRouter(this.grid, {
        ...this.rawOptions,
        disableResumeGrid: true,
        coarseGridFactory: undefined,
      });
      return fallbackRouter.routeNet(points, useSteinerOptimization);
    }

    // Refine each coarse segment on the fine grid
    const segments: IRoutePath[] = [];
    let currentPoint = coarseResult.nodes[0];
    for (let i = 1; i < coarseResult.nodes.length; i++) {
      const target = coarseResult.nodes[i];
      const res = this.routeSegment(currentPoint, target);
      if (!res.success) {
        // If any fine refinement fails, fallback to full fine-grid net routing
        if (this.options.debug)
          logger.warn(chalk.yellow('[AStarRouter] Segment refinement failed; falling back to fine-grid net routing'));
        const fallbackRouter = new AStarRouter(this.grid, {
          ...this.rawOptions,
          disableResumeGrid: true,
          coarseGridFactory: undefined,
        });
        return fallbackRouter.routeNet(points, useSteinerOptimization);
      }
      segments.push(res);
      currentPoint = target;
    }

    const merged = mergeSegments(segments);
    return merged;
  }

  /**
   * Route a single MST edge, optionally through waypoints.
   * @private
   */
  private routeMSTEdge(
    fromPoint: { x: number; y: number; layer: string },
    toPoint: { x: number; y: number; layer: string },
    allPoints: { x: number; y: number; layer: string }[],
    routedPoints: Set<number>,
    existingTreeNodes: { x: number; y: number; layer: string }[],
  ): IRoutePath {
    // Prefer branching into an existing routed trunk when beneficial.
    // If one endpoint is already in the routed tree, route the other endpoint
    // to the nearest existing tree node instead of strictly to the pad.
    const useTrunkRouting = existingTreeNodes && existingTreeNodes.length > 0;

    const pickNearestTreeNode = (p: {
      x: number;
      y: number;
      layer: string;
    }): { x: number; y: number; layer: string } | null => {
      if (!useTrunkRouting) return null;
      let bestNode: { x: number; y: number; layer: string } | null = null;
      let bestDist = Infinity;
      for (const n of existingTreeNodes) {
        const dx = n.x - p.x;
        const dy = n.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          bestNode = n;
        }
      }
      return bestNode;
    };

    // Determine if either endpoint is already part of the routed tree
    // We infer this from routedPoints (which tracks terminals by index) combined with proximity checks.
    // routedPoints ensures at least one of the two terminals belongs to the current tree for later edges.
    // Identify which terminal(s) are in the tree by comparing coordinates.
    const isSamePoint = (
      a: { x: number; y: number; layer: string },
      b: { x: number; y: number; layer: string },
    ): boolean => {
      const tol = 1e-3;
      return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && a.layer === b.layer;
    };

    // Helper to decide trunk target for the endpoint not yet in tree
    const decideTrunkTarget = (
      freeEnd: { x: number; y: number; layer: string },
      treeEnd: { x: number; y: number; layer: string },
    ): { x: number; y: number; layer: string } | null => {
      const nearest = pickNearestTreeNode(freeEnd);
      if (!nearest) return null;

      // Compare heuristic distance to the actual pad vs nearest trunk node
      const freeGrid = this.grid.worldToGrid(freeEnd.x, freeEnd.y);
      const padGrid = this.grid.worldToGrid(treeEnd.x, treeEnd.y);
      const nearGrid = this.grid.worldToGrid(nearest.x, nearest.y);

      const viaPenalty = this.options.viaCost ?? 0;
      const costToPad = heuristicDistance(
        freeGrid.x,
        freeGrid.y,
        freeEnd.layer,
        padGrid.x,
        padGrid.y,
        treeEnd.layer,
        viaPenalty,
        0,
        this.options.allow45DegreeRuns,
      );
      const costToTrunk = heuristicDistance(
        freeGrid.x,
        freeGrid.y,
        freeEnd.layer,
        nearGrid.x,
        nearGrid.y,
        nearest.layer,
        viaPenalty,
        0,
        this.options.allow45DegreeRuns,
      );

      // Favor trunk if it is not worse than pad by a small margin
      return costToTrunk <= costToPad * 0.95 ? nearest : null;
    };
    // If trunk routing is applicable, attempt to branch into the existing tree
    // rather than routing strictly pad-to-pad for later MST edges.
    if (useTrunkRouting) {
      // Determine which endpoint (if any) is already part of the tree based on routedPoints membership.
      // We find indices for from/to in allPoints to consult routedPoints.
      const fromIdx = allPoints.findIndex((p) => isSamePoint(p, fromPoint));
      const toIdx = allPoints.findIndex((p) => isSamePoint(p, toPoint));
      const fromInTree = fromIdx >= 0 && routedPoints.has(fromIdx);
      const toInTree = toIdx >= 0 && routedPoints.has(toIdx);

      // If exactly one endpoint is already in the tree, consider trunk routing for the other endpoint.
      if (fromInTree !== toInTree) {
        const freeEnd = fromInTree ? toPoint : fromPoint;
        const treeEnd = fromInTree ? fromPoint : toPoint;
        const trunkTarget = decideTrunkTarget(freeEnd, treeEnd);

        if (trunkTarget) {
          if (this.options.debug) {
            const dPad = Math.hypot(treeEnd.x - freeEnd.x, treeEnd.y - freeEnd.y).toFixed(2);
            const dTrunk = Math.hypot(trunkTarget.x - freeEnd.x, trunkTarget.y - freeEnd.y).toFixed(2);
            logger.debug(
              chalk.cyan(`[AStarRouter] Trunk routing: branching ${dTrunk}mm vs pad ${dPad}mm (selected trunk)`),
            );
          }
          // Route the free endpoint to the selected trunk node
          const trunkRoute = this.routeSegment(freeEnd, trunkTarget);
          if (trunkRoute.success) {
            return trunkRoute; // Done: branch into the trunk
          }
          // If trunk route fails, fall through to normal routing logic
        }
      }
    }

    // Check if we should route through nearby through-holes
    const waypointInfo = this.waypointPlanner.planWaypoints(fromPoint, toPoint);

    if (waypointInfo.waypoints.length === 0) {
      // Direct routing
      return this.routeSegment(fromPoint, toPoint);
    }

    // Route through waypoints: start -> TH1 -> TH2 -> end
    const segments: IRoutePath[] = [];
    let currentPoint = fromPoint;
    let segmentIndex = 0;

    for (const waypoint of waypointInfo.waypoints) {
      // Skip first segment if endpoint is already at/very close to first waypoint
      if (segmentIndex === 0 && waypointInfo.skipFirstSegment) {
        currentPoint = waypoint;
        segmentIndex++;
        continue;
      }

      const wpResult = this.routeSegment(currentPoint, waypoint);
      if (!wpResult.success) {
        break;
      }
      segments.push(wpResult);
      currentPoint = waypoint;
      segmentIndex++;
    }

    // Route from last waypoint to destination (unless it's already very close)
    if (segments.length === waypointInfo.waypoints.length - (waypointInfo.skipFirstSegment ? 1 : 0)) {
      if (!waypointInfo.skipLastSegment) {
        const finalResult = this.routeSegment(currentPoint, toPoint);
        if (!finalResult.success) {
          // Fall back to direct routing
          return this.routeSegment(fromPoint, toPoint);
        }
        segments.push(finalResult);
      }

      // Merge segments if we have any
      if (segments.length > 0) {
        return mergeSegments(segments);
      }
    }

    // Fall back to direct routing
    return this.routeSegment(fromPoint, toPoint);
  }

  private buildMST(points: { x: number; y: number; layer: string }[]): { from: number; to: number; cost: number }[] {
    // Prefer a start point on the preferred layer if present
    let startIdx = 0;
    if (this.options.preferredLayers && this.options.preferredLayers.length > 0) {
      const preferredLayer = this.options.preferredLayers[0];
      const idx = points.findIndex((p) => p.layer === preferredLayer);
      if (idx !== -1) startIdx = idx;
    }

    // Pre-compute grid coordinates for all points to avoid repeated conversions
    const enrichedPoints = points.map((p) => {
      const gridPos = this.grid.worldToGrid(p.x, p.y);
      return {
        x: p.x,
        y: p.y,
        layer: p.layer,
        gridX: gridPos.x,
        gridY: gridPos.y,
      };
    });

    const edges = buildSharedMST(
      enrichedPoints,
      (i, j) => this.waypointPlanner.estimateEdgeCost(enrichedPoints[i], enrichedPoints[j]),
      startIdx,
    );
    return edges;
  }

  /**
   * Route through a series of waypoints.
   * @private
   */
  private routeWithWaypoints(
    start: { x: number; y: number; layer: string },
    end: { x: number; y: number; layer: string },
    waypoints: IAutorouteWaypoint[],
  ): IRoutePath {
    const startTime = performance.now();
    const segments: { x: number; y: number; layer: string }[] = [start];

    // Add waypoints
    for (const wp of waypoints) {
      segments.push({
        x: wp.x,
        y: wp.y,
        layer: wp.layer || start.layer,
      });
    }

    // Add end
    segments.push(end);

    // Route each segment
    const allNodes: { x: number; y: number; layer: string }[] = [];
    const allGridNodes: { gridX: number; gridY: number; layer: string }[] = [];
    let totalLength = 0;
    let totalVias = 0;

    for (let i = 0; i < segments.length - 1; i++) {
      const segmentResult = this.routeSegment(segments[i], segments[i + 1]);

      if (!segmentResult.success) {
        const endTime = performance.now();
        const errorResult = {
          nodes: [],
          length: 0,
          viaCount: 0,
          success: false,
          error: `Failed to route segment ${i + 1}: ${segmentResult.error}`,
        };
        this.logRouteResult(errorResult, start, end, endTime - startTime);
        return errorResult;
      }

      appendSegmentNodes(allNodes, allGridNodes, segmentResult);

      totalLength += segmentResult.length;
      totalVias += segmentResult.viaCount;
    }

    const endTime = performance.now();
    const result = {
      nodes: allNodes,
      gridNodes: allGridNodes.length > 0 ? allGridNodes : undefined,
      length: totalLength,
      viaCount: totalVias,
      success: true,
    };
    this.logRouteResult(result, start, end, endTime - startTime);
    return result;
  }

  /**
   * Route through a series of forced via locations.
   * For each via, the router will reach the XY coordinate, insert a layer change,
   * then continue from the via on the requested layer.
   */
  private routeWithVias(
    start: { x: number; y: number; layer: string },
    end: { x: number; y: number; layer: string },
    vias: IAutorouteVia[],
  ): IRoutePath {
    const startTime = performance.now();
    const segments: IRoutePath[] = [];
    let currentPoint = { ...start };

    // Organic via placement in every segment keeps its distance from the
    // forced vias still ahead, so the route does not stack same-net vias
    // around them. If a seeded segment cannot be found, fall back to an
    // unseeded search for that segment.
    const remainingVias = vias.map((v) => ({ x: v.x, y: v.y }));

    for (const via of vias) {
      const viaEntryPoint = {
        x: via.x,
        y: via.y,
        layer: currentPoint.layer,
      };

      if (!pointsEqual(currentPoint, viaEntryPoint)) {
        let approachResult = this.routeSegment(currentPoint, viaEntryPoint, { seedVias: remainingVias });
        if (!approachResult.success) {
          approachResult = this.routeSegment(currentPoint, viaEntryPoint);
        }
        if (!approachResult.success) {
          const endTime = performance.now();
          const errorResult = {
            nodes: [],
            length: 0,
            viaCount: 0,
            success: false,
            error: `Failed to reach via at (${via.x}, ${via.y}): ${approachResult.error ?? 'unknown error'}`,
          };
          this.logRouteResult(errorResult, start, end, endTime - startTime);
          return errorResult;
        }
        segments.push(approachResult);
      }

      const targetLayer = via.layer;
      const viaIdx = remainingVias.findIndex((v) => v.x === via.x && v.y === via.y);
      if (viaIdx !== -1) remainingVias.splice(viaIdx, 1);
      if (targetLayer && targetLayer !== viaEntryPoint.layer) {
        // Before forcing a via at the requested coordinate, ensure it is DRC-legal
        // with respect to existing copper. Use the same numeric rule as KiCad
        // (viaClearance / netclass clearance), measured from the via PAD EDGE —
        // so the via's own radius must be added to the centerline clearance,
        // matching what organic via placement enforces via
        // ClearanceProfile.getViaKeepoutRadius(). The check covers every layer
        // the via spans: a through via's barrel crosses inner layers too, and
        // an inner-layer track under the via pad is a short.
        const gridPos = this.grid.worldToGrid(via.x, via.y);
        const viaClearance = this.options.viaClearance ?? this.options.clearance;
        const viaEdgeClearance = viaClearance + this.clearanceProfile.getViaDiameter() / 2;
        const spanLayers = viaSpanLayers(
          this.options.allowedLayers ?? [viaEntryPoint.layer],
          this.options.layerOrder ?? [],
          viaEntryPoint.layer,
          targetLayer,
        );
        const viaConflicts = spanLayers.some((spanLayer) =>
          this.grid.isOccupied(gridPos.x, gridPos.y, spanLayer, viaEdgeClearance, this.options.net, true, false),
        );

        if (viaConflicts) {
          const endTime = performance.now();
          const errorResult = {
            nodes: [],
            length: 0,
            viaCount: 0,
            success: false,
            error: `Forced via at (${via.x.toFixed(2)}, ${via.y.toFixed(2)}) violates clearance to existing copper`,
          };
          this.logRouteResult(errorResult, start, end, endTime - startTime);
          return errorResult;
        }

        // Force a via directly at the requested coordinate without running a search.
        segments.push({
          nodes: [{ ...viaEntryPoint }, { x: via.x, y: via.y, layer: targetLayer }],
          length: 0,
          viaCount: 1,
          success: true,
        });
        currentPoint = { x: via.x, y: via.y, layer: targetLayer };
      } else {
        currentPoint = { ...viaEntryPoint };
      }
    }

    const forcedPositions = vias.map((v) => ({ x: v.x, y: v.y }));
    let finalResult = this.routeSegment(currentPoint, end, { seedVias: forcedPositions });
    if (!finalResult.success) {
      finalResult = this.routeSegment(currentPoint, end);
    }
    if (!finalResult.success) {
      const endTime = performance.now();
      const errorResult = {
        nodes: [],
        length: 0,
        viaCount: 0,
        success: false,
        error: finalResult.error ?? 'Failed to route final segment after vias',
      };
      this.logRouteResult(errorResult, start, end, endTime - startTime);
      return errorResult;
    }
    segments.push(finalResult);

    const endTime = performance.now();
    const result = mergeSegments(segments);
    this.logRouteResult(result, start, end, endTime - startTime);
    return result;
  }

  /**
   * Route a single segment using A*.
   * Made public to allow Steiner optimizer to re-route through Steiner points.
   */
  public routeSegment(
    start: { x: number; y: number; layer: string },
    end: { x: number; y: number; layer: string },
    opts?: { seedVias?: { x: number; y: number }[] },
  ): IRoutePath {
    return profiler.profile('AStarRouter.routeSegment', () => {
      const path = this.gridSearch.findPath(start, end, opts?.seedVias);
      const normal = this.normalizeViaPairs(this.maybeResumeOnCoarseGrid(path, start, end));
      return this.preferSingleLayer(start, end, normal, opts?.seedVias);
    })();
  }

  /**
   * Vias are a tool, not a default: when the normal path between same-layer
   * endpoints uses vias, try a single-layer alternative and keep it while it
   * costs less than the vias it save (a via is worth roughly
   * VIA_PREFERENCE_MM of trace). This kills the classic gratuitous via —
   * dropping through a through-hole pad to start the route on a less
   * congested layer when the same-layer route was perfectly fine.
   * Unbounded preference would produce absurd detours when the direct
   * corridor is congested — hopping under it is exactly what vias are for.
   */
  private preferSingleLayer(
    start: { x: number; y: number; layer: string },
    end: { x: number; y: number; layer: string },
    normal: IRoutePath,
    seedVias?: { x: number; y: number }[],
  ): IRoutePath {
    // The via-free sub-router has allowVias disabled, so its own
    // routeSegment skips this preference — no recursion. Same-layer
    // endpoints only; a layer change needs the via by definition. And no
    // extra search when the normal path already avoided vias.
    if (!this.options.allowVias || !normal.success || normal.viaCount === 0 || start.layer !== end.layer) {
      return normal;
    }
    // Explicitly pinned layers (route() `layers`, net-class affinity) are a
    // user instruction to route there — offering a same-layer shortcut on a
    // non-preferred layer would silently undo that choice.
    const preferred = this.options.preferredLayers;
    const allowed = this.options.allowedLayers;
    const pinned =
      preferred && allowed && (preferred.length !== allowed.length || preferred.some((l) => !allowed.includes(l)));
    if (pinned && !preferred.includes(start.layer)) {
      return normal;
    }
    const viaFree = this.getViaFreeRouter().routeSegment(start, end, { seedVias });
    if (!viaFree.success) {
      return normal;
    }
    if (viaFree.length <= normal.length + normal.viaCount * AStarRouter.ROUTING_CONSTANTS.VIA_PREFERENCE_MM) {
      return viaFree;
    }
    return normal;
  }

  /**
   * Format time display - show seconds for times >= 1000ms, milliseconds otherwise
   * @private
   */
  private formatTime(timeMs: number): string {
    if (timeMs >= 1000) {
      const seconds = timeMs / 1000;
      return `${seconds.toFixed(2)}s`;
    } else {
      return `${timeMs.toFixed(2)}ms`;
    }
  }

  /**
   * Log routing result with colored output and useful information.
   * @private
   */
  private logRouteResult(
    result: IRoutePath,
    start: { x: number; y: number; layer: string },
    end: { x: number; y: number; layer: string },
    routeTime: number = 0,
  ): void {
    const netName = this.options.net || 'unnamed';
    const timeString = this.formatTime(routeTime);

    if (result.success) {
      let output =
        '├──' +
        ' ' +
        chalk.blue(netName) +
        ' ' +
        chalk.gray(
          `(${start.x.toFixed(2)},${start.y.toFixed(2)})${start.layer} -> (${end.x.toFixed(2)},${end.y.toFixed(2)})${end.layer}`,
        ) +
        ' ' +
        chalk.yellow(`${result.length.toFixed(2)}mm`);

      if (result.viaCount > 0) {
        output += ' ' + chalk.cyan(`+${result.viaCount} vias`);
      }

      output += ' ' + chalk.magenta(timeString);
      if (this.options.debug) {
        process.stdout.write(output + '\n');
      } else {
        logger.debug(output);
      }
    } else {
      const output =
        chalk.red('[failed]') +
        ' ' +
        chalk.blue(`[${netName}]`) +
        ' ' +
        chalk.gray(
          `(${start.x.toFixed(2)},${start.y.toFixed(2)})${start.layer} -> (${end.x.toFixed(2)},${end.y.toFixed(2)})${end.layer}`,
        ) +
        ' ' +
        chalk.red(result.error || 'Routing failed') +
        ' ' +
        chalk.magenta(timeString);

      if (this.options.debug) {
        process.stdout.write(output + '\n');
      } else {
        logger.debug(output);
      }
    }
  }

  /**
   * Log net routing result with colored output and useful information.
   * @private
   */
  private logNetResult(
    result: IRoutePath,
    points: { x: number; y: number; layer: string }[],
    routeTime: number = 0,
  ): void {
    const netName = this.options.net || 'unnamed';
    const timeString = this.formatTime(routeTime);

    if (result.success) {
      let output =
        chalk.green('[net routed]') +
        ' ' +
        chalk.blue(`[${netName}]`) +
        ' ' +
        chalk.gray(`Net with ${points.length} points`) +
        ' ' +
        chalk.yellow(`${result.length.toFixed(2)}mm`);

      if (result.viaCount > 0) {
        output += ' ' + chalk.cyan(`+${result.viaCount} vias`);
      }

      output += ' ' + chalk.magenta(timeString);
      // Always show routing results, not just in debug mode
      process.stdout.write(output + '\n');
    } else {
      const output =
        chalk.red('[net failed]') +
        ' ' +
        chalk.blue(`[${netName}]`) +
        ' ' +
        chalk.gray(`Net with ${points.length} points`) +
        ' ' +
        chalk.red(result.error || 'Net routing failed') +
        ' ' +
        chalk.magenta(timeString);

      // Always show routing results, not just in debug mode
      if (this.options.debug) {
        process.stdout.write(output + '\n');
      } else {
        logger.debug(output);
      }
    }
  }

  /**
   * geometry changes outside of this router (e.g., manual edits).
   */
  public invalidateCaches(scope: { windows?: boolean; paths?: boolean; occupancy?: boolean } = {}): void {
    this.gridSearch.resetCaches(scope);
  }

  /**
   * Alias for cache invalidation so hosts can uniformly reset router internals
   * when board obstacles change.
   */
  public resetCaches(scope: { windows?: boolean; paths?: boolean; occupancy?: boolean } = {}): void {
    this.invalidateCaches(scope);
  }

  dispose(): void {
    if (this._mstRouter) {
      this._mstRouter.dispose();
      this._mstRouter = null;
    }
    if (this._viaFreeRouter) {
      this._viaFreeRouter.dispose();
      this._viaFreeRouter = null;
    }
    if (this.gridSearch) {
      this.gridSearch.dispose();
    }
  }
}
