import { RoutingGrid } from '../contracts/routing_grid.js';
import type { IWaypointPlan, RouteEndpoint, RouteEndpointWithGrid } from './types.js';
import { heuristicDistance } from './grid_search.js';

/**
 * Utility function to convert a RouteEndpoint to RouteEndpointWithGrid.
 */
export function enrichEndpointWithGrid(endpoint: RouteEndpoint, grid: RoutingGrid): RouteEndpointWithGrid {
  const gridPos = grid.worldToGrid(endpoint.x, endpoint.y);
  return {
    x: endpoint.x,
    y: endpoint.y,
    layer: endpoint.layer,
    gridX: gridPos.x,
    gridY: gridPos.y,
  };
}

export interface WaypointPlannerConstants {
  MAX_THROUGH_HOLE_PROXIMITY: number;
  MIN_WAYPOINT_SEPARATION: number;
  VERY_CLOSE_THRESHOLD: number;
  WAYPOINT_ROUTING_OVERHEAD: number;
}

export interface WaypointPlannerConfig {
  grid: RoutingGrid;
  preferredLayer?: string;
  freeViaLocations?: { x: number; y: number }[];
  constants: WaypointPlannerConstants;
  viaCost: number;
}

interface EnrichedVia {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
}

export class WaypointPlanner {
  private grid: RoutingGrid;
  private preferredLayer?: string;
  private throughHoles: EnrichedVia[];
  private constants: WaypointPlannerConstants;
  private viaCost: number;

  constructor(config: WaypointPlannerConfig) {
    this.grid = config.grid;
    this.preferredLayer = config.preferredLayer;
    this.constants = config.constants;
    this.viaCost = config.viaCost;
    this.throughHoles =
      config.freeViaLocations?.map((loc) => {
        const gridPos = this.grid.worldToGrid(loc.x, loc.y);
        return { x: loc.x, y: loc.y, gridX: gridPos.x, gridY: gridPos.y };
      }) ?? [];
  }

  estimateEdgeCost(p1: RouteEndpoint, p2: RouteEndpoint): number {
    // Use pre-computed grid coordinates if available (from RouteEndpointWithGrid)
    const gridStart =
      'gridX' in p1 && 'gridY' in p1
        ? { x: (p1 as RouteEndpointWithGrid).gridX, y: (p1 as RouteEndpointWithGrid).gridY }
        : this.grid.worldToGrid(p1.x, p1.y);
    const gridEnd =
      'gridX' in p2 && 'gridY' in p2
        ? { x: (p2 as RouteEndpointWithGrid).gridX, y: (p2 as RouteEndpointWithGrid).gridY }
        : this.grid.worldToGrid(p2.x, p2.y);

    const directCost = heuristicDistance(gridStart.x, gridStart.y, p1.layer, gridEnd.x, gridEnd.y, p2.layer);

    if (!this.preferredLayer) {
      return directCost;
    }

    const key1 = `${gridStart.x}:${gridStart.y}`;
    const key2 = `${gridEnd.x}:${gridEnd.y}`;
    const isThroughHole1 = this.isThroughHole(key1);
    const isThroughHole2 = this.isThroughHole(key2);

    if (p1.layer === this.preferredLayer || p2.layer === this.preferredLayer || isThroughHole1 || isThroughHole2) {
      return directCost;
    }

    if (this.throughHoles.length === 0) {
      return directCost;
    }

    const nearest = this.findNearestPair(p1, p2);
    if (!nearest.nearestToP1 || !nearest.nearestToP2) {
      return directCost;
    }

    const costP1ToTH = nearest.nearestToP1.dist * this.constants.WAYPOINT_ROUTING_OVERHEAD;
    const costTHToTH = Math.sqrt(
      Math.pow(nearest.nearestToP2.gridX - nearest.nearestToP1.gridX, 2) +
        Math.pow(nearest.nearestToP2.gridY - nearest.nearestToP1.gridY, 2),
    );
    const costTHToP2 = nearest.nearestToP2.dist * this.constants.WAYPOINT_ROUTING_OVERHEAD;

    const viaRouteCost = costP1ToTH + costTHToTH + costTHToP2;
    return Math.min(viaRouteCost, directCost);
  }

  planWaypoints(p1: RouteEndpoint, p2: RouteEndpoint): IWaypointPlan {
    const result: IWaypointPlan = {
      waypoints: [],
      skipFirstSegment: false,
      skipLastSegment: false,
    };

    if (!this.preferredLayer || this.throughHoles.length === 0) {
      return result;
    }

    const isThroughHoleP1 = this.isPointThroughHole(p1);
    const isThroughHoleP2 = this.isPointThroughHole(p2);

    if (isThroughHoleP1 || isThroughHoleP2) {
      return result;
    }

    const bothOnPreferred = p1.layer === this.preferredLayer && p2.layer === this.preferredLayer;
    if (bothOnPreferred) {
      return result;
    }

    const nearest = this.findNearestPair(p1, p2);
    if (!nearest.nearestToP1 || !nearest.nearestToP2) {
      return result;
    }

    const waypointDistance = Math.hypot(
      nearest.nearestToP1.x - nearest.nearestToP2.x,
      nearest.nearestToP1.y - nearest.nearestToP2.y,
    );
    if (waypointDistance < this.constants.MIN_WAYPOINT_SEPARATION) {
      return result;
    }

    const directDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const waypointCost = nearest.nearestToP1.dist + waypointDistance + nearest.nearestToP2.dist;
    const viaCostSavings = this.viaCost * 2;
    const effectiveWaypointCost = waypointCost - viaCostSavings;

    if (effectiveWaypointCost > directDistance * 1.2) {
      return result;
    }

    const skipFirst = nearest.nearestToP1.dist < this.constants.VERY_CLOSE_THRESHOLD;
    const skipLast = nearest.nearestToP2.dist < this.constants.VERY_CLOSE_THRESHOLD;

    result.waypoints = [
      {
        x: nearest.nearestToP1.x,
        y: nearest.nearestToP1.y,
        layer: this.preferredLayer!,
      },
      {
        x: nearest.nearestToP2.x,
        y: nearest.nearestToP2.y,
        layer: this.preferredLayer!,
      },
    ];
    result.skipFirstSegment = skipFirst;
    result.skipLastSegment = skipLast;
    return result;
  }

  private isThroughHole(key: string): boolean {
    return this.throughHoles.some((hole) => `${hole.gridX}:${hole.gridY}` === key);
  }

  private isPointThroughHole(point: RouteEndpoint): boolean {
    const gridPos = this.grid.worldToGrid(point.x, point.y);
    return this.isThroughHole(`${gridPos.x}:${gridPos.y}`);
  }

  private findNearestPair(
    p1: RouteEndpoint,
    p2: RouteEndpoint,
  ): {
    nearestToP1: (EnrichedVia & { dist: number }) | null;
    nearestToP2: (EnrichedVia & { dist: number }) | null;
  } {
    let nearestToP1: (EnrichedVia & { dist: number }) | null = null;
    let nearestToP2: (EnrichedVia & { dist: number }) | null = null;
    const maxProximity = this.constants.MAX_THROUGH_HOLE_PROXIMITY;

    for (const via of this.throughHoles) {
      const dist1 = Math.hypot(via.x - p1.x, via.y - p1.y);
      if (dist1 < maxProximity && (!nearestToP1 || dist1 < nearestToP1.dist)) {
        nearestToP1 = { ...via, dist: dist1 };
      }

      const dist2 = Math.hypot(via.x - p2.x, via.y - p2.y);
      if (dist2 < maxProximity && (!nearestToP2 || dist2 < nearestToP2.dist)) {
        nearestToP2 = { ...via, dist: dist2 };
      }
    }

    return { nearestToP1, nearestToP2 };
  }
}
