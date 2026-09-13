/**
 * Board outline reconstruction: chain the Edge.Cuts layer's geometry into
 * closed contours. KiCad plots the outline either as thin traces (one op per
 * edge, sometimes arcs) or as filled regions; both are handled. A closed loop
 * is required for the PCBA substrate fill/clip — when stitching fails, the
 * caller falls back to a bounding-box rectangle.
 */
import { evaluateAperture } from '../gerber/apertures.js';
import { dist, signedSweep } from '../gerber/geometry.js';
import type { GerberImage, PathSegment, Point } from '../gerber/types.js';
import type { Bounds, RenderLayer } from './svg.js';

export interface OutlineContour {
  start: Point;
  segments: PathSegment[];
}

export interface BoardOutline {
  contours: OutlineContour[];
  /** stroke weight for the outline, from the median edge trace width */
  strokeWidth: number;
  warnings: string[];
}

interface ChainEdge {
  from: Point;
  to: Point;
  seg: PathSegment;
  used: boolean;
}

/**
 * Endpoint index with tolerance-based lookup (cell size = tolerance). Cells
 * hold EVERY node in them, not just the last: a node >tol away sharing a
 * cell with an earlier one must not shadow it, or a later endpoint identical
 * to the shadowed node would get a fresh id and the chain would never close.
 */
class NodeIndex {
  private cells = new Map<string, number[]>();
  private nodes: Point[] = [];

  constructor(private tol: number) {}

  find(p: Point): number {
    const ix = Math.round(p.x / this.tol);
    const iy = Math.round(p.y / this.tol);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const idx of this.cells.get(`${ix + dx},${iy + dy}`) ?? []) {
          if (dist(this.nodes[idx]!, p) <= this.tol) return idx;
        }
      }
    }
    this.nodes.push(p);
    const key = `${ix},${iy}`;
    const list = this.cells.get(key) ?? [];
    list.push(this.nodes.length - 1);
    this.cells.set(key, list);
    return this.nodes.length - 1;
  }

  point(id: number): Point {
    return this.nodes[id]!;
  }
}

function reverseSegment(seg: PathSegment, newTo: Point): PathSegment {
  if (seg.kind === 'line') return { kind: 'line', to: newTo };
  return { kind: 'arc', to: newTo, center: seg.center, ccw: !seg.ccw };
}

/** A rectangle contour — the fallback when no edge layer / stitching fails. */
export function rectangleContour(bounds: Bounds): OutlineContour {
  return {
    start: { x: bounds.minX, y: bounds.minY },
    segments: [
      { kind: 'line', to: { x: bounds.maxX, y: bounds.minY } },
      { kind: 'line', to: { x: bounds.maxX, y: bounds.maxY } },
      { kind: 'line', to: { x: bounds.minX, y: bounds.maxY } },
      { kind: 'line', to: { x: bounds.minX, y: bounds.minY } },
    ],
  };
}

/** Flatten a contour into a polygon (arcs sampled), dropping the closing point. */
export function contourPoints(contour: OutlineContour, arcSamples = 8): Point[] {
  const pts: Point[] = [contour.start];
  let prev = contour.start;
  for (const seg of contour.segments) {
    if (seg.kind === 'line') {
      pts.push(seg.to);
    } else {
      const r = dist(prev, seg.center);
      const sweep = signedSweep(prev, seg.to, seg.center, seg.ccw);
      const a0 = Math.atan2(prev.y - seg.center.y, prev.x - seg.center.x);
      for (let i = 1; i <= arcSamples; i++) {
        const a = a0 + (sweep * i) / arcSamples;
        pts.push({ x: seg.center.x + r * Math.cos(a), y: seg.center.y + r * Math.sin(a) });
      }
    }
    prev = seg.to;
  }
  if (pts.length > 1 && dist(pts[0]!, pts[pts.length - 1]!) < 1e-9) pts.pop();
  return pts;
}

/**
 * Stitch the edge layer into closed contours. `fallback` bounds produce a
 * rectangle when there is no edge layer; returns null only when neither is
 * available.
 */
export function stitchBoardOutline(
  edge: RenderLayer | null,
  fallback: Bounds | null,
  units: 'mm' | 'in',
): BoardOutline | null {
  const warnings: string[] = [];
  if (!edge) {
    if (!fallback) return null;
    warnings.push('no edge/outline layer found — using the board bounding box as the outline');
    return { contours: [rectangleContour(fallback)], strokeWidth: defaultWidth(units), warnings };
  }

  const tol = units === 'mm' ? 0.01 : 0.0004;
  const img = edge.image as GerberImage;
  const contours: OutlineContour[] = [];
  const chainEdges: ChainEdge[] = [];
  const widths: number[] = [];

  const apertureWidth = new Map<number, number>();
  const widthOf = (code: number): number => {
    if (!apertureWidth.has(code)) {
      const def = img.apertures.get(code);
      if (!def) {
        apertureWidth.set(code, 0);
      } else {
        const ap = evaluateAperture(def, img.macros);
        const t = ap.template;
        const w = t
          ? t.kind === 'circle'
            ? t.diameter
            : t.kind === 'polygon'
              ? t.outerDiameter
              : Math.min(t.width, t.height)
          : 2 * Math.min(ap.extent.rx, ap.extent.ry);
        apertureWidth.set(code, w);
      }
    }
    return apertureWidth.get(code)!;
  };

  // region contours may end a hair short of their start; accept that gap
  // when deciding whether the closing edge is implicit. The allowance is
  // 0.05mm — unit-scaled, not a bare constant (0.05 file units would be
  // 1.27mm on an inch board, 125x the stitch tolerance)
  const closeTol = Math.max(tol, units === 'mm' ? 0.05 : 0.05 / 25.4);
  for (const op of img.ops) {
    if (op.type === 'trace') {
      widths.push(widthOf(op.aperture));
      let prev = op.from;
      for (const seg of op.segments) {
        if (dist(prev, seg.to) > tol) chainEdges.push({ from: prev, to: seg.to, seg, used: false });
        prev = seg.to;
      }
    } else if (op.type === 'region') {
      for (const contour of op.contours) {
        const last = contour.segments[contour.segments.length - 1];
        const closed = last ? dist(last.to, contour.start) <= closeTol : false;
        if (closed) {
          contours.push(contour);
        } else if (contour.segments.length >= 2) {
          // regions are filled areas — the closing edge back to the start is
          // implicit in gerber, so add it rather than chaining
          contours.push({
            start: contour.start,
            segments: [...contour.segments, { kind: 'line', to: contour.start }],
          });
        }
      }
    }
    // flashes on the edge layer are drill/mark dots, not outline geometry
  }

  // adjacency: node id -> incident edge indices (endpoints resolved once)
  const index = new NodeIndex(tol);
  const edgeA = chainEdges.map((e) => index.find(e.from));
  const edgeB = chainEdges.map((e) => index.find(e.to));
  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < chainEdges.length; i++) {
    if (edgeA[i] === edgeB[i]) continue; // degenerate (already length-filtered, belt and braces)
    if (!adjacency.has(edgeA[i]!)) adjacency.set(edgeA[i]!, []);
    if (!adjacency.has(edgeB[i]!)) adjacency.set(edgeB[i]!, []);
    adjacency.get(edgeA[i]!)!.push(i);
    adjacency.get(edgeB[i]!)!.push(i);
  }

  let discarded = 0;
  const closedEdges = new Set<number>();
  for (let seed = 0; seed < chainEdges.length; seed++) {
    if (chainEdges[seed]!.used) continue;
    const closed = closeChain(seed);
    if (closed) {
      contours.push({ start: chainEdges[seed]!.from, segments: closed.segments });
      for (const idx of closed.edges) closedEdges.add(idx);
    } else {
      chainEdges[seed]!.used = true;
    }
  }
  discarded = chainEdges.length - closedEdges.size;

  /**
   * Walk edges from `seed` (in a→b direction) back to its start node,
   * preferring the smallest turn at junctions (the outer boundary keeps
   * going straight past tee connections, e.g. terminal-block divider
   * lines) and backtracking on dead ends. Returns the closed segment
   * path plus the edges it consumed — or null, leaving only the seed
   * marked used.
   */
  function closeChain(seed: number): { segments: PathSegment[]; edges: number[] } | null {
    const first = chainEdges[seed]!;
    first.used = true;
    const walked = new Set<number>([seed]);
    const startNode = edgeA[seed]!;
    let steps = 0;
    const dirOf = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x);
    const turnCost = (node: number, idx: number, incoming: number): number => {
      const e = chainEdges[idx]!;
      const from = edgeA[idx] === node ? e.from : e.to;
      const to = edgeA[idx] === node ? e.to : e.from;
      let d = dirOf(from, to) - incoming;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d);
    };
    const dfs = (node: number, incoming: number): PathSegment[] | null => {
      if (node === startNode) return [];
      if (++steps > 10000) return null;
      const candidates = (adjacency.get(node) ?? []).filter((i) => !chainEdges[i]!.used);
      candidates.sort((i, j) => turnCost(node, i!, incoming) - turnCost(node, j!, incoming));
      for (const idx of candidates) {
        chainEdges[idx]!.used = true;
        walked.add(idx);
        const forward = edgeA[idx] === node;
        const edge = chainEdges[idx]!;
        const seg = forward ? edge.seg : reverseSegment(edge.seg, edge.from);
        const rest = dfs(
          forward ? edgeB[idx]! : edgeA[idx]!,
          dirOf(forward ? edge.from : edge.to, forward ? edge.to : edge.from),
        );
        if (rest) return [seg, ...rest];
        chainEdges[idx]!.used = false;
        walked.delete(idx);
      }
      return null;
    };
    const rest = dfs(edgeB[seed]!, dirOf(first.from, first.to));
    if (rest) return { segments: [first.seg, ...rest], edges: [...walked] };
    for (const idx of walked) chainEdges[idx]!.used = idx === seed;
    return null;
  }

  if (discarded > 0) {
    warnings.push(`board outline has ${discarded} open segment(s) that could not be closed; ignored`);
  }
  if (contours.length === 0) {
    if (!fallback) {
      warnings.push('edge layer has no closed outline');
      return { contours: [], strokeWidth: defaultWidth(units), warnings };
    }
    warnings.push('edge layer could not be stitched into a closed outline — using the board bounding box');
    return { contours: [rectangleContour(fallback)], strokeWidth: defaultWidth(units), warnings };
  }

  widths.sort((a, b) => a - b);
  const median = widths.length > 0 ? widths[Math.floor(widths.length / 2)]! : 0;
  return { contours, strokeWidth: median > 0 ? median : defaultWidth(units), warnings };
}

function defaultWidth(units: 'mm' | 'in'): number {
  return units === 'mm' ? 0.1 : 0.004;
}
