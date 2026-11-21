/**
 * The routable board region, derived from Edge.Cuts geometry: the largest
 * closed contour is the board, every other closed contour is a cutout.
 * The router uses it to keep copper inside the board and clear of every
 * edge by the copper-to-edge rule (KiCad `copper_edge_clearance`).
 */
import type { OutlineElement } from '../../pcb/pcb_interfaces.js';

export interface IPoint2 {
  x: number;
  y: number;
}

export interface IBoardRegion {
  /** Board contour, as a closed polygon (arcs/circles flattened). */
  outer: IPoint2[];
  /** Internal cutouts (milled slots, holes on Edge.Cuts). */
  holes: IPoint2[][];
}

/** Max chord length used when flattening arcs and circles, mm. */
const ARC_STEP_MM = 0.25;

/** Points along a three-point arc from `a` through `m` to `b`. */
export function flattenArc(a: IPoint2, m: IPoint2, b: IPoint2, maxStep = ARC_STEP_MM): IPoint2[] {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-12) return [a, b];
  const sq = (p: IPoint2) => p.x * p.x + p.y * p.y;
  const cx = (sq(a) * (m.y - b.y) + sq(m) * (b.y - a.y) + sq(b) * (a.y - m.y)) / d;
  const cy = (sq(a) * (b.x - m.x) + sq(m) * (a.x - b.x) + sq(b) * (m.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  const ang = (p: IPoint2) => Math.atan2(p.y - cy, p.x - cx);
  const twoPi = 2 * Math.PI;
  const norm = (t: number) => ((t % twoPi) + twoPi) % twoPi;
  const a0 = ang(a);
  const toEnd = norm(ang(b) - a0);
  const toMid = norm(ang(m) - a0);
  // sweep the way that passes through the mid point
  const sweep = toMid <= toEnd ? toEnd : toEnd - twoPi;
  const n = Math.max(2, Math.ceil((Math.abs(sweep) * r) / maxStep));
  const pts: IPoint2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  pts[0] = a;
  pts[n] = b;
  return pts;
}

function circlePolygon(c: IPoint2, r: number): IPoint2[] {
  const n = Math.max(16, Math.ceil((2 * Math.PI * r) / ARC_STEP_MM));
  return Array.from({ length: n }, (_, i) => ({
    x: c.x + r * Math.cos((i / n) * 2 * Math.PI),
    y: c.y + r * Math.sin((i / n) * 2 * Math.PI),
  }));
}

export function polygonArea(p: IPoint2[]): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j]!.x * p[i]!.y - p[i]!.x * p[j]!.y;
  return Math.abs(s) / 2;
}

/**
 * Build the board region from Edge.Cuts elements. Line/arc elements are
 * chained end-to-end into closed loops (endpoints matched to 1µm); rect,
 * poly and circle elements are closed on their own. Returns null when no
 * closed contour can be formed — the caller then routes without an edge
 * constraint, exactly as before.
 */
export function boardRegionFromElements(elements: readonly OutlineElement[]): IBoardRegion | null {
  const loops: IPoint2[][] = [];
  const open: IPoint2[][] = [];

  for (const el of elements) {
    if (el.layer !== 'Edge.Cuts') continue;
    switch (el.type) {
      case 'rect': {
        const x0 = Math.min(el.start.x, el.end.x);
        const x1 = Math.max(el.start.x, el.end.x);
        const y0 = Math.min(el.start.y, el.end.y);
        const y1 = Math.max(el.start.y, el.end.y);
        loops.push([
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ]);
        break;
      }
      case 'poly':
        if (el.points.length >= 3) loops.push(el.points.map((p) => ({ x: p.x, y: p.y })));
        break;
      case 'circle':
        loops.push(circlePolygon(el.center, Math.hypot(el.end.x - el.center.x, el.end.y - el.center.y)));
        break;
      case 'line':
        open.push([el.start, el.end]);
        break;
      case 'arc':
        open.push(flattenArc(el.start, el.mid, el.end));
        break;
    }
  }

  // chain open polylines into closed loops
  const key = (p: IPoint2) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const used = new Set<number>();
  for (let s = 0; s < open.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    const loop = [...open[s]!];
    let closed = false;
    for (;;) {
      const tail = key(loop[loop.length - 1]!);
      if (loop.length > 2 && tail === key(loop[0]!)) {
        closed = true;
        break;
      }
      const i = open.findIndex((seg, idx) => !used.has(idx) && (key(seg[0]!) === tail || key(seg[seg.length - 1]!) === tail));
      if (i < 0) break;
      used.add(i);
      const seg = key(open[i]![0]!) === tail ? open[i]! : [...open[i]!].reverse();
      loop.push(...seg.slice(1));
    }
    if (closed) {
      loop.pop(); // last point repeats the first
      loops.push(loop);
    }
  }

  if (loops.length === 0) return null;
  loops.sort((a, b) => polygonArea(b) - polygonArea(a));
  return { outer: loops[0]!, holes: loops.slice(1) };
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(x: number, y: number, poly: readonly IPoint2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** True when (x, y) is on the board: inside the outer contour and outside every cutout. */
export function pointOnBoard(x: number, y: number, region: IBoardRegion): boolean {
  return pointInPolygon(x, y, region.outer) && !region.holes.some((h) => pointInPolygon(x, y, h));
}

/** Axis-aligned bounds of the board contour. */
export function boardRegionBounds(region: IBoardRegion): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of region.outer) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}
