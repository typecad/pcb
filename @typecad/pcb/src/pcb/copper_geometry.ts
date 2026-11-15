/**
 * Millimeter-space copper geometry primitives.
 *
 * Shared by the autorouter's post-route validation and the CLI board-model
 * connectivity analysis so both answer geometry questions from one
 * implementation (the DRC engine keeps its own nanometer s-expression world,
 * which is already exact and heavily pinned by tests).
 *
 * All distances are in mm; all shapes are convex (rectangles may be rotated,
 * pads may be circles) so segment-to-shape distance is a closed-form
 * transform plus clamped point distance.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Squared distance from point p to segment ab. */
export function pointSegDistSq(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = p.x - (a.x + t * dx);
  const ey = p.y - (a.y + t * dy);
  return ex * ex + ey * ey;
}

/** Distance from point p to segment ab (mm). */
export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  return Math.sqrt(pointSegDistSq(p, a, b));
}

/** Do segments a and b share a point (proper crossing or touching)? */
export function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return false; // parallel (collinear handled by distance)
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Minimum distance between two segments (mm; 0 when they cross). */
export function segmentSegDist(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegDist(a1, b1, b2),
    pointSegDist(a2, b1, b2),
    pointSegDist(b1, a1, a2),
    pointSegDist(b2, a1, a2),
  );
}

/** Minimum distance from point p to an axis-aligned rectangle (0 inside). */
export function pointRectDist(p: Pt, minX: number, minY: number, maxX: number, maxY: number): number {
  const dx = Math.max(minX - p.x, 0, p.x - maxX);
  const dy = Math.max(minY - p.y, 0, p.y - maxY);
  return Math.hypot(dx, dy);
}

/** Minimum distance from segment ab to an axis-aligned rectangle (mm; 0 on overlap).
 *  Rectangles are closed: a segment ending exactly on the edge has distance 0.
 *  Exact for the corner case — a segment passing near a corner realizes its
 *  closest approach mid-segment, not at an endpoint, so the distance is
 *  measured against the rect's four edges. */
export function segmentRectDist(a: Pt, b: Pt, minX: number, minY: number, maxX: number, maxY: number): number {
  const aIn = a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY;
  const bIn = b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY;
  if (aIn || bIn) return 0;
  const corners: Pt[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  let best = Infinity;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const d = segmentSegDist(a, b, corners[j]!, corners[i]!);
    if (d === 0) return 0;
    if (d < best) best = d;
  }
  return best;
}

/** Rotate a point by -theta (into the rectangle's local frame). */
function toLocal(p: Pt, center: Pt, thetaRad: number): Pt {
  const cos = Math.cos(-thetaRad);
  const sin = Math.sin(-thetaRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Minimum distance from a segment to a (possibly rotated) rectangle (mm; 0 on overlap). */
export function segmentOrientedRectDist(
  a: Pt,
  b: Pt,
  center: Pt,
  width: number,
  height: number,
  rotationDeg: number,
): number {
  const theta = (rotationDeg * Math.PI) / 180;
  // Rotation preserves distance, so measure in the rect's local axis-aligned frame.
  const la = toLocal(a, center, theta);
  const lb = toLocal(b, center, theta);
  const hw = width / 2;
  const hh = height / 2;
  return segmentRectDist(la, lb, center.x - hw, center.y - hh, center.x + hw, center.y + hh);
}

/** Minimum distance from a segment to a circle (mm; 0 on overlap). */
export function segmentCircleDist(a: Pt, b: Pt, center: Pt, radius: number): number {
  return Math.max(0, pointSegDist(center, a, b) - radius);
}

/** A copper shape a route must keep clear of: an oriented pad rectangle or a
 *  circle, carrying the layer/net identity needed to decide applicability. */
export interface CopperShape {
  /** 'rect' | 'circle' geometry kind (ovals are approximated by their rect) */
  kind: 'rect' | 'circle';
  center: Pt;
  width: number;
  height: number;
  rotationDeg: number;
  radius: number;
  layers: string[];
  net?: string;
  /** human label for messages, e.g. "U2.2 [DQ]" */
  label: string;
  /** clearance required from this shape (mm) */
  clearance: number;
}

/** Edge-to-edge distance from a centerline segment (half-width included) to a copper shape. */
export function segmentShapeGap(a: Pt, b: Pt, halfWidth: number, shape: CopperShape): number {
  const d =
    shape.kind === 'circle'
      ? segmentCircleDist(a, b, shape.center, shape.radius)
      : segmentOrientedRectDist(a, b, shape.center, shape.width, shape.height, shape.rotationDeg);
  return Math.max(0, d - halfWidth);
}

/** Layers shared between a route segment's layer and a shape (empty = no interaction). */
export function shapeOnLayer(shape: CopperShape, layer: string): boolean {
  return shape.layers.length === 0 || shape.layers.includes(layer) || shape.layers.includes('*.Cu');
}
