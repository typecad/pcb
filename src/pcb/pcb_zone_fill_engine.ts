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
  /** keyhole ring in board mm, flat [x0,y0,x1,y1,…] */
  ring: number[];
  areaMm2: number;
}

export interface ZoneFillResult {
  layer: string;
  islands: ZoneFillIsland[];
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

interface Obstacle {
  /** thermal/solid only applies to same-net */
  kind: 'circle' | 'capsule' | 'poly';
  circle?: Circle;
  capsule?: Capsule;
  poly?: RectPoly;
}

function circleToPoly(x: number, y: number, r: number, inflate = 0): Path {
  const rr = r + inflate;
  // 64-gon: chord error < 0.2% of r — plenty for pour clearance
  const path: Path = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    path.push({ X: Math.round((x + rr * Math.cos(a)) * NM), Y: Math.round((y + rr * Math.sin(a)) * NM) });
  }
  return path;
}

function capsuleToPoly(x1: number, y1: number, x2: number, y2: number, r: number, inflate = 0): ClipperLib.Path {
  // stroke a 2-point open path with round joins/caps — Clipper's exact
  // Minkowski sum of the segment and a (r+inflate) disc
  const co = new ClipperLib.ClipperOffset(2, 0.02 * NM);
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

function polyToPath(pts: Array<[number, number]>, inflate: number, centroid: [number, number]): Path {
  if (inflate === 0) {
    return pts.map(([x, y]) => ({ X: Math.round(x * NM), Y: Math.round(y * NM) }));
  }
  // approximate uniform inflation by pushing each vertex outward from the
  // centroid along its bisector — exact for convex polys, fine for pours
  return pts.map(([x, y]) => {
    const dx = x - centroid[0];
    const dy = y - centroid[1];
    const len = Math.hypot(dx, dy) || 1e-9;
    return {
      X: Math.round((x + (dx / len) * inflate) * NM),
      Y: Math.round((y + (dy / len) * inflate) * NM),
    };
  });
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
  const ring: number[] = [];
  const pushPath = (p: Path, close: boolean) => {
    for (const v of p) ring.push(v.X / NM, v.Y / NM);
    if (close) {
      ring.push(p[0]!.X / NM, p[0]!.Y / NM);
    }
  };
  // start ring at the vertex nearest a hole to minimize channel length:
  // simplicity over optimality — channel is zero-width anyway
  pushPath(outer, true);
  for (const hole of holes) {
    // bridge: ...outerEnd, hole..., holeStart(=channel), outerStart...
    pushPath(hole, true);
  }
  return ring;
}

// ---------------------------------------------------------------------------
// obstacle collection
// ---------------------------------------------------------------------------

function padShapeObstacle(pad: SNode, worldX: number, worldY: number, angle: number): Obstacle | null {
  const shape = String(pad.raw[3] ?? 'circle');
  const sizeNode = pad.child('size');
  if (!sizeNode) return null;
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
      return { kind: 'circle', circle: { x: worldX, y: worldY, r: w / 2 } };
    case 'rect':
    case 'roundrect':
    case 'trapezoid': {
      const hw = w / 2;
      const hh = h / 2;
      return {
        kind: 'poly',
        poly: { pts: [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)] },
      };
    }
    case 'oval': {
      const minor = Math.min(w, h);
      const half = (Math.max(w, h) - minor) / 2;
      if (w >= h) {
        // major along local x
        return {
          kind: 'capsule',
          capsule: {
            x1: worldX - half * cos,
            y1: worldY - half * sin,
            x2: worldX + half * cos,
            y2: worldY + half * sin,
            r: minor / 2,
          },
        };
      }
      return {
        kind: 'capsule',
        capsule: {
          x1: worldX + half * sin,
          y1: worldY - half * cos,
          x2: worldX - half * sin,
          y2: worldY + half * cos,
          r: minor / 2,
        },
      };
    }
    default:
      return null;
  }
}

function arcPolyline(
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
  let a0 = ang(s);
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
  const pts = o.poly!.pts;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return polyToPath(pts, inflate, [cx, cy]);
}

// ---------------------------------------------------------------------------
// zone fill
// ---------------------------------------------------------------------------


/**
 * Chain Edge.Cuts lines and arcs into one closed outline (each segment's
 * end connects to the next start). Returns [] when the pieces don't form
 * a closed loop — edge pullback is then skipped rather than guessed.
 */
function chainEdgeOutline(root: SNode): Path {
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
}

/** Resolve an item's net child to a net NAME (name-only or coded form). */
function netNameOf(item: SNode, netCodeToName: Map<number, string>): string | null {
  const n = item.child('net');
  if (!n) return null;
  if (typeof n.raw[1] === 'string') return String(n.raw[1]) || null;
  if (typeof n.raw[1] === 'number') return netCodeToName.get(n.raw[1]) ?? null;
  return null;
}

function buildNetCodeMap(root: SNode): Map<number, string> {
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
  const netCodeToName = buildNetCodeMap(root);
  const polyNode = zone.child('polygon');
  if (!polyNode) return null;
  const zonePts = polyNode.child('pts')?.children('xy') ?? [];
  if (zonePts.length < 3) return null;
  const zonePoly: Path = zonePts.map((p) => ({
    X: Math.round(scalar(p, 1) * NM),
    Y: Math.round(scalar(p, 2) * NM),
  }));

  // zone net (name-only or coded form)
  const zoneNet = netNameOf(zone, netCodeToName);

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
  const edgeClearanceMm = opts.edgeClearance ?? 0.3;
  const minIsland = opts.minIslandArea ?? 0;

  // collect obstacles + same-net pads on this layer
  const foreign: Path[] = [];
  const sameNet: Array<{ pad: Obstacle; x: number; y: number; angle: number; r: number }> = [];

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
        const obst = padShapeObstacle(pad, wx, wy, angle);
        if (!obst) continue;
        const padNet = netNameOf(pad, netCodeToName);
        const sizeNode = pad.child('size');
        const r = sizeNode ? Math.max(scalar(sizeNode, 1, 0), scalar(sizeNode, 2, 0)) / 2 : 0.5;
        if (zoneNet && padNet === zoneNet) {
          sameNet.push({ pad: obst, x: wx, y: wy, angle, r });
        } else {
          const p = obstacleToPath(obst, clearanceMm);
          if (p) foreign.push(p);
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
        sameNet.push({ pad: { kind: 'circle', circle: { x: at.x, y: at.y, r: size / 2 } }, x: at.x, y: at.y, angle: 0, r: size / 2 });
      } else {
        foreign.push(circleToPoly(at.x, at.y, size / 2, clearanceMm));
      }
    }
  }

  // board edge pullback: chain Edge.Cuts lines+arcs into a closed outline
  const edge = chainEdgeOutline(root);
  const clips: Path[] = [...foreign];
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
    cpr.AddPath(zonePoly, ClipperLib.PolyType.ptSubject, true);
    inflated.forEach((p: Path) => cpr.AddPath(p, ClipperLib.PolyType.ptClip, true));
    const inner: ClipperLib.Path[] = [];
    cpr.Execute(ClipperLib.ClipType.ctIntersection, inner, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    if (inner.length > 0) {
      return finish(inner, clips, sameNet, thermalGapMm, spokeWidthMm, minIsland, layer);
    }
  }

  return finish([zonePoly], clips, sameNet, thermalGapMm, spokeWidthMm, minIsland, layer);
}

function finish(
  subject: Path[],
  clips: Path[],
  sameNet: Array<{ pad: Obstacle; x: number; y: number; angle: number; r: number }>,
  thermalGapMm: number,
  spokeWidthMm: number,
  minIsland: number,
  layer: string,
): ZoneFillResult | null {
  // thermal relief: same-net items keep an annular gap with four spoke
  // corridors left open. Built analytically as four annular sectors whose
  // angular span excludes the spoke half-angles — no boolean union needed.
  const thermalClips: Path[] = [];
  const spokes: Path[] = [];
  const spokeHalfAngle = (x: number): number => Math.asin(Math.min(1, spokeWidthMm / 2 / x));
  for (const { x, y } of sameNet) {
    const r1 = 0.05; // from just outside the pad center
    const r2 = r1 + thermalGapMm + 0.05;
    for (let q = 0; q < 4; q++) {
      const a0 = (q * Math.PI) / 2 + spokeHalfAngle(r2);
      const a1 = ((q + 1) * Math.PI) / 2 - spokeHalfAngle(r2);
      if (a1 <= a0) continue;
      const sector: Path = [];
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        sector.push({ X: Math.round((x + r1 * Math.cos(a)) * NM), Y: Math.round((y + r1 * Math.sin(a)) * NM) });
      }
      for (let i = steps; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / steps;
        sector.push({ X: Math.round((x + r2 * Math.cos(a)) * NM), Y: Math.round((y + r2 * Math.sin(a)) * NM) });
      }
      thermalClips.push(sector);
    }
  }

  const islands: ZoneFillIsland[] = [];
  const outerPaths: Path[] = [];
  const holesByOuter = new Map<number, Path[]>();

  // union spokes back into the fill per island: simplest is to union spokes
  // with the clipped result as flat paths
  let flatResult = subtract(subject, [...clips, ...thermalClips]);
  if (spokes.length > 0) {
    const cpr = new ClipperLib.Clipper();
    flatResult.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
    spokes.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptClip, true));
    const merged: ClipperLib.Path[] = [];
    cpr.Execute(ClipperLib.ClipType.ctUnion, merged, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    flatResult = merged;
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

  let total = 0;
  outerPaths.forEach((outer, i) => {
    const area = areaOf(outer);
    if (area < minIsland) return;
    total += area;
    islands.push({ ring: mergeWithHoles(outer, holesByOuter.get(i) ?? []), areaMm2: area });
  });

  if (islands.length === 0) return { layer, islands: [], totalAreaMm2: 0 };
  return { layer, islands, totalAreaMm2: total };
}
