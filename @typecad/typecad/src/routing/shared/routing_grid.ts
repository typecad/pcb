import chalk from 'chalk';
import logger from '../../logging.js';
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
    private bounds: { minX: number; maxX: number; minY: number; maxY: number };
    private gridResolution: number; // mm per grid cell
    private layers: string[];
    private cells: Map<string, IGridCell>; // Key: "layer:x:y"
    private gridWidth: number;
    private gridHeight: number;
    private maxObstacleClearance: number; // mm
    private maxObstacleHalfWidthMm: number; // mm
    private obstacles: Map<string, IRoutingObstacle>; // Key: unique obstacle ID

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
        private debug: boolean = false
    ) {
        this.bounds = bounds;
        this.gridResolution = gridResolution;
        this.layers = layers;
        this.cells = new Map();
        this.obstacles = new Map();
        this.maxObstacleClearance = 0;

        // Calculate grid dimensions
        this.gridWidth = Math.ceil((bounds.maxX - bounds.minX) / gridResolution);
        this.gridHeight = Math.ceil((bounds.maxY - bounds.minY) / gridResolution);

        this.maxObstacleHalfWidthMm = 0;
        if (this.debug) {
            loggerDebug && loggerDebug(chalk.blue(`[RoutingGrid] Created grid: ${this.gridWidth}x${this.gridHeight} cells (${this.gridWidth * this.gridHeight * layers.length} total across ${layers.length} layers)`));
            loggerDebug && loggerDebug(chalk.blue(`[RoutingGrid] Resolution: ${gridResolution}mm, Bounds: ${bounds.minX},${bounds.minY} to ${bounds.maxX},${bounds.maxY}`));
        }
    }

    /**
     * Add an obstacle to the grid.
     * Marks all cells within the obstacle bounds as occupied.
     * Note: Clearance is NOT applied here - it's checked during routing in isOccupied().
     *
     * @param obstacle - The obstacle to add
     */
    addObstacle(obstacle: IRoutingObstacle): void {
        // Generate unique obstacle ID and store reference
        const obstacleId = `${obstacle.type}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        this.obstacles.set(obstacleId, { ...obstacle });

        // Expand wildcard layer specifications (e.g., '*.Cu') to actual grid layers
        const expandLayers = (layers: string[]): string[] => {
            if (!layers || layers.length === 0) return [];
            // If any entry is '*.Cu', apply to all grid layers
            if (layers.some(l => l === '*.Cu')) {
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
                obstacle.bounds.maxY
            );

            // Helper to mark a single cell as occupied
            const occupyCell = (gx: number, gy: number, obstacleHalfWidthMm?: number) => {
                const key = this.getCellKey(layer, gx, gy);
                const existingCell = this.cells.get(key);

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
                    this.cells.set(key, {
                        x: gx,
                        y: gy,
                        layer,
                        occupied: true,
                        net: obstacle.net,
                        isManualRoute: obstacle.isManualRoute,
                        absoluteBlock: (obstacle.type === 'keepout' || obstacle.type === 'outline') ? true : undefined,
                        pad: obstacle.type === 'pad' ? true : undefined,
                        cost: obstacle.isManualRoute ? 0.2 : 1.0,
                        clearance: obsClr > 0 ? obsClr : undefined,
                        obstacleHalfWidthMm: typeof obstacleHalfWidthMm === 'number' ? obstacleHalfWidthMm : undefined,
                        obstacleIds: [obstacleId]
                    });
                }
            };

            // If we have precise segment geometry (tracks), rasterize against cell rectangles
            // using a robust segment–rectangle intersection where the rectangle is expanded
            // by the track half-width. This avoids "holes" at coarse grid resolutions.
            const seg = obstacle.segment;
            if (obstacle.type === 'track' && seg) {
                const halfWidth = seg.width / 2;

                // Helpers for geometry
                const pointInRect = (x: number, y: number, minX: number, minY: number, maxX: number, maxY: number) =>
                    x >= minX && x <= maxX && y >= minY && y <= maxY;

                const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
                    const val = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
                    if (Math.abs(val) < 1e-12) return 0;
                    return (val > 0) ? 1 : 2; // 1: cw, 2: ccw
                };
                const onSegment = (ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean =>
                    px <= Math.max(ax, bx) + 1e-12 && px + 1e-12 >= Math.min(ax, bx) &&
                    py <= Math.max(ay, by) + 1e-12 && py + 1e-12 >= Math.min(ay, by);
                const segmentsIntersect = (a1x: number, a1y: number, a2x: number, a2y: number,
                                           b1x: number, b1y: number, b2x: number, b2y: number): boolean => {
                    const o1 = orientation(a1x, a1y, a2x, a2y, b1x, b1y);
                    const o2 = orientation(a1x, a1y, a2x, a2y, b2x, b2y);
                    const o3 = orientation(b1x, b1y, b2x, b2y, a1x, a1y);
                    const o4 = orientation(b1x, b1y, b2x, b2y, a2x, a2y);
                    if (o1 !== o2 && o3 !== o4) return true;
                    if (o1 === 0 && onSegment(a1x, a1y, a2x, a2y, b1x, b1y)) return true;
                    if (o2 === 0 && onSegment(a1x, a1y, a2x, a2y, b2x, b2y)) return true;
                    if (o3 === 0 && onSegment(b1x, b1y, b2x, b2y, a1x, a1y)) return true;
                    if (o4 === 0 && onSegment(b1x, b1y, b2x, b2y, a2x, a2y)) return true;
                    return false;
                };

                const x1 = seg.x1, y1 = seg.y1, x2 = seg.x2, y2 = seg.y2;

                // Iterate grid cells in the bounding box
                for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
                    for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
                        // Cell rectangle (world)
                        const center = this.gridToWorld(gx, gy);
                        const halfCell = this.gridResolution / 2;
                        // Expand rectangle by track half-width to model thick segment footprint
                        const minX = center.x - halfCell - halfWidth;
                        const maxX = center.x + halfCell + halfWidth;
                        const minY = center.y - halfCell - halfWidth;
                        const maxY = center.y + halfCell + halfWidth;

                        // Quick accept: either endpoint inside expanded rect
                        let hit = pointInRect(x1, y1, minX, minY, maxX, maxY) || pointInRect(x2, y2, minX, minY, maxX, maxY);
                        if (!hit) {
                            // Check intersection with expanded rectangle edges
                            const edges = [
                                [minX, minY, maxX, minY],
                                [maxX, minY, maxX, maxY],
                                [maxX, maxY, minX, maxY],
                                [minX, maxY, minX, minY]
                            ] as const;
                            for (const e of edges) {
                                if (segmentsIntersect(x1, y1, x2, y2, e[0], e[1], e[2], e[3])) { hit = true; break; }
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

                // Calculate effective radius for clearance calculations
                // For rectangular pads: use half of the diagonal for conservative clearance
                // For circular pads: use the actual radius
                // For oval pads: use the larger of half-width or half-height
                let padEffectiveRadius: number;
                if (shape === 'circle') {
                    padEffectiveRadius = Math.min(halfW, halfH);
                } else if (shape === 'oval') {
                    padEffectiveRadius = Math.max(halfW, halfH);
                } else {
                    // For rectangular and roundrect pads, use conservative half-diagonal
                    padEffectiveRadius = Math.sqrt(halfW * halfW + halfH * halfH);
                }

                const rotRad = (rotation * Math.PI) / 180; // forward rotation to world
                const cosR = Math.cos(rotRad);
                const sinR = Math.sin(rotRad);
                const toWorld = (lx: number, ly: number) => ({
                    x: c.x + lx * cosR - ly * sinR,
                    y: c.y + lx * sinR + ly * cosR,
                });

                const poly: { x: number; y: number }[] = [];
                const pushWorld = (lx: number, ly: number) => { poly.push(toWorld(lx, ly)); };
                const ARC_STEPS = 12; // resolution for circular/oval approximation

                if (shape === 'rect' || shape === 'roundrect') {
                    // Approximate roundrect as rect (corner radius unavailable)
                    pushWorld(-halfW, -halfH);
                    pushWorld( halfW, -halfH);
                    pushWorld( halfW,  halfH);
                    pushWorld(-halfW,  halfH);
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
                        pushWorld(-inner,  r);
                        pushWorld( inner,  r);
                        // Right semicircle: +90 -> -90 degrees
                        for (let s = 1; s < ARC_STEPS; s++) {
                            const ang = (Math.PI / 2) - (Math.PI * s) / ARC_STEPS;
                            pushWorld(inner + r * Math.cos(ang), r * Math.sin(ang));
                        }
                        // Bottom straight edge
                        pushWorld( inner, -r);
                        pushWorld(-inner, -r);
                        // Left semicircle: -90 -> +90 degrees
                        for (let s = 1; s < ARC_STEPS; s++) {
                            const ang = (-Math.PI / 2) + (Math.PI * s) / ARC_STEPS;
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
                        pushWorld( r, -inner);
                        // Bottom semicircle: 0 -> 180 degrees
                        for (let s = 0; s <= ARC_STEPS; s++) {
                            const ang = (Math.PI * s) / ARC_STEPS;
                            pushWorld(r * Math.cos(ang), -inner + r * Math.sin(ang));
                        }
                        // Left straight side back to top
                        pushWorld(-r,  inner);
                    }
                } else {
                    // Fallback: occupy full bounding box
                    for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
                        for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
                            occupyCell(gx, gy);
                        }
                    }
                }

                if (poly.length > 0) {
                    const pointInPolygon = (x: number, y: number): boolean => {
                        let inside = false;
                        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                            const xi = poly[i].x, yi = poly[i].y;
                            const xj = poly[j].x, yj = poly[j].y;
                            const intersect = ((yi > y) !== (yj > y)) &&
                                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
                            if (intersect) inside = !inside;
                        }
                        return inside;
                    };

                    const onSegment = (ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean => (
                        px <= Math.max(ax, bx) + 1e-12 && px + 1e-12 >= Math.min(ax, bx) &&
                        py <= Math.max(ay, by) + 1e-12 && py + 1e-12 >= Math.min(ay, by)
                    );
                    const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
                        const val = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
                        if (Math.abs(val) < 1e-12) return 0;
                        return (val > 0) ? 1 : 2;
                    };
                    const segmentsIntersect = (a1x: number, a1y: number, a2x: number, a2y: number,
                                               b1x: number, b1y: number, b2x: number, b2y: number): boolean => {
                        const o1 = orientation(a1x, a1y, a2x, a2y, b1x, b1y);
                        const o2 = orientation(a1x, a1y, a2x, a2y, b2x, b2y);
                        const o3 = orientation(b1x, b1y, b2x, b2y, a1x, a1y);
                        const o4 = orientation(b1x, b1y, b2x, b2y, a2x, a2y);
                        if (o1 !== o2 && o3 !== o4) return true;
                        if (o1 === 0 && onSegment(a1x, a1y, a2x, a2y, b1x, b1y)) return true;
                        if (o2 === 0 && onSegment(a1x, a1y, a2x, a2y, b2x, b2y)) return true;
                        if (o3 === 0 && onSegment(b1x, b1y, b2x, b2y, a1x, a1y)) return true;
                        if (o4 === 0 && onSegment(b1x, b1y, b2x, b2y, a2x, a2y)) return true;
                        return false;
                    };

                    const halfCell = this.gridResolution / 2;
                    for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
                        for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
                            const centerCell = this.gridToWorld(gx, gy);
                            const minX = centerCell.x - halfCell;
                            const maxX = centerCell.x + halfCell;
                            const minY = centerCell.y - halfCell;
                            const maxY = centerCell.y + halfCell;

                            let hit = false;
                            // 1) Rect corner inside polygon
                            if (!hit) {
                                const rectCorners = [
                                    { x: minX, y: minY },
                                    { x: maxX, y: minY },
                                    { x: maxX, y: maxY },
                                    { x: minX, y: maxY }
                                ];
                                for (const p of rectCorners) { if (pointInPolygon(p.x, p.y)) { hit = true; break; } }
                            }
                            // 2) Polygon vertex inside rect
                            if (!hit) {
                                const pointInRect = (x: number, y: number) => (
                                    x >= minX - 1e-12 && x <= maxX + 1e-12 && y >= minY - 1e-12 && y <= maxY + 1e-12
                                );
                                for (let i = 0; i < poly.length; i++) { if (pointInRect(poly[i].x, poly[i].y)) { hit = true; break; } }
                            }
                            // 3) Edge intersections
                            if (!hit) {
                                const rectEdges = [
                                    [minX, minY, maxX, minY],
                                    [maxX, minY, maxX, maxY],
                                    [maxX, maxY, minX, maxY],
                                    [minX, maxY, minX, minY]
                                ] as const;
                                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                                    const x1 = poly[j].x, y1 = poly[j].y;
                                    const x2 = poly[i].x, y2 = poly[i].y;
                                    for (const e of rectEdges) {
                                        if (segmentsIntersect(x1, y1, x2, y2, e[0], e[1], e[2], e[3])) { hit = true; break; }
                                    }
                                    if (hit) break;
                                }
                            }

                            if (hit) occupyCell(gx, gy, padEffectiveRadius);
                        }
                    }

                    // Update max obstacle tracking for pad clearance calculations
                    this.maxObstacleHalfWidthMm = Math.max(this.maxObstacleHalfWidthMm, padEffectiveRadius);
                }
            } else if (obstacle.polygon && obstacle.polygon.points && obstacle.polygon.points.length >= 3) {
                // Precise rasterization for polygon obstacles (zones, keepouts):
                // mark a grid cell occupied if the polygon and the cell rectangle intersect in any way.
                const pts = obstacle.polygon.points;

                // Point in polygon (ray casting)
                const pointInPolygon = (x: number, y: number): boolean => {
                    let inside = false;
                    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                        const xi = pts[i].x, yi = pts[i].y;
                        const xj = pts[j].x, yj = pts[j].y;
                        // Check if edge crosses the horizontal ray at y and to the right of x
                        const intersect = ((yi > y) !== (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                };

                // Segment intersection helpers
                const onSegment = (ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean => {
                    return px <= Math.max(ax, bx) + 1e-12 && px + 1e-12 >= Math.min(ax, bx) &&
                           py <= Math.max(ay, by) + 1e-12 && py + 1e-12 >= Math.min(ay, by);
                };
                const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
                    const val = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
                    if (Math.abs(val) < 1e-12) return 0;
                    return (val > 0) ? 1 : 2; // 1: clockwise, 2: counterclockwise
                };
                const segmentsIntersect = (a1x: number, a1y: number, a2x: number, a2y: number,
                                           b1x: number, b1y: number, b2x: number, b2y: number): boolean => {
                    const o1 = orientation(a1x, a1y, a2x, a2y, b1x, b1y);
                    const o2 = orientation(a1x, a1y, a2x, a2y, b2x, b2y);
                    const o3 = orientation(b1x, b1y, b2x, b2y, a1x, a1y);
                    const o4 = orientation(b1x, b1y, b2x, b2y, a2x, a2y);

                    if (o1 !== o2 && o3 !== o4) return true;

                    // Colinear special cases
                    if (o1 === 0 && onSegment(a1x, a1y, a2x, a2y, b1x, b1y)) return true;
                    if (o2 === 0 && onSegment(a1x, a1y, a2x, a2y, b2x, b2y)) return true;
                    if (o3 === 0 && onSegment(b1x, b1y, b2x, b2y, a1x, a1y)) return true;
                    if (o4 === 0 && onSegment(b1x, b1y, b2x, b2y, a2x, a2y)) return true;
                    return false;
                };

                const halfCell = this.gridResolution / 2;

                for (let gx = gridBounds.minX; gx <= gridBounds.maxX; gx++) {
                    for (let gy = gridBounds.minY; gy <= gridBounds.maxY; gy++) {
                        const center = this.gridToWorld(gx, gy);
                        const minX = center.x - halfCell;
                        const maxX = center.x + halfCell;
                        const minY = center.y - halfCell;
                        const maxY = center.y + halfCell;

                        // Quick reject with AABB overlap against polygon's bounding box
                        // Compute polygon bounds lazily per cell might be expensive; rely on gridBounds coarse filter instead

                        // 1) Any rect corner inside polygon?
                        const rectCorners = [
                            { x: minX, y: minY },
                            { x: maxX, y: minY },
                            { x: maxX, y: maxY },
                            { x: minX, y: maxY }
                        ];
                        let hit = false;
                        for (const p of rectCorners) {
                            if (pointInPolygon(p.x, p.y)) { hit = true; break; }
                        }

                        // 2) Any polygon vertex inside the rect?
                        const pointInRect = (x: number, y: number): boolean => (
                            x >= minX - 1e-12 && x <= maxX + 1e-12 && y >= minY - 1e-12 && y <= maxY + 1e-12
                        );
                        if (!hit) {
                            for (let i = 0; i < pts.length; i++) {
                                if (pointInRect(pts[i].x, pts[i].y)) { hit = true; break; }
                            }
                        }

                        // 3) Any polygon edge intersect any rect edge?
                        if (!hit) {
                            const rectEdges = [
                                [minX, minY, maxX, minY],
                                [maxX, minY, maxX, maxY],
                                [maxX, maxY, minX, maxY],
                                [minX, maxY, minX, minY]
                            ] as const;
                            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                                const x1 = pts[j].x, y1 = pts[j].y;
                                const x2 = pts[i].x, y2 = pts[i].y;
                                for (const e of rectEdges) {
                                    if (segmentsIntersect(x1, y1, x2, y2, e[0], e[1], e[2], e[3])) { hit = true; break; }
                                }
                                if (hit) break;
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
        const key = this.getCellKey(layer, x, y);
        const cell = this.cells.get(key);
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

                const cell = this.cells.get(this.getCellKey(layer, nx, ny));
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
    isOccupied(x: number, y: number, layer: string, clearance: number = 0, net?: string, considerObstacleClearance: boolean = false, sumObstacleClearance: boolean = false): boolean {
        // Check if coordinates are within bounds
        if (!this.isInBounds(x, y)) {
            return true; // Out of bounds = occupied
        }

        // Fast path: no clearance and not considering obstacle clearance => exact cell only
        if (clearance <= 0 && !considerObstacleClearance) {
            return this.isCellOccupied(x, y, layer, net);
        }

        // Determine search radius in cells. If considering obstacle clearance, use the
        // maximum of the trace clearance and any obstacle's required clearance; otherwise, use trace clearance only.
        const searchClearanceMm = (considerObstacleClearance
            ? (sumObstacleClearance
                ? (clearance + this.maxObstacleClearance + this.maxObstacleHalfWidthMm)
                : Math.max(clearance, this.maxObstacleClearance))
            : clearance);
        const searchRadiusCells = Math.ceil(searchClearanceMm / this.gridResolution);

        for (let dx = -searchRadiusCells; dx <= searchRadiusCells; dx++) {
            for (let dy = -searchRadiusCells; dy <= searchRadiusCells; dy++) {
                const nx = x + dx;
                const ny = y + dy;
                if (!this.isInBounds(nx, ny)) continue;

                const key = this.getCellKey(layer, nx, ny);
                const cell = this.cells.get(key);
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
                const baseClearance = sumObstacleClearance ? (clearance + obstacleClr) : Math.max(clearance, obstacleClr);
                const requiredClearanceMm = baseClearance + obstacleHalfWidthMm;

                // Convert grid cell distance to actual mm distance between cell centers
                const distanceMm = Math.sqrt(dx * dx + dy * dy) * this.gridResolution;

                // Edge-to-edge clearance: distance between centerlines minus obstacle half width
                const edgeToEdgeDistance = Math.max(0, distanceMm - obstacleHalfWidthMm);

                // Absolute blocks always block within required clearance
                if (cell.absoluteBlock && edgeToEdgeDistance <= requiredClearanceMm) {
                    return true;
                }

                // Manual routes: block different nets; allow same net
                if (cell.isManualRoute) {
                    if (!(net && cell.net && cell.net === net)) {
                        if (edgeToEdgeDistance <= requiredClearanceMm) return true;
                    }
                    continue;
                }

                // General occupied cell: blocks different nets within required clearance
                if (edgeToEdgeDistance <= requiredClearanceMm) {
                    return true;
                }
            }
        }

        return false;
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
    public checkTrackObstaclePrecise(worldX: number, worldY: number, layer: string, clearance: number, net?: string): boolean {
        // Find all track obstacles on this layer
        for (const [key, cell] of this.cells) {
            if (!cell.occupied || !key.startsWith(`${layer}:`)) {
                continue;
            }

            // Skip same-net tracks (unless manual route)
            if (net && cell.net && cell.net === net && !cell.isManualRoute && !cell.absoluteBlock) {
                continue;
            }

            // Check if this cell represents a track obstacle with segment data
            if (cell.obstacleHalfWidthMm !== undefined && cell.obstacleIds) {
                // Check all obstacles occupying this cell
                for (const obstacleId of cell.obstacleIds) {
                    const obstacle = this.getCellObstacle(obstacleId);
                    if (obstacle?.segment) {
                        const segment = obstacle.segment;
                        const trackHalfWidth = segment.width / 2;

                        // Calculate precise point-to-segment distance
                        const distanceToTrackCenterline = pointToSegmentDistance(
                            worldX, worldY,
                            segment.x1, segment.y1,
                            segment.x2, segment.y2
                        );

                        // Calculate required clearance: track half-width + obstacle clearance + requested clearance
                        const obstacleClearance = obstacle.clearance || 0;
                        const requiredClearance = trackHalfWidth + obstacleClearance + clearance;

                        if (distanceToTrackCenterline <= requiredClearance) {
                            return true; // Conflict detected
                        }
                    }
                }
            }
        }

        return false; // No conflicts
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
        const key = this.getCellKey(layer, x, y);
        const cell = this.cells.get(key);

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
        const key = this.getCellKey(layer, x, y);
        const cell = this.cells.get(key);
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
        const key = this.getCellKey(layer, x, y);
        let cell = this.cells.get(key);

        if (!cell) {
            cell = {
                x,
                y,
                layer,
                occupied: false,
                cost
            };
            this.cells.set(key, cell);
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
            y: Math.floor((worldY - this.bounds.minY) / this.gridResolution)
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
            y: this.bounds.minY + (gridY + 0.5) * this.gridResolution
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
    private getCellKey(layer: string, x: number, y: number): string {
        return `${layer}:${x}:${y}`;
    }

    /**
     * Get a cell by coordinates, if present.
     */
    getCell(x: number, y: number, layer: string): IGridCell | undefined {
        const key = this.getCellKey(layer, x, y);
        return this.cells.get(key);
    }

    /**
     * Convert world bounds to grid bounds.
     * @private
     */
    private worldBoundsToGridBounds(
        worldMinX: number,
        worldMaxX: number,
        worldMinY: number,
        worldMaxY: number
    ): { minX: number; maxX: number; minY: number; maxY: number } {
        const topLeft = this.worldToGrid(worldMinX, worldMinY);
        const bottomRight = this.worldToGrid(worldMaxX, worldMaxY);

        return {
            minX: Math.max(0, topLeft.x),
            maxX: Math.min(this.gridWidth - 1, bottomRight.x),
            minY: Math.max(0, topLeft.y),
            maxY: Math.min(this.gridHeight - 1, bottomRight.y)
        };
    }

    /**
     * Get grid dimensions.
     */
    getDimensions(): { width: number; height: number; layers: number } {
        return {
            width: this.gridWidth,
            height: this.gridHeight,
            layers: this.layers.length
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

    /**
     * Clear all obstacles from the grid.
     * Useful for rebuilding the grid with different obstacles.
     */
    clear(): void {
        this.cells.clear();
        this.maxObstacleClearance = 0;
        this.maxObstacleHalfWidthMm = 0;
        if (this.debug) {
            loggerDebug && loggerDebug(chalk.blue(`[RoutingGrid] Cleared all cells`));
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
        const occupiedCells = Array.from(this.cells.values()).filter(c => c.occupied).length;
        const freeCells = totalCells - occupiedCells;

        return {
            totalCells,
            occupiedCells,
            freeCells,
            occupancyPercent: (occupiedCells / totalCells) * 100
        };
    }
}

