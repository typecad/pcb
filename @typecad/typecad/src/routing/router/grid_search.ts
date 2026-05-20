import chalk from "chalk";
import logger from '../../logging.js';
import { PriorityQueue } from "../shared/priority_queue.js";
import type { RoutingGrid } from "../contracts/routing_grid.js";
import type {
  IRouteNode,
  IRoutePath,
  NormalizedRoutingOptions,
  RouteEndpoint,
} from "./types.js";
import { ClearanceProfile } from "./clearance_profile.js";
import { profiler } from "../shared/profiler.js";

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
  ignoreSameNet: boolean,
  treatManualRoutesAsBlocks: boolean
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
}

interface ISearchRunResult {
  status: "success" | "failure" | "expand";
  path?: IRoutePath;
  error?: string;
  iterations?: number;
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
  private openMapTouchedIndices: number[] = [];
  private openPQ = new PriorityQueue<IRouteNode>((a, b) => a.fCost - b.fCost);
  private static readonly MAX_PATH_CACHE_ENTRIES = 64;
  private static readonly MAX_GLOBAL_OCCUPANCY_CACHE_ENTRIES = 400000;
  private static readonly ANGLE_TOLERANCE = 1e-6;

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
    const hasExplicitScope =
      "windows" in scope || "paths" in scope || "occupancy" in scope;
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
      3
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
        this.grid.isOccupied(
          node.gridX,
          node.gridY,
          node.layer,
          clearance,
          this.options.net,
          false,
          true
        )
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

  private getWindowCacheKey(
    start: { gridX: number; gridY: number },
    end: { gridX: number; gridY: number }
  ): string {
    const a = `${start.gridX},${start.gridY}`;
    const b = `${end.gridX},${end.gridY}`;
    return a <= b ? `${a}->${b}` : `${b}->${a}`;
  }

  private getOrCreateWindowData(
    start: { gridX: number; gridY: number },
    end: { gridX: number; gridY: number },
    startLayer: string,
    endLayer: string
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
      const merged = this.mergeWindows(
        cached.window,
        this.buildSearchWindow(start, end, cached.window.expansionLevel)
      );
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
    endLayer: string
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
    nextWindow: SearchWindow
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
    previous?: CachedWindow
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

  private sampleCellCost(
    layer: string,
    gridX: number,
    gridY: number,
    windowData: CachedWindow,
    layerIndex?: number
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
      if (
        localX < 0 ||
        localY < 0 ||
        localX >= searchWindow.width ||
        localY >= searchWindow.height
      ) {
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
      ignoreSameNet: boolean,
      treatManualRoutesAsBlocks: boolean
    ): boolean => {
      if (!this.isWithinWindow(gridX, gridY, searchWindow)) {
        boundaryTracker.touched = true;
        return true;
      }

      // Fast path: the router always queries occupancy using the same variant
      // (ignoreSameNet=false, treatManualRoutesAsBlocks=true) and a constant
      // trace clearance for the whole run.
      if (
        clearanceMm === fastTraceClearance &&
        ignoreSameNet === false &&
        treatManualRoutesAsBlocks === true
      ) {
        const cellIndex = encodeKey(layer, gridX, gridY);
        if (cellIndex < 0) {
          return true;
        }

        const localCached = this.localOccupancyCache[cellIndex];
        if (localCached === this.searchGeneration) return true;
        if (localCached === -this.searchGeneration) return false;

        const globalKey = this.buildGlobalOccupancyKey(
          layer,
          gridX,
          gridY,
          fastTraceClearance,
          false,
          true
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
          false,
          true
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
        ignoreSameNet,
        treatManualRoutesAsBlocks
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
        ignoreSameNet,
        treatManualRoutesAsBlocks
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

    const viaPenalty = this.options.allowVias ? this.options.viaCost ?? 0 : 0;

    const mmPerCell = this.grid.getResolution();
    const strideDisableRadius = Math.max(
      1,
      Math.ceil(
        (this.options.strideNearPadDisableRadiusMm ?? 3.0) / mmPerCell
      )
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
    const manhattanToGoal =
      Math.abs(startGrid.gridX - endGrid.gridX) +
      Math.abs(startGrid.gridY - endGrid.gridY);
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
    };

    const startLayers: string[] =
      !forceSingleLayer && startIsFreeVia
        ? (this.options.allowedLayers && this.options.allowedLayers.length > 0
            ? this.options.allowedLayers
            : [adjustedStart.layer])
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
      const avgCost =
        startCost > 0 && goalCost > 0
          ? (startCost + goalCost) * 0.5
          : windowData.averageCost;
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
            status: "success",
            path: this.reconstructPath(current, {
              start: adjustedStart,
              end: adjustedEnd,
            }),
            iterations,
          };
        }

        openMapArr[currentKey] = undefined;
        closedSet[currentKey] = this.searchGeneration;

        let neighbors = this.getNeighbors(current, neighborContext);

        if ((this.options.useAdaptiveStride ?? false) && neighbors.length === 0) {
          neighbors = this.getNeighbors(current, neighborContext, true);
        }

        for (const neighbor of neighbors) {
          const neighborKey = encodeKey(
            neighbor.layer,
            neighbor.gridX,
            neighbor.gridY,
            neighbor.layerIndex
          );

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
              // Only check occupancy for non-special cells
              const effectiveClearance = fastTraceClearance;
              if (lookupOccupancy(
                neighbor.layer,
                neighbor.gridX,
                neighbor.gridY,
                effectiveClearance,
                false,
                true
              )) {
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
        return { status: "expand", iterations };
      }

      return {
        status: "failure",
        iterations,
        error: `No path found after ${iterations} iterations`,
      };
    } finally {
      for (const idx of this.openMapTouchedIndices) {
        this.openMapArr[idx] = undefined;
      }
      this.openMapTouchedIndices.length = 0;
      profiler.end('GridSearch.runSearchWithWindow');
    }
  }

  public findPath(start: RouteEndpoint, end: RouteEndpoint): IRoutePath {
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
      } else if (
        startIsFreeVia &&
        start.layer !== end.layer &&
        !endIsFreeVia
      ) {
        adjustedStart = { ...start, layer: end.layer };
        forceSingleLayer = true;
      } else if (
        endIsFreeVia &&
        start.layer !== end.layer &&
        !startIsFreeVia
      ) {
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

      let windowData = this.getOrCreateWindowData(
        startGrid,
        endGrid,
        adjustedStart.layer,
        adjustedEnd.layer
      );

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
        });

        if (result.status === "expand") {
          windowData = this.expandWindowData(
            windowData,
            startGrid,
            endGrid,
            adjustedStart.layer,
            adjustedEnd.layer
          );
          continue;
        }

        if (result.status === "success" && result.path) {
          this.storePathCache(cacheKey, result.path);
          return result.path;
        }

        if (this.options.debug) {
          logger.warn(
            chalk.yellow(
              `[GridSearch] Failed to find path after ${result.iterations ?? 0} iterations`
            )
          );
        }

        return result.path ??
          {
            nodes: [],
            length: 0,
            viaCount: 0,
            success: false,
            error: result.error ?? `No path found after ${result.iterations ?? 0} iterations`,
          };
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
    { dx: -1, dy: 1, cost: Math.SQRT2 }
  ]);

  private getNeighbors(
    node: IRouteNode,
    context: NeighborContext,
    disableStride: boolean = false
  ): IRouteNode[] {
    const neighbors: IRouteNode[] = [];
    const {
      goalX,
      goalY,
      goalLayer,
      viaPenalty,
      allowDiagonalRuns,
      heuristicWeight,
      windowData,
      goalCosts
    } = context;
    const averageCost = windowData.averageCost;
    const nodeLayerIndex = windowData.layerIdMap.get(node.layer);
    const nodeGoalCost = nodeLayerIndex !== undefined && goalCosts ? goalCosts[nodeLayerIndex] : undefined;
    const directions = this.options.allow45DegreeRuns 
      ? GridSearch.DIRECTIONS_8WAY 
      : GridSearch.DIRECTIONS_4WAY;
    const strideClearance = this.clearanceProfile.getTraceClearance();

    for (const dir of directions) {
      if (this.options.useAdaptiveStride && !disableStride) {
        const jumped = this.jump(
          node,
          dir,
          strideClearance,
          context
        );
        if (jumped) {
          neighbors.push(jumped);
          continue;
        }
        const single = this.makeSingleStepNeighbor(
          node,
          dir,
          context
        );
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
        if (
          node.directionFrom.dx !== dir.dx ||
          node.directionFrom.dy !== dir.dy
        ) {
          bendPenalty = this.options.bendCost;
        }
      }

      let layerPenalty = 0;
      if (
        !context.endLayerAgnostic &&
        context.preferredLayerIndexMap &&
        context.preferredLayerIndexMap.size > 0
      ) {
        const layerIndex = context.preferredLayerIndexMap.get(node.layer);
        if (layerIndex === undefined) {
          layerPenalty = GridSearchConstants.NON_PREFERRED_LAYER_PENALTY;
        }
      }

      const moveCost =
        dir.cost +
        bendPenalty +
        layerPenalty +
        this.sampleCellCost(node.layer, nx, ny, windowData, nodeLayerIndex);

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
          const radiusCells = Math.max(
            1,
            Math.ceil(
              GridSearchConstants.TH_GOAL_VIA_AVOID_RADIUS_MM / mmPerCell
            )
          );
          const distToGoal = Math.hypot(context.goalX - nx, context.goalY - ny);
          if (distToGoal <= radiusCells) {
            continue;
          }
        }

        if (
          context.startLayerAgnostic &&
          context.startX !== undefined &&
          context.startY !== undefined
        ) {
          const mmPerCell = this.grid.getResolution();
          const radiusCells = Math.max(
            1,
            Math.ceil(
              GridSearchConstants.TH_START_VIA_AVOID_RADIUS_MM / mmPerCell
            )
          );
          const distToStart = Math.hypot(
            context.startX - nx,
            context.startY - ny
          );
          if (distToStart <= radiusCells) {
            continue;
          }
        }

        const allowViaHere = !!node.parent;

        if (!allowViaHere) {
          continue;
        }

        const padKeepout = this.clearanceProfile.getViaKeepoutRadius();

        if (
          this.isPadWithinClearance(
            nx,
            ny,
            [node.layer, targetLayer],
            padKeepout
          )
        ) {
          continue;
        }

        const viaBlocked =
          this.grid.isOccupied(
            nx,
            ny,
            node.layer,
            padKeepout,
            this.options.net,
            true,
            true
          ) ||
          this.grid.isOccupied(
            nx,
            ny,
            targetLayer,
            padKeepout,
            this.options.net,
            true,
            true
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

        const viaCostAtLocation = this.options.viaCost || 0;

        let targetLayerPenalty = 0;
        if (
          !context.endLayerAgnostic &&
          context.preferredLayerIndexMap &&
          context.preferredLayerIndexMap.size > 0
        ) {
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
        });
      }
    }

    return neighbors;
  }

  private jump(
    node: IRouteNode,
    dir: { dx: number; dy: number; cost: number },
    clearance: number,
    context: NeighborContext
  ): IRouteNode | null {
    const {
      goalX,
      goalY,
      goalLayer,
      viaPenalty,
      allowDiagonalRuns,
      heuristicWeight,
      windowData,
      goalCosts
    } = context;
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
    
    if (
      startDistSq <= context.strideDisableRadiusSq ||
      goalDistSq <= context.strideDisableRadiusSq
    ) {
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

      if (
        context.lookupOccupancy(
          node.layer,
          nx,
          ny,
          clearance,
          false,
          true
        )
      ) {
        return null;
      }

      if (dir.dx !== 0 && dir.dy !== 0) {
        const ax = currentX + dir.dx;
        const ay = currentY;
        const bx = currentX;
        const by = currentY + dir.dy;
        if (
          context.lookupOccupancy(node.layer, ax, ay, clearance, false, true) ||
          context.lookupOccupancy(node.layer, bx, by, clearance, false, true)
        ) {
          return null;
        }
      }

      currentX = nx;
      currentY = ny;
      accMoveCost +=
        dir.cost +
        this.sampleCellCost(node.layer, currentX, currentY, windowData, nodeLayerIndex);
      if (!penaltyApplied) {
        accMoveCost += this.getDirectionalPenalty(
          node,
          dir,
          context.endLayerAgnostic,
          context
        );
        penaltyApplied = true;
      }

      const reachedGoal =
        currentX === goalX &&
        currentY === goalY &&
        (node.layer === goalLayer || context.endLayerAgnostic);

      const forced = this.hasForcedNeighbor(
        currentX,
        currentY,
        node.layer,
        dir,
        clearance,
        context
      );

      const nearStart = (() => {
        const dx = currentX - context.startGrid.gridX;
        const dy = currentY - context.startGrid.gridY;
        return (dx * dx + dy * dy) <= context.strideDisableRadiusSq;
      })();
      
      const nearGoal = (() => {
        const dx = currentX - context.endGrid.gridX;
        const dy = currentY - context.endGrid.gridY;
        return (dx * dx + dy * dy) <= context.strideDisableRadiusSq;
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
        };
      }
    }

    return null;
  }

  private makeSingleStepNeighbor(
    node: IRouteNode,
    dir: { dx: number; dy: number; cost: number },
    context: NeighborContext
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
      heuristicWeight
    } = context;
    const averageCost = windowData.averageCost;
    const nx = node.gridX + dir.dx;
    const ny = node.gridY + dir.dy;
    if (!this.grid.isInBounds(nx, ny)) return null;

    let bendPenalty = 0;
    if (node.directionFrom) {
      if (
        node.directionFrom.dx !== dir.dx ||
        node.directionFrom.dy !== dir.dy
      ) {
        bendPenalty = this.options.bendCost;
      }
    }

    let layerPenalty = 0;
    if (
      !endLayerAgnostic &&
      context.preferredLayerIndexMap &&
      context.preferredLayerIndexMap.size > 0
    ) {
      const layerIndex = context.preferredLayerIndexMap.get(node.layer);
      if (layerIndex === undefined) {
        layerPenalty = GridSearchConstants.NON_PREFERRED_LAYER_PENALTY;
      }
    }

    const nodeLayerIndex = windowData.layerIdMap.get(node.layer);
    const nodeGoalCost = nodeLayerIndex !== undefined && goalCosts ? goalCosts[nodeLayerIndex] : undefined;

    const moveCost =
      dir.cost +
      bendPenalty +
      layerPenalty +
      this.sampleCellCost(node.layer, nx, ny, windowData, nodeLayerIndex);

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
    };
  }

  private reconstructPath(
    endNode: IRouteNode,
    snapEndpoints?: { start: RouteEndpoint; end: RouteEndpoint }
  ): IRoutePath {
    const nodes: RouteEndpoint[] = [];
    const gridNodes: { gridX: number; gridY: number; layer: string }[] = [];
    let current: IRouteNode | null = endNode;
    let viaCount = 0;
    let length = 0;

    while (current) {
      let worldPos: { x: number; y: number };
      if (current.worldX !== undefined && current.worldY !== undefined) {
        worldPos = { x: current.worldX, y: current.worldY };
      } else {
        const gridWorldPos = this.grid.gridToWorld(
          current.gridX,
          current.gridY
        );
        const gridResolution = this.grid.getResolution();
        worldPos = {
          x: gridWorldPos.x - gridResolution * 0.125,
          y: gridWorldPos.y - gridResolution * 0.125,
        };
      }

      if (current.viaUsed && current.parent) {
        const prevNode = nodes[0];
        const needsParentNode =
          !prevNode ||
          prevNode.x !== worldPos.x ||
          prevNode.y !== worldPos.y ||
          prevNode.layer !== current.parent.layer;

        if (needsParentNode) {
          nodes.unshift({
            x: worldPos.x,
            y: worldPos.y,
            layer: current.parent.layer,
          });
          gridNodes.unshift({
            gridX: current.gridX,
            gridY: current.gridY,
            layer: current.parent.layer,
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
      nodes[0] = snapEndpoints.start;
      nodes[nodes.length - 1] = snapEndpoints.end;
      
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
          if (distToFirstGrid <= removalThreshold) {
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
          if (distToLastGrid <= removalThreshold) {
            // Remove the last grid node - connect directly from second-to-last to end
            nodes.splice(nodes.length - 2, 1);
            gridNodes.splice(gridNodes.length - 2, 1);
          }
        }
      }
    }

    const filteredNodes: RouteEndpoint[] = [];
    const filteredGridNodes: { gridX: number; gridY: number; layer: string }[] =
      [];

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
    const simplifiedNodes = this.removeRedundantNearEndpoints(angledNodes);
    const finalNodes = this.removeCollinearPoints(simplifiedNodes);

    for (let i = 1; i < finalNodes.length; i++) {
      const a = finalNodes[i - 1];
      const b = finalNodes[i];
      if (a.layer === b.layer) {
        length += Math.hypot(b.x - a.x, b.y - a.y);
      } else {
        const planar = Math.hypot(b.x - a.x, b.y - a.y);
        length += planar + this.clearanceProfile.getViaDiameter();
      }
    }

    return {
      nodes: finalNodes,
      gridNodes: filteredGridNodes,
      length,
      viaCount,
      success: true,
    };
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
        // a small deviation is better than a visible zigzag
        if (distStartToMid <= nearThreshold) {
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
        
        if (distMidToEnd <= nearThreshold) {
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
  private isPadWithinClearance(
    gridX: number,
    gridY: number,
    layers: string[],
    clearanceMm: number
  ): boolean {
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
    context?: NeighborContext
  ): number {
    let bendPenalty = 0;
    if (node.directionFrom) {
      if (
        node.directionFrom.dx !== dir.dx ||
        node.directionFrom.dy !== dir.dy
      ) {
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
      if (
        !current ||
        current.layer !== target.layer ||
        this.isAllowedRunSegment(current, target)
      ) {
        result.push(target);
        continue;
      }
      
      // Check if this segment is near an endpoint - if so, skip angle enforcement
      const distToFirst = Math.hypot(current.x - firstPoint.x, current.y - firstPoint.y);
      const distToLast = Math.hypot(target.x - lastPoint.x, target.y - lastPoint.y);
      const nearEndpoint = distToFirst <= endpointProximityThreshold || 
                          distToLast <= endpointProximityThreshold;
      
      if (nearEndpoint) {
        // Don't split this segment - accept the small angle deviation
        result.push(target);
        continue;
      }
      
      const replacements = this.splitIntoAllowedSegments(current, target);
      result.push(...replacements);
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

  private splitIntoAllowedSegments(
    start: RouteEndpoint,
    end: RouteEndpoint
  ): RouteEndpoint[] {
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
    context: NeighborContext
  ): boolean {
    const lookup = (dx: number, dy: number): boolean =>
      context.lookupOccupancy(
        layer,
        gridX + dx,
        gridY + dy,
        clearance,
        false,
        true
      );

    if (dir.dx !== 0 && dir.dy !== 0) {
      return (
        (lookup(-dir.dx, 0) && !lookup(-dir.dx, dir.dy)) ||
        (lookup(0, -dir.dy) && !lookup(dir.dx, -dir.dy))
      );
    }

    if (dir.dx !== 0) {
      return (
        (lookup(0, 1) && !lookup(dir.dx, 1)) ||
        (lookup(0, -1) && !lookup(dir.dx, -1))
      );
    }

    if (dir.dy !== 0) {
      return (
        (lookup(1, 0) && !lookup(1, dir.dy)) ||
        (lookup(-1, 0) && !lookup(-1, dir.dy))
      );
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
    expansionLevel: number = 0
  ): SearchWindow {
    const paddingMm = Math.max(
      this.clearanceProfile.getTraceClearance(),
      this.clearanceProfile.getViaKeepoutRadius()
    ) + GridSearchConstants.SEARCH_WINDOW_PADDING_MM;
    const resolution = this.grid.getResolution();
    const expansionMultiplier = 1 + expansionLevel * 0.75;
    const paddingCells = Math.max(
      4,
      Math.ceil((paddingMm * expansionMultiplier) / resolution)
    );

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

  private isWithinWindow(
    gridX: number,
    gridY: number,
    window: SearchWindow
  ): boolean {
    return (
      gridX >= window.minX &&
      gridX <= window.maxX &&
      gridY >= window.minY &&
      gridY <= window.maxY
    );
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
    treatManualRoutesAsBlocks: boolean
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

export function heuristicDistance(
  x1: number,
  y1: number,
  layer1: string,
  x2: number,
  y2: number,
  layer2: string,
  viaPenalty: number = 0,
  congestionPenalty: number = 0,
  allowDiagonalRuns: boolean = true
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
  TH_GOAL_VIA_AVOID_RADIUS_MM: 5.0,
  TH_START_VIA_AVOID_RADIUS_MM: 5.0,
  SEARCH_WINDOW_PADDING_MM: 8.0,
};
