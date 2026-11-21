import chalk from 'chalk';
import logger from '../../utils/logging.js';
import type { IBoardRegion } from './board_region.js';

/** Gap from (px, py) to an obstacle's copper, when its exact shape is known. */
function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) !== o(ax, ay, bx, by, dx, dy) && o(cx, cy, dx, dy, ax, ay) !== o(cx, cy, dx, dy, bx, by);
}

/** Distance between segments AB and CD (0 when they cross). */
function segSegDistance(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    pointToSegmentDistance(ax, ay, cx, cy, dx, dy),
    pointToSegmentDistance(bx, by, cx, cy, dx, dy),
    pointToSegmentDistance(cx, cy, ax, ay, bx, by),
    pointToSegmentDistance(dx, dy, ax, ay, bx, by),
  );
}

/**
 * Gap from a point — or, with (sx, sy), from the segment (sx, sy)→(px, py) —
 * to an obstacle's copper, when its exact shape is known. The segment form
 * checks a whole search MOVE: a step can pass closer to a pad corner than
 * either of its end points (by up to L²/8d), which point probes miss.
 */
function exactGapToObstacle(obs: IRoutingObstacle, px: number, py: number, sx?: number, sy?: number): number | undefined {
  const ax = sx ?? px;
  const ay = sy ?? py;
  if (obs.type === 'track' && obs.segment) {
    const s = obs.segment;
    return Math.max(0, segSegDistance(ax, ay, px, py, s.x1, s.y1, s.x2, s.y2) - s.width / 2);
  }
  if (obs.type === 'pad' && obs.padShape) {
    const { shape, center, width, height, rotation } = obs.padShape;
    // into the pad's own frame (rotation is applied forward when rasterizing)
    const r = (-rotation * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const local = (x: number, y: number) => {
      const dx = x - center.x;
      const dy = y - center.y;
      return [dx * cos - dy * sin, dx * sin + dy * cos] as const;
    };
    const [l1x, l1y] = local(ax, ay);
    const [l2x, l2y] = local(px, py);
    const hw = width / 2;
    const hh = height / 2;
    if (shape === 'circle') return Math.max(0, pointToSegmentDistance(0, 0, l1x, l1y, l2x, l2y) - Math.min(hw, hh));
    if (shape === 'oval') {
      const rad = Math.min(hw, hh);
      const ex = Math.max(0, hw - rad);
      const ey = Math.max(0, hh - rad);
      return Math.max(0, segSegDistance(l1x, l1y, l2x, l2y, -ex, -ey, ex, ey) - rad);
    }
    // rect, roundrect (corner radius unknown: the sharp rect is the safe side), custom
    const inside = (x: number, y: number) => Math.abs(x) <= hw && Math.abs(y) <= hh;
    if (inside(l1x, l1y) || inside(l2x, l2y)) return 0;
    const corners: Array<[number, number]> = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i]!;
      const [dx, dy] = corners[(i + 1) % 4]!;
      best = Math.min(best, segSegDistance(l1x, l1y, l2x, l2y, cx, cy, dx, dy));
    }
    return best;
  }
  return undefined;
}

/** True when every turn of the polygon goes the same way. */
function isConvex(poly: readonly { x: number; y: number }[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = poly[(i + 2) % poly.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-12) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
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

  /** Human label ("U2.2") for diagnostics — pads carry their component ref and pad number. */
  label?: string;

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

  /**
   * Board region (type 'outline'): every cell whose centre lies OFF the
   * board — outside the outer contour or inside a cutout — is an absolute
   * block. `clearance` then keeps copper that far from the nearest
   * off-board cell centre, which is how the copper-to-edge rule is applied.
   */
  boardRegion?: IBoardRegion;
  /**
   * Board edge only: the keepout for a via centre (edge rule + via radius).
   * `clearance` then covers track centrelines only, so a thin track can still
   * leave a pad near the edge where a via could not be placed.
   */
  viaClearance?: number;
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

  /**
   * Board-edge keepout, one byte per cell (index = getCellIndex): set where a
   * copper CENTRELINE may not be — off the board, inside a cutout, or closer
   * to any Edge.Cuts segment than the obstacle's clearance (edge rule + the
   * widest copper radius the route places). Kept apart from obstacle cells on
   * purpose: an occupancy probe adds the TRACE clearance around occupied
   * cells, which would double the edge rule, and flagging cells would hide
   * pads that legitimately sit inside the band.
   */
  private edgeMask: Uint8Array | null = null;

  private addBoardEdgeMask(obstacle: IRoutingObstacle): void {
    const region = obstacle.boardRegion!;
    const contours = [region.outer, ...region.holes];
    // Between two legal cell centres a straight segment can only come closer
    // to the edge than its ends near a reflex corner (concave outline or a
    // cutout); there, keep half a cell diagonal of margin. A convex board
    // keeps the exact distance, so designs laid out at the rule limit route.
    const convex = region.holes.length === 0 && isConvex(region.outer);
    const slack = (convex ? 0 : this.gridResolution * Math.SQRT1_2) - 1e-6;
    const band = obstacle.clearance + slack;
    // vias need the wider band; cells only vias must avoid are marked 1, track keepout 2
    const viaBand = Math.max(band, (obstacle.viaClearance ?? 0) + slack);
    const mask = (this.edgeMask ??= new Uint8Array(this.cellsTotalSize));
    const layers = obstacle.layers.some((l) => l === '*.Cu') ? this.layers : obstacle.layers;
    const mark = (gx: number, gy: number, level = 2) => {
      for (const layer of layers) {
        const idx = this.getCellIndex(layer, gx, gy);
        if (idx >= 0 && mask[idx]! < level) mask[idx] = level;
      }
    };

    // off-board: scanline with even-odd parity over all contours
    for (let gy = 0; gy < this.gridHeight; gy++) {
      const y = this.gridToWorldY(gy);
      const xs: number[] = [];
      for (const poly of contours) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[i]!;
          const b = poly[j]!;
          if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
        }
      }
      xs.sort((p, q) => p - q);
      let k = 0;
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const cx = this.gridToWorldX(gx);
        while (k < xs.length && xs[k]! < cx) k++;
        if (k % 2 === 0) mark(gx, gy);
      }
    }

    // on-board but within `band` of an edge segment: walk each segment's
    // band-expanded box only (cheap even for finely tessellated outlines)
    if (viaBand > 0) {
      for (const poly of contours) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[j]!;
          const b = poly[i]!;
          const g0 = this.worldToGrid(Math.min(a.x, b.x) - viaBand, Math.min(a.y, b.y) - viaBand);
          const g1 = this.worldToGrid(Math.max(a.x, b.x) + viaBand, Math.max(a.y, b.y) + viaBand);
          for (let gx = Math.max(0, g0.x); gx <= Math.min(this.gridWidth - 1, g1.x); gx++) {
            const cx = this.gridToWorldX(gx);
            for (let gy = Math.max(0, g0.y); gy <= Math.min(this.gridHeight - 1, g1.y); gy++) {
              const d = pointToSegmentDistance(cx, this.gridToWorldY(gy), a.x, a.y, b.x, b.y);
              if (d < band) mark(gx, gy);
              else if (d < viaBand) mark(gx, gy, 1);
            }
          }
        }
      }
    }
    this._version++;
  }

  /**
   * Exact gap (mm) from a point to the copper of the obstacles occupying a
   * cell, or undefined when any of them lacks exact geometry (component
   * bodies, polygons, bounding-box fallbacks) — the caller then uses the
   * conservative cell-centre rule.
   */
  private exactGapToCell(
    cell: IGridCell,
    px: number,
    py: number,
    memo: Map<string, number>,
    from?: { x: number; y: number },
  ): number | undefined {
    const ids = cell.obstacleIds;
    if (!ids || ids.length === 0) return undefined;
    let best = Infinity;
    for (const id of ids) {
      let gap = memo.get(id);
      if (gap === undefined) {
        const obs = this.obstacles.get(id);
        if (!obs) return undefined;
        const g = exactGapToObstacle(obs, px, py, from?.x, from?.y);
        if (g === undefined) return undefined;
        gap = g;
        memo.set(id, gap);
      }
      if (gap < best) best = gap;
    }
    return best;
  }

  /** True when the cell centre is inside the board-edge keepout (the wider via keepout when `via`). */
  isEdgeKeepout(x: number, y: number, layer: string, via = false): boolean {
    if (!this.edgeMask) return false;
    const idx = this.getCellIndex(layer, x, y);
    return idx >= 0 && this.edgeMask[idx]! >= (via ? 1 : 2);
  }

  addObstacle(obstacleIn: IRoutingObstacle): void {
    // Zone obstacles represent copper fills that can be routed through —
    // the EDA tool creates clearance when the zone is poured.  Adding them
    // as occupied cells would block all routing on dense boards.
    if (obstacleIn.type === 'zone') return;

    if (obstacleIn.boardRegion) {
      this.addBoardEdgeMask(obstacleIn);
      return;
    }
    const obstacle = obstacleIn;

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

        // The grid-wide max half-width sizes every occupancy probe's scan
        // radius, and the only half-width a pad cell stores is
        // padCellHalfWidth — folding in the pad's physical radius (as this
        // once did) made one 37mm pad turn every probe into a ~270-cell-radius
        // scan that matched nothing extra, timing out trivially routable boards.

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
          this.maxObstacleHalfWidthMm = Math.max(this.maxObstacleHalfWidthMm, padCellHalfWidth);
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

          this.maxObstacleHalfWidthMm = Math.max(this.maxObstacleHalfWidthMm, padCellHalfWidth);
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
    /** Exact world point to test instead of the cell centre (segment sampling). */
    probe?: { x: number; y: number },
    /** Test the whole move from this world point to the probe (exact obstacles only). */
    from?: { x: number; y: number },
  ): boolean {
    // Check if coordinates are within bounds
    if (!this.isInBounds(x, y)) {
      return true; // Out of bounds = occupied
    }
    // the board edge binds the copper centreline exactly — no trace clearance on top
    if (this.isEdgeKeepout(x, y, layer)) return true;

    // Fast path: no clearance and not considering obstacle clearance => exact cell only
    if (clearance <= 0 && !considerObstacleClearance && !probe && !from) {
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
    const probeX = probe ? probe.x : this.gridToWorldX(x);
    const probeY = probe ? probe.y : this.gridToWorldY(y);
    // a move probe must also reach obstacles beside its far end
    const moveMm = from ? Math.hypot(probeX - from.x, probeY - from.y) : 0;
    const searchRadiusCells = Math.ceil((searchClearanceMm + moveMm) / this.gridResolution);
    const gridResSq = this.gridResolution * this.gridResolution;
    const exactGapMemo = new Map<string, number>();

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
        // Exact geometry when every obstacle in the cell has it (pads: their
        // shape; tracks: their segment): the gap from this cell's centre to
        // the obstacle copper must reach the clearance. The cell-centre rule
        // below pads each obstacle by up to ~1.5 cells, which rejected lanes
        // that are exactly legal (designs laid out at the rule limit).
        const exactGap = this.exactGapToCell(cell, probeX, probeY, exactGapMemo, from);
        const withinThreshold =
          exactGap !== undefined ? exactGap < baseClearance - 1e-9 : distSqGrid * gridResSq <= thresholdMm * thresholdMm;

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
    if (this.edgeMask && this.edgeMask[idx] === 2) return true;
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
    this.edgeMask = null;
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
