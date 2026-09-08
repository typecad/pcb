/**
 * Arbitrary board outline (Edge.Cuts) shape builders.
 *
 * The existing `pcb.outline()` produces a filleted rectangle. These builders
 * produce arbitrary shapes — polygons, circles, cutouts, and free-form
 * line/arc paths — all staged as `IOutline` groups on `Edge.Cuts`, rendered by
 * `renderOutlinesAndTracks` as native KiCad `gr_*` primitives.
 */

import type { PcbInternalState } from './pcb_state.js';
import type { IOutline, OutlineElement, IGrLine, IGrArc, IGrCircle, IGrPoly } from './pcb_interfaces.js';
import { generateUuid } from './pcb_utils.js';

/** Standard board-edge stroke width in mm (matches `pcbOutline`). */
const EDGE_STROKE_WIDTH = 0.05;
/** KiCad layer for board outlines and cutouts. */
const EDGE_LAYER = 'Edge.Cuts';

/** A 2D point in mm. */
export interface IPoint {
  x: number;
  y: number;
}

/**
 * Validate a polygon's points: at least 3 distinct points required.
 * @throws {RangeError} if fewer than 3 points.
 */
function validatePolygonPoints(points: IPoint[]): void {
  if (!Array.isArray(points) || points.length < 3) {
    throw new RangeError(`polygon requires at least 3 points, got ${points?.length ?? 0}`);
  }
}

/**
 * Build an `IOutline` group from a set of elements. The nominal rect fields
 * are left at 0 — only `elements` is consumed by the renderer and bounds.
 */
function stageOutline(state: PcbInternalState, elements: OutlineElement[]): void {
  const outlineData: IOutline = {
    uuid: generateUuid(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    filletRadius: 0,
    elements,
  };
  state.stagedOutlines.push(outlineData);
}

/**
 * Stage a polygon outline (or cutout) on Edge.Cuts as a single `gr_poly`.
 *
 * The polygon is emitted as-is; KiCad treats it as a closed contour. If the
 * first and last points differ, KiCad still closes it implicitly.
 *
 * @param state - PCB internal state.
 * @param points - Polygon vertices in mm (≥3).
 */
export function pcbOutlinePolygon(state: PcbInternalState, points: IPoint[]): void {
  validatePolygonPoints(points);
  const element: IGrPoly = {
    type: 'poly',
    uuid: generateUuid(),
    layer: EDGE_LAYER,
    strokeWidth: EDGE_STROKE_WIDTH,
    points: points.map((p) => ({ x: p.x, y: p.y })),
    fill: false,
  };
  stageOutline(state, [element]);
}

/**
 * Stage a circular outline (or cutout) on Edge.Cuts as a `gr_circle`.
 *
 * @param state - PCB internal state.
 * @param cx - Center X in mm.
 * @param cy - Center Y in mm.
 * @param radius - Radius in mm (must be positive).
 */
export function pcbOutlineCircle(state: PcbInternalState, cx: number, cy: number, radius: number): void {
  if (!(radius > 0)) {
    throw new RangeError(`circle radius must be positive, got ${radius}`);
  }
  const element: IGrCircle = {
    type: 'circle',
    uuid: generateUuid(),
    layer: EDGE_LAYER,
    strokeWidth: EDGE_STROKE_WIDTH,
    center: { x: cx, y: cy },
    end: { x: cx + radius, y: cy },
    fill: false,
  };
  stageOutline(state, [element]);
}

/** Alias for cutout polygons — same mechanism, separate name for API clarity. */
export function pcbCutout(state: PcbInternalState, points: IPoint[]): void {
  pcbOutlinePolygon(state, points);
}

/** Alias for circular cutouts (e.g. mounting holes). */
export function pcbCutoutCircle(state: PcbInternalState, cx: number, cy: number, radius: number): void {
  pcbOutlineCircle(state, cx, cy, radius);
}

/**
 * Builder for an arbitrary outline path of line and arc segments on Edge.Cuts.
 * Accumulate segments with {@link OutlinePathBuilder.lineTo} and
 * {@link OutlinePathBuilder.arcTo}, then call {@link OutlinePathBuilder.close}
 * to stage the outline.
 */
export class OutlinePathBuilder {
  private readonly state: PcbInternalState;
  private readonly elements: OutlineElement[] = [];
  private current: IPoint;
  private readonly start: IPoint;
  private closed = false;

  constructor(state: PcbInternalState, startX: number, startY: number) {
    this.state = state;
    this.current = { x: startX, y: startY };
    this.start = { x: startX, y: startY };
  }

  /**
   * Draw a straight line to `(x, y)`.
   * @returns this builder for chaining.
   */
  lineTo(x: number, y: number): this {
    this.assertNotClosed();
    const end = { x, y };
    const el: IGrLine = {
      type: 'line',
      uuid: generateUuid(),
      layer: EDGE_LAYER,
      strokeWidth: EDGE_STROKE_WIDTH,
      start: { x: this.current.x, y: this.current.y },
      end,
      locked: false,
    };
    this.elements.push(el);
    this.current = end;
    return this;
  }

  /**
   * Draw an arc to `(endX, endY)` passing through `mid`.
   * KiCad arcs use the three-point form (start, point-on-arc, end).
   * @param endX - End X in mm.
   * @param endY - End Y in mm.
   * @param mid - A point on the arc defining its curvature.
   * @returns this builder for chaining.
   */
  arcTo(endX: number, endY: number, mid: IPoint): this {
    this.assertNotClosed();
    const end = { x: endX, y: endY };
    const el: IGrArc = {
      type: 'arc',
      uuid: generateUuid(),
      layer: EDGE_LAYER,
      strokeWidth: EDGE_STROKE_WIDTH,
      start: { x: this.current.x, y: this.current.y },
      mid: { x: mid.x, y: mid.y },
      end,
    };
    this.elements.push(el);
    this.current = end;
    return this;
  }

  /**
   * Close the path back to the start point (if not already there) and stage
   * the outline. After this the builder is sealed.
   */
  close(): void {
    if (this.closed) return;
    // Auto-close with a line if the current point isn't the start.
    if (this.current.x !== this.start.x || this.current.y !== this.start.y) {
      this.lineTo(this.start.x, this.start.y);
    }
    this.closed = true;
    if (this.elements.length > 0) {
      stageOutline(this.state, this.elements);
    }
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('cannot modify an outline path after close()');
    }
  }
}

/**
 * Start building an arbitrary outline path on Edge.Cuts starting at `(x, y)`.
 */
export function pcbOutlinePath(state: PcbInternalState, x: number, y: number): OutlinePathBuilder {
  return new OutlinePathBuilder(state, x, y);
}
