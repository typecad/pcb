import chalk from 'chalk';
import logger from '../../utils/logging.js';
import { PriorityQueue } from '../shared/priority_queue.js';
import type { RoutingGrid } from '../contracts/routing_grid.js';
import type { IRouteNode, IRoutePath, NormalizedRoutingOptions, RouteEndpoint } from './types.js';
import { ClearanceProfile } from './clearance_profile.js';
import { profiler } from '../shared/profiler.js';

interface SearchWindow {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  expansionLevel: number;
}

interface CachedWindow {
  key: string;
  window: SearchWindow;
  layerOrder: string[];
  layerIdMap: Map<string, number>;
  coordsPerLayer: number;
  totalCoordSlots: number;
  // Use a typed array per layer for fast indexed access in hot loops
  costTiles: Float32Array[];
  averageCost: number;
}

interface GlobalOccupancyEntry {
  key: number;
  layer: string;
  gridX: number;
  gridY: number;
  clearanceBucket: number;
  variant: number;
  blocked: boolean;
}

type OccupancyLookup = (
  layer: string,
  gridX: number,
  gridY: number,
  clearanceMm: number,
  considerObstacleClearance: boolean,
  sumObstacleClearance: boolean,
) => boolean;

interface NeighborContext {
  goalX: number;
  goalY: number;
  goalLayer: string;
  forceSingleLayer: boolean;
  endLayerAgnostic: boolean;
  startX?: number;
  startY?: number;
  startLayerAgnostic: boolean;
  searchWindow: SearchWindow;
  lookupOccupancy: OccupancyLookup;
  viaPenalty: number;
  strideDisableRadius: number;
  strideDisableRadiusSq: number; // Squared radius for performance
  startGrid: { gridX: number; gridY: number };
  endGrid: { gridX: number; gridY: number };
  windowData: CachedWindow;
  boundaryTracker: { touched: boolean };
  // Pre-computed heuristic constants for performance
  heuristicWeight: number;
  allowDiagonalRuns: boolean;
  preferredLayerIndexMap?: Map<string, number>;
  goalCosts?: Float32Array;
  /** Vias that already exist at the segment start (e.g. forced vias the
   *  caller knows about) — organic vias must keep their distance. */
  seedVias: { gridX: number; gridY: number }[];
}

interface ISearchRunResult {
  status: 'success' | 'failure' | 'expand';
  path?: IRoutePath;
  error?: string;
  iterations?: number;
  /** Nets whose copper blocked the search (rip-up candidates). */
  blockedBy?: string[];
}

export interface GridSearchConfig {
  grid: RoutingGrid;
  options: NormalizedRoutingOptions;
  freeViaGridLocations: Set<string>;
  clearanceProfile: ClearanceProfile;
}

/**
 * Standalone single-segment router built on top of the routing grid.
 * AStarRouter composes this helper for every segment/waypoint hop as well
 * as Steiner re-routing.
 */
export class GridSearch {
  private grid: RoutingGrid;
  private options: NormalizedRoutingOptions;
  private freeViaGridLocations: Set<string>;
  private clearanceProfile: ClearanceProfile;
  private windowCache: Map<string, CachedWindow> = new Map();
  private pathCache: Map<string, IRoutePath> = new Map();
  private pathCacheOrder: string[] = [];
  private globalOccupancyCache: Map<number, GlobalOccupancyEntry> = new Map();
  private layerCodeMap: Map<string, number> = new Map();
  private nextLayerCode: number = 1;
  private openMapArr: (IRouteNode | undefined)[] = [];
  private closedSet: Uint32Array = new Uint32Array(0);
  private localOccupancyCache: Int32Array = new Int32Array(0);
  private searchGeneration: number = 0;
  /** Nets that blocked the current search (for rip-up-and-reroute). */
  private currentBlockers: Set<string> | null = null;
  private openMapTouchedIndices: number[] = [];
  private openPQ = new PriorityQueue<IRouteNode>((a, b) => a.fCost - b.fCost);
  private static readonly MAX_PATH_CACHE_ENTRIES = 64;
  private static readonly MAX_GLOBAL_OCCUPANCY_CACHE_ENTRIES = 400000;
  private static readonly ANGLE_TOLERANCE = 1e-6;
  /**
   * Straightening only applies to escape-length diagonals near a pad. Longer
   * diagonals are intentional trunk routing — replacing them with orthogonal
   * runs would add walls that seal off neighboring escape corridors.
   */
  private static readonly STRAIGHTEN_MAX_ESCAPE_MM = 2.0;
  /** How many nodes ahead the staircase simplifier may look for a shortcut. */
  private static readonly SIMPLIFY_WINDOW_NODES = 16;
  /**
   * The direct two-segment escape path is an escape-scale shortcut. Longer
   * connections are trunk routing: giving them idealized straight/diagonal
   * geometry reshapes congestion across the whole board (and slows later
   * searches), so they go through the regular grid search.
   */
  private static readonly DIRECT_ESCAPE_MAX_MM = 8.0;

  constructor(config: GridSearchConfig) {
    this.grid = config.grid;
    this.options = config.options;
    this.freeViaGridLocations = config.freeViaGridLocations;
    this.clearanceProfile = config.clearanceProfile;
  }

  /**
   * Clears cached data. Allows callers to selectively drop expensive caches
   * when the host board changes underneath the router.
   */
  public resetCaches(scope: { windows?: boolean; paths?: boolean; occupancy?: boolean } = {}): void {
    const hasExplicitScope = 'windows' in scope || 'paths' in scope || 'occupancy' in scope;
    const windows = hasExplicitScope ? scope.windows === true : true;
    const paths = hasExplicitScope ? scope.paths === true : true;
    const occupancy = hasExplicitScope ? scope.occupancy === true : true;

    if (windows) {
      this.windowCache.clear();
    }
    if (paths) {
      this.pathCache.clear();
      this.pathCacheOrder = [];
    }
    if (occupancy) {
      this.globalOccupancyCache.clear();
      this.layerCodeMap.clear();
      this.nextLayerCode = 1;
    }
  }

  private buildPathCacheKey(start: RouteEndpoint, end: RouteEndpoint): string {
    return `${start.layer}:${start.x.toFixed(3)}:${start.y.toFixed(
      3,
    )}->${end.layer}:${end.x.toFixed(3)}:${end.y.toFixed(3)}`;
  }

  private tryReuseCachedPath(cacheKey: string): IRoutePath | null {
    const cached = this.pathCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    if (!this.isCachedPathValid(cached)) {
      this.pathCache.delete(cacheKey);
      this.pathCacheOrder = this.pathCacheOrder.filter((k) => k !== cacheKey);
      return null;
    }
    return this.cloneRoutePath(cached);
  }

  private isCachedPathValid(path: IRoutePath): boolean {
    if (!path.gridNodes || path.gridNodes.length === 0) {
      return false;
    }
    const clearance = this.clearanceProfile.getTraceClearance();
    for (const node of path.gridNodes) {
      if (
        !this.grid.isInBounds(node.gridX, node.gridY) ||
        this.grid.isOccupied(node.gridX, node.gridY, node.layer, clearance, this.options.net, true, false)
      ) {
        return false;
      }
    }
    return true;
  }

  private storePathCache(cacheKey: string, path: IRoutePath): void {
    const clone = this.cloneRoutePath(path);
    this.pathCache.set(cacheKey, clone);
    this.pathCacheOrder = this.pathCacheOrder.filter((k) => k !== cacheKey);
    this.pathCacheOrder.push(cacheKey);
    while (this.pathCacheOrder.length > GridSearch.MAX_PATH_CACHE_ENTRIES) {
      const keyToRemove = this.pathCacheOrder.shift();
      if (keyToRemove) {
        this.pathCache.delete(keyToRemove);
      }
    }
  }

  private cloneRoutePath(path: IRoutePath): IRoutePath {
    return {
      nodes: path.nodes.map((n) => ({ ...n })),
      gridNodes: path.gridNodes ? path.gridNodes.map((g) => ({ ...g })) : undefined,
      length: path.length,
      viaCount: path.viaCount,
      success: path.success,
      error: path.error,
      segments: path.segments ? path.segments.map((seg) => this.cloneRoutePath(seg)) : undefined,
    };
  }

  private getWindowCacheKey(start: { gridX: number; gridY: number }, end: { gridX: number; gridY: number }): string {
    const a = `${start.gridX},${start.gridY}`;
    const b = `${end.gridX},${end.gridY}`;
    return a <= b ? `${a}->${b}` : `${b}->${a}`;
  }

  private getOrCreateWindowData(
    start: { gridX: number; gridY: number },
    end: { gridX: number; gridY: number },
    startLayer: string,
    endLayer: string,
  ): CachedWindow {
    const key = this.getWindowCacheKey(start, end);
    const cached = this.windowCache.get(key);
    if (cached) {
      if (
        this.isWithinWindow(start.gridX, start.gridY, cached.window) &&
        this.isWithinWindow(end.gridX, end.gridY, cached.window)
      ) {
        return cached;
      }
      const merged = this.mergeWindows(cached.window, this.buildSearchWindow(start, end, cached.window.expansionLevel));
      const updated = this.buildWindowData(key, merged, startLayer, endLayer, cached);
      this.windowCache.set(key, updated);
      return updated;
    }

    const window = this.buildSearchWindow(start, end, 0);
    const data = this.buildWindowData(key, window, startLayer, endLayer);
    this.windowCache.set(key, data);
    return data;
  }

  private expandWindowData(
    windowData: CachedWindow,
    start: { gridX: number; gridY: number },
    end: { gridX: number; gridY: number },
    startLayer: string,
    endLayer: string,
  ): CachedWindow {
    const nextLevel = windowData.window.expansionLevel + 1;
    const expandedWindow = this.buildSearchWindow(start, end, nextLevel);
    const merged = this.mergeWindows(windowData.window, expandedWindow);
    const updated = this.buildWindowData(windowData.key, merged, startLayer, endLayer, windowData);
    this.windowCache.set(windowData.key, updated);
    return updated;
  }

  private canReusePreviousWindow(
    previous: CachedWindow | undefined,
    nextWindow: SearchWindow,
  ): previous is CachedWindow {
    if (!previous) return false;
    const prevWindow = previous.window;
    return (
      nextWindow.minX <= prevWindow.minX &&
      nextWindow.maxX >= prevWindow.maxX &&
      nextWindow.minY <= prevWindow.minY &&
      nextWindow.maxY >= prevWindow.maxY
    );
  }

  private buildLayerOrderWithReuse(previous: string[] | undefined, layers: string[]): string[] {
    if (!previous || previous.length === 0) {
      return this.buildLayerOrder(layers);
    }
    const result: string[] = [...previous];
    const seen = new Set<string>(previous);
    for (const layer of this.buildLayerOrder(layers)) {
      if (!seen.has(layer)) {
        seen.add(layer);
        result.push(layer);
      }
    }
    return result;
  }

  private buildWindowData(
    key: string,
    window: SearchWindow,
    startLayer: string,
    endLayer: string,
    previous?: CachedWindow,
  ): CachedWindow {
    const layerOrder = this.buildLayerOrderWithReuse(previous?.layerOrder, [
      ...(this.options.allowedLayers ?? []),
      startLayer,
      endLayer,
    ]);
    const layerIdMap = new Map<string, number>();
    layerOrder.forEach((layer, idx) => layerIdMap.set(layer, idx));

    const coordsPerLayer = Math.max(1, window.width * window.height);
    const totalCoordSlots = Math.max(1, coordsPerLayer * layerOrder.length);

    // IMPORTANT: do not eagerly call grid.getCellCost for every cell in the window.
    // That can dominate runtime on larger boards/windows.
    // Instead, create tiles lazily and fill on demand in sampleCellCost().
    const costTiles: Float32Array[] = [];
    for (let layerIndex = 0; layerIndex < layerOrder.length; layerIndex++) {
      const tile = new Float32Array(coordsPerLayer);
      // Use NaN as the sentinel for "not computed".
      tile.fill(Number.NaN);
      costTiles[layerIndex] = tile;
    }

    // Keep a lightweight estimate used by estimateCongestionPenalty().
    // If we have a previous window, reuse its average cost; otherwise sample a few points.
    let averageCost = previous?.averageCost ?? 0;
    if (!(averageCost > 0)) {
      const sampleXs = [window.minX, window.maxX, Math.floor((window.minX + window.maxX) / 2)];
      const sampleYs = [window.minY, window.maxY, Math.floor((window.minY + window.maxY) / 2)];
      let total = 0;
      let count = 0;
      const layer0 = layerOrder[0];
      for (const sx of sampleXs) {
        for (const sy of sampleYs) {
          total += this.grid.getCellCost(sx, sy, layer0);
          count++;
        }
      }
      averageCost = count > 0 ? total / count : 0;
    }

    return {
      key,
      window,
      layerOrder,
      layerIdMap,
      coordsPerLayer,
      totalCoordSlots,
      costTiles,
      averageCost,
    };
  }

  private mergeWindows(a: SearchWindow, b: SearchWindow): SearchWindow {
    const minX = Math.min(a.minX, b.minX);
    const maxX = Math.max(a.maxX, b.maxX);
    const minY = Math.min(a.minY, b.minY);
    const maxY = Math.max(a.maxY, b.maxY);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      expansionLevel: Math.max(a.expansionLevel, b.expansionLevel),
    };
  }

  /**
   * Via cost for a layer transition. With a board `layerOrder` configured
   * (blind/buried vias), the cost scales with the number of layer
   * boundaries crossed — span depth is the real manufacturing cost of a
   * blind/buried via. Without `layerOrder` (or unknown layers) the flat
   * `viaCost` applies.
   */
  private computeViaCost(fromLayer: string, toLayer: string): number {
    const base = (this.options.viaCost || 0) * (0.1 / this.grid.getResolution());
    const order = this.options.layerOrder;
    if (!order || base <= 0) {
      return base;
    }
    const fromIdx = order.indexOf(fromLayer);
    const toIdx = order.indexOf(toLayer);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
      return base;
    }
    return base * Math.abs(fromIdx - toIdx);
  }

  private sampleCellCost(
    layer: string,
    gridX: number,
    gridY: number,
    windowData: CachedWindow,
    layerIndex?: number,
  ): number {
    const win = windowData.window;
    const localX = gridX - win.minX;
    const localY = gridY - win.minY;
    if (localX < 0 || localY < 0 || localX >= win.width || localY >= win.height) {
      return this.grid.getCellCost(gridX, gridY, layer);
    }

    if (layerIndex === undefined) {
      layerIndex = windowData.layerIdMap.get(layer);
    }
    const tile = layerIndex !== undefined ? windowData.costTiles[layerIndex] : undefined;
    if (!tile) {
      return this.grid.getCellCost(gridX, gridY, layer);
    }

    const idx = localY * win.width + localX;
    let cost = tile[idx];
    if (Number.isNaN(cost)) {
      cost = this.grid.getCellCost(gridX, gridY, layer);
      tile[idx] = cost;
    }
    return cost;
  }

  private runSearchWithWindow(config: {
    adjustedStart: RouteEndpoint;
    adjustedEnd: RouteEndpoint;
    startGrid: { gridX: number; gridY: number };
    endGrid: { gridX: number; gridY: number };
    startIsFreeVia: boolean;
    endIsLayerAgnosticGoal: boolean;
    forceSingleLayer: boolean;
    windowData: CachedWindow;
    seedVias?: { x: number; y: number }[];
  }): ISearchRunResult {
    profiler.start('GridSearch.runSearchWithWindow');
    try {
      const {
        adjustedStart,
        adjustedEnd,
        startGrid,
        endGrid,
        startIsFreeVia,
        endIsLayerAgnosticGoal,
        forceSingleLayer,
        windowData,
      } = config;

      const searchWindow = windowData.window;
      const layerIdMap = windowData.layerIdMap;
      const coordsPerLayer = windowData.coordsPerLayer;
      const totalCoordSlots = windowData.totalCoordSlots;
      const boundaryTracker = { touched: false };

      this.searchGeneration++;
      if (this.openMapArr.length < totalCoordSlots) {
        this.openMapArr = new Array(totalCoordSlots).fill(undefined);
      }
      if (this.closedSet.length < totalCoordSlots) {
        const newClosedSet = new Uint32Array(totalCoordSlots);
        newClosedSet.set(this.closedSet);
        this.closedSet = newClosedSet;
      }
      if (this.localOccupancyCache.length < totalCoordSlots) {
        const newLocalOccupancyCache = new Int32Array(totalCoordSlots);
        newLocalOccupancyCache.set(this.localOccupancyCache);
        this.localOccupancyCache = newLocalOccupancyCache;
      }

      const encodeKey = (layer: string, gridX: number, gridY: number, layerIndex?: number): number => {
        if (layerIndex === undefined) {
          layerIndex = layerIdMap.get(layer);
        }
        if (layerIndex === undefined) {
          return -1;
        }
        const localX = gridX - searchWindow.minX;
        const localY = gridY - searchWindow.minY;
        if (localX < 0 || localY < 0 || localX >= searchWindow.width || localY >= searchWindow.height) {
          boundaryTracker.touched = true;
          return -1;
        }
        return layerIndex * coordsPerLayer + localY * searchWindow.width + localX;
      };

      // ClearanceProfile is currently constant for a full search. Pull it once to
      // avoid allocations and repeated calls in the hot neighbor loop.
      const fastTraceClearance = this.clearanceProfile.getTraceClearance();

      // Hot-path local occupancy cache.
      // Values: -1 = unknown, 0 = free, 1 = blocked.
      // We use this.localOccupancyCache instead of a local allocation.

      const lookupOccupancy: OccupancyLookup = (
        layer: string,
        gridX: number,
        gridY: number,
        clearanceMm: number,
        considerObstacleClearance: boolean,
        sumObstacleClearance: boolean,
      ): boolean => {
        if (!this.isWithinWindow(gridX, gridY, searchWindow)) {
          boundaryTracker.touched = true;
          return true;
        }

        // Fast path: the router always queries occupancy using the same variant
        // (considerObstacleClearance=true, sumObstacleClearance=false — the
        // strongest of the trace keepout (clearance + own half-width, from
        // ClearanceProfile) or the obstacle's clearance applies, plus the
        // obstacle's half-width) and a constant trace clearance for the whole
        // run. The flags map straight through to RoutingGrid.isOccupied's
        // trailing booleans.
        if (
          considerObstacleClearance === true &&
          sumObstacleClearance === false &&
          clearanceMm === fastTraceClearance
        ) {
          const cellIndex = encodeKey(layer, gridX, gridY);
          if (cellIndex < 0) {
            return true;
          }

          const localCached = this.localOccupancyCache[cellIndex];
          if (localCached === this.searchGeneration) return true;
          if (localCached === -this.searchGeneration) return false;

          const globalKey = this.buildGlobalOccupancyKey(layer, gridX, gridY, fastTraceClearance, true, false);
          if (globalKey) {
            const cached = this.globalOccupancyCache.get(globalKey.key);
            if (
              cached &&
              cached.layer === layer &&
              cached.gridX === gridX &&
              cached.gridY === gridY &&
              cached.clearanceBucket === globalKey.clearanceBucket &&
              cached.variant === globalKey.variant
            ) {
              this.localOccupancyCache[cellIndex] = cached.blocked ? this.searchGeneration : -this.searchGeneration;
              return cached.blocked;
            }
          }

          const blocked = this.grid.isOccupied(
            gridX,
            gridY,
            layer,
            fastTraceClearance,
            this.options.net,
            true,
            false,
            this.currentBlockers ?? undefined,
          );

          this.localOccupancyCache[cellIndex] = blocked ? this.searchGeneration : -this.searchGeneration;
          if (globalKey) {
            this.storeGlobalOccupancyValue({
              key: globalKey.key,
              layer,
              gridX,
              gridY,
              clearanceBucket: globalKey.clearanceBucket,
              variant: globalKey.variant,
              blocked,
            });
          }
          return blocked;
        }

        const globalKey = this.buildGlobalOccupancyKey(
          layer,
          gridX,
          gridY,
          clearanceMm,
          considerObstacleClearance,
          sumObstacleClearance,
        );
        if (globalKey) {
          const cached = this.globalOccupancyCache.get(globalKey.key);
          if (
            cached &&
            cached.layer === layer &&
            cached.gridX === gridX &&
            cached.gridY === gridY &&
            cached.clearanceBucket === globalKey.clearanceBucket &&
            cached.variant === globalKey.variant
          ) {
            return cached.blocked;
          }
        }
        const blocked = this.grid.isOccupied(
          gridX,
          gridY,
          layer,
          clearanceMm,
          this.options.net,
          considerObstacleClearance,
          sumObstacleClearance,
          this.currentBlockers ?? undefined,
        );
        if (globalKey) {
          this.storeGlobalOccupancyValue({
            key: globalKey.key,
            layer,
            gridX,
            gridY,
            clearanceBucket: globalKey.clearanceBucket,
            variant: globalKey.variant,
            blocked,
          });
        }
        return blocked;
      };

      // Use preallocated arrays from class instance
      const openMapArr = this.openMapArr;
      const closedSet = this.closedSet;
      const openPQ = this.openPQ;
      openPQ.clear();

      const mmPerCell = this.grid.getResolution();
      // Via cost is priced in grid cells, so a fixed viaCost implicitly
      // shrinks as the grid refines (20 cells = 2mm at 0.1mm, only 1mm at
      // 0.05mm) — making fine-pitch boards via-happy. Scale it back to the
      // equivalent price at the reference 0.1mm resolution.
      const viaCostScale = 0.1 / mmPerCell;
      const viaPenalty = this.options.allowVias ? (this.options.viaCost ?? 0) * viaCostScale : 0;
      const strideDisableRadius = Math.max(
        1,
        Math.ceil((this.options.strideNearPadDisableRadiusMm ?? 3.0) / mmPerCell),
      );

      const preferredLayerIndexMap = new Map<string, number>();
      if (this.options.preferredLayers) {
        this.options.preferredLayers.forEach((l, idx) => preferredLayerIndexMap.set(l, idx));
      }

      const goalCosts = new Float32Array(layerIdMap.size);
      for (const [layer, idx] of layerIdMap.entries()) {
        goalCosts[idx] = this.sampleCellCost(layer, endGrid.gridX, endGrid.gridY, windowData, idx);
      }

      // Weighted A*: for longer routes, bias harder toward the goal to reduce
      // exploration. This trades some optimality for a large speed win.
      const baseHeuristicWeight = this.options.heuristicWeight ?? 2.0;
      const manhattanToGoal = Math.abs(startGrid.gridX - endGrid.gridX) + Math.abs(startGrid.gridY - endGrid.gridY);
      let heuristicWeight = baseHeuristicWeight;
      if (manhattanToGoal > 800) {
        heuristicWeight = Math.max(heuristicWeight, 4.5);
      } else if (manhattanToGoal > 500) {
        heuristicWeight = Math.max(heuristicWeight, 3.5);
      } else if (manhattanToGoal > 250) {
        heuristicWeight = Math.max(heuristicWeight, 2.75);
      }

      const neighborContext: NeighborContext = {
        goalX: endGrid.gridX,
        goalY: endGrid.gridY,
        goalLayer: adjustedEnd.layer,
        forceSingleLayer,
        endLayerAgnostic: endIsLayerAgnosticGoal,
        startX: startGrid.gridX,
        startY: startGrid.gridY,
        startLayerAgnostic: !forceSingleLayer && startIsFreeVia,
        searchWindow,
        lookupOccupancy,
        viaPenalty,
        strideDisableRadius,
        strideDisableRadiusSq: strideDisableRadius * strideDisableRadius,
        startGrid,
        endGrid,
        windowData,
        boundaryTracker,
        heuristicWeight,
        allowDiagonalRuns: this.options.allow45DegreeRuns ?? true,
        preferredLayerIndexMap,
        goalCosts,
        seedVias: (config.seedVias ?? []).map((v) => {
          const g = this.grid.worldToGrid(v.x, v.y);
          return { gridX: g.x, gridY: g.y };
        }),
      };

      const startLayers: string[] =
        !forceSingleLayer && startIsFreeVia
          ? this.options.allowedLayers && this.options.allowedLayers.length > 0
            ? this.options.allowedLayers
            : [adjustedStart.layer]
          : [adjustedStart.layer];

      for (const sl of startLayers) {
        const slIndex = layerIdMap.get(sl);
        if (slIndex === undefined) {
          continue;
        }
        const dx = Math.abs(endGrid.gridX - startGrid.gridX);
        const dy = Math.abs(endGrid.gridY - startGrid.gridY);
        const manhattan = dx + dy;

        const startCost = this.sampleCellCost(sl, startGrid.gridX, startGrid.gridY, windowData, slIndex);
        const goalCost = goalCosts[slIndex];
        const avgCost = startCost > 0 && goalCost > 0 ? (startCost + goalCost) * 0.5 : windowData.averageCost;
        const congestionPenalty = avgCost * (manhattan > 1 ? manhattan : 1) * 0.01;

        let planar: number;
        if (this.options.allow45DegreeRuns ?? true) {
          const maxComponent = Math.max(dx, dy);
          const minComponent = Math.min(dx, dy);
          planar = minComponent * Math.SQRT2 + (maxComponent - minComponent);
        } else {
          planar = manhattan;
        }
        let hCost = planar;
        if (sl !== adjustedEnd.layer && viaPenalty > 0) {
          hCost += viaPenalty;
        }
        if (congestionPenalty > 0) {
          hCost += congestionPenalty;
        }
        hCost *= heuristicWeight;
        const sNode: IRouteNode = {
          gridX: startGrid.gridX,
          gridY: startGrid.gridY,
          worldX: adjustedStart.x,
          worldY: adjustedStart.y,
          layer: sl,
          layerIndex: slIndex,
          gCost: 0,
          hCost,
          fCost: hCost,
          parent: null,
          viaUsed: false,
        };
        const key = encodeKey(sNode.layer, sNode.gridX, sNode.gridY, slIndex);
        if (key === -1) {
          continue;
        }
        const existing = openMapArr[key];
        if (!existing || sNode.fCost < existing.fCost) {
          if (!existing) this.openMapTouchedIndices.push(key);
          openMapArr[key] = sNode;
          openPQ.push(sNode);
        }
      }

      let iterations = 0;
      const maxIterations = this.options.maxIterations ?? 500000;

      while (openPQ.size() > 0 && iterations < maxIterations) {
        iterations++;

        const current = openPQ.pop()!;
        const currentKey = encodeKey(current.layer, current.gridX, current.gridY, current.layerIndex);
        if (currentKey === -1) {
          continue;
        }
        const mapped = openMapArr[currentKey];
        if (!mapped || mapped !== current || closedSet[currentKey] === this.searchGeneration) {
          continue;
        }

        // Goal check - optimized for common case (single layer)
        const atGoalPosition = current.gridX === endGrid.gridX && current.gridY === endGrid.gridY;
        if (atGoalPosition && (current.layer === adjustedEnd.layer || endIsLayerAgnosticGoal)) {
          return {
            status: 'success',
            path: this.reconstructPath(current, {
              start: adjustedStart,
              end: adjustedEnd,
            }),
            iterations,
            // Nets that blocked the search along the way: a successful but
            // congested route (long detour) still names its blockers so
            // rip-up-and-reroute can act on quality, not just failure.
            blockedBy:
              this.currentBlockers && this.currentBlockers.size > 0 ? Array.from(this.currentBlockers) : undefined,
          };
        }

        openMapArr[currentKey] = undefined;
        closedSet[currentKey] = this.searchGeneration;

        let neighbors = this.getNeighbors(current, neighborContext);

        if ((this.options.useAdaptiveStride ?? false) && neighbors.length === 0) {
          neighbors = this.getNeighbors(current, neighborContext, true);
        }

        for (const neighbor of neighbors) {
          const neighborKey = encodeKey(neighbor.layer, neighbor.gridX, neighbor.gridY, neighbor.layerIndex);

          if (neighborKey === -1 || closedSet[neighborKey] === this.searchGeneration) {
            continue;
          }

          // Fast path: check if this is goal or start (skip occupancy check)
          const isGoalNeighbor =
            neighbor.gridX === endGrid.gridX &&
            neighbor.gridY === endGrid.gridY &&
            (neighbor.layer === adjustedEnd.layer || endIsLayerAgnosticGoal);

          if (!isGoalNeighbor) {
            const isStartNeighbor =
              current.gridX === startGrid.gridX &&
              current.gridY === startGrid.gridY &&
              current.layer === adjustedStart.layer;

            if (!isStartNeighbor) {
              const effectiveClearance = fastTraceClearance;
              if (lookupOccupancy(neighbor.layer, neighbor.gridX, neighbor.gridY, effectiveClearance, true, false)) {
                continue;
              }
            }
          }

          const existingNeighbor = openMapArr[neighborKey];
          // Only add to queue if this is a better path
          // This prevents duplicate nodes accumulating in the priority queue
          if (!existingNeighbor) {
            this.openMapTouchedIndices.push(neighborKey);
            openMapArr[neighborKey] = neighbor;
            openPQ.push(neighbor);
          } else if (neighbor.gCost < existingNeighbor.gCost) {
            openMapArr[neighborKey] = neighbor;
            openPQ.push(neighbor);
          }
        }
      }

      if (boundaryTracker.touched) {
        return { status: 'expand', iterations };
      }

      return {
        status: 'failure',
        iterations,
        error: `No path found after ${iterations} iterations`,
        blockedBy: this.currentBlockers ? Array.from(this.currentBlockers) : undefined,
      };
    } finally {
      for (const idx of this.openMapTouchedIndices) {
        this.openMapArr[idx] = undefined;
      }
      this.openMapTouchedIndices.length = 0;
      profiler.end('GridSearch.runSearchWithWindow');
    }
  }

  public findPath(start: RouteEndpoint, end: RouteEndpoint, seedVias?: { x: number; y: number }[]): IRoutePath {
    return profiler.profile('GridSearch.findPath', () => {
      let adjustedStart = { ...start };
      let adjustedEnd = { ...end };

      const startGridCheck = this.grid.worldToGrid(start.x, start.y);
      const endGridCheck = this.grid.worldToGrid(end.x, end.y);
      const startKey = `${startGridCheck.x}:${startGridCheck.y}`;
      const endKey = `${endGridCheck.x}:${endGridCheck.y}`;
      const startIsFreeVia = this.freeViaGridLocations.has(startKey);
      const endIsFreeVia = this.freeViaGridLocations.has(endKey);

      let forceSingleLayer = false;

      if (startIsFreeVia && endIsFreeVia) {
        forceSingleLayer = false;
      } else if (startIsFreeVia && start.layer !== end.layer && !endIsFreeVia) {
        adjustedStart = { ...start, layer: end.layer };
        forceSingleLayer = true;
      } else if (endIsFreeVia && start.layer !== end.layer && !startIsFreeVia) {
        adjustedEnd = { ...end, layer: start.layer };
        forceSingleLayer = true;
      }

      const startGridCoord = this.grid.worldToGrid(adjustedStart.x, adjustedStart.y);
      const endGridCoord = this.grid.worldToGrid(adjustedEnd.x, adjustedEnd.y);
      const startGrid = { gridX: startGridCoord.x, gridY: startGridCoord.y };
      const endGrid = { gridX: endGridCoord.x, gridY: endGridCoord.y };

      if (!this.grid.isInBounds(startGrid.gridX, startGrid.gridY)) {
        return {
          nodes: [],
          length: 0,
          viaCount: 0,
          success: false,
          error: `Start position (${adjustedStart.x}, ${adjustedStart.y}) is out of grid bounds`,
        };
      }

      if (!this.grid.isInBounds(endGrid.gridX, endGrid.gridY)) {
        return {
          nodes: [],
          length: 0,
          viaCount: 0,
          success: false,
          error: `End position (${adjustedEnd.x}, ${adjustedEnd.y}) is out of grid bounds`,
        };
      }

      const endIsLayerAgnosticGoal = endIsFreeVia;
      const cacheKey = this.buildPathCacheKey(adjustedStart, adjustedEnd);
      const cached = this.tryReuseCachedPath(cacheKey);
      if (cached) {
        return cached;
      }

      // Canonical escape shape first: straight along the start axis, then a
      // single 45° into the goal (or the mirror). When the space allows it
      // this is shorter and cleaner than anything the grid search would
      // staircase together, and it keeps pad exits on the pad's axis.
      const direct = this.tryDirectEscapePath(adjustedStart, adjustedEnd);
      if (direct) {
        this.storePathCache(cacheKey, direct);
        return direct;
      }

      let windowData = this.getOrCreateWindowData(startGrid, endGrid, adjustedStart.layer, adjustedEnd.layer);

      // Blockers accumulate across window expansions of this search — each
      // expansion re-runs with a fresh open set, but the rip-up intelligence
      // gathered along the way must survive to the final failure result.
      this.currentBlockers = new Set<string>();
      while (true) {
        const result = this.runSearchWithWindow({
          adjustedStart,
          adjustedEnd,
          startGrid,
          endGrid,
          startIsFreeVia,
          endIsLayerAgnosticGoal,
          forceSingleLayer,
          windowData,
          seedVias,
        });

        if (result.status === 'expand') {
          windowData = this.expandWindowData(windowData, startGrid, endGrid, adjustedStart.layer, adjustedEnd.layer);
          continue;
        }

        if (result.status === 'success' && result.path) {
          this.storePathCache(cacheKey, result.path);
          return result.blockedBy && result.blockedBy.length > 0
            ? { ...result.path, blockedBy: result.blockedBy }
            : result.path;
        }

        if (this.options.debug) {
          logger.warn(chalk.yellow(`[GridSearch] Failed to find path after ${result.iterations ?? 0} iterations`));
        }

        return (
          result.path ?? {
            nodes: [],
            length: 0,
            viaCount: 0,
            success: false,
            error: result.error ?? `No path found after ${result.iterations ?? 0} iterations`,
            blockedBy: result.blockedBy,
          }
        );
      }
    })();
  }

  // Static direction arrays to avoid allocation in hot loops
  private static readonly DIRECTIONS_4WAY = Object.freeze([
    { dx: 0, dy: -1, cost: 1.0 },
    { dx: 0, dy: 1, cost: 1.0 },
    { dx: 1, dy: 0, cost: 1.0 },
    { dx: -1, dy: 0, cost: 1.0 },
  ]);

  private static readonly DIRECTIONS_8WAY = Object.freeze([
    { dx: 0, dy: -1, cost: 1.0 },
    { dx: 0, dy: 1, cost: 1.0 },
    { dx: 1, dy: 0, cost: 1.0 },
    { dx: -1, dy: 0, cost: 1.0 },
    { dx: 1, dy: -1, cost: Math.SQRT2 },
    { dx: -1, dy: -1, cost: Math.SQRT2 },
    { dx: 1, dy: 1, cost: Math.SQRT2 },
    { dx: -1, dy: 1, cost: Math.SQRT2 },
  ]);

  private getNeighbors(node: IRouteNode, context: NeighborContext, disableStride: boolean = false): IRouteNode[] {
    const neighbors: IRouteNode[] = [];
    const { goalX, goalY, goalLayer, viaPenalty, allowDiagonalRuns, heuristicWeight, windowData, goalCosts } = context;
    const averageCost = windowData.averageCost;
    const nodeLayerIndex = windowData.layerIdMap.get(node.layer);
    const nodeGoalCost = nodeLayerIndex !== undefined && goalCosts ? goalCosts[nodeLayerIndex] : undefined;
    const directions = this.options.allow45DegreeRuns ? GridSearch.DIRECTIONS_8WAY : GridSearch.DIRECTIONS_4WAY;
    const strideClearance = this.clearanceProfile.getTraceClearance();

    for (const dir of directions) {
      if (this.options.useAdaptiveStride && !disableStride) {
        const jumped = this.jump(node, dir, strideClearance, context);
        if (jumped) {
          neighbors.push(jumped);
          continue;
        }
        const single = this.makeSingleStepNeighbor(node, dir, context);
        if (single) neighbors.push(single);
        continue;
      }

      const nx = node.gridX + dir.dx;
      const ny = node.gridY + dir.dy;

      if (!this.grid.isInBounds(nx, ny)) {
        continue;
      }
      if (!this.isWithinWindow(nx, ny, context.searchWindow)) {
        context.boundaryTracker.touched = true;
        continue;
      }

      let bendPenalty = 0;
      if (node.directionFrom) {
        if (node.directionFrom.dx !== dir.dx || node.directionFrom.dy !== dir.dy) {
          bendPenalty = this.options.bendCost;
        }
      }

      let layerPenalty = 0;
      if (!context.endLayerAgnostic && context.preferredLayerIndexMap && context.preferredLayerIndexMap.size > 0) {
        const layerIndex = context.preferredLayerIndexMap.get(node.layer);
        if (layerIndex === undefined) {
          layerPenalty = GridSearchConstants.NON_PREFERRED_LAYER_PENALTY;
        }
      }

      const moveCost =
        dir.cost + bendPenalty + layerPenalty + this.sampleCellCost(node.layer, nx, ny, windowData, nodeLayerIndex);

      const dx = Math.abs(goalX - nx);
      const dy = Math.abs(goalY - ny);
      const manhattan = dx + dy;

      const startCost = this.sampleCellCost(node.layer, nx, ny, windowData, nodeLayerIndex);
      const avgCost =
        startCost > 0 && nodeGoalCost !== undefined && nodeGoalCost > 0
          ? (startCost + nodeGoalCost) * 0.5
          : averageCost;
      const congestionPenalty = avgCost * (manhattan > 1 ? manhattan : 1) * 0.01;

      let planar: number;
      if (allowDiagonalRuns) {
        const maxComponent = Math.max(dx, dy);
        const minComponent = Math.min(dx, dy);
        planar = minComponent * Math.SQRT2 + (maxComponent - minComponent);
      } else {
        planar = manhattan;
      }
      let hCost = planar;
      if (node.layer !== goalLayer && viaPenalty > 0) {
        hCost += viaPenalty;
      }
      if (congestionPenalty > 0) {
        hCost += congestionPenalty;
      }
      hCost *= heuristicWeight;

      neighbors.push({
        gridX: nx,
        gridY: ny,
        layer: node.layer,
        layerIndex: nodeLayerIndex,
        gCost: node.gCost + moveCost,
        hCost,
        fCost: node.gCost + moveCost + hCost,
        parent: node,
        directionFrom: { dx: dir.dx, dy: dir.dy },
        viaUsed: false,
        viaChain: node.viaChain,
      });
    }

    if (
      !context.forceSingleLayer &&
      this.options.allowVias &&
      this.options.allowedLayers &&
      this.options.allowedLayers.length > 1
    ) {
      for (const targetLayer of this.options.allowedLayers) {
        if (targetLayer === node.layer) continue;

        const nx = node.gridX;
        const ny = node.gridY;
        if (!this.grid.isInBounds(nx, ny)) continue;
        if (!this.isWithinWindow(nx, ny, context.searchWindow)) {
          context.boundaryTracker.touched = true;
          continue;
        }

        if (context.endLayerAgnostic) {
          const mmPerCell = this.grid.getResolution();
          const radiusCells = Math.max(1, Math.ceil(GridSearchConstants.TH_GOAL_VIA_AVOID_RADIUS_MM / mmPerCell));
          const distToGoal = Math.hypot(context.goalX - nx, context.goalY - ny);
          if (distToGoal <= radiusCells) {
            continue;
          }
        }

        if (context.startLayerAgnostic && context.startX !== undefined && context.startY !== undefined) {
          const mmPerCell = this.grid.getResolution();
          const radiusCells = Math.max(1, Math.ceil(GridSearchConstants.TH_START_VIA_AVOID_RADIUS_MM / mmPerCell));
          const distToStart = Math.hypot(context.startX - nx, context.startY - ny);
          if (distToStart <= radiusCells) {
            continue;
          }
        }

        const allowViaHere = !!node.parent;

        if (!allowViaHere) {
          continue;
        }

        // Same-net via spacing: keep the new via away from vias already on
        // this path (and any seeded positions such as forced vias). The fab
        // constraint is hole-to-hole (drill edge to drill edge), so the
        // minimum center distance is one drill diameter plus the hole
        // clearance — NOT the pad-to-pad clearance, which would also outlaw
        // perfectly manufacturable neighboring vias.
        const minViaCenterSpacing =
          (this.options.viaSize ?? GridSearchConstants.DEFAULT_VIA_SIZE) / 2 + GridSearchConstants.MIN_HOLE_TO_HOLE_MM;
        const spacingCells = minViaCenterSpacing / this.grid.getResolution();
        let tooCloseToVia = false;
        for (let chain = node.viaChain; chain && !tooCloseToVia; chain = chain.next) {
          if (Math.hypot(nx - chain.gridX, ny - chain.gridY) < spacingCells) {
            tooCloseToVia = true;
          }
        }
        for (const seed of context.seedVias) {
          if (Math.hypot(nx - seed.gridX, ny - seed.gridY) < spacingCells) {
            tooCloseToVia = true;
            break;
          }
        }
        if (tooCloseToVia) {
          continue;
        }

        const padKeepout = this.clearanceProfile.getViaKeepoutRadius();
        // The via's barrel occupies every layer it spans, not just the two
        // endpoints — an inner-layer track under a through via is a short.
        const spanLayers = viaSpanLayers(
          this.options.allowedLayers ?? [node.layer],
          this.options.layerOrder ?? [],
          node.layer,
          targetLayer,
        );

        if (this.isPadWithinClearance(nx, ny, spanLayers, padKeepout)) {
          continue;
        }

        const viaBlocked = spanLayers.some((spanLayer) =>
          this.grid.isOccupied(nx, ny, spanLayer, padKeepout, this.options.net, true, true),
        );

        if (viaBlocked) {
          continue;
        }

        if (
          nx === context.goalX &&
          ny === context.goalY &&
          targetLayer === context.goalLayer &&
          !context.endLayerAgnostic
        ) {
          continue;
        }

        const viaCostAtLocation = this.computeViaCost(node.layer, targetLayer);

        let targetLayerPenalty = 0;
        if (!context.endLayerAgnostic && context.preferredLayerIndexMap && context.preferredLayerIndexMap.size > 0) {
          const layerIndex = context.preferredLayerIndexMap.get(targetLayer);
          if (layerIndex === undefined) {
            targetLayerPenalty = GridSearchConstants.NON_PREFERRED_LAYER_PENALTY;
          } else if (layerIndex > 0) {
            targetLayerPenalty = layerIndex * 2.0;
          }
        }

        const targetLayerIndex = windowData.layerIdMap.get(targetLayer);
        const targetGoalCost = targetLayerIndex !== undefined && goalCosts ? goalCosts[targetLayerIndex] : undefined;
        const viaMoveCost =
          viaCostAtLocation +
          targetLayerPenalty +
          this.sampleCellCost(targetLayer, nx, ny, windowData, targetLayerIndex);

        const dx = Math.abs(goalX - nx);
        const dy = Math.abs(goalY - ny);
        const manhattan = dx + dy;

        const startCost = this.sampleCellCost(targetLayer, nx, ny, windowData, targetLayerIndex);
        const avgCost =
          startCost > 0 && targetGoalCost !== undefined && targetGoalCost > 0
            ? (startCost + targetGoalCost) * 0.5
            : averageCost;
        const congestionPenalty = avgCost * (manhattan > 1 ? manhattan : 1) * 0.01;

        let planar: number;
        if (allowDiagonalRuns) {
          const maxComponent = Math.max(dx, dy);
          const minComponent = Math.min(dx, dy);
          planar = minComponent * Math.SQRT2 + (maxComponent - minComponent);
        } else {
          planar = manhattan;
        }
        let hCost = planar;
        if (targetLayer !== goalLayer && viaPenalty > 0) {
          hCost += viaPenalty;
        }
        if (congestionPenalty > 0) {
          hCost += congestionPenalty;
        }
        hCost *= heuristicWeight;

        neighbors.push({
          gridX: nx,
          gridY: ny,
          layer: targetLayer,
          layerIndex: targetLayerIndex,
          gCost: node.gCost + viaMoveCost,
          hCost,
          fCost: node.gCost + viaMoveCost + hCost,
          parent: node,
          directionFrom: node.directionFrom,
          viaUsed: true,
          viaChain: { gridX: nx, gridY: ny, next: node.viaChain },
        });
      }
    }

    return neighbors;
  }

  private jump(
    node: IRouteNode,
    dir: { dx: number; dy: number; cost: number },
    clearance: number,
    context: NeighborContext,
  ): IRouteNode | null {
    const { goalX, goalY, goalLayer, viaPenalty, allowDiagonalRuns, heuristicWeight, windowData, goalCosts } = context;
    const averageCost = windowData.averageCost;
    const maxStride = Math.max(1, this.options.maxStrideCells ?? 16);
    const nodeLayerIndex = windowData.layerIdMap.get(node.layer);
    const nodeGoalCost = nodeLayerIndex !== undefined && goalCosts ? goalCosts[nodeLayerIndex] : undefined;
    // Use squared distance to avoid expensive Math.hypot calls
    const startDx = node.gridX - context.startGrid.gridX;
    const startDy = node.gridY - context.startGrid.gridY;
    const startDistSq = startDx * startDx + startDy * startDy;

    const goalDx = node.gridX - context.endGrid.gridX;
    const goalDy = node.gridY - context.endGrid.gridY;
    const goalDistSq = goalDx * goalDx + goalDy * goalDy;

    if (startDistSq <= context.strideDisableRadiusSq || goalDistSq <= context.strideDisableRadiusSq) {
      return null;
    }

    let accMoveCost = 0;
    let penaltyApplied = false;
    let currentX = node.gridX;
    let currentY = node.gridY;
    for (let step = 0; step < maxStride; step++) {
      const nx = currentX + dir.dx;
      const ny = currentY + dir.dy;
      if (!this.grid.isInBounds(nx, ny)) {
        return null;
      }
      if (!this.isWithinWindow(nx, ny, context.searchWindow)) {
        return null;
      }

      if (context.lookupOccupancy(node.layer, nx, ny, clearance, true, false)) {
        return null;
      }

      if (dir.dx !== 0 && dir.dy !== 0) {
        const ax = currentX + dir.dx;
        const ay = currentY;
        const bx = currentX;
        const by = currentY + dir.dy;
        if (
          context.lookupOccupancy(node.layer, ax, ay, clearance, true, false) ||
          context.lookupOccupancy(node.layer, bx, by, clearance, true, false)
        ) {
          return null;
        }
      }

      currentX = nx;
      currentY = ny;
      accMoveCost += dir.cost + this.sampleCellCost(node.layer, currentX, currentY, windowData, nodeLayerIndex);
      if (!penaltyApplied) {
        accMoveCost += this.getDirectionalPenalty(node, dir, context.endLayerAgnostic, context);
        penaltyApplied = true;
      }

      const reachedGoal =
        currentX === goalX && currentY === goalY && (node.layer === goalLayer || context.endLayerAgnostic);

      const forced = this.hasForcedNeighbor(currentX, currentY, node.layer, dir, clearance, context);

      const nearStart = (() => {
        const dx = currentX - context.startGrid.gridX;
        const dy = currentY - context.startGrid.gridY;
        return dx * dx + dy * dy <= context.strideDisableRadiusSq;
      })();

      const nearGoal = (() => {
        const dx = currentX - context.endGrid.gridX;
        const dy = currentY - context.endGrid.gridY;
        return dx * dx + dy * dy <= context.strideDisableRadiusSq;
      })();

      if (reachedGoal || forced || nearStart || nearGoal) {
        const dx = Math.abs(goalX - currentX);
        const dy = Math.abs(goalY - currentY);
        const manhattan = dx + dy;

        const startCost = this.sampleCellCost(node.layer, currentX, currentY, windowData, nodeLayerIndex);
        const avgCost =
          startCost > 0 && nodeGoalCost !== undefined && nodeGoalCost > 0
            ? (startCost + nodeGoalCost) * 0.5
            : averageCost;
        const congestionPenalty = avgCost * (manhattan > 1 ? manhattan : 1) * 0.01;

        let planar: number;
        if (allowDiagonalRuns) {
          const maxComponent = Math.max(dx, dy);
          const minComponent = Math.min(dx, dy);
          planar = minComponent * Math.SQRT2 + (maxComponent - minComponent);
        } else {
          planar = manhattan;
        }
        let hCost = planar;
        if (node.layer !== goalLayer && viaPenalty > 0) {
          hCost += viaPenalty;
        }
        if (congestionPenalty > 0) {
          hCost += congestionPenalty;
        }
        hCost *= heuristicWeight;
        return {
          gridX: currentX,
          gridY: currentY,
          layer: node.layer,
          layerIndex: nodeLayerIndex,
          gCost: node.gCost + accMoveCost,
          hCost,
          fCost: node.gCost + accMoveCost + hCost,
          parent: node,
          directionFrom: { dx: dir.dx, dy: dir.dy },
          viaUsed: false,
          viaChain: node.viaChain,
        };
      }
    }

    return null;
  }

  private makeSingleStepNeighbor(
    node: IRouteNode,
    dir: { dx: number; dy: number; cost: number },
    context: NeighborContext,
  ): IRouteNode | null {
    const {
      goalX,
      goalY,
      goalLayer,
      endLayerAgnostic,
      viaPenalty,
      windowData,
      goalCosts,
      allowDiagonalRuns,
      heuristicWeight,
    } = context;
    const averageCost = windowData.averageCost;
    const nx = node.gridX + dir.dx;
    const ny = node.gridY + dir.dy;
    if (!this.grid.isInBounds(nx, ny)) return null;

    let bendPenalty = 0;
    if (node.directionFrom) {
      if (node.directionFrom.dx !== dir.dx || node.directionFrom.dy !== dir.dy) {
        bendPenalty = this.options.bendCost;
      }
    }

    let layerPenalty = 0;
    if (!endLayerAgnostic && context.preferredLayerIndexMap && context.preferredLayerIndexMap.size > 0) {
      const layerIndex = context.preferredLayerIndexMap.get(node.layer);
      if (layerIndex === undefined) {
        layerPenalty = GridSearchConstants.NON_PREFERRED_LAYER_PENALTY;
      }
    }

    const nodeLayerIndex = windowData.layerIdMap.get(node.layer);
    const nodeGoalCost = nodeLayerIndex !== undefined && goalCosts ? goalCosts[nodeLayerIndex] : undefined;

    const moveCost =
      dir.cost + bendPenalty + layerPenalty + this.sampleCellCost(node.layer, nx, ny, windowData, nodeLayerIndex);

    const dx = Math.abs(goalX - nx);
    const dy = Math.abs(goalY - ny);
    const manhattan = dx + dy;

    const startCost = this.sampleCellCost(node.layer, nx, ny, windowData, nodeLayerIndex);
    const avgCost =
      startCost > 0 && nodeGoalCost !== undefined && nodeGoalCost > 0 ? (startCost + nodeGoalCost) * 0.5 : averageCost;
    const congestionPenalty = avgCost * (manhattan > 1 ? manhattan : 1) * 0.01;

    let planar: number;
    if (allowDiagonalRuns) {
      const maxComponent = Math.max(dx, dy);
      const minComponent = Math.min(dx, dy);
      planar = minComponent * Math.SQRT2 + (maxComponent - minComponent);
    } else {
      planar = manhattan;
    }
    let hCost = planar;
    if (node.layer !== goalLayer && viaPenalty > 0) {
      hCost += viaPenalty;
    }
    if (congestionPenalty > 0) {
      hCost += congestionPenalty;
    }
    hCost *= heuristicWeight;

    return {
      gridX: nx,
      gridY: ny,
      layer: node.layer,
      layerIndex: nodeLayerIndex,
      gCost: node.gCost + moveCost,
      hCost,
      fCost: node.gCost + moveCost + hCost,
      parent: node,
      directionFrom: { dx: dir.dx, dy: dir.dy },
      viaUsed: false,
      viaChain: node.viaChain,
    };
  }

  private reconstructPath(
    endNode: IRouteNode,
    snapEndpoints?: { start: RouteEndpoint; end: RouteEndpoint },
  ): IRoutePath {
    const nodes: RouteEndpoint[] = [];
    const gridNodes: { gridX: number; gridY: number; layer: string }[] = [];
    let current: IRouteNode | null = endNode;
    let viaCount = 0;
    const length = 0;

    while (current) {
      let worldPos: { x: number; y: number };
      if (current.worldX !== undefined && current.worldY !== undefined) {
        worldPos = { x: current.worldX, y: current.worldY };
      } else {
        const gridWorldPos = this.grid.gridToWorld(current.gridX, current.gridY);
        const gridResolution = this.grid.getResolution();
        worldPos = {
          x: gridWorldPos.x - gridResolution * 0.125,
          y: gridWorldPos.y - gridResolution * 0.125,
        };
      }

      if (current.viaUsed && current.parent) {
        // A via node always sits at its parent's cell, so the backward walk
        // unshifts the parent (same XY, parent layer) immediately after this
        // node — forming the proper via pair. Inserting a parent-layer node
        // here as well would duplicate it and produce B/F/B/F sandwiches:
        // two overlapping opposite vias at one spot. Only bridge in the
        // defensive case of a parent that is somehow not at the via cell.
        const parent = current.parent;
        if (parent.gridX !== current.gridX || parent.gridY !== current.gridY) {
          nodes.unshift({
            x: worldPos.x,
            y: worldPos.y,
            layer: parent.layer,
          });
          gridNodes.unshift({
            gridX: current.gridX,
            gridY: current.gridY,
            layer: parent.layer,
          });
        }

        nodes.unshift({
          x: worldPos.x,
          y: worldPos.y,
          layer: current.layer,
        });
        gridNodes.unshift({
          gridX: current.gridX,
          gridY: current.gridY,
          layer: current.layer,
        });
        viaCount++;
      } else {
        nodes.unshift({
          x: worldPos.x,
          y: worldPos.y,
          layer: current.layer,
        });
        gridNodes.unshift({
          gridX: current.gridX,
          gridY: current.gridY,
          layer: current.layer,
        });
      }

      current = current.parent;
    }

    if (snapEndpoints) {
      // Snap the endpoint POSITIONS exactly, but keep the layers the search
      // actually chose. Layer-agnostic endpoints (through-hole pads) may
      // start or end on any copper layer; overwriting with the caller's
      // declared layer here would manufacture a phantom layer transition at
      // the pad — which downstream code happily emits as a real via in the
      // pad's hole even though the pad barrel already connects the layers.
      nodes[0] = { ...snapEndpoints.start, layer: nodes[0].layer };
      nodes[nodes.length - 1] = { ...snapEndpoints.end, layer: nodes[nodes.length - 1].layer };

      // Remove intermediate grid nodes that are very close to the snapped endpoints
      // These create "zigzag" patterns when the pad position doesn't align with the grid
      const gridResolution = this.grid.getResolution();
      const removalThreshold = gridResolution * 2.5; // Remove nodes within ~2.5 grid cells of endpoint

      // Check if we should remove node[1] (first grid node after snapped start)
      if (nodes.length >= 3) {
        const start = nodes[0];
        const firstGrid = nodes[1];
        const secondPoint = nodes[2];

        if (start.layer === firstGrid.layer && firstGrid.layer === secondPoint.layer) {
          const distToFirstGrid = Math.hypot(firstGrid.x - start.x, firstGrid.y - start.y);
          // Removing the grid node creates an unsearched direct segment —
          // keep the node when that shortcut would violate clearance.
          if (
            distToFirstGrid <= removalThreshold &&
            segmentClearOfObstacles(
              this.grid,
              this.options.net,
              this.clearanceProfile.getTraceClearance(),
              start,
              secondPoint,
            )
          ) {
            // Remove the first grid node - connect directly from start to second point
            nodes.splice(1, 1);
            gridNodes.splice(1, 1);
          }
        }
      }

      // Check if we should remove node[n-2] (last grid node before snapped end)
      if (nodes.length >= 3) {
        const end = nodes[nodes.length - 1];
        const lastGrid = nodes[nodes.length - 2];
        const secondToLast = nodes[nodes.length - 3];

        if (end.layer === lastGrid.layer && lastGrid.layer === secondToLast.layer) {
          const distToLastGrid = Math.hypot(end.x - lastGrid.x, end.y - lastGrid.y);
          if (
            distToLastGrid <= removalThreshold &&
            segmentClearOfObstacles(
              this.grid,
              this.options.net,
              this.clearanceProfile.getTraceClearance(),
              secondToLast,
              end,
            )
          ) {
            // Remove the last grid node - connect directly from second-to-last to end
            nodes.splice(nodes.length - 2, 1);
            gridNodes.splice(gridNodes.length - 2, 1);
          }
        }
      }
    }

    const filteredNodes: RouteEndpoint[] = [];
    const filteredGridNodes: { gridX: number; gridY: number; layer: string }[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const prev = filteredNodes[filteredNodes.length - 1];
      const cur = nodes[i];
      if (prev && prev.x === cur.x && prev.y === cur.y && prev.layer === cur.layer) {
        continue;
      }
      filteredNodes.push(cur);
      filteredGridNodes.push(gridNodes[i]);
    }

    const angledNodes = this.ensureAllowedRunAngles(filteredNodes);
    const collapsedNodes = this.simplifyToFortyFive(angledNodes);
    const simplifiedNodes = this.removeRedundantNearEndpoints(collapsedNodes);
    const finalNodes = this.removeCollinearPoints(simplifiedNodes);
    this.straightenPadExits(finalNodes);
    // Defense in depth: the post-processing passes above are individually
    // clearance-gated, but ship the result only when the WHOLE final path is
    // clear end to end — otherwise fall back to the raw search-validated
    // path, which is never worse than the pre-simplification behavior.
    if (finalNodes !== filteredNodes && !this.pathIsClear(finalNodes)) {
      return this.assemblePath(filteredNodes, gridNodes.length > 0 ? gridNodes : undefined, viaCount);
    }

    return this.assemblePath(finalNodes, filteredGridNodes.length > 0 ? filteredGridNodes : undefined, viaCount);
  }

  /** True when every same-layer segment of the path is clearance-clear. */
  private pathIsClear(nodes: RouteEndpoint[]): boolean {
    const clearance = this.clearanceProfile.getTraceClearance();
    for (let i = 1; i < nodes.length; i++) {
      if (
        nodes[i].layer === nodes[i - 1].layer &&
        !segmentClearOfObstacles(this.grid, this.options.net, clearance, nodes[i - 1], nodes[i])
      ) {
        return false;
      }
    }
    return true;
  }

  private assemblePath(
    nodes: RouteEndpoint[],
    gridNodes: { gridX: number; gridY: number; layer: string }[] | undefined,
    viaCount: number,
  ): IRoutePath {
    let length = 0;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      if (a.layer === b.layer) {
        length += Math.hypot(b.x - a.x, b.y - a.y);
      } else {
        const planar = Math.hypot(b.x - a.x, b.y - a.y);
        length += planar + this.clearanceProfile.getViaDiameter();
      }
    }
    return {
      nodes,
      gridNodes,
      length,
      viaCount,
      success: true,
    };
  }

  /**
   * Try the canonical two-segment escape shape directly, bypassing the grid
   * search: a pure 45° when the offsets match, otherwise a straight run
   * along the start axis with a single 45° into the goal (the straight pad
   * exit), or the mirror (45° out of the start, straight into the goal
   * axis). Every candidate is clearance-validated end to end; when none fit
   * the caller falls back to the grid search. The returned path is exact —
   * endpoints are used verbatim, so nothing snaps or drifts off the pad
   * axes.
   */
  private tryDirectEscapePath(start: RouteEndpoint, end: RouteEndpoint): IRoutePath | null {
    if (start.layer !== end.layer) {
      return null;
    }
    // Respect layer preference: when the caller pinned preferred layers
    // (route() layers, net-class affinity), a direct path on a non-preferred
    // layer would silently skip the vias the preference implies.
    const preferred = this.options.preferredLayers;
    if (preferred && preferred.length > 0 && !preferred.includes(start.layer)) {
      return null;
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx <= GridSearch.ANGLE_TOLERANCE && ady <= GridSearch.ANGLE_TOLERANCE) {
      return null;
    }
    if (Math.hypot(dx, dy) > GridSearch.DIRECT_ESCAPE_MAX_MM) {
      return null;
    }

    const clearance = this.clearanceProfile.getTraceClearance();
    const clear = (a: RouteEndpoint, b: RouteEndpoint) =>
      segmentClearOfObstacles(this.grid, this.options.net, clearance, a, b);

    const build = (corners: RouteEndpoint[]): IRoutePath => {
      const nodes = [start, ...corners, end];
      let length = 0;
      for (let i = 1; i < nodes.length; i++) {
        if (!clear(nodes[i - 1], nodes[i])) {
          return null as unknown as IRoutePath;
        }
        length += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
      }
      return { nodes, gridNodes: undefined, length, viaCount: 0, success: true };
    };

    // Pure 45° when the offsets match.
    if (Math.abs(adx - ady) <= GridSearch.ANGLE_TOLERANCE) {
      const direct = build([]);
      if (direct) {
        return direct;
      }
    }

    if (adx > GridSearch.ANGLE_TOLERANCE && ady > adx) {
      // Straight down/up the start's x, then 45° into the goal.
      const straight = build([{ x: start.x, y: end.y - Math.sign(dy) * adx, layer: start.layer }]);
      if (straight) {
        return straight;
      }
      // Mirror: 45° out of the start, then straight into the goal's x.
      const mirrored = build([{ x: end.x, y: start.y + Math.sign(dy) * adx, layer: start.layer }]);
      if (mirrored) {
        return mirrored;
      }
    }

    if (ady > GridSearch.ANGLE_TOLERANCE && adx > ady) {
      // Straight across the start's y, then 45° into the goal.
      const straight = build([{ x: end.x - Math.sign(dx) * ady, y: start.y, layer: start.layer }]);
      if (straight) {
        return straight;
      }
      // Mirror: 45° out of the start, then straight into the goal's y.
      const mirrored = build([{ x: start.x + Math.sign(dx) * ady, y: end.y, layer: start.layer }]);
      if (mirrored) {
        return mirrored;
      }
    }

    return null;
  }

  /**
   * Collapses staircase runs into canonical 45° geometry. The grid search
   * assembles paths from unit steps, so a diagonal drift becomes many tiny
   * alternating 45°/axis jogs; collinear merging cannot touch those. Between
   * anchor points (path ends, via nodes — layer changes — and any node the
   * window cannot validly shortcut), each run is replaced by the canonical
   * two-segment 45° route between the same endpoints: pure diagonal, pure
   * straight, or diagonal + straight. Every replacement segment is
   * clearance-validated, so a shortcut that would cut a corner into other
   * copper is rejected and the original steps are kept. Already-clean runs
   * are reproduced unchanged (no churn), and the first segment keeps the
   * straight-first form so pad exits stay on the pad axis.
   */
  private simplifyToFortyFive(nodes: RouteEndpoint[]): RouteEndpoint[] {
    const count = nodes.length;
    if (count <= 3) {
      return nodes;
    }

    const result: RouteEndpoint[] = [nodes[0]];
    let i = 0;

    while (i < count - 1) {
      if (nodes[i + 1].layer !== nodes[i].layer) {
        // Via transition: pin both nodes, they are deliberate layer changes.
        result.push(nodes[i + 1]);
        i++;
        continue;
      }

      // End of the same-layer chunk reachable from i.
      let limit = i + 1;
      while (limit < count - 1 && nodes[limit + 1].layer === nodes[limit].layer) {
        limit++;
      }

      let cursor = i;
      while (cursor < limit) {
        const windowEnd = Math.min(limit, cursor + GridSearch.SIMPLIFY_WINDOW_NODES);
        let advanced = false;
        for (let j = windowEnd; j >= cursor + 2; j--) {
          // Keep the pad-exit form: straight first when leaving the path start.
          const straightFirst = cursor === 0;
          const replacement = this.canonicalFortyFiveRoute(nodes[cursor], nodes[j], straightFirst);
          if (!replacement || replacement.length >= j - cursor) {
            continue; // no strict reduction in segment count
          }
          if (this.replacementRouteIsClear(nodes[cursor], replacement, nodes[j])) {
            // The replacement holds only intermediate points — the shortcut's
            // endpoint node must be carried too, or every collapsed anchor
            // (including the final pad node) is silently dropped.
            result.push(...replacement, nodes[j]);
            cursor = j;
            advanced = true;
            break;
          }
        }
        if (!advanced) {
          result.push(nodes[cursor + 1]);
          cursor++;
        }
      }
      i = limit;
    }

    return result;
  }

  /**
   * Intermediate points of the canonical 45° route from `a` to `b` (same
   * layer): none when aligned or a pure diagonal, otherwise one corner.
   * `straightFirst` picks whether the straight run leaves `a` (diagonal
   * arrives at `b`) or the diagonal leaves `a` — both forms have exactly one
   * 45° turn. Returns null when the points coincide.
   */
  private canonicalFortyFiveRoute(a: RouteEndpoint, b: RouteEndpoint, straightFirst: boolean): RouteEndpoint[] | null {
    const tol = GridSearch.ANGLE_TOLERANCE;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx <= tol && ady <= tol) {
      return null;
    }
    if (adx <= tol || ady <= tol) {
      return []; // already a single straight segment
    }
    if (Math.abs(adx - ady) <= tol) {
      return []; // already a single 45° diagonal
    }
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if (straightFirst) {
      return adx > ady
        ? [{ x: a.x + sx * (adx - ady), y: a.y, layer: a.layer }]
        : [{ x: a.x, y: a.y + sy * (ady - adx), layer: a.layer }];
    }
    return adx > ady
      ? [{ x: a.x + sx * ady, y: a.y + sy * ady, layer: a.layer }]
      : [{ x: a.x + sx * adx, y: a.y + sy * adx, layer: a.layer }];
  }

  /** Clearance-check every segment of a candidate replacement route. */
  private replacementRouteIsClear(a: RouteEndpoint, mid: RouteEndpoint[], b: RouteEndpoint): boolean {
    const clearance = this.clearanceProfile.getTraceClearance();
    const points = [a, ...mid, b];
    for (let k = 1; k < points.length; k++) {
      if (!segmentClearOfObstacles(this.grid, this.options.net, clearance, points[k - 1], points[k])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Straightens pad exits and entries. The search allows 45° moves from the
   * first cell, so the trace often leaves a pad at an angle — sometimes as a
   * run of consecutive diagonals. Convention (and readable boards) want the
   * pad-touching segment perfectly straight along an axis, with any 45°
   * occurring after the escape. The pad-side diagonal run is rebuilt as
   * straight-along-the-continuation-axis plus a 45° merge (or a perpendicular
   * jog when the lateral offset dominates). Every replacement segment is
   * clearance-validated — if it would not fit, the diagonals are kept, so
   * this can never break routability.
   */
  private straightenPadExits(nodes: RouteEndpoint[]): void {
    const isDiagonal = (a: RouteEndpoint, b: RouteEndpoint) =>
      Math.abs(b.x - a.x) > GridSearch.ANGLE_TOLERANCE && Math.abs(b.y - a.y) > GridSearch.ANGLE_TOLERANCE;
    const sameLayer = (a: RouteEndpoint, b: RouteEndpoint) => a.layer === b.layer;

    const count = nodes.length;
    if (count < 3) {
      return;
    }

    // Start side: pad → diagonal run → first axis-aligned continuation.
    if (isDiagonal(nodes[0], nodes[1])) {
      let k = 1;
      while (k + 1 < count && sameLayer(nodes[k], nodes[k + 1]) && isDiagonal(nodes[k], nodes[k + 1])) {
        k++;
      }
      if (
        k + 1 < count &&
        sameLayer(nodes[k], nodes[k + 1]) &&
        !isDiagonal(nodes[k], nodes[k + 1]) &&
        Math.hypot(nodes[k].x - nodes[0].x, nodes[k].y - nodes[0].y) <= GridSearch.STRAIGHTEN_MAX_ESCAPE_MM
      ) {
        const mid = this.buildStraightExitReplacement(nodes[0], nodes[k], nodes[k + 1]);
        if (mid) {
          nodes.splice(1, k - 1, mid);
        }
      }
    }

    // End side: last axis-aligned approach → diagonal run → pad.
    const end = nodes.length;
    if (end >= 3 && isDiagonal(nodes[end - 2], nodes[end - 1])) {
      let k = end - 2;
      while (k - 1 >= 0 && sameLayer(nodes[k - 1], nodes[k]) && isDiagonal(nodes[k - 1], nodes[k])) {
        k--;
      }
      if (
        k - 1 >= 0 &&
        sameLayer(nodes[k - 1], nodes[k]) &&
        !isDiagonal(nodes[k - 1], nodes[k]) &&
        Math.hypot(nodes[k].x - nodes[end - 1].x, nodes[k].y - nodes[end - 1].y) <= GridSearch.STRAIGHTEN_MAX_ESCAPE_MM
      ) {
        const mid = this.buildStraightExitReplacement(nodes[end - 1], nodes[k], nodes[k - 1]);
        if (mid) {
          nodes.splice(k + 1, end - 2 - k, mid);
        }
      }
    }
  }

  /**
   * Compute the replacement point that straightens the pad-touching diagonal
   * `pad → corner` to exit along the axis of the adjacent segment
   * `corner → adjacent` (start side) / `adjacent → corner` (end side).
   * Returns null when the diagonal is already straight, too small to matter,
   * or the replacement would violate clearance.
   */
  private buildStraightExitReplacement(
    pad: RouteEndpoint,
    corner: RouteEndpoint,
    adjacent: RouteEndpoint,
  ): RouteEndpoint | null {
    const dx = corner.x - pad.x;
    const dy = corner.y - pad.y;
    const lateralX = Math.abs(dx);
    const lateralY = Math.abs(dy);
    if (lateralX <= GridSearch.ANGLE_TOLERANCE || lateralY <= GridSearch.ANGLE_TOLERANCE) {
      return null; // already axis-aligned
    }

    // The exit axis follows the direction of travel beyond the corner, so
    // the straight escape flows into the rest of the route.
    const adjDx = Math.abs(adjacent.x - corner.x);
    const adjDy = Math.abs(adjacent.y - corner.y);
    const axisVertical = adjDy > adjDx ? true : adjDx > adjDy ? false : null;
    if (axisVertical === null) {
      return null; // the route continues diagonally; leave the pair alone
    }

    const along = axisVertical ? lateralY : lateralX;
    const perp = axisVertical ? lateralX : lateralY;
    if (perp <= this.grid.getResolution() * 0.5) {
      return null; // sub-half-cell offset: the angle is invisible
    }

    const sign = axisVertical ? Math.sign(dy) : Math.sign(dx);
    let mid: RouteEndpoint;
    if (along > perp + GridSearch.ANGLE_TOLERANCE) {
      // Straight escape of (along - perp), then a 45° merge into the corner.
      mid = axisVertical
        ? { x: pad.x, y: pad.y + sign * (along - perp), layer: pad.layer }
        : { x: pad.x + sign * (along - perp), y: pad.y, layer: pad.layer };
    } else {
      // Lateral offset dominates (or ties): straight along the axis for the
      // full `along`, then a perpendicular jog of `perp`.
      mid = axisVertical ? { x: pad.x, y: corner.y, layer: pad.layer } : { x: corner.x, y: pad.y, layer: pad.layer };
    }

    const clearance = this.clearanceProfile.getTraceClearance();
    const clear = (a: RouteEndpoint, b: RouteEndpoint) =>
      segmentClearOfObstacles(this.grid, this.options.net, clearance, a, b);
    if (!clear(pad, mid) || !clear(mid, corner)) {
      return null;
    }
    return mid;
  }

  /**
   * Removes intermediate points that lie on a straight line between their neighbors.
   * This eliminates unnecessary "zigzag" patterns where a trace goes 45° then back 45°
   * when it could just continue straight, or similar redundant bends.
   */
  private removeCollinearPoints(nodes: RouteEndpoint[]): RouteEndpoint[] {
    if (nodes.length <= 2) {
      return nodes;
    }

    const result: RouteEndpoint[] = [nodes[0]];

    for (let i = 1; i < nodes.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = nodes[i];
      const next = nodes[i + 1];

      // Skip points where there's a layer change - these are via locations
      if (prev.layer !== curr.layer || curr.layer !== next.layer) {
        result.push(curr);
        continue;
      }

      // Check if curr is collinear with prev and next
      if (!this.isCollinear(prev, curr, next)) {
        result.push(curr);
      }
      // If collinear, skip curr (it's redundant)
    }

    // Always include the last node
    result.push(nodes[nodes.length - 1]);

    return result;
  }

  /**
   * Checks if three points are collinear (lie on the same line).
   * Uses cross product to detect collinearity with a small tolerance.
   */
  private isCollinear(a: RouteEndpoint, b: RouteEndpoint, c: RouteEndpoint): boolean {
    // Vector from a to b
    const abx = b.x - a.x;
    const aby = b.y - a.y;

    // Vector from a to c
    const acx = c.x - a.x;
    const acy = c.y - a.y;

    // Cross product: if zero (within tolerance), points are collinear
    const cross = abx * acy - aby * acx;

    // Use a relative tolerance based on the segment lengths
    const lenAB = Math.hypot(abx, aby);
    const lenAC = Math.hypot(acx, acy);
    const maxLen = Math.max(lenAB, lenAC, 0.001);

    // Tolerance scaled by segment length - allows for small floating point errors
    const tolerance = maxLen * 0.001;

    return Math.abs(cross) <= tolerance;
  }

  /**
   * Removes redundant intermediate points near the start/end of a path.
   * These can occur when endpoint snapping creates a pattern like:
   * pad → nearby grid point → main route direction
   * The nearby grid point often creates an ugly "zigzag" pattern and should
   * be removed even if it means the resulting segment isn't at a perfect
   * 45°/90° angle - small deviations are visually acceptable.
   */
  private removeRedundantNearEndpoints(nodes: RouteEndpoint[]): RouteEndpoint[] {
    if (nodes.length <= 2) {
      return nodes;
    }

    const result = [...nodes];
    const gridResolution = this.grid.getResolution();
    // Consider points within 3 grid cells of endpoints as "near"
    const nearThreshold = gridResolution * 3;

    // Check start: if nodes[1] is very close to nodes[0], remove it
    // This eliminates the "jog" right at the pad entry
    if (result.length >= 3) {
      const start = result[0];
      const mid = result[1];
      const next = result[2];

      if (start.layer === mid.layer && mid.layer === next.layer) {
        const distStartToMid = Math.hypot(mid.x - start.x, mid.y - start.y);

        // Remove the intermediate point if it's close to the start
        // Don't require the resulting segment to be at an allowed angle -
        // a small deviation is better than a visible zigzag — but never
        // remove it when the direct segment would violate clearance.
        if (
          distStartToMid <= nearThreshold &&
          segmentClearOfObstacles(this.grid, this.options.net, this.clearanceProfile.getTraceClearance(), start, next)
        ) {
          result.splice(1, 1);
        }
      }
    }

    // Check end: if nodes[n-2] is very close to nodes[n-1], remove it
    if (result.length >= 3) {
      const prev = result[result.length - 3];
      const mid = result[result.length - 2];
      const end = result[result.length - 1];

      if (prev.layer === mid.layer && mid.layer === end.layer) {
        const distMidToEnd = Math.hypot(end.x - mid.x, end.y - mid.y);

        if (
          distMidToEnd <= nearThreshold &&
          segmentClearOfObstacles(this.grid, this.options.net, this.clearanceProfile.getTraceClearance(), prev, end)
        ) {
          result.splice(result.length - 2, 1);
        }
      }
    }

    return result;
  }

  /**
   * Prevents placing vias directly adjacent to pads by checking
   * for pad cells within a clearance radius on both involved layers.
   */
  private isPadWithinClearance(gridX: number, gridY: number, layers: string[], clearanceMm: number): boolean {
    if (clearanceMm <= 0) {
      return false;
    }

    const resolution = this.grid.getResolution();
    const radiusCells = Math.max(1, Math.ceil(clearanceMm / resolution));

    for (const layer of layers) {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        for (let dy = -radiusCells; dy <= radiusCells; dy++) {
          const px = gridX + dx;
          const py = gridY + dy;
          if (!this.grid.isInBounds(px, py)) {
            continue;
          }
          if (!this.grid.isPadCell(px, py, layer)) {
            continue;
          }
          const distMm = Math.hypot(dx * resolution, dy * resolution);
          if (distMm <= clearanceMm) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private getDirectionalPenalty(
    node: IRouteNode,
    dir: { dx: number; dy: number },
    endLayerAgnostic: boolean,
    context?: NeighborContext,
  ): number {
    let bendPenalty = 0;
    if (node.directionFrom) {
      if (node.directionFrom.dx !== dir.dx || node.directionFrom.dy !== dir.dy) {
        bendPenalty = this.options.bendCost;
      }
    }

    let layerPenalty = 0;
    if (!endLayerAgnostic) {
      const map = context?.preferredLayerIndexMap;
      if (map && map.size > 0) {
        const layerIndex = map.get(node.layer);
        if (layerIndex === undefined) {
          layerPenalty = GridSearchConstants.NON_PREFERRED_LAYER_PENALTY;
        }
      } else if (this.options.preferredLayers && this.options.preferredLayers.length > 0) {
        const layerIndex = this.options.preferredLayers.indexOf(node.layer);
        if (layerIndex === -1) {
          layerPenalty = GridSearchConstants.NON_PREFERRED_LAYER_PENALTY;
        }
      }
    }

    return bendPenalty + layerPenalty;
  }

  private ensureAllowedRunAngles(nodes: RouteEndpoint[]): RouteEndpoint[] {
    if (nodes.length <= 1) {
      return nodes;
    }

    const gridResolution = this.grid.getResolution();
    // Don't enforce strict angles on segments very close to endpoints
    // These small deviations are visually acceptable and avoiding the
    // angle enforcement prevents ugly "zigzag" patterns at pad entries
    const endpointProximityThreshold = gridResolution * 3;

    const result: RouteEndpoint[] = [nodes[0]];
    const firstPoint = nodes[0];
    const lastPoint = nodes[nodes.length - 1];

    for (let i = 1; i < nodes.length; i++) {
      const target = nodes[i];
      const current = result[result.length - 1];
      if (!current || current.layer !== target.layer || this.isAllowedRunSegment(current, target)) {
        result.push(target);
        continue;
      }

      // Check if this segment is near an endpoint - if so, skip angle enforcement
      const distToFirst = Math.hypot(current.x - firstPoint.x, current.y - firstPoint.y);
      const distToLast = Math.hypot(target.x - lastPoint.x, target.y - lastPoint.y);
      const nearEndpoint = distToFirst <= endpointProximityThreshold || distToLast <= endpointProximityThreshold;

      if (nearEndpoint) {
        // Don't split this segment - accept the small angle deviation
        result.push(target);
        continue;
      }

      const replacements = this.splitIntoAllowedSegments(current, target);
      // The split geometry was never occupancy-checked by the search — a
      // diagonal sweeping past a neighboring pad is the classic DRC leak.
      // Fall back to the original segment when any replacement violates.
      const replacementsClear = replacements.every((rep, i) => {
        const from = i === 0 ? current : replacements[i - 1];
        return segmentClearOfObstacles(
          this.grid,
          this.options.net,
          this.clearanceProfile.getTraceClearance(),
          from,
          rep,
        );
      });
      if (replacementsClear) {
        result.push(...replacements);
      } else {
        result.push(target);
      }
    }
    return result;
  }

  private isAllowedRunSegment(a: RouteEndpoint, b: RouteEndpoint): boolean {
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const tol = GridSearch.ANGLE_TOLERANCE;
    if (dx <= tol && dy <= tol) {
      return true;
    }
    if (dx <= tol || dy <= tol) {
      return true;
    }
    return Math.abs(dx - dy) <= tol;
  }

  private splitIntoAllowedSegments(start: RouteEndpoint, end: RouteEndpoint): RouteEndpoint[] {
    if (start.layer !== end.layer) {
      return [end];
    }
    const tol = GridSearch.ANGLE_TOLERANCE;
    const result: RouteEndpoint[] = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const diag = Math.min(absDx, absDy);
    const totalDist = Math.hypot(dx, dy);

    let currentX = start.x;
    let currentY = start.y;

    // Avoid creating tiny diagonal segments that look like unnecessary jogs.
    // If the diagonal portion is very small relative to the total distance,
    // it creates a visual "zigzag" artifact. In such cases, we suppress the
    // diagonal entirely and go straight to the endpoint (the small angle
    // deviation is visually imperceptible and acceptable).
    const minDiagRatio = 0.15; // Diagonal must be at least 15% of total distance
    const minAbsoluteDiag = 0.3; // Or at least 0.3mm absolute
    const diagRatio = totalDist > tol ? diag / totalDist : 0;
    const suppressDiag = diag > tol && (diag < minAbsoluteDiag || diagRatio < minDiagRatio);

    if (suppressDiag) {
      // Skip the diagonal - go straight to the end
      // The small angle deviation is acceptable
      result.push({ x: end.x, y: end.y, layer: end.layer });
      return result;
    }

    // Normal case: diagonal first, then straight
    if (diag > tol) {
      currentX += stepX * diag;
      currentY += stepY * diag;
      result.push({ x: currentX, y: currentY, layer: start.layer });
    }

    const remainingX = absDx - diag;
    if (remainingX > tol) {
      currentX += stepX * remainingX;
      result.push({ x: currentX, y: currentY, layer: start.layer });
    }

    const remainingY = absDy - diag;
    if (remainingY > tol) {
      currentY += stepY * remainingY;
      result.push({ x: currentX, y: currentY, layer: start.layer });
    }

    if (
      result.length === 0 ||
      Math.abs(result[result.length - 1].x - end.x) > tol ||
      Math.abs(result[result.length - 1].y - end.y) > tol
    ) {
      result.push({ x: end.x, y: end.y, layer: end.layer });
    } else {
      result[result.length - 1] = { x: end.x, y: end.y, layer: end.layer };
    }

    return result;
  }

  private hasForcedNeighbor(
    gridX: number,
    gridY: number,
    layer: string,
    dir: { dx: number; dy: number },
    clearance: number,
    context: NeighborContext,
  ): boolean {
    const lookup = (dx: number, dy: number): boolean =>
      context.lookupOccupancy(layer, gridX + dx, gridY + dy, clearance, true, false);

    if (dir.dx !== 0 && dir.dy !== 0) {
      return (lookup(-dir.dx, 0) && !lookup(-dir.dx, dir.dy)) || (lookup(0, -dir.dy) && !lookup(dir.dx, -dir.dy));
    }

    if (dir.dx !== 0) {
      return (lookup(0, 1) && !lookup(dir.dx, 1)) || (lookup(0, -1) && !lookup(dir.dx, -1));
    }

    if (dir.dy !== 0) {
      return (lookup(1, 0) && !lookup(1, dir.dy)) || (lookup(-1, 0) && !lookup(-1, dir.dy));
    }

    return false;
  }

  private buildLayerOrder(layers: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const layer of layers) {
      if (!layer || seen.has(layer)) continue;
      seen.add(layer);
      result.push(layer);
    }
    if (result.length === 0 && layers.length > 0) {
      result.push(layers[0]);
    }
    return result;
  }

  private buildSearchWindow(
    start: { gridX: number; gridY: number },
    end: { gridX: number; gridY: number },
    expansionLevel: number = 0,
  ): SearchWindow {
    const paddingMm =
      Math.max(this.clearanceProfile.getTraceClearance(), this.clearanceProfile.getViaKeepoutRadius()) +
      GridSearchConstants.SEARCH_WINDOW_PADDING_MM;
    const resolution = this.grid.getResolution();
    const expansionMultiplier = 1 + expansionLevel * 0.75;
    const paddingCells = Math.max(4, Math.ceil((paddingMm * expansionMultiplier) / resolution));

    const minX = Math.min(start.gridX, end.gridX) - paddingCells;
    const maxX = Math.max(start.gridX, end.gridX) + paddingCells;
    const minY = Math.min(start.gridY, end.gridY) - paddingCells;
    const maxY = Math.max(start.gridY, end.gridY) + paddingCells;

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      expansionLevel,
    };
  }

  private isWithinWindow(gridX: number, gridY: number, window: SearchWindow): boolean {
    return gridX >= window.minX && gridX <= window.maxX && gridY >= window.minY && gridY <= window.maxY;
  }

  private getLayerCode(layer: string): number {
    const existing = this.layerCodeMap.get(layer);
    if (existing !== undefined) return existing;
    const next = this.nextLayerCode++;
    this.layerCodeMap.set(layer, next);
    return next;
  }

  private buildGlobalOccupancyKey(
    layer: string,
    gridX: number,
    gridY: number,
    clearanceMm: number,
    ignoreSameNet: boolean,
    treatManualRoutesAsBlocks: boolean,
  ): { key: number; clearanceBucket: number; variant: number } | null {
    if (!this.grid.isInBounds(gridX, gridY)) {
      return null;
    }
    const clearanceBucket = Math.max(0, Math.round(clearanceMm * 1000));
    const variant = (ignoreSameNet ? 1 : 0) + (treatManualRoutesAsBlocks ? 2 : 0);
    const layerCode = this.getLayerCode(layer);

    // Simple 32-bit FNV-1a style hash to avoid string churn while keeping collisions low.
    let hash = 0x811c9dc5;
    hash = Math.imul(hash ^ layerCode, 0x01000193);
    hash = Math.imul(hash ^ gridX, 0x01000193);
    hash = Math.imul(hash ^ gridY, 0x01000193);
    hash = Math.imul(hash ^ clearanceBucket, 0x01000193);
    hash = Math.imul(hash ^ variant, 0x01000193);
    hash >>>= 0;

    return { key: hash, clearanceBucket, variant };
  }

  dispose(): void {
    this.windowCache.clear();
    this.pathCache.clear();
    this.pathCacheOrder = [];
    this.globalOccupancyCache.clear();
    this.layerCodeMap.clear();
    this.openMapArr = [];
    this.closedSet = new Uint32Array(0);
    this.localOccupancyCache = new Int32Array(0);
    this.openMapTouchedIndices = [];
    this.openPQ.clear();
  }

  private storeGlobalOccupancyValue(entry: GlobalOccupancyEntry): void {
    // Update recency by reinserting.
    if (this.globalOccupancyCache.has(entry.key)) {
      this.globalOccupancyCache.delete(entry.key);
    }
    this.globalOccupancyCache.set(entry.key, entry);

    // LRU eviction: drop oldest when limit exceeded.
    if (this.globalOccupancyCache.size > GridSearch.MAX_GLOBAL_OCCUPANCY_CACHE_ENTRIES) {
      const oldest = this.globalOccupancyCache.keys().next().value as number | undefined;
      if (oldest !== undefined) {
        this.globalOccupancyCache.delete(oldest);
      }
    }
  }
}

/**
 * Every routing layer a via between `fromLayer` and `toLayer` physically
 * spans. A through via's barrel occupies every copper layer it passes
 * through, so clearance must be kept on all of them — checking only the two
 * endpoint layers lets a via land on top of an inner-layer track. With a
 * board `layerOrder` configured (blind/buried policy), the span is the
 * layers between the endpoints; without it (through policy), all layers.
 */
export function viaSpanLayers(
  allowedLayers: string[],
  layerOrder: string[],
  fromLayer: string,
  toLayer: string,
): string[] {
  if (!layerOrder || layerOrder.length === 0) {
    return allowedLayers;
  }
  const fromIdx = allowedLayers.indexOf(fromLayer);
  const toIdx = allowedLayers.indexOf(toLayer);
  if (fromIdx === -1 || toIdx === -1) {
    return [fromLayer, toLayer];
  }
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  return allowedLayers.slice(lo, hi + 1);
}

/**
 * Check a straight trace segment against the grid with the same occupancy
 * semantics as the search. Post-search path massaging (endpoint snapping,
 * angle splitting, near-endpoint node removal) creates geometry the A*
 * never occupancy-checked; this catches clearance violations introduced
 * there so the caller can revert the massaging step.
 *
 * Samples the segment interior at half-cell spacing — close enough to catch
 * real violations (the massaged segments are typically many cells long).
 */
export function segmentClearOfObstacles(
  grid: RoutingGrid,
  net: string | undefined,
  clearance: number,
  a: { x: number; y: number; layer: string },
  b: { x: number; y: number; layer: string },
): boolean {
  if (a.layer !== b.layer) return true; // via transitions are not trace geometry
  const resolution = grid.getResolution();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length <= resolution) return true;
  const steps = Math.max(2, Math.ceil(length / (resolution * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const g = grid.worldToGrid(a.x + dx * t, a.y + dy * t);
    if (!grid.isInBounds(g.x, g.y)) return false;
    if (grid.isOccupied(g.x, g.y, a.layer, clearance, net, true, false)) return false;
  }
  return true;
}

export function heuristicDistance(
  x1: number,
  y1: number,
  layer1: string,
  x2: number,
  y2: number,
  layer2: string,
  viaPenalty: number = 0,
  congestionPenalty: number = 0,
  allowDiagonalRuns: boolean = true,
): number {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  let planar: number;
  if (allowDiagonalRuns) {
    const maxComponent = Math.max(dx, dy);
    const minComponent = Math.min(dx, dy);
    planar = minComponent * Math.SQRT2 + (maxComponent - minComponent);
  } else {
    planar = dx + dy;
  }

  let result = planar;
  if (layer1 !== layer2 && viaPenalty > 0) {
    result += viaPenalty;
  }
  if (congestionPenalty > 0) {
    result += congestionPenalty;
  }
  return result;
}

export const GridSearchConstants = {
  NON_PREFERRED_LAYER_PENALTY: 10,
  DEFAULT_VIA_SIZE: 0.6,
  /** Default drill-edge to drill-edge spacing (KiCad/JLC standard). */
  MIN_HOLE_TO_HOLE_MM: 0.25,
  TH_GOAL_VIA_AVOID_RADIUS_MM: 5.0,
  TH_START_VIA_AVOID_RADIUS_MM: 5.0,
  SEARCH_WINDOW_PADDING_MM: 8.0,
};
