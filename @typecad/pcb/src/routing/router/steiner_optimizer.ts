import { RoutingGrid } from '../contracts/routing_grid.js';
import type { AStarRouter, IRoutePath } from './astar_router.js';
import { mergeSegments } from './path_assembler.js';
import chalk from 'chalk';
import logger from '../../utils/logging.js';
import { buildMST as buildSharedMST } from '../shared/mst.js';

/**
 * Represents a Steiner point - an intermediate junction point that can reduce total trace length
 */
export interface ISteinerPoint {
  x: number;
  y: number;
  layer: string;
  /** Connection points this Steiner point serves */
  connectedTerminals: number[];
  /** Estimated savings if this point is used (mm) */
  savings: number;
}

/**
 * Edge in the Steiner tree
 */
interface ISteinerEdge {
  from: number; // Terminal or Steiner point index
  to: number;
  cost: number;
  layer: string;
}

/**
 * Result of Steiner optimization
 */
export interface ISteinerOptimizationResult {
  /** Optimized path with Steiner points */
  path: IRoutePath;
  /** Steiner points added */
  steinerPoints: ISteinerPoint[];
  /** Length reduction achieved (mm) */
  lengthReduction: number;
  /** Percentage improvement */
  improvement: number;
  /** Via count change (negative means fewer vias) */
  viaReduction: number;
}

/**
 * Steiner Tree optimizer for PCB routing.
 * Optimizes multi-terminal nets by finding optimal junction points (Steiner points)
 * that minimize total trace length.
 */
export class SteinerOptimizer {
  // Optimization tuning constants
  private static readonly OPTIMIZATION_CONSTANTS = {
    /** Maximum span (mm) for terminals to be worth Steiner optimization */
    MAX_TERMINAL_SPAN: 50,
    /** Minimum savings (mm) required to use a Steiner point */
    MIN_STEINER_SAVINGS: 2.0,
    /** Maximum distance (mm) from terminal to Steiner point */
    MAX_TERMINAL_DISTANCE: 20,
    /** A* routing overhead factor (routes are typically longer than straight line) */
    ROUTING_OVERHEAD_FACTOR: 1.4,
    /** Penalty (mm) for adding each Steiner point (complexity cost) */
    COMPLEXITY_PENALTY: 0.5,
    /** Maximum number of Steiner points to add */
    MAX_STEINER_POINTS: 2,
    /** Tolerance (mm) for duplicate point detection */
    DUPLICATE_TOLERANCE: 0.1,
    /** Tolerance for Fermat point convergence */
    FERMAT_TOLERANCE: 0.001,
    /** Maximum iterations for Fermat point calculation */
    FERMAT_MAX_ITERATIONS: 20,
  } as const;

  private grid: RoutingGrid;
  private clearance: number;
  private traceWidth: number;
  private net?: string;
  private router?: AStarRouter; // A* router instance for re-routing through Steiner points

  /**
   * Create a new Steiner optimizer
   * @param grid - Routing grid for pathfinding
   * @param clearance - Minimum clearance requirement
   * @param traceWidth - Trace width
   * @param net - Net name for obstacle checking
   * @param router - Optional router instance for re-routing segments
   */
  constructor(grid: RoutingGrid, clearance: number, traceWidth: number, net?: string, router?: AStarRouter) {
    this.grid = grid;
    this.clearance = clearance;
    this.traceWidth = traceWidth;
    this.net = net;
    this.router = router;
  }

  private debugEnabled(): boolean {
    try {
      return !!this.router?.routingOptions?.debug;
    } catch {
      logger.debug('[SteinerOptimizer] debugEnabled check failed');
      return false;
    }
  }

  /**
   * Optimize a routed path using Steiner tree algorithm
   * @param initialPath - Initial MST-based routing result
   * @param terminals - Original connection points (pins)
   * @param minImprovement - Minimum improvement threshold (default 5%)
   * @returns Optimization result with improved path or null if no improvement
   */
  optimize(
    initialPath: IRoutePath,
    terminals: { x: number; y: number; layer: string }[],
    minImprovement: number = 0.05,
  ): ISteinerOptimizationResult | null {
    if (this.debugEnabled()) {
      logger.debug(chalk.blue(`[SteinerOptimizer] Starting optimization for ${terminals.length} terminals`));
      logger.debug(
        chalk.blue(
          `[SteinerOptimizer] Initial length: ${initialPath.length.toFixed(2)}mm, vias: ${initialPath.viaCount}`,
        ),
      );
    }

    if (terminals.length < 3) {
      if (this.debugEnabled())
        logger.debug(chalk.yellow(`[SteinerOptimizer] Skipping: need at least 3 terminals for Steiner optimization`));
      return null;
    }

    if (!initialPath.segments || initialPath.segments.length === 0) {
      if (this.debugEnabled())
        logger.debug(chalk.yellow(`[SteinerOptimizer] Skipping: no segments available in initial path`));
      return null;
    }

    // Early check: only worth optimizing if terminals are reasonably close
    // Calculate bounding box of terminals
    const xs = terminals.map((t) => t.x);
    const ys = terminals.map((t) => t.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const maxSpan = Math.max(spanX, spanY);

    // If terminals are spread out too far, Steiner optimization rarely helps
    if (maxSpan > SteinerOptimizer.OPTIMIZATION_CONSTANTS.MAX_TERMINAL_SPAN) {
      if (this.debugEnabled())
        logger.debug(
          chalk.yellow(
            `[SteinerOptimizer] Terminals span ${maxSpan.toFixed(1)}mm - too spread out for Steiner optimization`,
          ),
        );
      return null;
    }

    // Step 1: Generate candidate Steiner points
    const candidates = this.generateSteinerCandidates(terminals, initialPath);
    if (this.debugEnabled())
      logger.debug(chalk.blue(`[SteinerOptimizer] Generated ${candidates.length} candidate Steiner points`));

    if (candidates.length === 0) {
      if (this.debugEnabled()) logger.debug(chalk.yellow(`[SteinerOptimizer] No valid candidates found`));
      return null;
    }

    // Step 2: Evaluate candidates and select beneficial ones
    const selectedSteinerPoints = this.selectBestSteinerPoints(terminals, candidates, initialPath);
    if (this.debugEnabled())
      logger.debug(chalk.blue(`[SteinerOptimizer] Selected ${selectedSteinerPoints.length} Steiner points`));

    if (selectedSteinerPoints.length === 0) {
      if (this.debugEnabled()) logger.debug(chalk.yellow(`[SteinerOptimizer] No beneficial Steiner points found`));
      return null;
    }

    // Step 3: Build optimized tree with Steiner points
    const optimizedPath = this.buildOptimizedTree(terminals, selectedSteinerPoints, initialPath);

    if (!optimizedPath) {
      if (this.debugEnabled()) logger.debug(chalk.yellow(`[SteinerOptimizer] Failed to build optimized tree`));
      return null;
    }

    // Step 4: Calculate improvements
    const lengthReduction = initialPath.length - optimizedPath.length;
    const improvement = lengthReduction / initialPath.length;
    const viaReduction = initialPath.viaCount - optimizedPath.viaCount;

    if (this.debugEnabled()) {
      logger.info(chalk.green(`[SteinerOptimizer] Optimization complete:`));
      logger.info(
        chalk.green(
          `  Length: ${initialPath.length.toFixed(2)}mm -> ${optimizedPath.length.toFixed(2)}mm (${(improvement * 100).toFixed(1)}% reduction)`,
        ),
      );
      logger.info(chalk.green(`  Vias: ${initialPath.viaCount} -> ${optimizedPath.viaCount} (${viaReduction} fewer)`));
    }

    // Only return if improvement meets threshold
    if (improvement < minImprovement) {
      if (this.debugEnabled())
        logger.debug(
          chalk.yellow(
            `[SteinerOptimizer] Improvement ${(improvement * 100).toFixed(1)}% below threshold ${(minImprovement * 100).toFixed(1)}%`,
          ),
        );
      return null;
    }

    return {
      path: optimizedPath,
      steinerPoints: selectedSteinerPoints,
      lengthReduction,
      improvement,
      viaReduction,
    };
  }

  /**
   * Generate candidate Steiner points by analyzing path intersections and geometric positions
   * @private
   */
  private generateSteinerCandidates(
    terminals: { x: number; y: number; layer: string }[],
    initialPath: IRoutePath,
  ): ISteinerPoint[] {
    const candidates: ISteinerPoint[] = [];

    // Strategy 1: Find potential junction points between terminal pairs
    // For each triplet of terminals, find the Fermat point (point that minimizes sum of distances)
    for (let i = 0; i < terminals.length; i++) {
      for (let j = i + 1; j < terminals.length; j++) {
        for (let k = j + 1; k < terminals.length; k++) {
          const t1 = terminals[i];
          const t2 = terminals[j];
          const t3 = terminals[k];

          // Determine the layer to use for this Steiner point
          let steinerLayer: string;

          // Prefer the user's specified layer if available
          if (this.router?.routingOptions?.preferredLayers && this.router.routingOptions.preferredLayers.length > 0) {
            steinerLayer = this.router.routingOptions.preferredLayers[0];
          } else {
            // Fallback: use the dominant layer (most common among the three terminals)
            const layers = [t1.layer, t2.layer, t3.layer];
            const layerCounts = new Map<string, number>();
            layers.forEach((l) => layerCounts.set(l, (layerCounts.get(l) || 0) + 1));
            steinerLayer = Array.from(layerCounts.entries()).reduce((a, b) => (a[1] > b[1] ? a : b))[0];
          }

          // Calculate Fermat point (approximate using geometric median)
          const fermatPoint = this.calculateFermatPoint(t1, t2, t3, steinerLayer);

          if (fermatPoint && this.isValidSteinerLocation(fermatPoint)) {
            candidates.push({
              x: fermatPoint.x,
              y: fermatPoint.y,
              layer: fermatPoint.layer,
              connectedTerminals: [i, j, k],
              savings: 0, // Will be calculated later
            });
          }
        }
      }
    }

    // Strategy 2: Find midpoints on existing segments where branches could merge
    if (initialPath.segments) {
      for (let i = 0; i < initialPath.segments.length; i++) {
        for (let j = i + 1; j < initialPath.segments.length; j++) {
          const seg1 = initialPath.segments[i];
          const seg2 = initialPath.segments[j];

          if (seg1.nodes.length >= 2 && seg2.nodes.length >= 2) {
            // Find closest points between the two segments
            const closestPair = this.findClosestPointsBetweenSegments(seg1, seg2);
            if (closestPair) {
              const midpoint = {
                x: (closestPair.p1.x + closestPair.p2.x) / 2,
                y: (closestPair.p1.y + closestPair.p2.y) / 2,
                layer: closestPair.p1.layer,
              };

              if (this.isValidSteinerLocation(midpoint)) {
                candidates.push({
                  ...midpoint,
                  connectedTerminals: [], // Will be determined during evaluation
                  savings: 0,
                });
              }
            }
          }
        }
      }
    }

    // Remove duplicate candidates (within 0.1mm tolerance)
    const uniqueCandidates = this.removeDuplicatePoints(candidates);
    return uniqueCandidates;
  }

  /**
   * Calculate Fermat point (point minimizing sum of distances to three points)
   * Uses iterative Weiszfeld's algorithm
   * @private
   */
  private calculateFermatPoint(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    layer: string,
  ): { x: number; y: number; layer: string } | null {
    // Start with centroid as initial guess
    let x = (p1.x + p2.x + p3.x) / 3;
    let y = (p1.y + p2.y + p3.y) / 3;

    // Weiszfeld's algorithm - iterate to find Fermat point
    const maxIterations = SteinerOptimizer.OPTIMIZATION_CONSTANTS.FERMAT_MAX_ITERATIONS;
    const tolerance = SteinerOptimizer.OPTIMIZATION_CONSTANTS.FERMAT_TOLERANCE;

    for (let iter = 0; iter < maxIterations; iter++) {
      const d1 = Math.sqrt((x - p1.x) ** 2 + (y - p1.y) ** 2);
      const d2 = Math.sqrt((x - p2.x) ** 2 + (y - p2.y) ** 2);
      const d3 = Math.sqrt((x - p3.x) ** 2 + (y - p3.y) ** 2);

      // Avoid division by zero
      if (d1 < tolerance || d2 < tolerance || d3 < tolerance) {
        break;
      }

      const w1 = 1 / d1;
      const w2 = 1 / d2;
      const w3 = 1 / d3;
      const wSum = w1 + w2 + w3;

      const newX = (w1 * p1.x + w2 * p2.x + w3 * p3.x) / wSum;
      const newY = (w1 * p1.y + w2 * p2.y + w3 * p3.y) / wSum;

      if (Math.abs(newX - x) < tolerance && Math.abs(newY - y) < tolerance) {
        break;
      }

      x = newX;
      y = newY;
    }

    return { x, y, layer };
  }

  /**
   * Find closest points between two path segments
   * @private
   */
  private findClosestPointsBetweenSegments(
    seg1: IRoutePath,
    seg2: IRoutePath,
  ): {
    p1: { x: number; y: number; layer: string };
    p2: { x: number; y: number; layer: string };
    distance: number;
  } | null {
    let minDistance = Infinity;
    let closestPair: {
      p1: { x: number; y: number; layer: string };
      p2: { x: number; y: number; layer: string };
      distance: number;
    } | null = null;

    for (const n1 of seg1.nodes) {
      for (const n2 of seg2.nodes) {
        if (n1.layer === n2.layer) {
          const dist = Math.sqrt((n1.x - n2.x) ** 2 + (n1.y - n2.y) ** 2);
          if (dist < minDistance) {
            minDistance = dist;
            closestPair = { p1: n1, p2: n2, distance: dist };
          }
        }
      }
    }

    return closestPair;
  }

  /**
   * Check if a location is valid for placing a Steiner point (not blocked by obstacles)
   * @private
   */
  private isValidSteinerLocation(point: { x: number; y: number; layer: string }): boolean {
    const gridPos = this.grid.worldToGrid(point.x, point.y);

    if (!this.grid.isInBounds(gridPos.x, gridPos.y)) {
      return false;
    }

    // Check if location is occupied (with clearance)
    if (this.grid.isOccupied(gridPos.x, gridPos.y, point.layer, this.clearance, this.net, true, true)) {
      return false;
    }

    return true;
  }

  /**
   * Remove duplicate Steiner points within tolerance
   * @private
   */
  private removeDuplicatePoints(points: ISteinerPoint[]): ISteinerPoint[] {
    const tolerance = SteinerOptimizer.OPTIMIZATION_CONSTANTS.DUPLICATE_TOLERANCE;
    const unique: ISteinerPoint[] = [];

    for (const p of points) {
      const isDuplicate = unique.some(
        (u) => Math.abs(u.x - p.x) < tolerance && Math.abs(u.y - p.y) < tolerance && u.layer === p.layer,
      );

      if (!isDuplicate) {
        unique.push(p);
      }
    }

    return unique;
  }

  /**
   * Select the best Steiner points based on potential savings
   * @private
   */
  private selectBestSteinerPoints(
    terminals: { x: number; y: number; layer: string }[],
    candidates: ISteinerPoint[],
    initialPath: IRoutePath,
  ): ISteinerPoint[] {
    const debug = this.debugEnabled();
    // Evaluate each candidate by calculating potential savings
    const evaluatedCandidates = candidates.map((candidate) => {
      const savings = this.evaluateSteinerPoint(candidate, terminals, initialPath);
      return { ...candidate, savings };
    });

    // Sort by savings (descending)
    evaluatedCandidates.sort((a, b) => b.savings - a.savings);

    // Select candidates with significant positive savings (more conservative threshold)
    const beneficial = evaluatedCandidates.filter(
      (c) => c.savings > SteinerOptimizer.OPTIMIZATION_CONSTANTS.MIN_STEINER_SAVINGS,
    );

    if (debug) {
      logger.debug(
        chalk.blue(
          `[SteinerOptimizer] Found ${beneficial.length} candidates with >${SteinerOptimizer.OPTIMIZATION_CONSTANTS.MIN_STEINER_SAVINGS}mm estimated savings`,
        ),
      );
    }

    // Limit to avoid over-complication
    // (More Steiner points = more routing complexity = more overhead)
    const selected = beneficial.slice(0, SteinerOptimizer.OPTIMIZATION_CONSTANTS.MAX_STEINER_POINTS);

    if (debug && selected.length > 0) {
      logger.debug(chalk.blue(`[SteinerOptimizer] Best candidate savings: ${selected[0].savings.toFixed(2)}mm`));
    }

    return selected;
  }

  /**
   * Evaluate potential savings from using a Steiner point
   * Uses conservative estimation accounting for A* routing overhead
   * @private
   */
  private evaluateSteinerPoint(
    candidate: ISteinerPoint,
    terminals: { x: number; y: number; layer: string }[],
    initialPath: IRoutePath,
  ): number {
    // Calculate distance saved by routing through this Steiner point
    // Compare: direct connections vs routing through Steiner point

    // Find closest 3 terminals to this candidate
    const distances = terminals.map((t, idx) => ({
      idx,
      dist: Math.sqrt((t.x - candidate.x) ** 2 + (t.y - candidate.y) ** 2),
    }));
    distances.sort((a, b) => a.dist - b.dist);
    const closest3 = distances.slice(0, 3);

    // If closest terminals are too far, Steiner point won't help
    const maxDist = SteinerOptimizer.OPTIMIZATION_CONSTANTS.MAX_TERMINAL_DISTANCE;
    if (closest3[0].dist > maxDist || closest3[1].dist > maxDist || closest3[2].dist > maxDist) {
      return -100; // Large negative penalty
    }

    // Calculate direct connection cost (MST of 3 terminals)
    const t1 = terminals[closest3[0].idx];
    const t2 = terminals[closest3[1].idx];
    const t3 = terminals[closest3[2].idx];
    const directCost = this.distance(t1, t2) + this.distance(t2, t3);

    // Calculate cost via Steiner point (straight line)
    const steinerCostStraight = closest3[0].dist + closest3[1].dist + closest3[2].dist;

    // Apply A* routing overhead factor (routes are typically longer than straight line)
    const steinerCostActual = steinerCostStraight * SteinerOptimizer.OPTIMIZATION_CONSTANTS.ROUTING_OVERHEAD_FACTOR;

    // Savings is the difference (negative if Steiner is worse)
    const savings = directCost - steinerCostActual;

    // Additional penalty for adding complexity (more segments, more vias potentially)
    const complexityPenalty = SteinerOptimizer.OPTIMIZATION_CONSTANTS.COMPLEXITY_PENALTY;

    return savings - complexityPenalty;
  }

  /**
   * Calculate Euclidean distance between two points
   * @private
   */
  private distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }

  /**
   * Build optimized routing tree using selected Steiner points.
   * Routes through each MST edge using the A* router to properly avoid obstacles.
   */
  /**
   * Build optimized routing tree using selected Steiner points.
   * Routes through each MST edge using the A* router to properly avoid obstacles.
   */
  private buildOptimizedTree(
    terminals: { x: number; y: number; layer: string }[],
    steinerPoints: ISteinerPoint[],
    initialPath: IRoutePath,
  ): IRoutePath | null {
    const debug = this.debugEnabled();
    if (debug) {
      logger.debug(
        chalk.blue(`[SteinerOptimizer] Building optimized tree with ${steinerPoints.length} Steiner points`),
      );
    }

    if (!this.router || typeof this.router.routeSegment !== 'function') {
      if (debug) {
        logger.debug(chalk.yellow(`[SteinerOptimizer] No router available - cannot build optimized subtree`));
      }
      return null;
    }

    const allNodes = [
      ...terminals.map((t, idx) => ({ ...t, type: 'terminal' as const, index: idx })),
      ...steinerPoints.map((s, idx) => ({ ...s, type: 'steiner' as const, index: terminals.length + idx })),
    ];

    const mstEdges = this.buildMSTForNodes(allNodes);
    if (debug) {
      logger.debug(chalk.blue(`[SteinerOptimizer] MST has ${mstEdges.length} edges to route`));
    }

    const segments: IRoutePath[] = [];
    let totalLength = 0;
    let totalVias = 0;
    let failedRoutes = 0;

    for (const edge of mstEdges) {
      const fromNode = allNodes[edge.from];
      const toNode = allNodes[edge.to];
      if (debug) {
        logger.debug(
          chalk.gray(`[SteinerOptimizer] Routing edge ${edge.from}->${edge.to} (${fromNode.type}->${toNode.type})`),
        );
      }

      try {
        const segment = this.router.routeSegment(fromNode, toNode);
        if (segment.success) {
          segments.push(segment);
          totalLength += segment.length;
          totalVias += segment.viaCount;
          if (debug) {
            logger.debug(
              chalk.green(`[SteinerOptimizer]    ok ${segment.length.toFixed(2)}mm, ${segment.viaCount} vias`),
            );
          }
        } else {
          failedRoutes++;
          if (debug) {
            logger.debug(chalk.red(`[SteinerOptimizer]    xx Failed: ${segment.error}`));
          }
        }
      } catch (error: unknown) {
        failedRoutes++;
        if (debug) {
          logger.debug(
            chalk.red(`[SteinerOptimizer]    xx Exception: ${error instanceof Error ? error.message : String(error)}`),
          );
        }
      }
    }

    if (failedRoutes > 0) {
      if (debug) {
        logger.debug(
          chalk.yellow(`[SteinerOptimizer] ${failedRoutes}/${mstEdges.length} edges failed - abandoning optimization`),
        );
      }
      return null;
    }

    const mergedPath = mergeSegments(segments);
    return {
      ...mergedPath,
      segments,
      length: totalLength,
      viaCount: totalVias,
      success: true,
    };
  }
  /**
   * Build MST for a set of nodes using Prim's algorithm
   * @private
   */
  private buildMSTForNodes(
    nodes: Array<{ x: number; y: number; layer: string; type: 'terminal' | 'steiner'; index: number }>,
  ): ISteinerEdge[] {
    const raw = buildSharedMST(nodes, (i, j) => this.distance(nodes[i], nodes[j]), 0);
    return raw.map((e) => ({ ...e, layer: nodes[e.to].layer }));
  }
}
