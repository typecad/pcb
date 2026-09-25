import chalk from 'chalk';
import logger from '../../utils/logging.js';
const loggerDebug = logger.debug;

/**
 * Calculate the minimum distance from a point to a line segment.
 * This provides accurate distance measurements for angled segments.
 *
 * @param px - Point X coordinate
 * @param py - Point Y coordinate
 * @param x1 - Segment start X coordinate
 * @param y1 - Segment start Y coordinate
 * @param x2 - Segment end X coordinate
 * @param y2 - Segment end Y coordinate
 * @returns Minimum distance from point to segment
 */
export function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // Segment is a point
    return Math.hypot(px - x1, py - y1);
  }

  // Parameter t represents position along the segment (0 = start, 1 = end)
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  // Find the closest point on the segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  // Return distance to closest point
  return Math.hypot(px - closestX, py - closestY);
}

/**
 * Represents a single cell in the routing grid.
 */
export interface IGridCell {
  /** Grid column index */
  x: number;

  /** Grid row index */
  y: number;

  /** Layer this cell is on */
  layer: string;

  /** Whether this cell is blocked by an obstacle */
  occupied: boolean;

  /** If occupied, which net owns this cell (null if not net-specific) */
  net?: string;

  /** If true, this cell is from a manual route and blocks routing even on the same net */
  isManualRoute?: boolean;

  /** If true, this cell blocks routing for all nets (e.g., keepouts, board outline) */
  absoluteBlock?: boolean;

  /** If true, this cell belongs to a pad area (for via placement rules) */
  pad?: boolean;

  /** Cost multiplier for routing through this cell (1.0 = normal, higher = discouraged) */
  cost: number;

  /** Maximum obstacle-required clearance (mm) affecting this cell */
  clearance?: number;

  /**
   * For track obstacles, the half width (mm) of the occupying geometry.
   * Used to enforce edge-to-edge clearance by requiring the new centerline
   * to stay at least (obstacleHalfWidth + centerlineClearance) away.
   */
  obstacleHalfWidthMm?: number;

  /** IDs of obstacles occupying this cell for precise geometry lookups */
  obstacleIds?: string[];
}

/**
 * Represents an obstacle in the routing space.
 */
export interface IRoutingObstacle {
  /** Type of obstacle for debugging/visualization */
  type: 'component' | 'pad' | 'track' | 'zone' | 'keepout' | 'outline';

  /** Bounding box in world coordinates (mm) */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };

  /** Layers this obstacle exists on */
  layers: string[];

  /** Net assignment - obstacles on same net don't block each other */
  net?: string;

  /** Required clearance around this obstacle in mm */
  clearance: number;

  /** Priority - higher priority obstacles block lower priority ones */
  priority?: number;

  /** If true, this obstacle blocks routing even on the same net (for manual routes) */
  isManualRoute?: boolean;

  /** Optional geometric description for precise rasterization (used for tracks) */
  segment?: { x1: number; y1: number; x2: number; y2: number; width: number };

  /** Optional pad geometry for precise rasterization */
  padShape?: {
    shape: 'circle' | 'rect' | 'oval' | 'roundrect';
    center: { x: number; y: number };
    width: number;
    height: number;
    rotation: number; // degrees
  };

  /** Optional polygon geometry (zones, keepouts) for precise rasterization */
  polygon?: { points: { x: number; y: number }[] };
}

/**
 * Grid-based spatial representation for PCB routing.
 * Discretizes continuous PCB space into a uniform grid for pathfinding algorithms.
 */
export class RoutingGrid {
  private static orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
    const val = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
    if (Math.abs(val) < 1e-12) return 0;
    return val > 0 ? 1 : 2;
  }

  private static onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
    return (
      px <= Math.max(ax, bx) + 1e-12 &&
      px + 1e-12 >= Math.min(ax, bx) &&
      py <= Math.max(ay, by) + 1e-12 &&
      py + 1e-12 >= Math.min(ay, by)
    );
  }

  private static segmentsIntersect(
    a1x: number,
    a1y: number,
    a2x: number,
    a2y: number,
    b1x: number,
    b1y: number,
    b2x: number,
    b2y: number,
  ): boolean {
    const o1 = RoutingGrid.orientation(a1x, a1y, a2x, a2y, b1x, b1y);
    const o2 = RoutingGrid.orientation(a1x, a1y, a2x, a2y, b2x, b2y);
    const o3 = RoutingGrid.orientation(b1x, b1y, b2x, b2y, a1x, a1y);
    const o4 = RoutingGrid.orientation(b1x, b1y, b2x, b2y, a2x, a2y);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && RoutingGrid.onSegment(a1x, a1y, a2x, a2y, b1x, b1y)) return true;
    if (o2 === 0 && RoutingGrid.onSegment(a1x, a1y, a2x, a2y, b2x, b2y)) return true;
    if (o3 === 0 && RoutingGrid.onSegment(b1x, b1y, b2x, b2y, a1x, a1y)) return true;
    if (o4 === 0 && RoutingGrid.onSegment(b1x, b1y, b2x, b2y, a2x, a2y)) return true;
    return false;
  }

  private static pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private bounds: { minX: number; maxX: number; minY: number; maxY: number };
  public gridResolution: number;
  private layers: string[];
  private cells: (IGridCell | undefined)[];
  private gridWidth: number;
  private gridHeight: number;
  private cellsTotalSize: number;
  private maxObstacleClearance: number;
  maxObstacleHalfWidthMm: number;
  private obstacles: Map<string, IRoutingObstacle>;
  private _version: number = 0;

  private layerIndex: Map<string, number>;

  /**
   * Creates a new routing grid.
   *
   * @param bounds - World-space bounds of the routing area in mm
   * @param gridResolution - Size of each grid cell in mm (e.g., 0.1 = 10 cells per mm)
   * @param layers - List of copper layers to route on (e.g., ['F.Cu', 'B.Cu'])
   *
   * @example
   * ```ts
   * const grid = new RoutingGrid(
   *   { minX: 0, maxX: 100, minY: 0, maxY: 80 },
   *   0.1,  // 0.1mm per cell
   *   ['F.Cu', 'B.Cu']
   * );
   * ```
   */
  constructor(
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    gridResolution: number,
    layers: string[],
    private debug: boolean = false,
  ) {
    this.bounds = bounds;
    this.gridResolution = gridResolution;
    this.layers = layers;
    this.obstacles = new Map();
    this.maxObstacleClearance = 0;

    this.gridWidth = Math.ceil((bounds.maxX - bounds.minX) / gridResolution);
    this.gridHeight = Math.ceil((bounds.maxY - bounds.minY) / gridResolution);

    this.maxObstacleHalfWidthMm = 0;

    this.layerIndex = new Map<string, number>();
    for (let i = 0; i < layers.length; i++) {
      this.layerIndex.set(layers[i], i);
    }

    this.cellsTotalSize = layers.length * this.gridWidth * this.gridHeight;
    if (this.cellsTotalSize > 500_000_000) {
      throw new Error(
        `RoutingGrid too large: ${this.gridWidth}x${this.gridHeight}x${layers.length} = ${this.cellsTotalSize} cells. Reduce board size or increase grid resolution.`,
      );
    }
    this.cells = new Array(this.cellsTotalSize);

    if (this.debug) {
      if (loggerDebug)
        loggerDebug(
          chalk.blue(
            `[RoutingGrid] Created grid: ${this.gridWidth}x${this.gridHeight} cells (${this.gridWidth * this.gridHeight * layers.length} total across ${layers.length} layers)`,
          ),
        );
      if (loggerDebug)
        loggerDebug(
          chalk.blue(
            `[RoutingGrid] Resolution: ${gridResolution}mm, Bounds: ${bounds.minX},${bounds.minY} to ${bounds.maxX},${bounds.maxY}`,
          ),
        );
    }
  }

  /**
   * Add an obstacle to the grid.
   * Marks all cells within the obstacle bounds as occupied.
   * Note: Clearance is NOT applied here - it's checked during routing in isOccupied().
   *
   * @param obstacle - The obstacle to add
   */
  private static _obstacleIdCounter = 0;

  addObstacle(obstacle: IRoutingObstacle): void {
    // Zone obstacles represent copper fills that can be routed through —
    // the EDA tool creates clearance when the zone is poured.  Adding them
    // as occupied cells would block all routing on dense boards.
    if (obstacle.type === 'zone') return;

    const obstacleId = `${obstacle.type}_${++RoutingGrid._obstacleIdCounter}`;
    this.obstacles.set(obstacleId, { ...obstacle });

    // Expand wildcard layer specifications (e.g., '*.Cu') to actual grid layers
    const expandLayers = (layers: string[]): string[] => {
      if (!layers || layers.length === 0) return [];
      // If any entry is '*.Cu', apply to all grid layers
      if (layers.some((l) => l === '*.Cu')) {
        return this.layers;
      }
      return layers;
    };

    const targetLayers = expandLayers(obstacle.layers);

    for (const layer of targetLayers) {
      if (!this.layers.includes(layer)) {
        continue; // Skip layers we're not routing on
      }

      // Convert world bounds to grid bounds (without clearance expansion)
      // Clearance is applied during routing checks, not during obstacle placement
      const gridBounds = this.worldBoundsToGridBounds(
        obstacle.bounds.minX,
        obstacle.bounds.maxX,
        obstacle.bounds.minY,
        obstacle.bounds.maxY,
      );

      // Helper to mark a single cell as occupied
      const occupyCell = (gx: number, gy: number, obstacleHalfWidthMm?: number) => {
        const idx = this.getCellIndex(layer, gx, gy);
        if (idx < 0) return;
        const existingCell = this.cells[idx];

        if (existingCell) {
          existingCell.occupied = true;
          if (obstacle.type === 'keepout' || obstacle.type === 'outline') {
            existingCell.absoluteBlock = true;
          }
          if (obstacle.type === 'pad') {
            existingCell.pad = true;
          }
          // Track the strongest clearance requirement for this occupied cell
          const obsClr = obstacle.clearance ?? 0;
          if (obsClr > (existingCell.clearance ?? 0)) {
            existingCell.clearance = obsClr;
          }
          // Preserve the maximum half width seen for any track occupying this cell
          if (typeof obstacleHalfWidthMm === 'number') {
            existingCell.obstacleHalfWidthMm = Math.max(existingCell.obstacleHalfWidthMm ?? 0, obstacleHalfWidthMm);
          }
          if (obstacle.net) {
            if (!existingCell.net) {
              existingCell.net = obstacle.net;
            } else if (existingCell.net === obstacle.net) {
              // same-net, keep as-is
            } else {
              // different-net overlap: keep prior owner to avoid overriding pad ownership
            }
          }
          if (obstacle.isManualRoute) {
            existingCell.isManualRoute = true;
            existingCell.cost = Math.min(existingCell.cost, 0.2);
          }
          // Store obstacle ID reference for precise lookups
          if (!existingCell.obstacleIds) {
            existingCell.obstacleIds = [];
          }
          if (!existingCell.obstacleIds.includes(obstacleId)) {
            existingCell.obstacleIds.push(obstacleId);
          }
        } else {
          const obsClr = obstacle.clearance ?? 0;
          this.cells[idx] = {
            x: gx,
            y: gy,
            layer,
            occupied: true,
            net: obstacle.net,
            isManualRoute: obstacle.isManualRoute,
            absoluteBlock: obstacle.type === 'keepout' || obstacle.type === 'outline' ? true : undefined,
            pad: obstacle.type === 'pad' ? true : undefined,
            cost: obstacle.isManualRoute ? 0.2 : 1.0,
            clearance: obsClr > 0 ? obsClr : undefined,
            obstacleHalfWidthMm: typeof obstacleHalfWidthMm === 'number' ? obstacleHalfWidthMm : undefined,
            obstacleIds: [obstacleId],
          };
        }
      };

      // If we have precise segment geometry (tracks), rasterize against cell rectangles
      // using a robust segment–rectangle intersection where the rectangle is expanded
      // by the track half-width. This avoids "holes" at coarse grid resolutions.
      const seg = obstacle.segment;
      if (obstacle.type === 'track' && seg) {
        const halfWidth = seg.width / 2;

        const x1 = seg.x1,
          y1 = seg.y1,
          x2 = seg.x2,
          y2 = seg.y2;

        // Iterate grid cells in the bounding box
        for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
          for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
            const cx = this.gridToWorldX(gx);
            const cy = this.gridToWorldY(gy);
            const halfCell = this.gridResolution / 2;
            const minX = cx - halfCell - halfWidth;
            const maxX = cx + halfCell + halfWidth;
            const minY = cy - halfCell - halfWidth;
            const maxY = cy + halfCell + halfWidth;

            // Quick accept: either endpoint inside expanded rect
            let hit =
              (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) ||
              (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY);
            if (!hit) {
              if (
                RoutingGrid.segmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) ||
                RoutingGrid.segmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
                RoutingGrid.segmentsIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
                RoutingGrid.segmentsIntersect(x1, y1, x2, y2, minX, maxY, minX, minY)
              ) {
                hit = true;
              }
            }

            if (hit) {
              // Mark occupied and record the half width for clearance checks
              occupyCell(gx, gy, halfWidth);
            }
          }
        }

        // Ensure our global search window considers wide tracks
        this.maxObstacleClearance = Math.max(this.maxObstacleClearance, obstacle.clearance ?? 0, halfWidth);
        this.maxObstacleHalfWidthMm = Math.max(this.maxObstacleHalfWidthMm, halfWidth);
      } else if (obstacle.type === 'pad' && obstacle.padShape) {
        // Precise rasterization for pad shapes via rectangle–polygon intersection.
        // Convert pad shape into a polygon in world coords, then test overlap with cell rectangles.
        const { shape, center: c, width: w, height: h, rotation } = obstacle.padShape;
        const halfW = w / 2;
        const halfH = h / 2;

        // Pads are rasterized into grid cells, but the physical pad boundary can
        // extend up to one full grid-cell beyond the outermost occupied cell center
        // (due to circle/rect rasterization and rotation).  Using padEffectiveRadius
        // per cell is too aggressive (blocks routing lanes), but gridRes/2 is too
        // small and causes clearance violations.  gridResolution provides a safe
        // margin that covers the worst-case gap between rasterized cells and the
        // true pad edge while keeping routing lanes open.
        const padCellHalfWidth = this.gridResolution * 1.5;

        // Still track the max physical pad radius for search window sizing
        let padPhysicalRadius: number;
        if (shape === 'circle') {
          padPhysicalRadius = Math.min(halfW, halfH);
        } else if (shape === 'oval') {
          padPhysicalRadius = Math.max(halfW, halfH);
        } else {
          padPhysicalRadius = Math.sqrt(halfW * halfW + halfH * halfH);
        }

        const rotRad = (rotation * Math.PI) / 180; // forward rotation to world
        const cosR = Math.cos(rotRad);
        const sinR = Math.sin(rotRad);
        const toWorld = (lx: number, ly: number) => ({
          x: c.x + lx * cosR - ly * sinR,
          y: c.y + lx * sinR + ly * cosR,
        });

        const poly: { x: number; y: number }[] = [];
        const pushWorld = (lx: number, ly: number) => {
          poly.push(toWorld(lx, ly));
        };
        const ARC_STEPS = 12; // resolution for circular/oval approximation

        if (shape === 'rect' || shape === 'roundrect') {
          // Approximate roundrect as rect (corner radius unavailable)
          pushWorld(-halfW, -halfH);
          pushWorld(halfW, -halfH);
          pushWorld(halfW, halfH);
          pushWorld(-halfW, halfH);
        } else if (shape === 'circle') {
          const r = Math.min(halfW, halfH);
          for (let i = 0; i < ARC_STEPS; i++) {
            const t = (2 * Math.PI * i) / ARC_STEPS;
            pushWorld(r * Math.cos(t), r * Math.sin(t));
          }
        } else if (shape === 'oval') {
          if (w >= h) {
            const r = halfH;
            const inner = Math.max(0, halfW - r);
            // Top straight edge
            pushWorld(-inner, r);
            pushWorld(inner, r);
            // Right semicircle: +90 -> -90 degrees
            for (let s = 1; s < ARC_STEPS; s++) {
              const ang = Math.PI / 2 - (Math.PI * s) / ARC_STEPS;
              pushWorld(inner + r * Math.cos(ang), r * Math.sin(ang));
            }
            // Bottom straight edge
            pushWorld(inner, -r);
            pushWorld(-inner, -r);
            // Left semicircle: -90 -> +90 degrees
            for (let s = 1; s < ARC_STEPS; s++) {
              const ang = -Math.PI / 2 + (Math.PI * s) / ARC_STEPS;
              pushWorld(-inner + r * Math.cos(ang), r * Math.sin(ang));
            }
          } else {
            const r = halfW;
            const inner = Math.max(0, halfH - r);
            // Top semicircle (center at y=+inner): 180 -> 0 degrees
            for (let s = 0; s <= ARC_STEPS; s++) {
              const ang = Math.PI - (Math.PI * s) / ARC_STEPS;
              pushWorld(r * Math.cos(ang), inner + r * Math.sin(ang));
            }
            // Right straight side to bottom
            pushWorld(r, -inner);
            // Bottom semicircle: 0 -> 180 degrees
            for (let s = 0; s <= ARC_STEPS; s++) {
              const ang = (Math.PI * s) / ARC_STEPS;
              pushWorld(r * Math.cos(ang), -inner + r * Math.sin(ang));
            }
            // Left straight side back to top
            pushWorld(-r, inner);
          }
        } else {
          // Fallback: occupy full bounding box
          for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
            for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
              occupyCell(gx, gy, padCellHalfWidth);
            }
          }
          this.maxObstacleHalfWidthMm = Math.max(this.maxObstacleHalfWidthMm, padPhysicalRadius);
        }

        if (poly.length > 0) {
          const halfCell = this.gridResolution / 2;
          for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
            for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
              const cx = this.gridToWorldX(gx);
              const cy = this.gridToWorldY(gy);
              const minX = cx - halfCell;
              const maxX = cx + halfCell;
              const minY = cy - halfCell;
              const maxY = cy + halfCell;

              let hit = false;
              if (
                RoutingGrid.pointInPolygon(minX, minY, poly) ||
                RoutingGrid.pointInPolygon(maxX, minY, poly) ||
                RoutingGrid.pointInPolygon(maxX, maxY, poly) ||
                RoutingGrid.pointInPolygon(minX, maxY, poly)
              ) {
                hit = true;
              }
              if (!hit) {
                for (let i = 0; i < poly.length; i++) {
                  const px = poly[i].x,
                    py = poly[i].y;
                  if (px >= minX - 1e-12 && px <= maxX + 1e-12 && py >= minY - 1e-12 && py <= maxY + 1e-12) {
                    hit = true;
                    break;
                  }
                }
              }
              if (!hit) {
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                  const px1 = poly[j].x,
                    py1 = poly[j].y;
                  const px2 = poly[i].x,
                    py2 = poly[i].y;
                  if (
                    RoutingGrid.segmentsIntersect(px1, py1, px2, py2, minX, minY, maxX, minY) ||
                    RoutingGrid.segmentsIntersect(px1, py1, px2, py2, maxX, minY, maxX, maxY) ||
                    RoutingGrid.segmentsIntersect(px1, py1, px2, py2, maxX, maxY, minX, maxY) ||
                    RoutingGrid.segmentsIntersect(px1, py1, px2, py2, minX, maxY, minX, minY)
                  ) {
                    hit = true;
                    break;
                  }
                }
              }

              if (hit) occupyCell(gx, gy, padCellHalfWidth);
            }
          }

          this.maxObstacleHalfWidthMm = Math.max(this.maxObstacleHalfWidthMm, padPhysicalRadius);
        }
      } else if (obstacle.polygon && obstacle.polygon.points && obstacle.polygon.points.length >= 3) {
        // Precise rasterization for polygon obstacles (zones, keepouts):
        // mark a grid cell occupied if the polygon and the cell rectangle intersect in any way.
        const pts = obstacle.polygon.points;

        const halfCell = this.gridResolution / 2;

        for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
          for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
            const cx = this.gridToWorldX(gx);
            const cy = this.gridToWorldY(gy);
            const minX = cx - halfCell;
            const maxX = cx + halfCell;
            const minY = cy - halfCell;
            const maxY = cy + halfCell;

            let hit = false;
            if (
              RoutingGrid.pointInPolygon(minX, minY, pts) ||
              RoutingGrid.pointInPolygon(maxX, minY, pts) ||
              RoutingGrid.pointInPolygon(maxX, maxY, pts) ||
              RoutingGrid.pointInPolygon(minX, maxY, pts)
            ) {
              hit = true;
            }

            if (!hit) {
              for (let i = 0; i < pts.length; i++) {
                const px = pts[i].x,
                  py = pts[i].y;
                if (px >= minX - 1e-12 && px <= maxX + 1e-12 && py >= minY - 1e-12 && py <= maxY + 1e-12) {
                  hit = true;
                  break;
                }
              }
            }

            if (!hit) {
              for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const px1 = pts[j].x,
                  py1 = pts[j].y;
                const px2 = pts[i].x,
                  py2 = pts[i].y;
                if (
                  RoutingGrid.segmentsIntersect(px1, py1, px2, py2, minX, minY, maxX, minY) ||
                  RoutingGrid.segmentsIntersect(px1, py1, px2, py2, maxX, minY, maxX, maxY) ||
                  RoutingGrid.segmentsIntersect(px1, py1, px2, py2, maxX, maxY, minX, maxY) ||
                  RoutingGrid.segmentsIntersect(px1, py1, px2, py2, minX, maxY, minX, minY)
                ) {
                  hit = true;
                  break;
                }
              }
            }

            if (hit) occupyCell(gx, gy);
          }
        }
      } else {
        // Fallback: occupy full bounding box (pads, components, zones, keepouts, outlines)
        for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
          for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
            occupyCell(gx, gy);
          }
        }
      }
    }

    // Track grid-wide maximum obstacle clearance for efficient search radius
    this.maxObstacleClearance = Math.max(this.maxObstacleClearance, obstacle.clearance ?? 0);
  }

  /**
   * Check if a specific grid cell belongs to a pad area on a given layer.
   */
  isPadCell(x: number, y: number, layer: string): boolean {
    const idx = this.getCellIndex(layer, x, y);
    if (idx < 0) return false;
    const cell = this.cells[idx];
    return !!cell?.pad;
  }

  /**
   * Check if any pad lies within the specified clearance of a grid coordinate.
   * Ignores net assignments so that callers can enforce absolute pad spacing.
   */
  hasPadWithinClearance(x: number, y: number, layer: string, clearanceMm: number): boolean {
    if (clearanceMm <= 0) {
      return false;
    }

    const radiusCells = Math.ceil((clearanceMm + this.maxObstacleHalfWidthMm) / this.gridResolution);
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      for (let dy = -radiusCells; dy <= radiusCells; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isInBounds(nx, ny)) continue;

        const cell = this.cells[this.getCellIndex(layer, nx, ny)];
        if (!cell?.pad) continue;

        const padHalfWidth = cell.obstacleHalfWidthMm ?? 0;
        const padClearance = cell.clearance ?? 0;
        const requiredClearance = Math.max(clearanceMm, padClearance);

        const distanceMm = Math.sqrt(dx * dx + dy * dy) * this.gridResolution;
        const edgeDistance = Math.max(0, distanceMm - padHalfWidth);
        if (edgeDistance < requiredClearance) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a grid cell is occupied.
   *
   * @param x - Grid X coordinate
   * @param y - Grid Y coordinate
   * @param layer - Layer to check
   * @param clearance - Additional clearance to check (in mm, not grid cells)
   * @param net - Net we're routing - obstacles on same net don't block
   * @returns True if occupied, false if available for routing
   */
  isOccupied(
    x: number,
    y: number,
    layer: string,
    clearance: number = 0,
    net?: string,
    considerObstacleClearance: boolean = false,
    sumObstacleClearance: boolean = false,
    blockers?: Set<string>,
  ): boolean {
    // Check if coordinates are within bounds
    if (!this.isInBounds(x, y)) {
      return true; // Out of bounds = occupied
    }

    // Fast path: no clearance and not considering obstacle clearance => exact cell only
    if (clearance <= 0 && !considerObstacleClearance) {
      return this.isCellOccupied(x, y, layer, net);
    }

    // Determine search radius in cells. The radius must cover every cell that
    // could block: the clearance (trace keepout incl. the moving trace's own
    // half-width, or a via keepout) compared against the strongest obstacle
    // clearance, plus the widest obstacle half-width so wide tracks/pads are
    // reachable by the scan.
    const searchClearanceMm = considerObstacleClearance
      ? sumObstacleClearance
        ? clearance + this.maxObstacleClearance + this.maxObstacleHalfWidthMm
        : Math.max(clearance, this.maxObstacleClearance) + this.maxObstacleHalfWidthMm
      : clearance;
    const searchRadiusCells = Math.ceil(searchClearanceMm / this.gridResolution);
    const gridResSq = this.gridResolution * this.gridResolution;

    for (let dx = -searchRadiusCells; dx <= searchRadiusCells; dx++) {
      for (let dy = -searchRadiusCells; dy <= searchRadiusCells; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isInBounds(nx, ny)) continue;

        const idx = this.getCellIndex(layer, nx, ny);
        if (idx < 0) continue;
        const cell = this.cells[idx];
        if (!cell || !cell.occupied) continue;

        // Same-net exemption (except for absolute blocks and manual-route handling below)
        if (net && cell.net && cell.net === net && !cell.isManualRoute && !cell.absoluteBlock) {
          continue;
        }

        // Effective clearance is the stricter of the trace's and the obstacle's requirement; do not add
        // a full grid cell of margin, which can be overly conservative near dense pads.
        const obstacleClr = considerObstacleClearance ? (cell.clearance ?? 0) : 0;
        // For track obstacles, use edge-to-edge clearance: the new trace centerline must stay
        // at least (obstacleHalfWidth + clearance) away from the obstacle centerline.
        // This is the correct PCB clearance calculation.
        const obstacleHalfWidthMm = cell.obstacleHalfWidthMm ?? 0;
        const baseClearance = sumObstacleClearance ? clearance + obstacleClr : Math.max(clearance, obstacleClr);

        // Use squared distance to avoid Math.sqrt:
        // We want: edgeToEdgeDistance < baseClearance
        //   edgeToEdgeDistance = max(0, distanceMm - obstacleHalfWidthMm)
        //   <=> distanceMm < baseClearance + obstacleHalfWidthMm
        //   <=> distSqGrid * gridResSq < (baseClearance + obstacleHalfWidthMm)^2
        const distSqGrid = dx * dx + dy * dy;
        const thresholdMm = baseClearance + obstacleHalfWidthMm;
        const withinThreshold = distSqGrid * gridResSq <= thresholdMm * thresholdMm;

        // Absolute blocks always block within required clearance
        if (cell.absoluteBlock && withinThreshold) {
          return true;
        }

        // Manual routes: block different nets; allow same net
        if (cell.isManualRoute) {
          if (!(net && cell.net && cell.net === net)) {
            if (withinThreshold) {
              if (blockers && cell.net) blockers.add(cell.net);
              return true;
            }
          }
          continue;
        }

        // General occupied cell: blocks different nets within required clearance
        if (withinThreshold) {
          if (blockers && cell.net && cell.net !== net) blockers.add(cell.net);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Fast-path occupancy check for via placement: returns true only if the cell
   * at (x, y, layer) is occupied by an obstacle whose ID is in `obstacleIds`.
   * Avoids the expensive clearance-radius scan of isOccupied().
   *
   * @param x       Grid X coordinate
   * @param y       Grid Y coordinate
   * @param layer   Layer name
   * @param obstacleIds  Set (or array) of obstacle IDs already belonging to the
   *                     current net — these are ignored so the via can share pads.
   */
  isOccupiedById(x: number, y: number, layer: string, obstacleIds: Set<string> | string[]): boolean {
    if (!this.isInBounds(x, y)) return true;

    const idx = this.getCellIndex(layer, x, y);
    if (idx < 0) return true;
    const cell = this.cells[idx];
    if (!cell || !cell.occupied) return false;

    // Absolute blocks always block
    if (cell.absoluteBlock) return true;

    // If the cell has no obstacle IDs it blocks unconditionally
    if (!cell.obstacleIds || cell.obstacleIds.length === 0) return true;

    // Check whether ALL occupying obstacles are in the exempt set
    const ids = cell.obstacleIds;
    for (let i = 0; i < ids.length; i++) {
      const exempt = obstacleIds instanceof Set ? obstacleIds.has(ids[i]) : (obstacleIds as string[]).includes(ids[i]);
      if (!exempt) return true; // blocked by a non-exempt obstacle
    }
    return false; // every obstacle is exempt
  }

  /**
   * Check if a position conflicts with track obstacles using precise point-to-segment distance.
   * This method provides more accurate clearance checking for angled tracks.
   *
   * @param worldX - World X coordinate in mm
   * @param worldY - World Y coordinate in mm
   * @param layer - Layer to check
   * @param clearance - Required clearance in mm
   * @param net - Net we're routing (for same-net exemptions)
   * @returns True if position conflicts with track obstacles
   */
  public checkTrackObstaclePrecise(
    worldX: number,
    worldY: number,
    layer: string,
    clearance: number,
    net?: string,
  ): boolean {
    for (const [obstacleId, obstacle] of this.obstacles) {
      if (!obstacle.segment) continue;
      if (!obstacle.layers.includes(layer)) continue;

      if (net && obstacle.net && obstacle.net === net && !obstacle.isManualRoute) continue;

      const segment = obstacle.segment;
      const trackHalfWidth = segment.width / 2;

      const distanceToTrackCenterline = pointToSegmentDistance(
        worldX,
        worldY,
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2,
      );

      const obstacleClearance = obstacle.clearance || 0;
      const requiredClearance = trackHalfWidth + obstacleClearance + clearance;

      if (distanceToTrackCenterline <= requiredClearance) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get obstacle data for a cell (internal helper).
   * @private
   */
  private getCellObstacle(obstacleId: string): IRoutingObstacle | null {
    return this.obstacles.get(obstacleId) || null;
  }

  /**
   * Convert grid X coordinate to world X coordinate in mm.
   * @param gridX - Grid X coordinate
   * @returns World X coordinate in mm
   */
  public gridToWorldX(gridX: number): number {
    return this.bounds.minX + (gridX + 0.5) * this.gridResolution;
  }

  /**
   * Convert grid Y coordinate to world Y coordinate in mm.
   * @param gridY - Grid Y coordinate
   * @returns World Y coordinate in mm
   */
  public gridToWorldY(gridY: number): number {
    return this.bounds.minY + (gridY + 0.5) * this.gridResolution;
  }

  /**
   * Convert grid X coordinate to world X coordinate using cell boundary (no center offset).
   * This provides more accurate positioning for track creation.
   * @param gridX - Grid X coordinate
   * @returns World X coordinate in mm
   */
  public getWorldXFromGrid(gridX: number): number {
    return this.bounds.minX + gridX * this.gridResolution;
  }

  /**
   * Convert grid Y coordinate to world Y coordinate using cell boundary (no center offset).
   * This provides more accurate positioning for track creation.
   * @param gridY - Grid Y coordinate
   * @returns World Y coordinate in mm
   */
  public getWorldYFromGrid(gridY: number): number {
    return this.bounds.minY + gridY * this.gridResolution;
  }

  /**
   * Check if a single cell is occupied (internal helper).
   * @private
   */
  private isCellOccupied(x: number, y: number, layer: string, net?: string): boolean {
    const idx = this.getCellIndex(layer, x, y);
    if (idx < 0) return false;
    const cell = this.cells[idx];

    if (!cell) {
      return false; // No cell = not occupied
    }

    if (!cell.occupied) {
      return false; // Cell exists but not occupied
    }

    // Absolute blocks (keepouts, outlines) always block regardless of net
    if (cell.absoluteBlock) {
      return true;
    }

    // Manual routes: allow traversal on the same net, block otherwise
    // This lets other connections on the same net connect/branch from a
    // manually specified path while still protecting it from other nets.
    if (cell.isManualRoute) {
      if (net && cell.net && cell.net === net) {
        return false;
      }
      return true;
    }

    // If the cell is occupied by the same net, it's not blocking
    if (net && cell.net && cell.net === net) {
      return false;
    }

    return true; // Occupied by different net or no net
  }

  /**
   * Get the routing cost for a grid cell.
   *
   * @param x - Grid X coordinate
   * @param y - Grid Y coordinate
   * @param layer - Layer to check
   * @returns Cost multiplier (1.0 = normal, higher = more expensive)
   */
  getCellCost(x: number, y: number, layer: string): number {
    const idx = this.getCellIndex(layer, x, y);
    if (idx < 0) return 1.0;
    const cell = this.cells[idx];
    return cell?.cost || 1.0;
  }

  /**
   * Set the routing cost for a grid cell.
   * Useful for biasing routes toward or away from certain areas.
   *
   * @param x - Grid X coordinate
   * @param y - Grid Y coordinate
   * @param layer - Layer
   * @param cost - Cost multiplier
   */
  setCellCost(x: number, y: number, layer: string, cost: number): void {
    const idx = this.getCellIndex(layer, x, y);
    if (idx < 0) return;
    let cell = this.cells[idx];

    if (!cell) {
      cell = {
        x,
        y,
        layer,
        occupied: false,
        cost,
      };
      this.cells[idx] = cell;
    } else {
      cell.cost = cost;
    }
  }

  /**
   * Convert world coordinates (mm) to grid coordinates.
   *
   * @param worldX - X coordinate in mm
   * @param worldY - Y coordinate in mm
   * @returns Grid coordinates
   */
  worldToGrid(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: Math.floor((worldX - this.bounds.minX) / this.gridResolution),
      y: Math.floor((worldY - this.bounds.minY) / this.gridResolution),
    };
  }

  /**
   * Convert grid coordinates to world coordinates (mm).
   * Returns the center of the grid cell.
   *
   * @param gridX - Grid X coordinate
   * @param gridY - Grid Y coordinate
   * @returns World coordinates in mm
   */
  gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
    return {
      x: this.bounds.minX + (gridX + 0.5) * this.gridResolution,
      y: this.bounds.minY + (gridY + 0.5) * this.gridResolution,
    };
  }

  /**
   * Check if grid coordinates are within bounds.
   *
   * @param x - Grid X coordinate
   * @param y - Grid Y coordinate
   * @returns True if in bounds
   */
  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
  }

  /**
   * Get the cell key for the internal map.
   * @private
   */
  private getCellIndex(layer: string, x: number, y: number): number {
    const li = this.layerIndex.get(layer);
    if (li === undefined) return -1;
    return li * this.gridWidth * this.gridHeight + y * this.gridWidth + x;
  }

  /**
   * Get a cell by coordinates, if present.
   */
  getCell(x: number, y: number, layer: string): IGridCell | undefined {
    const idx = this.getCellIndex(layer, x, y);
    if (idx < 0) return undefined;
    return this.cells[idx];
  }

  /**
   * Convert world bounds to grid bounds.
   * @private
   */
  private worldBoundsToGridBounds(
    worldMinX: number,
    worldMaxX: number,
    worldMinY: number,
    worldMaxY: number,
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const topLeft = this.worldToGrid(worldMinX, worldMinY);
    const bottomRight = this.worldToGrid(worldMaxX, worldMaxY);

    return {
      minX: Math.max(0, topLeft.x),
      maxX: Math.min(this.gridWidth - 1, bottomRight.x),
      minY: Math.max(0, topLeft.y),
      maxY: Math.min(this.gridHeight - 1, bottomRight.y),
    };
  }

  /**
   * Get grid dimensions.
   */
  getDimensions(): { width: number; height: number; layers: number } {
    return {
      width: this.gridWidth,
      height: this.gridHeight,
      layers: this.layers.length,
    };
  }

  /**
   * Get grid resolution in mm.
   */
  getResolution(): number {
    return this.gridResolution;
  }

  /**
   * Get the list of layers in the grid.
   */
  getLayers(): string[] {
    return [...this.layers];
  }

  /**
   * Get grid bounds in world coordinates.
   */
  getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    return { ...this.bounds };
  }

  getCellsArray(): readonly (IGridCell | undefined)[] {
    return this.cells;
  }

  getVersion(): number {
    return this._version;
  }

  /**
   * Clear all obstacles from the grid.
   * Useful for rebuilding the grid with different obstacles.
   */
  clear(): void {
    this.cells = new Array(this.cellsTotalSize);
    this.obstacles.clear();
    this.maxObstacleClearance = 0;
    this.maxObstacleHalfWidthMm = 0;
    this._version++;
    if (this.debug) {
      if (loggerDebug) loggerDebug(chalk.blue(`[RoutingGrid] Cleared all cells`));
    }
  }

  /**
   * Get statistics about the grid.
   */
  getStats(): {
    totalCells: number;
    occupiedCells: number;
    freeCells: number;
    occupancyPercent: number;
  } {
    const totalCells = this.gridWidth * this.gridHeight * this.layers.length;
    let occupiedCells = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c && c.occupied) occupiedCells++;
    }
    const freeCells = totalCells - occupiedCells;

    return {
      totalCells,
      occupiedCells,
      freeCells,
      occupancyPercent: (occupiedCells / totalCells) * 100,
    };
  }
}
