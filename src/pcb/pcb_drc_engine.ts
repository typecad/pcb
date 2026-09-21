// ---------------------------------------------------------------------------
// Native DRC engine (phase 1: copper core).
//
// Collects every copper item per layer (pads incl. custom shapes, tracks,
// arcs, vias, zone fills) as clipper polygons with net attribution — the
// same geometry substrate the zone-fill engine uses — and checks:
//
//   shorting_items   different-net items whose copper overlaps (collinear
//                    track overlap or polygon intersection)
//   tracks_crossing  different-net track centerlines crossing at a point
//   clearance        different-net items closer than the net-class/board
//                    minimum clearance (inflate-and-intersect)
//   annular_width    via/PTH-pad ring width below the minimum
//   hole_to_hole     drilled holes closer (edge-to-edge) than the minimum
//   hole_clearance   hole-to-other-net-copper below the minimum
//
// Violations carry KiCad's report schema (type, severity, description,
// items[{description, pos, uuid}]) with description strings matched to the
// kicad-cli 10 goldens (gerber_spec/boards/*/build/drc_golden.json).
// ---------------------------------------------------------------------------
import ClipperLib from 'clipper-lib';
import { parse, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/index.js';
import { atPoint, scalar } from '../gerber_export/copper.js';
import {
  arcPolyline,
  buildNetCodeMap,
  capsuleToPoly,
  circleToPoly,
  fillZone,
  netNameOf,
  padShapeObstacles,
  type Obstacle,
} from './pcb_zone_fill_engine.js';

type Path = ClipperLib.Path;
const NM = 1e6;
/**
 * Geometric tolerance: our copper polygons tessellate arcs (64-gon capsules,
 * circles), so edges sit up to a few µm INSIDE the true curve — a fill that
 * kept exactly min_clearance measures a hair under it. KiCad computes with
 * exact arcs; comparisons here forgive the rasterization slop (5µm, far
 * below fab tolerance).
 */
const GEOM_TOL_NM = 10000;
/** minimum overlap area (nm²) that counts as a real intersection */
const AREA_TOL_NM2 = 1e6;

/** KiCad JSON report violation shape (subset the printer consumes). */
export interface DrcViolation {
  type: string;
  severity: 'error' | 'warning' | 'ignore';
  description: string;
  items: Array<{ description: string; pos: { x: number; y: number }; uuid?: string }>;
}

export interface DrcReport {
  violations: DrcViolation[];
  unconnected_items: Array<{ description: string; items: DrcViolation['items'] }>;
}

/** Resolved constraint values (mm) the engine checks against. */
export interface DrcConstraints {
  min_clearance: number;
  min_track_width: number;
  min_via_diameter: number;
  min_through_hole_diameter: number;
  min_via_annular_width: number;
  min_copper_edge_clearance: number;
  min_hole_to_hole: number;
  /** copper-to-hole; KiCad's hole_clearance (0.25 JLC standard) */
  min_hole_to_copper: number;
  /** check id → severity override (conf constraints file) */
  severities: Record<string, 'error' | 'warning' | 'ignore'>;
}

export const DEFAULT_DRC_CONSTRAINTS: DrcConstraints = {
  min_clearance: 0.2,
  min_track_width: 0.2,
  min_via_diameter: 0.6,
  min_through_hole_diameter: 0.3,
  min_via_annular_width: 0.15,
  min_copper_edge_clearance: 0.2,
  min_hole_to_hole: 0.25,
  min_hole_to_copper: 0.25,
  severities: {},
};

/** One copper shape under test, with its report identity. */
interface CopperItem {
  kind: 'track' | 'arc' | 'via' | 'pad' | 'zone';
  net: string | null;
  /**
   * Clipper polygons in nm, board frame: [outer, ...holes] with holes
   * negatively oriented — nonzero fill gives the true copper region. Zone
   * items carry clearance voids as holes; the KEYHOLED ring form is a
   * gerber encoding fiction whose channels cross voids and must never
   * reach the DRC.
   */
  paths: Path[];
  /** track centerline for crossing checks (tracks/arcs only) */
  centerline?: Array<[number, number]>;
  hole?: { x: number; y: number; r: number };
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  description: string;
  pos: { x: number; y: number };
  uuid?: string;
}

function bboxOfPaths(paths: Path[]): CopperItem['bbox'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of paths) {
    for (const v of path) {
      if (v.X < minX) minX = v.X;
      if (v.X > maxX) maxX = v.X;
      if (v.Y < minY) minY = v.Y;
      if (v.Y > maxY) maxY = v.Y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function bboxOf(path: Path): CopperItem['bbox'] {
  return bboxOfPaths([path]);
}

function obstaclePaths(o: Obstacle): Path[] {
  if (o.kind === 'group') return o.parts?.flatMap(obstaclePaths) ?? [];
  if (o.kind === 'circle') return [circleToPoly(o.circle!.x, o.circle!.y, o.circle!.r, 0)];
  if (o.kind === 'capsule') {
    const c = o.capsule!;
    return [capsuleToPoly(c.x1, c.y1, c.x2, c.y2, c.r, 0)];
  }
  return [o.poly!.pts.map(([x, y]) => ({ X: Math.round(x * NM), Y: Math.round(y * NM) }))];
}

const fmtNet = (net: string | null): string => (net ? net : '<no net>');

/** Collect copper items + drilled holes for one layer of a parsed board. */
function collectLayerItems(root: SNode, layer: string, netCodeToName: Map<number, string>): CopperItem[] {
  const items: CopperItem[] = [];
  const push = (i: Omit<CopperItem, 'bbox'>): void => {
    items.push({ ...i, bbox: bboxOfPaths(i.paths) });
  };

  // tracks + arcs
  for (const item of root.children()) {
    if (item.name === 'segment') {
      if (String(item.child('layer')?.raw[1] ?? '') !== layer) continue;
      const s = atPoint(item.child('start'));
      const e = atPoint(item.child('end'));
      const width = scalar(item.child('width')!, 1, 0.2);
      const net = netNameOf(item, netCodeToName);
      const len = Math.hypot(e.x - s.x, e.y - s.y);
      push({
        kind: 'track',
        net,
        paths: [capsuleToPoly(s.x, s.y, e.x, e.y, width / 2, 0)],
        centerline: [[s.x, s.y], [e.x, e.y]],
        description: `Track [${fmtNet(net)}] on ${layer}, length ${len.toFixed(4)} mm`,
        pos: { x: s.x, y: s.y },
        uuid: String(item.child('uuid')?.raw[1] ?? ''),
      });
    } else if (item.name === 'arc') {
      if (String(item.child('layer')?.raw[1] ?? '') !== layer) continue;
      const s = atPoint(item.child('start'));
      const m = atPoint(item.child('mid'));
      const e = atPoint(item.child('end'));
      const width = scalar(item.child('width')!, 1, 0.2);
      const net = netNameOf(item, netCodeToName);
      // center from perpendicular bisectors (arcPolyline computes it)
      const pts = arcPolyline(s, m, e, 0);
      const cl = pts.map((p) => [p[0], p[1]] as [number, number]);
      // stroke the polyline as chained capsules (single path via clipper union)
      const segs: Path[] = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        segs.push(capsuleToPoly(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], width / 2, 0));
      }
      const cpr = new ClipperLib.Clipper();
      segs.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
      const unioned: Path[] = [];
      cpr.Execute(ClipperLib.ClipType.ctUnion, unioned, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
      const len = cl.reduce((acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p[0] - cl[i - 1]![0], p[1] - cl[i - 1]![1])), 0);
      for (const path of unioned.length ? unioned : segs) {
        push({
          kind: 'arc',
          net,
          paths: [path],
          centerline: cl,
          description: `Track [${fmtNet(net)}] on ${layer}, length ${len.toFixed(4)} mm`,
          pos: { x: s.x, y: s.y },
          uuid: String(item.child('uuid')?.raw[1] ?? ''),
        });
      }
    }
  }

  // vias (through spans every layer)
  for (const item of root.children('via')) {
    const layersNode = item.child('layers');
    const layers = layersNode ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string') : [];
    const through = layers.includes('F.Cu') && layers.includes('B.Cu');
    if (!through && !layers.includes(layer) && !layers.includes('*.Cu')) continue;
    const at = atPoint(item.child('at'));
    const size = scalar(item.child('size')!, 1, 0.6);
    const net = netNameOf(item, netCodeToName);
    const drill = scalar(item.child('drill')!, 1, 0.3);
    push({
      kind: 'via',
      net,
      paths: [circleToPoly(at.x, at.y, size / 2, 0)],
      hole: { x: at.x, y: at.y, r: drill / 2 },
      description: `Via [${fmtNet(net)}] on ${layers.length ? `${layers[0]} - ${layers[layers.length - 1]}` : layer}`,
      pos: at,
      uuid: String(item.child('uuid')?.raw[1] ?? ''),
    });
  }

  // footprint pads
  for (const fp of root.children('footprint')) {
    const fpAt = fp.child('at');
    const fx = scalar(fpAt!, 1, 0);
    const fy = scalar(fpAt!, 2, 0);
    const frot = scalar(fpAt!, 3, 0);
    const c = Math.cos((frot * Math.PI) / 180);
    const s = Math.sin((frot * Math.PI) / 180);
    const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
    const ref = String(refProp?.raw[2] ?? fp.child('reference')?.raw[1] ?? '?');
    for (const pad of fp.children('pad')) {
      const layersNode = pad.child('layers');
      const layers = layersNode ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string') : [];
      const touches = layers.includes(layer) || layers.includes('*.Cu') || layers.includes('*');
      if (!touches) continue;
      const at = pad.child('at')!;
      const lx = scalar(at, 1, 0);
      const ly = scalar(at, 2, 0);
      const angle = scalar(at, 3, 0);
      const wx = fx + lx * c + ly * s;
      const wy = fy - lx * s + ly * c;
      const net = netNameOf(pad, netCodeToName);
      const padNum = String(pad.raw[1] ?? '');
      const thru = String(pad.raw[2] ?? '').startsWith('thru');
      const drillNode = pad.child('drill');
      let hole: CopperItem['hole'] | undefined;
      if (drillNode) {
        const drill = scalar(drillNode, 1, 0);
        const off = pad.child('drill')?.child('offset');
        const ox = off ? scalar(off, 1, 0) : 0;
        const oy = off ? scalar(off, 2, 0) : 0;
        hole = { x: wx + ox, y: wy + oy, r: drill / 2 };
      }
      const obstacles = padShapeObstacles(pad, wx, wy, angle);
      const descs = obstacles.length > 1
        ? undefined // multi-part pads describe per-part below
        : thru
          ? `PTH pad ${padNum} [${fmtNet(net)}] of ${ref}`
          : `Pad ${padNum} [${fmtNet(net)}] of ${ref} on ${layer}`;
      for (const part of obstacles) {
        for (const path of obstaclePaths(part)) {
          push({
            kind: 'pad',
            net,
            paths: [path],
            hole,
            description: descs ?? (thru
              ? `PTH pad ${padNum} [${fmtNet(net)}] of ${ref}`
              : `Pad ${padNum} [${fmtNet(net)}] of ${ref} on ${layer}`),
            pos: { x: wx, y: wy },
            uuid: String(pad.child('uuid')?.raw[1] ?? ''),
          });
        }
      }
    }
  }

  return items;
}

/**
 * Zone-fill copper items for one layer, built from the native fill engine's
 * SEPARATE-CONTOUR output (outer + holes) — never the keyholed gerber ring,
 * whose zero-width channels cross cleared voids and would phantom-violate
 * every clearance around them.
 */
function collectZoneItems(root: SNode, layer: string, netCodeToName: Map<number, string>): CopperItem[] {
  const items: CopperItem[] = [];
  for (const zone of root.children('zone')) {
    const layersNode = zone.child('layers') ?? zone.child('layer');
    const zLayers = layersNode
      ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string')
      : [];
    if (!zLayers.includes(layer)) continue;
    const net = netNameOf(zone, netCodeToName);
    const res = fillZone(root, zone, layer);
    if (!res) continue;
    for (const isl of res.islands) {
      const paths: Path[] = [];
      for (const contour of isl.contours) {
        const path: Path = [];
        for (let i = 0; i < contour.length; i += 2) {
          path.push({ X: Math.round(contour[i]! * NM), Y: Math.round(contour[i + 1]! * NM) });
        }
        if (path.length >= 3) paths.push(path);
      }
      if (paths.length === 0) continue;
      items.push({
        kind: 'zone',
        net,
        paths,
        bbox: bboxOfPaths(paths),
        description: `Filled zone [${fmtNet(net)}] on ${layer}`,
        pos: { x: paths[0]![0]!.X / NM, y: paths[0]![0]!.Y / NM },
        uuid: String(zone.child('uuid')?.raw[1] ?? ''),
      });
    }
  }
  return items;
}

/**
 * Signed intersection area of two regions (nm²) — regions carry holes as
 * negatively-oriented contours, nonzero fill yields the true copper.
 * Touching-only intersections have ~zero area and do not count.
 */
function intersectAreaNm2(a: Path[], b: Path[]): number {
  const cpr = new ClipperLib.Clipper();
  a.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
  b.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptClip, true));
  const sol: ClipperLib.Paths = [];
  cpr.Execute(ClipperLib.ClipType.ctIntersection, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  let area = 0;
  for (const p of sol) area += ClipperLib.Clipper.Area(p);
  return area;
}

/** regions overlap with real (non-degenerate) area */
function pathsIntersect(a: Path[], b: Path[]): boolean {
  return intersectAreaNm2(a, b) > AREA_TOL_NM2;
}

function pointSegDistNm(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return Math.hypot(cx, cy);
}

/**
 * Minimum edge-to-edge distance between two closed polygons (nm). For
 * disjoint simple polygons the minimum is attained at a vertex-edge pair;
 * callers handle intersecting pairs before asking. This measures the ACTUAL
 * gap like KiCad does — inflate-and-intersect compounds arc-tessellation
 * error and misjudges exact-min distances.
 */
function gapNm(a: Path[], b: Path[]): number {
  let best = Infinity;
  const consider = (from: Path[], to: Path[]): void => {
    for (const poly of from) {
      for (const v of poly) {
        for (const other of to) {
          for (let i = 0, j = other.length - 1; i < other.length; j = i++) {
            const d = pointSegDistNm(v.X, v.Y, other[j]!.X, other[j]!.Y, other[i]!.X, other[i]!.Y);
            if (d < best) best = d;
            if (best === 0) return;
          }
        }
      }
    }
  };
  consider(a, b);
  if (best > 0) consider(b, a);
  return best;
}

/** Minimum distance from a circle (center, r) to a region's edges (nm). */
function circleGapNm(cx: number, cy: number, r: number, polys: Path[]): number {
  let best = Infinity;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const d = pointSegDistNm(cx, cy, poly[j]!.X, poly[j]!.Y, poly[i]!.X, poly[i]!.Y);
      if (d < best) best = d;
    }
  }
  return Math.max(0, best - r);
}

/** centerline segments cross at a point (endpoints count — different nets
 *  never legitimately connect); collinear parallel overlap returns false */
function centerlinesCross(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  const segInt = (
    p1: [number, number], p2: [number, number],
    p3: [number, number], p4: [number, number],
  ): boolean => {
    const d1 = p2[0] - p1[0], d2 = p2[1] - p1[1];
    const d3 = p4[0] - p3[0], d4 = p4[1] - p3[1];
    const denom = d1 * d4 - d2 * d3;
    if (Math.abs(denom) < 1e-12) return false; // parallel/collinear: not a crossing
    const t = ((p3[0] - p1[0]) * d4 - (p3[1] - p1[1]) * d3) / denom;
    const u = ((p3[0] - p1[0]) * d2 - (p3[1] - p1[1]) * d1) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      if (segInt(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
    }
  }
  return false;
}

/** spatial prefilter: bboxes overlap when expanded by clearance (nm) */
function near(a: CopperItem, b: CopperItem, clearanceNm: number): boolean {
  return (
    a.bbox.maxX + clearanceNm >= b.bbox.minX &&
    b.bbox.maxX + clearanceNm >= a.bbox.minX &&
    a.bbox.maxY + clearanceNm >= b.bbox.minY &&
    b.bbox.maxY + clearanceNm >= a.bbox.minY
  );
}

/**
 * Run the phase-1 copper DRC on a board source. `source` must already carry
 * materialized zone fills (see refillZoneFills).
 */
export function runDrc(source: string, constraints: Partial<DrcConstraints> = {}): DrcReport {
  const c: DrcConstraints = { ...DEFAULT_DRC_CONSTRAINTS, ...constraints, severities: constraints.severities ?? {} };
  const root = SNode.from(parse(source) as SExpr[]);
  const netCodeToName = buildNetCodeMap(root);

  const copperLayers: string[] = [];
  for (const l of root.children('layers')) {
    const name = String(l.raw[2] ?? '');
    if (String(l.raw[3] ?? '') === 'signal' && /\.Cu$|^[FB]\.Cu$/.test(name)) copperLayers.push(name);
  }
  if (copperLayers.length === 0) copperLayers.push('F.Cu', 'B.Cu');

  const violations: DrcViolation[] = [];
  // through vias appear on every spanned layer; dimension/hole checks
  // report them once (KiCad reports the via, not the via-per-layer)
  const reportedOnce = new Set<string>();
  const sev = (type: string): 'error' | 'warning' | 'ignore' => c.severities[type] ?? 'error';
  const report = (...v: [string, string, DrcViolation['items']]): void => {
    const [type, description, items] = v;
    const severity = sev(type);
    if (severity === 'ignore') return;
    violations.push({ type, severity, description, items });
  };

  const clearanceNm = Math.round(c.min_clearance * NM);
  const holeClearanceNm = Math.round(c.min_hole_to_copper * NM);
  const holeHoleNm = Math.round(c.min_hole_to_hole * NM);

  for (const layer of copperLayers) {
    const items = [
      ...collectLayerItems(root, layer, netCodeToName),
      ...collectZoneItems(root, layer, netCodeToName),
    ];
    // one shorting report per net pair per layer (KiCad reports the cluster
    // once); crossings report per pair
    const shortedPairs = new Set<string>();
    const netPairKey = (a: string | null, b: string | null): string =>
      [a ?? '<none>', b ?? '<none>'].sort().join('|');

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i]!;
        const B = items[j]!;
        if (A.net !== null && A.net === B.net) continue; // same net: fine
        if (A.net === null && B.net === null) continue; // KiCad: no-net vs no-net is not checked
        if (!near(A, B, clearanceNm)) continue;

        // 1) shorting / crossing
        if (pathsIntersect(A.paths, B.paths)) {
          if (A.kind === 'track' && B.kind === 'track' && centerlinesCross(A.centerline!, B.centerline!)) {
            report('tracks_crossing', 'Tracks crossing', [item(A), item(B)]);
          } else {
            const key = netPairKey(A.net, B.net);
            if (!shortedPairs.has(key)) {
              shortedPairs.add(key);
              report(
                'shorting_items',
                `Items shorting two nets (nets ${fmtNet(A.net)} and ${fmtNet(B.net)})`,
                [item(A), item(B)],
              );
            }
          }
          continue; // a short swallows any clearance concern
        }

        // 2) clearance: the ACTUAL edge-to-edge gap, like KiCad measures.
        // Exact-min passes; the geometric tolerance forgives arc-tessellation
        // slop in our polygonal approximations.
        if (gapNm(A.paths, B.paths) < clearanceNm - GEOM_TOL_NM) {
          report(
            'clearance',
            `Clearance violation (net ${fmtNet(A.net)} clears net ${fmtNet(B.net)} by less than ${c.min_clearance.toFixed(4)} mm)`,
            [item(A), item(B)],
          );
        }
      }
    }

    // 3) hole checks: hole-to-hole (edge-to-edge) and hole-to-other-net
    // copper. Holes attach to their item's first geometry part only —
    // multi-part custom pads would otherwise duplicate the drill.
    const holed = items.filter((it) => it.hole);
    for (let i = 0; i < holed.length; i++) {
      for (let j = i + 1; j < holed.length; j++) {
        const A = holed[i]!;
        const B = holed[j]!;
        const d = Math.hypot(A.hole!.x - B.hole!.x, A.hole!.y - B.hole!.y) - A.hole!.r - B.hole!.r;
        if (d < c.min_hole_to_hole - 1e-9) {
          report(
            'hole_to_hole',
            `Hole-to-hole clearance (edges ${d.toFixed(4)} mm; min is ${c.min_hole_to_hole.toFixed(4)} mm)`,
            [item(A), item(B)],
          );
        }
      }
      // hole vs other nets' copper: actual distance from the drill circle
      // to the foreign polygon edges
      const A = holed[i]!;
      const hx = Math.round(A.hole!.x * NM);
      const hy = Math.round(A.hole!.y * NM);
      const hr = Math.round(A.hole!.r * NM);
      for (const B of items) {
        if (A === B || (A.net !== null && A.net === B.net)) continue;
        if (A.net === null && B.net === null) continue; // KiCad: no-net vs no-net is not checked
        if (!near(A, B, holeClearanceNm + hr)) continue;
        if (pathsIntersect(A.paths, B.paths)) continue; // a short swallows the hole concern
        if (circleGapNm(hx, hy, hr, B.paths) < holeClearanceNm - GEOM_TOL_NM) {
          report(
            'hole_clearance',
            `Hole clearance (hole of ${A.description} too close to ${B.description})`,
            [item(A), item(B)],
          );
        }
      }
    }

    // 4) annular width: VIAS only in phase 1 (KiCad reports the same check
    // for non-round PTH pads with more nuance than we model)
    for (const it of items) {
      if (it.kind !== 'via' || !it.hole) continue;
      if (it.uuid && reportedOnce.has(it.uuid)) continue;
      let copperR = 0;
      for (const poly of it.paths)
        for (const v of poly) copperR = Math.max(copperR, Math.hypot(v.X - it.pos.x * NM, v.Y - it.pos.y * NM));
      const ring = copperR / NM - it.hole.r;
      if (it.uuid) reportedOnce.add(it.uuid);
      if (ring < c.min_via_annular_width - 0.0002) {
        report(
          'annular_width',
          `Annular width (board setup constraints min annular width ${c.min_via_annular_width.toFixed(4)} mm; actual ${ring.toFixed(4)} mm)`,
          [item(it)],
        );
      }
    }
  }

  // track width: board-wide scan (layer-independent)
  for (const seg of root.children('segment')) {
    const width = scalar(seg.child('width')!, 1, 0.2);
    if (width < c.min_track_width - 1e-9) {
      const s = atPoint(seg.child('start'));
      const e = atPoint(seg.child('end'));
      const net = netNameOf(seg, netCodeToName);
      const layer = String(seg.child('layer')?.raw[1] ?? '');
      const len = Math.hypot(e.x - s.x, e.y - s.y);
      report(
        'track_width',
        `Track width (${width.toFixed(4)} mm; min is ${c.min_track_width.toFixed(4)} mm)`,
        [{
          description: `Track [${fmtNet(net)}] on ${layer}, length ${len.toFixed(4)} mm`,
          pos: s,
          uuid: String(seg.child('uuid')?.raw[1] ?? ''),
        }],
      );
    }
  }

  return { violations, unconnected_items: [] };
}

function item(i: CopperItem): DrcViolation['items'][number] {
  return { description: i.description, pos: i.pos, ...(i.uuid ? { uuid: i.uuid } : {}) };
}
