// ---------------------------------------------------------------------------
// Native zone-fill engine: computes copper-pour polygons for a zone from
// board geometry — clearance from foreign-net copper, thermal-relief spokes
// for same-net pads, board-edge pullback — using Clipper (Boost license).
//
// Output shape: one ring per island (flat [x0,y0,x1,y1,…] in board mm),
// with holes inlined via zero-width keyhole channels — the same encoding
// KiCad uses for `filled_polygon`, so results can be written back into a
// .kicad_pcb and read by both our plotter and KiCad itself.
// ---------------------------------------------------------------------------

import ClipperLib from 'clipper-lib';
import { SNode } from '../sexpr/index.js';
import { atPoint, scalar } from '../gerber_export/copper.js';

const NM = 1e6; // integer-nm grid for Clipper
type Path = ClipperLib.Path;

export interface ZoneFillIsland {
  /** keyhole ring in board mm, flat [x0,y0,x1,y1,…] (KiCad filled_polygon form) */
  ring: number[];
  /**
   * Same island as SEPARATE contours — [outer, …holes] in board mm. Gerber
   * regions punch holes via even-odd between sub-contours, so plotters
   * should prefer these: the keyhole ring is geometrically self-intersecting
   * (channel crossings) and polygon tessellators render artifacts on it.
   */
  contours: number[][];
  areaMm2: number;
}

export interface ZoneFillResult {
  layer: string;
  islands: ZoneFillIsland[];
  /** net copper area in mm² (outer rings minus their holes) */
  totalAreaMm2: number;
}

interface Circle {
  x: number;
  y: number;
  r: number;
}
interface Capsule {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
}
interface RectPoly {
  /** polygon points (board mm) */
  pts: Array<[number, number]>;
}

/** A copper shape in board mm — shared with the DRC engine. */
export interface Obstacle {
  /** thermal/solid only applies to same-net */
  kind: 'circle' | 'capsule' | 'poly' | 'group';
  parts?: Obstacle[];
  circle?: Circle;
  capsule?: Capsule;
  poly?: RectPoly;
}

export function circleToPoly(x: number, y: number, r: number, inflate = 0): Path {
  const rr = r + inflate;
  // 64-gon: chord error < 0.2% of r — plenty for pour clearance
  const path: Path = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    path.push({ X: Math.round((x + rr * Math.cos(a)) * NM), Y: Math.round((y + rr * Math.sin(a)) * NM) });
  }
  return path;
}

export function capsuleToPoly(x1: number, y1: number, x2: number, y2: number, r: number, inflate = 0): ClipperLib.Path {
  // stroke a 2-point open path with round joins/caps — Clipper's exact
  // Minkowski sum of the segment and a (r+inflate) disc
  const co = new ClipperLib.ClipperOffset(2, 0.002 * NM);
  co.AddPath(
    [
      { X: Math.round(x1 * NM), Y: Math.round(y1 * NM) },
      { X: Math.round(x2 * NM), Y: Math.round(y2 * NM) },
    ],
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etOpenRound,
  );
  const out: ClipperLib.Path[] = [];
  co.Execute(out, Math.round((r + inflate) * NM));
  return out[0] ?? [];
}

function polyToPath(pts: Array<[number, number]>, inflate: number): Path {
  const path: Path = pts.map(([x, y]) => ({ X: Math.round(x * NM), Y: Math.round(y * NM) }));
  if (inflate === 0) return path;
  const co = new ClipperLib.ClipperOffset(2, 0.002 * NM);
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out: ClipperLib.Path[] = [];
  co.Execute(out, Math.round(inflate * NM));
  return out[0] ?? path;
}


function subtract(from: Path[], holes: Path[]): Path[] {
  const cpr = new ClipperLib.Clipper();
  from.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
  holes.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptClip, true));
  const solution: ClipperLib.Path[] = [];
  cpr.Execute(ClipperLib.ClipType.ctDifference, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return solution;
}

function areaOf(path: Path): number {
  return Math.abs(ClipperLib.Clipper.Area(path)) / (NM * NM);
}

/** Keyhole-merge an outer ring and its hole rings into one flat mm ring. */
function mergeWithHoles(outer: Path, holes: Path[]): number[] {
  // True keyhole encoding: each hole is SPLICED into the OUTER ring through
  // a zero-width channel between the nearest vertex pair (traversed in and
  // back out). Concatenating whole rings instead draws straight chords
  // across the pour — viewers render those as wedge-shaped voids. Every
  // channel anchors to the outer ring itself (never to another hole's
  // excursion): nested excursions break even-odd fill classification.
  //
  // The outer's straight edges are resampled first: hatch pours have a
  // rectangular outer with only corner vertices, so nearest-vertex anchoring
  // would otherwise pull thousands of channels to one corner (viewer
  // tessellation stalls). Holes below ~0.01 mm² are dropped — their
  // excursions are invisible ink but cost tessellation time.
  const MAX_STEP_NM = 2 * NM;
  const resampled: Path = [];
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % outer.length]!;
    resampled.push(a);
    const len = Math.hypot(b.X - a.X, b.Y - a.Y);
    const steps = Math.floor(len / MAX_STEP_NM);
    for (let s = 1; s <= steps; s++) {
      resampled.push({
        X: Math.round(a.X + ((b.X - a.X) * s) / (steps + 1)),
        Y: Math.round(a.Y + ((b.Y - a.Y) * s) / (steps + 1)),
      });
    }
  }
  const kept: Path[] = [];
  for (const hole of holes) {
    if (Math.abs(ClipperLib.Clipper.Area(hole)) < 0.01 * NM * NM) continue;
    kept.push(hole);
  }
  const anchors = kept.map((hole) => {
    let bestA = 0;
    let bestB = 0;
    let bestD = Infinity;
    for (let i = 0; i < resampled.length; i++) {
      for (let j = 0; j < hole.length; j++) {
        const dx = resampled[i]!.X - hole[j]!.X;
        const dy = resampled[i]!.Y - hole[j]!.Y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestA = i;
          bestB = j;
        }
      }
    }
    return { hole, bestA, bestB };
  });
  // splice at descending outer indices so earlier insertions stay valid
  anchors.sort((a, b) => b.bestA - a.bestA);
  let ring: Path = resampled;
  for (const { hole, bestA, bestB } of anchors) {
    const next: Path = [];
    for (let i = 0; i <= bestA; i++) next.push(ring[i]!); // outer up to channel
    for (let j = bestB; j < hole.length; j++) next.push(hole[j]!); // channel in
    for (let j = 0; j <= bestB; j++) next.push(hole[j]!); // around the hole
    next.push(hole[bestB]!); // channel back out (overlays the entry)
    for (let i = bestA; i < ring.length; i++) next.push(ring[i]!); // outer on
    ring = next;
  }
  const out: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const v = ring[i]!;
    const prev = ring[(i + ring.length - 1) % ring.length]!;
    if (v.X === prev.X && v.Y === prev.Y) continue; // collapse duplicates
    out.push(v.X / NM, v.Y / NM);
  }
  if (ring.length > 0) {
    const first = ring[0]!;
    const last = out.length >= 2 ? { X: out[out.length - 2]! * NM, Y: out[out.length - 1]! * NM } : null;
    if (!last || last.X !== first.X || last.Y !== first.Y) out.push(first.X / NM, first.Y / NM);
  }
  return out;
}

// ---------------------------------------------------------------------------
// obstacle collection
// ---------------------------------------------------------------------------

/** All copper shapes of one pad, in board mm (empty = no obstacle). */
export function padShapeObstacles(pad: SNode, worldX: number, worldY: number, angle: number): Obstacle[] {
  const shape = String(pad.raw[3] ?? 'circle');
  if (shape === 'custom') {
    // EVERY primitive contributes copper (poly/rect/circle/line) — taking
    // only the first silently under-blocks multi-shape pads
    const prims = pad.child('primitives');
    if (!prims) return [];
    const parts: Obstacle[] = [];
    for (const prim of prims.children()) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotP = (x: number, y: number): [number, number] => [
        worldX + x * cos - y * sin,
        worldY + x * sin + y * cos,
      ];
      if (prim.name === 'gr_poly') {
        const pts = prim.child('pts')?.children('xy') ?? [];
        const out: Array<[number, number]> = pts.map((p) =>
          rotP(scalar(p, 1, 0), scalar(p, 2, 0)),
        );
        if (out.length >= 3) parts.push({ kind: 'poly', poly: { pts: out } });
      } else if (prim.name === 'gr_rect') {
        const s = atPoint(prim.child('start'));
        const e = atPoint(prim.child('end'));
        parts.push({
          kind: 'poly',
          poly: { pts: [rotP(s.x, s.y), rotP(e.x, s.y), rotP(e.x, e.y), rotP(s.x, e.y)] },
        });
      } else if (prim.name === 'gr_circle') {
        const c = atPoint(prim.child('center'));
        const e2 = atPoint(prim.child('end'));
        const r = Math.hypot(e2.x - c.x, e2.y - c.y);
        if (r > 0) parts.push({ kind: 'circle', circle: { x: worldX + c.x, y: worldY + c.y, r } });
      } else if (prim.name === 'gr_line') {
        const s = atPoint(prim.child('start'));
        const e = atPoint(prim.child('end'));
        const wNode = prim.child('width');
        const w = wNode ? scalar(wNode, 1, 0) : 0;
        if (w > 0) {
          parts.push({
            kind: 'capsule',
            capsule: {
              x1: worldX + s.x * cos - s.y * sin,
              y1: worldY + s.x * sin + s.y * cos,
              x2: worldX + e.x * cos - e.y * sin,
              y2: worldY + e.x * sin + e.y * cos,
              r: w / 2,
            },
          });
        }
      } else if (prim.name === 'gr_arc') {
        // flatten the arc's centerline, stroke as chained capsules
        const s = atPoint(prim.child('start'));
        const midNode = prim.child('mid');
        const e = atPoint(prim.child('end'));
        const wNode = prim.child('width');
        const w = wNode ? scalar(wNode, 1, 0) : 0;
        if (w > 0) {
          const pts = midNode
            ? arcPolyline(s, atPoint(midNode), e, 0)
            : (() => {
                // legacy angle form: sweep from start around (at)
                const at = prim.child('at')!;
                const cx = worldX + scalar(at, 1, 0);
                const cy = worldY + scalar(at, 2, 0);
                const r = Math.hypot(s.x - cx, s.y - cy);
                const a0 = Math.atan2(s.y - cy, s.x - cx);
                let sweep = scalar(at.child('angle') ?? at, 1, 360) * (Math.PI / 180);
                if (sweep < 0) sweep += 2 * Math.PI;
                const out: Array<[number, number]> = [];
                for (let i = 0; i <= 24; i++) {
                  const a = a0 + (sweep * i) / 24;
                  out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
                }
                return out;
              })();
          for (let i = 0; i + 1 < pts.length; i++) {
            const [x1, y1] = pts[i]!;
            const [x2, y2] = pts[i + 1]!;
            parts.push({ kind: 'capsule', capsule: { x1, y1, x2, y2, r: w / 2 } });
          }
        }
      }
    }
    return parts;
  }
  const sizeNode = pad.child('size');
  if (!sizeNode) return [];
  const w = scalar(sizeNode, 1, 0);
  const h = scalar(sizeNode, 2, 0);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = (x: number, y: number): [number, number] => [
    worldX + x * cos - y * sin,
    worldY + x * sin + y * cos,
  ];
  switch (shape) {
    case 'circle':
      return [{ kind: 'circle', circle: { x: worldX, y: worldY, r: w / 2 } }];
    case 'roundrect': {
      // rounded corners: radius = rratio × min(w, h), quarter arcs per corner
      const hw = w / 2;
      const hh = h / 2;
      const rrNode = pad.child('roundrect_rratio');
      const rratio = rrNode ? scalar(rrNode, 1, 0.25) : 0.25;
      const r = Math.min(rratio * Math.min(w, h), Math.min(hw, hh));
      const pts: Array<[number, number]> = [];
      const seg = 6;
      const corners: Array<[number, number, number, number]> = [
        // [cx, cy, startAngle, endAngle] (file frame, angles in rad)
        [hw - r, -(hh - r), -Math.PI / 2, 0],
        [hw - r, hh - r, 0, Math.PI / 2],
        [-(hw - r), hh - r, Math.PI / 2, Math.PI],
        [-(hw - r), -(hh - r), Math.PI, 1.5 * Math.PI],
      ];
      for (const [cx, cy, a0, a1] of corners) {
        for (let i = 0; i <= seg; i++) {
          const a = a0 + ((a1 - a0) * i) / seg;
          pts.push(rot(cx + r * Math.cos(a), cy + r * Math.sin(a)));
        }
      }
      return [{ kind: 'poly', poly: { pts } }];
    }
    case 'trapezoid': {
      // KiCad BuildPadPolygon: delta.y slants the left/right edges, delta.x
      // the top/bottom (shift = delta/2); rectangle when both are zero
      const hw = w / 2;
      const hh = h / 2;
      const dNode = pad.child('rect_delta');
      const ddx = dNode ? scalar(dNode, 1, 0) / 2 : 0;
      const ddy = dNode ? scalar(dNode, 2, 0) / 2 : 0;
      return [{
        kind: 'poly',
        poly: {
          pts: [
            rot(-hw - ddy, -hh - ddx),
            rot(hw + ddy, -hh - ddx),
            rot(hw - ddy, hh + ddx),
            rot(-hw + ddy, hh + ddx),
          ],
        },
      }];
    }
    case 'rect': {
      const hw = w / 2;
      const hh = h / 2;
      return [{
        kind: 'poly',
        poly: { pts: [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)] },
      }];
    }
    case 'oval': {
      const minor = Math.min(w, h);
      const half = (Math.max(w, h) - minor) / 2;
      if (w >= h) {
        // major along local x
        return [{
          kind: 'capsule',
          capsule: {
            x1: worldX - half * cos,
            y1: worldY - half * sin,
            x2: worldX + half * cos,
            y2: worldY + half * sin,
            r: minor / 2,
          },
        }];
      }
      return [{
        kind: 'capsule',
        capsule: {
          x1: worldX + half * sin,
          y1: worldY - half * cos,
          x2: worldX - half * sin,
          y2: worldY + half * cos,
          r: minor / 2,
        },
      }];
    }
    default:
      return [];
  }
}

export function arcPolyline(
  s: { x: number; y: number },
  m: { x: number; y: number },
  e: { x: number; y: number },
  r: number,
): Array<[number, number]> {
  // flatten a 3-point arc into a polyline (center from perpendicular bisectors)
  const d = 2 * (s.x * (m.y - e.y) + m.x * (e.y - s.y) + e.x * (s.y - m.y));
  if (Math.abs(d) < 1e-12) return [[s.x, s.y], [e.x, e.y]];
  const a2 = s.x * s.x + s.y * s.y;
  const b2 = m.x * m.x + m.y * m.y;
  const c2 = e.x * e.x + e.y * e.y;
  const cx = (a2 * (m.y - e.y) + b2 * (e.y - s.y) + c2 * (s.y - m.y)) / d;
  const cy = (a2 * (e.x - m.x) + b2 * (s.x - e.x) + c2 * (m.x - s.x)) / d;
  const ang = (p: { x: number; y: number }) => Math.atan2(p.y - cy, p.x - cx);
  const a0 = ang(s);
  let a1 = ang(m);
  let a2n = ang(e);
  // sweep direction via cross product
  const cross = (m.x - s.x) * (e.y - m.y) - (m.y - s.y) * (e.x - m.x);
  if (cross > 0) {
    while (a1 < a0) a1 += 2 * Math.PI;
    while (a2n < a1) a2n += 2 * Math.PI;
  } else {
    while (a1 > a0) a1 -= 2 * Math.PI;
    while (a2n > a1) a2n -= 2 * Math.PI;
  }
  const pts: Array<[number, number]> = [];
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a2n - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function obstacleToPath(o: Obstacle, inflate: number): Path | null {
  if (o.kind === 'circle') return circleToPoly(o.circle!.x, o.circle!.y, o.circle!.r, inflate);
  if (o.kind === 'capsule') {
    const c = o.capsule!;
    return capsuleToPoly(c.x1, c.y1, c.x2, c.y2, c.r, inflate);
  }
  return polyToPath(o.poly!.pts, inflate);
}

/** Inflated pieces of an obstacle — multi-primitive pads yield several. */
export function obstacleToPaths(o: Obstacle, inflate: number): Path[] {
  if (o.kind === 'group') {
    // no union needed: subtraction accumulates windings, so overlapping
    // parts simply subtract twice (same net effect)
    return o.parts!.flatMap((p) => obstacleToPaths(p, inflate));
  }
  const p = obstacleToPath(o, inflate);
  return p ? [p] : [];
}

// ---------------------------------------------------------------------------
// zone fill
// ---------------------------------------------------------------------------


/**
 * Chain Edge.Cuts lines and arcs into one closed outline (each segment's
 * end connects to the next start). Returns [] when the pieces don't form
 * a closed loop — edge pullback is then skipped rather than guessed.
 */
export function chainEdgeOutline(root: SNode): Path {
  interface Seg {
    a: [number, number];
    b: [number, number];
  }
  const segs: Seg[] = [];
  const key = (p: [number, number]): string => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  for (const item of root.children()) {
    if (!item.name.startsWith('gr_')) continue;
    const l = item.child('layer');
    if (!l || String(l.raw[1] ?? '') !== 'Edge.Cuts') continue;
    if (item.name === 'gr_line') {
      const s = atPoint(item.child('start'));
      const e = atPoint(item.child('end'));
      segs.push({ a: [s.x, s.y], b: [e.x, e.y] });
    } else if (item.name === 'gr_arc') {
      const s = atPoint(item.child('start'));
      const m = atPoint(item.child('mid'));
      const e = atPoint(item.child('end'));
      // flatten and append as polyline segments
      const d = 2 * (s.x * (m.y - e.y) + m.x * (e.y - s.y) + e.x * (s.y - m.y));
      if (Math.abs(d) < 1e-12) {
        segs.push({ a: [s.x, s.y], b: [e.x, e.y] });
        continue;
      }
      const a2v = s.x * s.x + s.y * s.y;
      const b2v = m.x * m.x + m.y * m.y;
      const c2v = e.x * e.x + e.y * e.y;
      const cx = (a2v * (m.y - e.y) + b2v * (e.y - s.y) + c2v * (s.y - m.y)) / d;
      const cy = (a2v * (e.x - m.x) + b2v * (s.x - e.x) + c2v * (m.x - s.x)) / d;
      const r = Math.hypot(s.x - cx, s.y - cy);
      const pts = arcPolyline(s, m, e, r);
      for (let i = 0; i + 1 < pts.length; i++)
        segs.push({ a: pts[i]!, b: pts[i + 1]! });
    }
  }
  if (segs.length < 3) return [];
  const byStart = new Map<string, Seg[]>();
  for (const s of segs) byStart.set(key(s.a), [...(byStart.get(key(s.a)) ?? []), s]);
  const outline: Path = [];
  let cur = segs[0]!;
  const used = new Set<Seg>();
  const startKey = key(cur.a);
  outline.push({ X: Math.round(cur.a[0] * NM), Y: Math.round(cur.a[1] * NM) });
  for (let guard = 0; guard < segs.length * 2; guard++) {
    used.add(cur);
    outline.push({ X: Math.round(cur.b[0] * NM), Y: Math.round(cur.b[1] * NM) });
    const next = (byStart.get(key(cur.b)) ?? []).find((s) => !used.has(s));
    if (!next) return key(cur.b) === startKey ? dedupe(outline) : [];
    cur = next;
  }
  return [];
}

function dedupe(path: Path): Path {
  const out: Path = [];
  for (const v of path) {
    const prev = out[out.length - 1];
    if (!prev || prev.X !== v.X || prev.Y !== v.Y) out.push(v);
  }
  if (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first.X === last.X && first.Y === last.Y) out.pop();
  }
  return out;
}

export interface ZoneFillOptions {
  /** clearance to foreign copper (mm); default: zone connect_pads clearance */
  clearance?: number;
  /** thermal gap for same-net pads (mm) */
  thermalGap?: number;
  /** thermal spoke width (mm) */
  spokeWidth?: number;
  /** pullback from the board edge (mm) */
  edgeClearance?: number;
  /** drop islands below this area (mm²); 0 keeps all */
  minIslandArea?: number;
  /**
   * Memo table for repeated fills of the same zone within one run. The DRC
   * threads one Map through its per-layer passes (copper loop + mask
   * section) instead of re-filling the identical zone 2×+ per layer; a
   * stored `null` (zone yields no fill) is cached too.
   */
  cache?: Map<string, ZoneFillResult | null>;
}

/** Resolve an item's net child to a net NAME (name-only or coded form). */
export function netNameOf(item: SNode, netCodeToName: Map<number, string>): string | null {
  const n = item.child('net');
  if (!n) return null;
  if (typeof n.raw[1] === 'string') return String(n.raw[1]) || null;
  if (typeof n.raw[1] === 'number') return netCodeToName.get(n.raw[1]) ?? null;
  return null;
}

export function buildNetCodeMap(root: SNode): Map<number, string> {
  const map = new Map<number, string>();
  for (const net of root.children('net')) {
    const code = net.raw[1];
    const name = net.raw[2];
    if (typeof code === 'number' && typeof name === 'string' && name !== '') map.set(code, name);
  }
  return map;
}

export function fillZone(
  root: SNode,
  zone: SNode,
  layer: string,
  opts: ZoneFillOptions = {},
): ZoneFillResult | null {
  if (!opts.cache) return computeZoneFill(root, zone, layer, opts);
  const key = zoneFillCacheKey(zone, layer, opts);
  const hit = opts.cache.get(key);
  if (hit !== undefined) return hit;
  const res = computeZoneFill(root, zone, layer, opts);
  opts.cache.set(key, res);
  return res;
}

/**
 * Cache key: zone identity by CONTENT — SNode wrappers are not
 * reference-stable across children() calls, so uuid + net token + each
 * polygon's anchor point + layer (+ option overrides) stand in for the
 * node itself. Two zones sharing all of those are the same zone.
 */
function zoneFillCacheKey(zone: SNode, layer: string, opts: ZoneFillOptions): string {
  const anchors = zone
    .children('polygon')
    .map((p) => {
      const xy = p.child('pts')?.children('xy')[0];
      return xy ? `${scalar(xy, 1)},${scalar(xy, 2)}` : '';
    })
    .join(';');
  const net = String(zone.child('net')?.raw[1] ?? '');
  const uuid = String(zone.child('uuid')?.raw[1] ?? '');
  const overrides = [
    opts.clearance ?? '',
    opts.thermalGap ?? '',
    opts.spokeWidth ?? '',
    opts.edgeClearance ?? '',
    opts.minIslandArea ?? '',
  ].join(',');
  return `${uuid}|${net}|${anchors}|${layer}|${overrides}`;
}

function computeZoneFill(
  root: SNode,
  zone: SNode,
  layer: string,
  opts: ZoneFillOptions = {},
): ZoneFillResult | null {
  const netCodeToName = buildNetCodeMap(root);
  // a zone may carry MULTIPLE (polygon …) blocks — all of them are subject
  // copper (reading only the first silently drops the others' pour)
  const polyNodes = zone.children('polygon');
  if (polyNodes.length === 0) return null;
  const zonePolys: Path[] = [];
  for (const polyNode of polyNodes) {
    const zonePts = polyNode.child('pts')?.children('xy') ?? [];
    if (zonePts.length < 3) continue;
    zonePolys.push(
      zonePts.map((p) => ({
        X: Math.round(scalar(p, 1) * NM),
        Y: Math.round(scalar(p, 2) * NM),
      })),
    );
  }
  if (zonePolys.length === 0) return null;

  // zone net (name-only or coded form)
  const zoneNet = netNameOf(zone, netCodeToName);

  const clips: Path[] = [];
  // keepout zones on this layer punch holes in the fill (they never fill)
  for (const other of root.children('zone')) {
    if (other === zone || !other.child('keepout')) continue;
    const otherLayersNode = other.child('layer') ?? other.child('layers');
    const otherLayers = otherLayersNode
      ? otherLayersNode.raw.slice(1).filter((v): v is string => typeof v === 'string')
      : [];
    if (!otherLayers.includes(layer)) continue;
    const kPts = other.child('polygon')?.child('pts')?.children('xy') ?? [];
    if (kPts.length < 3) continue;
    clips.push(
      kPts.map((p) => ({ X: Math.round(scalar(p, 1) * NM), Y: Math.round(scalar(p, 2) * NM) })),
    );
  }

  const clearanceMm =
    opts.clearance ??
    (zone.child('connect_pads')?.child('clearance')
      ? scalar(zone.child('connect_pads')!.child('clearance')!, 1, 0.2)
      : 0.2);
  const fillNode = zone.child('fill');
  const zoneThermalGap = fillNode?.child('thermal_gap');
  const zoneBridge = fillNode?.child('thermal_bridge_width');
  const thermalGapMm = opts.thermalGap ?? (zoneThermalGap ? scalar(zoneThermalGap, 1, 0.5) : 0.5);
  const spokeWidthMm =
    opts.spokeWidth ?? (zoneBridge ? scalar(zoneBridge, 1, 0.5) : Math.max(2 * clearanceMm, 0.5));
  // island removal: mode 0 = remove unconnected islands (KiCad default),
  // 1 = keep all, 2 = also remove below min_island_area
  const islandMode = fillNode?.child('island_removal_mode')
    ? scalar(fillNode!.child('island_removal_mode')!, 1, 0)
    : 0;
  const zoneMinIsland = fillNode?.child('island_area_min')
    ? scalar(fillNode!.child('island_area_min')!, 1, 0)
    : 0;
  const modeTok = fillNode?.child('mode')?.raw[1];
  const hatchMode = String((modeTok as { name?: string })?.name ?? modeTok) === 'hatch';
  const hatchParams: HatchParams | null = hatchMode
    ? {
        thickness:
          fillNode?.child('hatch_thickness') ? scalar(fillNode!.child('hatch_thickness')!, 1, 0.25) : 0.25,
        gap: fillNode?.child('hatch_gap') ? scalar(fillNode!.child('hatch_gap')!, 1, 0.5) : 0.5,
        orientation: fillNode?.child('hatch_orientation')
          ? scalar(fillNode!.child('hatch_orientation')!, 1, 0)
          : 0,
        minHoleArea: fillNode?.child('hatch_min_hole_area')
          ? scalar(fillNode!.child('hatch_min_hole_area')!, 1, 0)
          : 0,
        smoothing: (() => {
          const lvl = fillNode?.child('hatch_smoothing_level')
            ? scalar(fillNode!.child('hatch_smoothing_level')!, 1, 0)
            : 0;
          const val = fillNode?.child('hatch_smoothing_value')
            ? scalar(fillNode!.child('hatch_smoothing_value')!, 1, 0)
            : 0;
          return lvl >= 1 ? val : 0;
        })(),
      }
    : null;
  if (hatchParams) {
    const mt = zone.child('min_thickness') ? scalar(zone.child('min_thickness')!, 1, 0) : 0;
    hatchParams.thickness = Math.max(hatchParams.thickness, mt);
  }
  const edgeClearanceMm = opts.edgeClearance ?? 0.3;
  const minIsland = opts.minIslandArea ?? 0;

  // collect obstacles + same-net pads on this layer
  const foreign: Path[] = [];
  const sameNet: Array<{ pads: Obstacle[]; x: number; y: number; angle: number }> = [];

  const scanFootprints = (): void => {
    for (const fp of root.children('footprint')) {
      const fpAt = fp.child('at');
      const fx = scalar(fpAt!, 1, 0);
      const fy = scalar(fpAt!, 2, 0);
      const frot = scalar(fpAt!, 3, 0);
      const c = Math.cos((frot * Math.PI) / 180);
      const s = Math.sin((frot * Math.PI) / 180);
      for (const pad of fp.children('pad')) {
        const layersNode = pad.child('layers');
        const layers = layersNode ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string') : [];
        const touches = layers.includes(layer) || layers.includes('*.Cu') || layers.includes('*');
        if (!touches) continue;
        const at = pad.child('at')!;
        const lx = scalar(at, 1, 0);
        const ly = scalar(at, 2, 0);
        const angle = scalar(at, 3, 0); // absolute
        const wx = fx + lx * c + ly * s;
        const wy = fy - lx * s + ly * c;
        const obst = padShapeObstacles(pad, wx, wy, angle);
        if (obst.length === 0) continue;
        const padNet = netNameOf(pad, netCodeToName);
        if (zoneNet && padNet === zoneNet) {
          sameNet.push({ pads: obst, x: wx, y: wy, angle });
        } else {
          // Drilled pads also enforce the hole-to-copper minimum: the fill
          // must sit no closer to the HOLE than min_hole_to_copper (KiCad's
          // filler enlarges drilled obstacles the same way — NPTH pads have
          // no ring, so their zone clearance alone would leave the drill
          // barrel under the rule).
          const drillNode = pad.child('drill');
          let inflate = clearanceMm;
          if (drillNode) {
            // oval slots: (drill oval W H) — raw[1] is a Sym; minor axis rules
            const drill = typeof drillNode.raw[1] !== 'number'
              ? Math.min(scalar(drillNode, 2, 0), scalar(drillNode, 3, 0))
              : scalar(drillNode, 1, 0);
            const sizeNode = pad.child('size');
            const padR = sizeNode ? Math.max(scalar(sizeNode, 1, 0), scalar(sizeNode, 2, 0)) / 2 : drill / 2;
            const ring = Math.max(0, padR - drill / 2);
            inflate = Math.max(clearanceMm, 0.25 - ring);
          }
          for (const o of obst) {
            const p = obstacleToPaths(o, inflate);
            foreign.push(...p);
          }
        }
      }
    }
  };
  scanFootprints();

  // tracks + vias
  for (const item of root.children()) {
    if (item.name === 'segment') {
      const l = String(item.child('layer')?.raw[1] ?? '');
      if (l !== layer) continue;
      const s = atPoint(item.child('start'));
      const e = atPoint(item.child('end'));
      const width = scalar(item.child('width')!, 1, 0.2);
      const net = netNameOf(item, netCodeToName);
      if (zoneNet && net === zoneNet) continue; // same-net tracks connect solid
      foreign.push(capsuleToPoly(s.x, s.y, e.x, e.y, width / 2, clearanceMm));
    } else if (item.name === 'arc') {
      const l = String(item.child('layer')?.raw[1] ?? '');
      if (l !== layer) continue;
      const s = atPoint(item.child('start'));
      const m = atPoint(item.child('mid'));
      const e = atPoint(item.child('end'));
      const width = scalar(item.child('width')!, 1, 0.2);
      const net = netNameOf(item, netCodeToName);
      if (zoneNet && net === zoneNet) continue;
      // arc center/radius
      const d = 2 * (s.x * (m.y - e.y) + m.x * (e.y - s.y) + e.x * (s.y - m.y));
      if (Math.abs(d) < 1e-12) continue;
      const a2v = s.x * s.x + s.y * s.y;
      const b2v = m.x * m.x + m.y * m.y;
      const c2v = e.x * e.x + e.y * e.y;
      const cx = (a2v * (m.y - e.y) + b2v * (e.y - s.y) + c2v * (s.y - m.y)) / d;
      const cy = (a2v * (e.x - m.x) + b2v * (s.x - e.x) + c2v * (m.x - s.x)) / d;
      const r = Math.hypot(s.x - cx, s.y - cy);
      const line = arcPolyline(s, m, e, r);
      for (let i = 0; i + 1 < line.length; i++) {
        foreign.push(
          capsuleToPoly(line[i]![0], line[i]![1], line[i + 1]![0], line[i + 1]![1], width / 2, clearanceMm),
        );
      }
    } else if (item.name === 'via') {
      // layer span: a via declaring F.Cu..B.Cu is THROUGH and touches every
      // copper layer; only typed blind/buried restrict to their span
      const layersNode = item.child('layers');
      const layers = layersNode ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string') : [];
      const through = layers.includes('F.Cu') && layers.includes('B.Cu');
      if (!through && !layers.includes(layer) && !layers.includes('*.Cu')) continue;
      const at = atPoint(item.child('at'));
      const size = scalar(item.child('size')!, 1, 0.6);
      const net = netNameOf(item, netCodeToName);
      if (zoneNet && net === zoneNet) {
        sameNet.push({ pads: [{ kind: 'circle', circle: { x: at.x, y: at.y, r: size / 2 } }], x: at.x, y: at.y, angle: 0 });
      } else {
        foreign.push(circleToPoly(at.x, at.y, size / 2, clearanceMm));
      }
    }
  }

  // board edge pullback: chain Edge.Cuts lines+arcs into a closed outline
  const edge = chainEdgeOutline(root);
  clips.push(...foreign);
  if (edgeClearanceMm > 0 && edge.length >= 3) {
    // inflate the edge outline and subtract its complement: simpler —
    // shrink the zone polygon by edgeClearance via offsetting the zone
    // against the edge: fill = zone ∩ deflate(edge) minus obstacles.
    // Clipper offsetting the edge path outward and intersecting gives the
    // same: fill = zone ∩ edge − obstacles, with edge inflated by clearance
    const co = new ClipperLib.ClipperOffset(2, 0.25 * NM);
    co.AddPath(edge, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const inflated: ClipperLib.Path[] = [];
    co.Execute(inflated, edgeClearanceMm * NM);
    const cpr = new ClipperLib.Clipper();
    zonePolys.forEach((zp) => cpr.AddPath(zp, ClipperLib.PolyType.ptSubject, true));
    inflated.forEach((p: Path) => cpr.AddPath(p, ClipperLib.PolyType.ptClip, true));
    const inner: ClipperLib.Path[] = [];
    cpr.Execute(ClipperLib.ClipType.ctIntersection, inner, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    if (inner.length > 0) {
      return finish(inner, clips, sameNet, thermalGapMm, spokeWidthMm, minIsland, layer, islandMode, zoneMinIsland, hatchParams);
    }
  }

  return finish(zonePolys, clips, sameNet, thermalGapMm, spokeWidthMm, minIsland, layer, islandMode, zoneMinIsland, hatchParams);
}

export interface HatchParams {
  /** stroke width of border and hatch lines (mm) */
  thickness: number;
  /** clear gap between hatch lines (mm) */
  gap: number;
  /** KiCad degrees; 0 = the 45° default */
  orientation: number;
  /** holes below this area (mm²) fill solid (hatch_min_hole_area) */
  minHoleArea: number;
  /** border corner rounding radius (mm); 0 = off (hatch_smoothing_level/value) */
  smoothing: number;
}

/**
 * Convert a solid fill region into KiCad-style hatch output pieces: a border
 * band (region outline stroked at the hatch thickness) plus individual hatch
 * line pieces (cross-hatch at the hatch angle and angle + 90°), each clipped
 * to the region. Returns one KEYHOLED RING per piece.
 *
 * Pieces are emitted as SEPARATE gerber regions rather than unioned into one
 * hole-riddled region: a hatched pour's complement (the voids between lines)
 * intersects obstacle clearances into large connected networks, and keyholing
 * those into a single zone-rectangular outer draws thousands of long
 * channels that cross the entire hatch (gerbview's fracturing stalls for
 * seconds; ours — separate single-contour regions — tessellate trivially).
 * Overlapping line pieces double-draw copper, which is harmless on film.
 */
export interface HatchPiece {
  /** keyholed single ring (gerber/board-file encoding) */
  ring: number[];
  /** TRUE geometry: [outer, ...holes] — what geometry consumers (DRC) use */
  contours: number[][];
}

function hatchPieceRings(region: Path[], hp: HatchParams): HatchPiece[] {
  const pieces: HatchPiece[] = [];

  /** keyhole a PolyTree node's holes into its contour; records the piece */
  const nodeRings = (node: ClipperLib.PolyNode): void => {
    const outer = node.Contour() as unknown as Path;
    const holes = node.Childs().map((ch) => ch.Contour() as unknown as Path);
    const toMm = (p: Path): number[] => {
      const out: number[] = [];
      for (const v of p) out.push(v.X / NM, v.Y / NM);
      return out;
    };
    pieces.push({ ring: mergeWithHoles(outer, holes), contours: [toMm(outer), ...holes.map(toMm)] });
  };

  const intersectRegion = (subjects: Path[], clipRegion: boolean): ClipperLib.PolyTree => {
    const cpr = new ClipperLib.Clipper();
    subjects.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
    region.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptClip, true));
    const tree = new ClipperLib.PolyTree();
    cpr.Execute(
      ClipperLib.ClipType.ctIntersection,
      tree,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    );
    return tree;
  };

  // ---- border band: stroke the region outlines, clip back into the region
  // (an open-path stroke extends half its width OUTSIDE the zone edge).
  // hatch_smoothing_level/value rounds the band's corners via a
  // morphological close (dilate then erode, round joins).
  const closeRound = (p: Path, radius: number): Path => {
    const once = (path: Path, d: number): Path => {
      const co = new ClipperLib.ClipperOffset(2, 0.002 * NM);
      co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      const o: ClipperLib.Path[] = [];
      co.Execute(o, Math.round(d * NM));
      return o[0] ?? path;
    };
    return once(once(p, radius), -radius);
  };
  const borderRaw: Path[] = [];
  for (const path of region) {
    const co = new ClipperLib.ClipperOffset(2, 0.002 * NM);
    co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
    const out: ClipperLib.Path[] = [];
    co.Execute(out, Math.round((hp.thickness / 2) * NM));
    out.forEach((o) => borderRaw.push(o));
  }
  for (const node of intersectRegion(borderRaw, true).Childs()) {
    if (hp.smoothing > 0) {
      const outer = closeRound(node.Contour() as unknown as Path, hp.smoothing);
      const holes = node.Childs().map((ch) => closeRound(ch.Contour() as unknown as Path, hp.smoothing));
      const toMm = (p: Path): number[] => {
        const out: number[] = [];
        for (const v of p) out.push(v.X / NM, v.Y / NM);
        return out;
      };
      pieces.push({ ring: mergeWithHoles(outer, holes), contours: [toMm(outer), ...holes.map(toMm)] });
    } else {
      nodeRings(node);
    }
  }

  // ---- cross-hatch lines: KiCad draws lines at hatch_orientation AND at
  // orientation + 90° (rd_skeleton golden: orientation 0 → 0° and 90° line
  // families in equal measure). Each line is intersected with the region
  // SEPARATELY so its pieces stay hole-free simple rings — unioning the
  // whole line field would make the voids between lines holes of one giant
  // region and reintroduce the keyhole blowup.
  const rad0 = (hp.orientation * Math.PI) / 180;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of region) {
    for (const v of path) {
      const x = v.X / NM;
      const y = v.Y / NM;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfL = Math.hypot(maxX - minX, maxY - minY) / 2 + hp.thickness;
  const pitch = hp.thickness + hp.gap;
  for (const rad of [rad0, rad0 + Math.PI / 2]) {
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const nx = -dy;
    const ny = dx;
    for (let off = -halfL; off <= halfL; off += pitch) {
      const capsule = capsuleToPoly(
        cx + nx * off - dx * halfL,
        cy + ny * off - dy * halfL,
        cx + nx * off + dx * halfL,
        cy + ny * off + dy * halfL,
        0,
        hp.thickness / 2,
      );
      for (const node of intersectRegion([capsule], true).Childs()) nodeRings(node);
    }
  }

  // ---- drop degenerate slivers (< 0.01 mm²): invisible ink that only
  // costs tessellation
  return pieces.filter((piece) => {
    let a = 0;
    const r = piece.ring;
    for (let i = 0; i < r.length / 2; i++) {
      const j = (i + 1) % (r.length / 2);
      a += r[i * 2]! * r[j * 2 + 1]! - r[j * 2]! * r[i * 2 + 1]!;
    }
    return Math.abs(a / 2) >= 0.01;
  });
}

function finish(
  subject: Path[],
  clips: Path[],
  sameNet: Array<{ pads: Obstacle[]; x: number; y: number; angle: number }>,
  thermalGapMm: number,
  spokeWidthMm: number,
  minIsland: number,
  layer: string,
  islandMode = 0,
  zoneMinIsland = 0,
  hatchParams: HatchParams | null = null,
): ZoneFillResult | null {
  // thermal relief: same-net items keep a gap ring around the pad with four
  // spoke corridors left open. The void is the pad outline INFLATED by the
  // thermal gap (KiCad's per-shape geometry — a circle radius for a rect
  // pad floats the ring off its long edges), with four orthogonal spoke
  // corridors (rotating with the pad) cut through it.
  const thermalClips: Path[] = [];
  for (const { pads, x, y, angle } of sameNet) {
    for (const part of pads) {
      for (const voidPoly of obstacleToPaths(part, thermalGapMm)) {
        if (voidPoly.length < 3) continue;
        // spoke reach: cover the void from the pad center
        let reach = 0;
        for (const v of voidPoly) {
          reach = Math.max(reach, Math.hypot(v.X - x * NM, v.Y - y * NM));
        }
        reach = reach / NM + 1;
        const rad = (angle * Math.PI) / 180;
        const spokePaths: Path[] = [];
        for (let q = 0; q < 4; q++) {
          const a = rad + (q * Math.PI) / 2;
          const dx = Math.cos(a);
          const dy = Math.sin(a);
          const hw = spokeWidthMm / 2;
          // rectangle from the pad center outward along the spoke direction
          const nx = -dy * hw;
          const ny = dx * hw;
          spokePaths.push([
            { X: Math.round(x * NM + nx * NM), Y: Math.round(y * NM + ny * NM) },
            { X: Math.round((x + dx * reach) * NM + nx * NM), Y: Math.round((y + dy * reach) * NM + ny * NM) },
            { X: Math.round((x + dx * reach) * NM - nx * NM), Y: Math.round((y + dy * reach) * NM - ny * NM) },
            { X: Math.round(x * NM - nx * NM), Y: Math.round(y * NM - ny * NM) },
          ]);
        }
        // void minus spokes = the gap pieces actually subtracted from the pour
        thermalClips.push(...subtract([voidPoly], spokePaths));
      }
    }
  }

  const islands: ZoneFillIsland[] = [];
  const outerPaths: Path[] = [];
  const holesByOuter = new Map<number, Path[]>();

  // spokes are already excluded from the thermal gap pieces (void minus
  // spoke corridors), so a single subtraction builds the fill
  let flatResult = subtract(subject, [...clips, ...thermalClips]);

  // Hatch output: independent border/line PIECES, each its own island with a
  // single (rarely-keyholed) contour — see hatchPieceRings. Skipping the
  // outer/hole classification entirely: the pieces' voids are simply not
  // emitted, which is what makes the gerber cheap to tessellate.
  if (hatchParams) {
    let total = 0;
    const piecePaths: Path[] = [];
    for (const piece of hatchPieceRings(flatResult, hatchParams)) {
      const pts = piece.ring.length / 2;
      const nmRing: Path = [];
      for (let i = 0; i < pts; i++) {
        nmRing.push({ X: Math.round(piece.ring[i * 2]! * NM), Y: Math.round(piece.ring[i * 2 + 1]! * NM) });
      }
      const area = areaOf(nmRing);
      total += area;
      piecePaths.push(nmRing);
      islands.push({ ring: piece.ring, contours: piece.contours, areaMm2: area });
    }
    // hatch_min_hole_area: voids of the fill region smaller than the
    // threshold are filled solid — compute the complement of the emitted
    // pieces and keep the small voids as copper islands
    if (hatchParams.minHoleArea > 0 && piecePaths.length > 0) {
      for (const v of subtract(flatResult, piecePaths)) {
        const a = areaOf(v);
        if (a >= hatchParams.minHoleArea || a < 0.01) continue;
        const ring: number[] = [];
        for (const p of v) ring.push(p.X / NM, p.Y / NM);
        total += a;
        islands.push({ ring, contours: [ring], areaMm2: a });
      }
    }
    if (islands.length === 0) return { layer, islands: [], totalAreaMm2: 0 };
    return { layer, islands, totalAreaMm2: total };
  }

  // classify outers/holes by orientation: Clipper's boolean output marks
  // hole contours with negative signed area
  const outers: Path[] = [];
  const holeList: Path[] = [];
  for (const p of flatResult) {
    if (ClipperLib.Clipper.Area(p) >= 0) outers.push(p);
    else holeList.push(p);
  }
  const pointInPath = (path: Path, pt: { X: number; Y: number }): boolean => {
    let inside = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[i]!;
      const b = path[j]!;
      if (
        a.Y > pt.Y !== b.Y > pt.Y &&
        pt.X < ((b.X - a.X) * (pt.Y - a.Y)) / (b.Y - a.Y) + a.X
      )
        inside = !inside;
    }
    return inside;
  };
  outerPaths.push(...outers);
  outerPaths.forEach((_, i) => holesByOuter.set(i, []));
  for (const hole of holeList) {
    const idx = outerPaths.findIndex((o) => pointInPath(o, hole[0]!));
    if (idx >= 0) holesByOuter.get(idx)!.push(hole);
  }

  const pointInPathLocal = (path: Path, x: number, y: number): boolean => {
    const pt = { X: Math.round(x * NM), Y: Math.round(y * NM) };
    let inside = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[i]!;
      const b = path[j]!;
      if (
        a.Y > pt.Y !== b.Y > pt.Y &&
        pt.X < ((b.X - a.X) * (pt.Y - a.Y)) / (b.Y - a.Y) + a.X
      )
        inside = !inside;
    }
    return inside;
  };
  let total = 0;
  outerPaths.forEach((outer, i) => {
    const area = areaOf(outer);
    if (area < minIsland) return;
    if (islandMode === 2 && area < zoneMinIsland) return;
    if (islandMode !== 1 && sameNet.length > 0) {
      // KiCad default: drop islands with no connection to the zone's net
      const connected = sameNet.some((s) => pointInPathLocal(outer, s.x, s.y));
      if (!connected) return;
    }
    total += area;
    const holes = holesByOuter.get(i) ?? [];
    for (const hole of holes) total -= areaOf(hole); // net copper, not gross
    const pathToMm = (p: Path): number[] => {
      const out: number[] = [];
      for (const v of p) out.push(v.X / NM, v.Y / NM);
      return out;
    };
    islands.push({
      ring: mergeWithHoles(outer, holes),
      contours: [pathToMm(outer), ...holes.map(pathToMm)],
      areaMm2: area,
    });
  });

  if (islands.length === 0) return { layer, islands: [], totalAreaMm2: 0 };
  return { layer, islands, totalAreaMm2: total };
}
