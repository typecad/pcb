// ---------------------------------------------------------------------------
// Native DRC engine (phase 1: copper core).
//
// Collects every copper item per layer (pads incl. custom shapes, tracks,
// arcs, vias, zone fills) as clipper polygons with net attribution — the
// same geometry substrate the zone-fill engine uses — and checks:
//
//   shorting_items       different-net items whose copper overlaps
//   tracks_crossing      different-net track centerlines crossing at a point
//   clearance            different-net items whose ACTUAL edge-to-edge gap
//                        is under the effective minimum (board rule vs the
//                        involved nets' classes, whichever is larger)
//   annular_width        via ring width below the minimum (vias only —
//                        KiCad's non-round PTH nuance is not modeled)
//   via_diameter         via copper diameter below the minimum
//   hole_size            PTH pad drill below the minimum
//   hole_to_hole         drilled holes closer (edge-to-edge) than the minimum
//   hole_clearance       hole-to-other-net-copper below the minimum
//   copper_edge_clearance copper items closer to Edge.Cuts than the minimum
//   track_width          segments thinner than the minimum
//   silk_edge_clearance / silk_overlap / solder_mask_bridge (non-copper)
//   unconnected_items    per-net connectivity (solid-pour boards only —
//                        hatched pours' line phase is engine-dependent)
//
// Violations carry KiCad's report schema (type, severity, description,
// items[{description, pos, uuid}]) with description strings matched to the
// kicad-cli 10 goldens (gerber_spec/golden/*/drc/).
// ---------------------------------------------------------------------------
import ClipperLib from 'clipper-lib';
import { parse, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/index.js';
import { atPoint, scalar, copperLayers as copperLayersOf } from '../gerber_export/copper.js';
import {
  arcPolyline,
  buildNetCodeMap,
  capsuleToPoly,
  chainEdgeOutline,
  circleToPoly,
  fillZone,
  netNameOf,
  padShapeObstacles,
  type Obstacle,
  type ZoneFillResult,
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
  unconnected_items: Array<{
    description: string;
    items: DrcViolation['items'];
    severity?: 'error' | 'warning';
  }>;
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
  /** silkscreen-to-board-edge minimum (KiCad silk_edge_clearance) */
  min_silk_edge_clearance: number;
  /** ---- DFM (advisory; warnings by default) ---- */
  /** hole edge to board edge minimum (mm) */
  min_hole_edge_clearance: number;
  /** max board-thickness ÷ drill-diameter ratio (plating limit) */
  max_drill_aspect_ratio: number;
  /** interior copper angle below this (deg) is an acid trap */
  min_copper_angle_deg: number;
  /** minimum silkscreen text height (mm) */
  min_silk_text_height: number;
  /** minimum silkscreen text stroke thickness (mm) */
  min_silk_text_thickness: number;
  /** clearance between hole edge and copper on an SMD pad (via-in-pad exempt radius) */
  via_in_pad_exempt_radius: number;
  /** copper narrower than this is a sliver the fab can't hold (mm) */
  min_copper_sliver_width: number;
  /** solder mask web between apertures below this (mm) */
  min_mask_web: number;
  /** resolved thermal spokes required per same-net pad */
  min_resolved_spokes: number;
  /** check id → severity override (conf constraints file) */
  severities: Record<string, 'error' | 'warning' | 'ignore'>;
  /** net class name → clearance override (mm) */
  netClassClearance: Record<string, number>;
  /** net-class patterns: net names matching `pattern` get `className` */
  netClassPatterns: Array<{ pattern: string; className: string }>;
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
  min_silk_edge_clearance: 0.1,
  min_hole_edge_clearance: 0.5,
  max_drill_aspect_ratio: 10,
  min_copper_angle_deg: 30,
  min_silk_text_height: 0.8,
  min_silk_text_thickness: 0.08,
  via_in_pad_exempt_radius: 0.25,
  min_copper_sliver_width: 0.1,
  min_mask_web: 0.1,
  min_resolved_spokes: 2,
  severities: {},
  netClassClearance: {},
  netClassPatterns: [],
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
  /** copper layers this item exists on (drives connectivity unions) */
  layers: string[];
  /** track centerline for crossing checks (tracks/arcs only) */
  centerline?: Array<[number, number]>;
  hole?: { x: number; y: number; r: number };
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  description: string;
  pos: { x: number; y: number };
  uuid?: string;
  /** zone items only: the zone's fill mode is hatch — narrow copper by
   *  design, excluded from the copper_sliver union */
  hatched?: boolean;
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

/**
 * Union all same-net copper on a layer into one region per net — the
 * substrate for checks whose geometry only exists between touching items
 * (acid traps, slivers). Zone holes drop (voids, not copper); vias drop
 * (isolated circles union nothing).
 */
function unionedCopperByNet(items: CopperItem[]): Map<string, Path[]> {
  const byNet = new Map<string, Path[]>();
  for (const it of items) {
    if (it.kind === 'via' || it.net === null) continue;
    const list = byNet.get(it.net) ?? [];
    const polys = it.kind === 'zone' ? it.paths.slice(0, 1) : it.paths;
    list.push(...polys);
    byNet.set(it.net, list);
  }
  const out = new Map<string, Path[]>();
  for (const [net, paths] of byNet) {
    if (paths.length === 0) continue;
    const cpr = new ClipperLib.Clipper();
    paths.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
    const unioned: Path[] = [];
    cpr.Execute(ClipperLib.ClipType.ctUnion, unioned, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    if (unioned.length > 0) out.set(net, unioned);
  }
  return out;
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
const netsEqual = (a: string | null, b: string | null): boolean =>
  (a === null && b === null) || (a !== null && a === b);

// ---------------------------------------------------------------------------
// silkscreen geometry (graphics segments + text bounding boxes)
// ---------------------------------------------------------------------------

interface SilkSeg {
  /** polyline points (mm) — arcs are flattened */
  pts: Array<[number, number]>;
  width: number;
  /** owning footprint reference; null for board-level graphics */
  ref: string | null;
  pos: { x: number; y: number };
}

interface SilkText {
  ref: string | null;
  text: string;
  pos: { x: number; y: number };
  height: number;
  thickness: number;
  bboxNm: { minX: number; minY: number; maxX: number; maxY: number };
}

const SILK_GRAPHICS = new Set(['gr_line', 'gr_arc', 'gr_rect', 'gr_circle', 'fp_line', 'fp_arc', 'fp_rect', 'fp_circle']);

function graphicPolyline(node: SNode): Array<[number, number]> {
  if (node.name === 'gr_line' || node.name === 'fp_line') {
    const s = atPoint(node.child('start'));
    const e = atPoint(node.child('end'));
    return [[s.x, s.y], [e.x, e.y]];
  }
  if (node.name === 'gr_arc' || node.name === 'fp_arc') {
    const s = atPoint(node.child('start'));
    const m = node.child('mid') ? atPoint(node.child('mid')) : null;
    const e = atPoint(node.child('end'));
    if (m) return arcPolyline(s, m, e, 0);
    // KiCad legacy arc form: start/end/angle
    const at = node.child('at')!;
    const cx = scalar(at, 1, 0);
    const cy = scalar(at, 2, 0);
    const r = Math.hypot(s.x - cx, s.y - cy);
    const a0 = Math.atan2(s.y - cy, s.x - cx);
    const a1 = Math.atan2(e.y - cy, e.x - cx);
    const angleNode = node.child('angle');
    let sweep = (angleNode ? scalar(angleNode, 1, 0) : 360) * (Math.PI / 180);
    if (sweep < 0) sweep += 2 * Math.PI;
    const pts: Array<[number, number]> = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }
  if (node.name === 'gr_rect' || node.name === 'fp_rect') {
    const s = atPoint(node.child('start'));
    const e = atPoint(node.child('end'));
    return [[s.x, s.y], [e.x, s.y], [e.x, e.y], [s.x, e.y], [s.x, s.y]];
  }
  if (node.name === 'gr_circle' || node.name === 'fp_circle') {
    const c = atPoint(node.child('center'));
    const e = atPoint(node.child('end'));
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a)]);
    }
    return pts;
  }
  return [];
}

export function collectSilkItems(root: SNode, silkLayer: string, netCodeToName: Map<number, string>): {
  segments: SilkSeg[];
  texts: SilkText[];
} {
  const segments: SilkSeg[] = [];
  const texts: SilkText[] = [];

  const graphicItem = (
    node: SNode,
    ref: string | null,
    xf: { x: number; y: number; c: number; s: number } | null,
  ): void => {
    if (String(node.child('layer')?.raw[1] ?? '') !== silkLayer) return;
    const hideTok = node.child('hide')?.raw[1];
    if (hideTok !== undefined && String((hideTok as { name?: string }).name ?? hideTok) === 'yes') return;
    const local = graphicPolyline(node);
    // footprint graphics are LOCAL — transform into board space
    const pts = xf
      ? local.map(([lx, ly]) => [xf.x + lx * xf.c + ly * xf.s, xf.y - lx * xf.s + ly * xf.c] as [number, number])
      : local;
    if (pts.length < 2) return;
    const width = node.child('stroke') ? scalar(node.child('stroke')!.child('width')!, 1, 0.15) : 0.15;
    segments.push({ pts, width, ref, pos: { x: pts[0]![0], y: pts[0]![1] } });
  };
  const textItem = (
    node: SNode,
    ref: string | null,
    text: string,
    xf: { x: number; y: number; c: number; s: number } | null,
  ): void => {
    if (String(node.child('layer')?.raw[1] ?? '') !== silkLayer) return;
    const hideTok = node.child('hide')?.raw[1];
    if (hideTok !== undefined && String((hideTok as { name?: string }).name ?? hideTok) === 'yes') return;
    const at = node.child('at');
    if (!at) return;
    const lx = scalar(at, 1, 0);
    const ly = scalar(at, 2, 0);
    const angle = scalar(at, 3, 0);
    const x = xf ? xf.x + lx * xf.c + ly * xf.s : lx;
    const y = xf ? xf.y - lx * xf.s + ly * xf.c : ly;
    const font = node.child('effects')?.child('font');
    const sizeY = font?.child('size') ? scalar(font.child('size')!, 2, 1) : 1;
    const thickness = font?.child('thickness') ? scalar(font.child('thickness')!, 1, 0.15) : 0.15;
    // rough ink width: glyph advance ≈ 0.72 × height per char (newstroke-ish)
    const w = Math.max(text.length * 0.72 * sizeY, sizeY);
    const rad = (angle * Math.PI) / 180;
    const hw = w / 2;
    const hh = sizeY / 2;
    const corners = [
      [x + (-hw) * Math.cos(rad) - (-hh) * Math.sin(rad), y + (-hw) * Math.sin(rad) + (-hh) * Math.cos(rad)],
      [x + hw * Math.cos(rad) - (-hh) * Math.sin(rad), y + hw * Math.sin(rad) + (-hh) * Math.cos(rad)],
      [x + hw * Math.cos(rad) - hh * Math.sin(rad), y + hw * Math.sin(rad) + hh * Math.cos(rad)],
      [x + (-hw) * Math.cos(rad) - hh * Math.sin(rad), y + (-hw) * Math.sin(rad) + hh * Math.cos(rad)],
    ];
    texts.push({
      ref,
      text,
      pos: { x, y },
      height: sizeY,
      thickness,
      bboxNm: {
        minX: Math.round(Math.min(...corners.map((c) => c[0])) * NM),
        minY: Math.round(Math.min(...corners.map((c) => c[1])) * NM),
        maxX: Math.round(Math.max(...corners.map((c) => c[0])) * NM),
        maxY: Math.round(Math.max(...corners.map((c) => c[1])) * NM),
      },
    });
  };

  // board-level graphics + texts
  for (const item of root.children()) {
    if (SILK_GRAPHICS.has(item.name)) graphicItem(item, null, null);
    if (item.name === 'gr_text') {
      const text = String(item.raw[1] ?? '');
      if (text) textItem(item, null, text, null);
    }
  }
  // footprint graphics + texts
  for (const fp of root.children('footprint')) {
    const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
    const ref = String(refProp?.raw[2] ?? fp.child('reference')?.raw[1] ?? null);
    const fpAt = fp.child('at');
    const xf = fpAt
      ? {
          x: scalar(fpAt, 1, 0),
          y: scalar(fpAt, 2, 0),
          c: Math.cos((scalar(fpAt, 3, 0) * Math.PI) / 180),
          s: Math.sin((scalar(fpAt, 3, 0) * Math.PI) / 180),
        }
      : null;
    for (const item of fp.children()) {
      if (SILK_GRAPHICS.has(item.name)) graphicItem(item, ref, xf);
      if (item.name === 'fp_text' || item.name === 'property') {
        // fp_text [type, text]; property [key, value]
        const kind = String(item.raw[1] ?? '');
        const text = String(item.raw[2] ?? '');
        if (!text || kind === 'Sheetfile' || kind === 'Sheetname') continue;
        if (item.name === 'property' && !['Reference', 'Value'].includes(kind)) continue;
        if (item.name === 'fp_text' && !['reference', 'value', 'user'].includes(kind)) continue;
        // ${REFERENCE} → footprint ref; ${VALUE} → the footprint's Value
        // property (reading the sibling property, as layers.ts does)
        const valProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Value');
        const valValue = String(valProp?.raw[2] ?? '');
        const shown = text
          .replace(/\$\{REFERENCE\}/gi, ref)
          .replace(/\$\{VALUE\}/gi, valValue);
        textItem(item, ref, shown, xf);
      }
    }
  }
  return { segments, texts };
}

/** Courtyard graphics per footprint, unioned into one region each. */
function collectCourtyards(
  root: SNode,
  side: 'F' | 'B',
  netCodeToName: Map<number, string>,
): Array<{ ref: string; paths: Path[]; bbox: CopperItem['bbox'] }> {
  const layerToken = side === 'F' ? 'F.Courtyard' : 'B.Courtyard';
  const { segments } = collectSilkItems(root, layerToken, netCodeToName);
  const byRef = new Map<string, Path[]>();
  for (const seg of segments) {
    const key = seg.ref ?? '__board__';
    const list = byRef.get(key) ?? [];
    // courtyard outlines arrive as open polylines — stroke them (capsule
    // chains) so the union is a real region, not degenerate zero-area lines
    for (let i = 0; i + 1 < seg.pts.length; i++) {
      const [x1, y1] = seg.pts[i]!;
      const [x2, y2] = seg.pts[i + 1]!;
      const stroked = capsuleToPoly(x1, y1, x2, y2, Math.max(seg.width, 0.05) / 2, 0);
      if (stroked.length >= 3) list.push(stroked);
    }
    byRef.set(key, list);
  }
  const out: Array<{ ref: string; paths: Path[]; bbox: CopperItem['bbox'] }> = [];
  for (const [ref, segs] of byRef) {
    const cpr = new ClipperLib.Clipper();
    segs.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
    const unioned: Path[] = [];
    cpr.Execute(ClipperLib.ClipType.ctUnion, unioned, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    if (unioned.length > 0) out.push({ ref, paths: unioned, bbox: bboxOfPaths(unioned) });
  }
  return out;
}

/** Edge.Cuts graphics flattened to polylines (board outline). */
export function collectEdgeSegments(root: SNode): SilkSeg[] {
  const segs: SilkSeg[] = [];
  for (const item of root.children()) {
    if (!SILK_GRAPHICS.has(item.name)) continue;
    if (String(item.child('layer')?.raw[1] ?? '') !== 'Edge.Cuts') continue;
    const pts = graphicPolyline(item);
    if (pts.length < 2) continue;
    segs.push({ pts, width: 0, ref: null, pos: { x: pts[0]![0], y: pts[0]![1] } });
  }
  return segs;
}

// --- segment/box distance helpers (nm) ---------------------------------

export function segSegMinDistNm(a: SilkSeg, b: SilkSeg): number {
  let best = Infinity;
  for (let i = 0; i + 1 < a.pts.length; i++) {
    const ax = a.pts[i]![0] * NM, ay = a.pts[i]![1] * NM;
    const bx = a.pts[i + 1]![0] * NM, by = a.pts[i + 1]![1] * NM;
    for (let j = 0; j + 1 < b.pts.length; j++) {
      const cx = b.pts[j]![0] * NM, cy = b.pts[j]![1] * NM;
      const dx = b.pts[j + 1]![0] * NM, dy = b.pts[j + 1]![1] * NM;
      const ex = dx - cx, ey = dy - cy;
      const fx = bx - ax, fy = by - ay;
      const denom = fx * ey - fy * ex;
      if (Math.abs(denom) < 1e-9) {
        // parallel: endpoint-to-other-segment distances (collinear → 0 via overlap)
        best = Math.min(
          best,
          pointSegDistNm(ax, ay, cx, cy, dx, dy),
          pointSegDistNm(bx, by, cx, cy, dx, dy),
          pointSegDistNm(cx, cy, ax, ay, bx, by),
          pointSegDistNm(dx, dy, ax, ay, bx, by),
        );
        continue;
      }
      const t = ((cx - ax) * ey - (cy - ay) * ex) / denom;
      const u = ((cx - ax) * fy - (cy - ay) * fx) / denom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0; // proper crossing
      // clamp both parameters and take endpoint-to-other-segment distances
      best = Math.min(
        best,
        pointSegDistNm(ax, ay, cx, cy, dx, dy),
        pointSegDistNm(bx, by, cx, cy, dx, dy),
        pointSegDistNm(cx, cy, ax, ay, bx, by),
        pointSegDistNm(dx, dy, ax, ay, bx, by),
      );
    }
  }
  return best;
}

function segIntersectsBboxNm(seg: SilkSeg, bbox: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  for (const [x, y] of seg.pts) {
    const nx = Math.round(x * NM);
    const ny = Math.round(y * NM);
    if (nx >= bbox.minX && nx <= bbox.maxX && ny >= bbox.minY && ny <= bbox.maxY) return true;
  }
  // bbox corners/edges vs segment: conservative check via bbox-expanded seg bbox
  const segBbox = {
    minX: Math.round(Math.min(...seg.pts.map((p) => p[0])) * NM),
    maxX: Math.round(Math.max(...seg.pts.map((p) => p[0])) * NM),
    minY: Math.round(Math.min(...seg.pts.map((p) => p[1])) * NM),
    maxY: Math.round(Math.max(...seg.pts.map((p) => p[1])) * NM),
  };
  return !(segBbox.maxX < bbox.minX || segBbox.minX > bbox.maxX || segBbox.maxY < bbox.minY || segBbox.minY > bbox.maxY);
}

/** min distance (nm) from a silk polyline (mm pts, with half-width applied
 *  by the caller) to a clipper region's edges */
function polylineToPathGapNm(seg: SilkSeg, paths: Path[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < seg.pts.length; i++) {
    const ax = seg.pts[i]![0] * NM, ay = seg.pts[i]![1] * NM;
    const bx = seg.pts[i + 1]![0] * NM, by = seg.pts[i + 1]![1] * NM;
    for (const poly of paths) {
      for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
        // a silk segment passing THROUGH a region crosses its edges with no
        // vertex inside — endpoint distances alone miss that
        if (segmentsCrossNm(ax, ay, bx, by, poly[m]!.X, poly[m]!.Y, poly[k]!.X, poly[k]!.Y)) return 0;
        best = Math.min(best, pointSegDistNm(ax, ay, poly[m]!.X, poly[m]!.Y, poly[k]!.X, poly[k]!.Y));
        best = Math.min(best, pointSegDistNm(poly[m]!.X, poly[m]!.Y, ax, ay, bx, by));
      }
    }
  }
  return best;
}

/** open-segment crossing test (nm coords) */
function segmentsCrossNm(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** min distance (nm) from a point to a region's edges */
function pointPathsGapNm(px: number, py: number, paths: Path[]): number {
  let best = Infinity;
  for (const poly of paths) {
    for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
      best = Math.min(best, pointSegDistNm(px, py, poly[m]!.X, poly[m]!.Y, poly[k]!.X, poly[k]!.Y));
    }
  }
  return best;
}

/** ray-cast point-in-polygon (nm coords) */
function pointInPathNm(poly: Path, px: number, py: number): boolean {
  let inside = false;
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const a = poly[m]!;
    const b = poly[k]!;
    if (a.Y > py !== b.Y > py && px < ((b.X - a.X) * (py - a.Y)) / (b.Y - a.Y) + a.X) inside = !inside;
  }
  return inside;
}

/** true when a closed path's non-adjacent edges cross */
function pathSelfIntersectsNm(poly: Path): boolean {
  const n = poly.length;
  const cross = (a1: Path[0], a2: Path[0], b1: Path[0], b2: Path[0]): boolean => {
    const d = (a2.X - a1.X) * (b2.Y - b1.Y) - (a2.Y - a1.Y) * (b2.X - b1.X);
    if (Math.abs(d) < 1e-12) return false;
    const t = ((b1.X - a1.X) * (b2.Y - b1.Y) - (b1.Y - a1.Y) * (b2.X - b1.X)) / d;
    const u = ((b1.X - a1.X) * (a2.Y - a1.Y) - (b1.Y - a1.Y) * (a2.X - a1.X)) / d;
    return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/**
 * Regions of `paths` whose local width is below `widthNm` — erode-and-
 * survive: deflate by width/2; whatever vanishes was too narrow. Returns
 * each narrow fragment as { path, areaNm2 } (outer contours, holes kept
 * via PolyTree). Fragments under minAreaNm2 drop as tessellation noise.
 */
function narrowRegions(paths: Path[], widthNm: number, minAreaNm2 = 2e9): Array<{ path: Path; areaNm2: number }> {
  const half = Math.round(widthNm / 2);
  const erode = new ClipperLib.ClipperOffset(2, 0.002 * NM);
  paths.forEach((p) => erode.AddPath(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon));
  const eroded: Path[] = [];
  erode.Execute(eroded, -half);
  if (eroded.length === 0) {
    // everything was narrower than the threshold: report the whole region
    return paths
      .filter((p) => Math.abs(ClipperLib.Clipper.Area(p)) >= minAreaNm2)
      .map((p) => ({ path: p, areaNm2: Math.abs(ClipperLib.Clipper.Area(p)) }));
  }
  // dilate the eroded core back: opening(X). X − opening(X) is exactly the
  // sub-threshold-width material (necks, slivers) — NOT the boundary shell
  // that X − erode(X) would also include
  const dilate = new ClipperLib.ClipperOffset(2, 0.002 * NM);
  eroded.forEach((p) => dilate.AddPath(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon));
  const opened: Path[] = [];
  dilate.Execute(opened, half);

  const cpr = new ClipperLib.Clipper();
  paths.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptSubject, true));
  opened.forEach((p) => cpr.AddPath(p, ClipperLib.PolyType.ptClip, true));
  const tree = new ClipperLib.PolyTree();
  cpr.Execute(ClipperLib.ClipType.ctDifference, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

  // flatten PolyTree outers (their holes ride along in the contour set)
  const out: Array<{ path: Path; areaNm2: number }> = [];
  const walk = (node: ClipperLib.PolyNode): void => {
    for (const child of node.Childs()) {
      const contour = child.Contour() as unknown as Path;
      const area = Math.abs(ClipperLib.Clipper.Area(contour));
      if (contour.length >= 3 && area >= minAreaNm2) {
        out.push({ path: contour, areaNm2: area });
      }
      walk(child);
    }
  };
  walk(tree);
  return out;
}

function nearBboxes(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  padNm: number,
): boolean {
  return !(a.maxX + padNm < b.minX || b.maxX + padNm < a.minX || a.maxY + padNm < b.minY || b.maxY + padNm < a.minY);
}

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
        layers: [layer],
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
      const arcUuid = String(item.child('uuid')?.raw[1] ?? '');
      let arcPart = 0;
      for (const path of unioned.length ? unioned : segs) {
        push({
          kind: 'arc',
          net,
          paths: [path],
          layers: [layer],
          centerline: cl,
          description: `Track [${fmtNet(net)}] on ${layer}, length ${len.toFixed(4)} mm`,
          pos: { x: s.x, y: s.y },
          // unique per path: uuid-keyed cross-layer dedup would drop the rest
          uuid: `${arcUuid}#arc${arcPart++}`,
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
      layers: through ? ['F.Cu', 'B.Cu'] : layers.slice(),
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
        // (drill D) | (drill oval W H) — raw[1] is a Sym for oval slots.
        // The MIN axis governs both the size rule (KiCad checks a slot's
        // smallest dimension) and the circle model: a minor-axis circle
        // stays inside the slot, where a major-axis circle would poke past
        // the pad copper and phantom-violate hole_clearance.
        const isOval = typeof drillNode.raw[1] !== 'number';
        const drill = isOval
          ? Math.min(scalar(drillNode, 2, 0), scalar(drillNode, 3, 0))
          : scalar(drillNode, 1, 0);
        const off = pad.child('drill')?.child('offset');
        const ox = off ? scalar(off, 1, 0) : 0;
        const oy = off ? scalar(off, 2, 0) : 0;
        // drill offsets are PAD-LOCAL: they rotate with the pad's angle
        const aRad = (angle * Math.PI) / 180;
        hole = {
          x: wx + ox * Math.cos(aRad) - oy * Math.sin(aRad),
          y: wy + ox * Math.sin(aRad) + oy * Math.cos(aRad),
          r: drill / 2,
        };
      }
      const obstacles = padShapeObstacles(pad, wx, wy, angle);
      const desc = thru
        ? `PTH pad ${padNum} [${fmtNet(net)}] of ${ref}`
        : `Pad ${padNum} [${fmtNet(net)}] of ${ref} on ${layer}`;
      const padUuid = String(pad.child('uuid')?.raw[1] ?? '');
      let padPart = 0;
      for (const part of obstacles) {
        for (const path of obstaclePaths(part)) {
          push({
            kind: 'pad',
            net,
            paths: [path],
            layers: [layer],
            hole,
            description: desc,
            pos: { x: wx, y: wy },
            // unique per part (stable across layers): uuid-keyed cross-layer
            // dedup must not drop multi-part pads' later parts
            uuid: `${padUuid}#${padPart++}`,
          });
        }
      }
    }
  }

  return items;
}

/** true when any zone fill declares hatch mode (raw text scan, depth-safe) */
function hasHatchedZone(root: SNode): boolean {
  for (const zone of root.children('zone')) {
    const mode = zone.child('fill')?.child('mode')?.raw[1];
    if (String((mode as { name?: string })?.name ?? mode) === 'hatch') return true;
  }
  return false;
}

/**
 * Zone-fill copper items for one layer, built from the native fill engine's
 * SEPARATE-CONTOUR output (outer + holes) — never the keyholed gerber ring,
 * whose zero-width channels cross cleared voids and would phantom-violate
 * every clearance around them.
 */
function collectZoneItems(
  root: SNode,
  layer: string,
  netCodeToName: Map<number, string>,
  fillCache?: Map<string, ZoneFillResult | null>,
): CopperItem[] {
  const items: CopperItem[] = [];
  for (const zone of root.children('zone')) {
    const layersNode = zone.child('layers') ?? zone.child('layer');
    const zLayers = layersNode
      ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string')
      : [];
    if (!zLayers.includes(layer)) continue;
    const net = netNameOf(zone, netCodeToName);
    const res = fillZone(root, zone, layer, fillCache ? { cache: fillCache } : {});
    if (!res) continue;
    const modeTok = zone.child('fill')?.child('mode')?.raw[1];
    const hatched = String((modeTok as { name?: string })?.name ?? modeTok) === 'hatch';
    const zoneUuid = String(zone.child('uuid')?.raw[1] ?? 'z');
    let islandIdx = 0;
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
        layers: [layer],
        bbox: bboxOfPaths(paths),
        description: `Filled zone [${fmtNet(net)}] on ${layer}`,
        pos: { x: paths[0]![0]!.X / NM, y: paths[0]![0]!.Y / NM },
        // unique per island: each island (and each layer's fill of the same
        // zone) is separate copper — the zone's own uuid must not dedup them
        uuid: `${zoneUuid}:${layer}#${islandIdx++}`,
        hatched,
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

  // copper layer discovery via the shared helper (a previous inline copy
  // read the layers block wrong and silently never checked inner layers)
  const copperLayers = copperLayersOf(root).map((l) => l.name);

  const violations: DrcViolation[] = [];
  const unconnected_items: DrcReport['unconnected_items'] = [];
  // through vias appear on every spanned layer; dimension/hole checks
  // report them once (KiCad reports the via, not the via-per-layer)
  const reportedOnce = new Set<string>();
  const DEFAULT_SEVERITIES: Record<string, 'error' | 'warning' | 'ignore'> = {
    silk_overlap: 'warning',
    silk_edge_clearance: 'warning',
    // DFM checks are advisory by design — the conf constraints file can
    // promote any of them to error or silence them per check id
    track_dangling: 'warning',
    hole_edge_clearance: 'warning',
    drill_aspect_ratio: 'warning',
    acid_trap: 'warning',
    text_height: 'warning',
    text_thickness: 'warning',
    silk_over_mask: 'warning',
    via_in_pad: 'warning',
    copper_sliver: 'warning',
    mask_web: 'warning',
    min_resolved_spokes: 'warning',
    courtyard_overlap: 'warning',
    missing_courtyard: 'ignore',
    edge_not_closed: 'error',
    edge_self_intersection: 'error',
  };
  const sev = (type: string): 'error' | 'warning' | 'ignore' =>
    c.severities[type] ?? DEFAULT_SEVERITIES[type] ?? 'error';
  const report = (...v: [string, string, DrcViolation['items']]): void => {
    const [type, description, items] = v;
    const severity = sev(type);
    if (severity === 'ignore') return;
    violations.push({ type, severity, description, items });
  };

  // Hatched-zone caveat: connectivity across a hatched pour depends on the
  // hatch line PHASE, which differs between fill engines. A track that runs
  // parallel to a line sits connected in one engine and isolated in the
  // other. On hatched boards, unconnected entries are therefore warnings.
  const hasHatchedZones = hasHatchedZone(root);

  const clearanceNm = Math.round(c.min_clearance * NM);
  /** net → class name via patterns (exact match, then prefix wildcard) */
  const classFor = (net: string | null): string | undefined => {
    if (net === null) return undefined;
    for (const { pattern, className } of c.netClassPatterns) {
      if (pattern === net || (pattern.endsWith('*') && net.startsWith(pattern.slice(0, -1)))) {
        return className;
      }
    }
    return undefined;
  };
  /** effective minimum clearance between two nets (board min vs classes) */
  const effectiveClearanceNm = (a: string | null, b: string | null): number => {
    let eff = clearanceNm;
    for (const net of [a, b]) {
      const cls = classFor(net);
      if (cls !== undefined) {
        const cc = c.netClassClearance[cls];
        if (cc !== undefined) eff = Math.max(eff, Math.round(cc * NM));
      }
    }
    return eff;
  };
  const maxClassClearanceNm = Math.round(
    Math.max(0, ...Object.values(c.netClassClearance).map((v) => v * NM)),
  );
  const holeClearanceNm = Math.round(c.min_hole_to_copper * NM);
  const holeHoleNm = Math.round(c.min_hole_to_hole * NM);
  const thickness = (() => {
    const g = root.child('general');
    return g ? scalar(g, 1, 1.6) : 1.6;
  })();

  // Edge.Cuts as clipper paths (open segments) + their bbox, for the
  // copper-to-edge check; gapNm's closed-edge traversal double-counts open
  // segments harmlessly (same min distance)
  const edgePaths: Path[] = [];
  for (const seg of collectEdgeSegments(root)) {
    const path: Path = seg.pts.map(([x, y]) => ({ X: Math.round(x * NM), Y: Math.round(y * NM) }));
    if (path.length >= 2) edgePaths.push(path);
  }
  const edgeBbox = edgePaths.length
    ? bboxOfPaths(edgePaths)
    : { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const nearPaths = (
    a: { minX: number; minY: number; maxX: number; maxY: number },
    b: { minX: number; minY: number; maxX: number; maxY: number },
    padNm: number,
  ): boolean =>
    !(a.maxX + padNm < b.minX || b.maxX + padNm < a.minX || a.maxY + padNm < b.minY || b.maxY + padNm < a.minY);

  // one fill per (zone, layer) for the whole run: the copper loop,
  // connectivity pass, mask-aperture section, and DFM section each collect
  // zone items for the same layers — without the cache each re-fills
  const fillCache = new Map<string, ZoneFillResult | null>();

  for (const layer of copperLayers) {
    const items = [
      ...collectLayerItems(root, layer, netCodeToName),
      ...collectZoneItems(root, layer, netCodeToName, fillCache),
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
        if (!near(A, B, Math.max(clearanceNm, maxClassClearanceNm))) continue;

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
        // slop in our polygonal approximations. Net classes raise the floor.
        const minNm = effectiveClearanceNm(A.net, B.net);
        if (gapNm(A.paths, B.paths) < minNm - GEOM_TOL_NM) {
          report(
            'clearance',
            `Clearance violation (net ${fmtNet(A.net)} clears net ${fmtNet(B.net)} by less than ${(minNm / NM).toFixed(4)} mm)`,
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
        if (d * NM < holeHoleNm - GEOM_TOL_NM) {
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
      const posKey = `via:${it.pos.x.toFixed(4)}:${it.pos.y.toFixed(4)}`;
      if (reportedOnce.has(posKey)) continue;
      let copperR = 0;
      for (const poly of it.paths)
        for (const v of poly) copperR = Math.max(copperR, Math.hypot(v.X - it.pos.x * NM, v.Y - it.pos.y * NM));
      const ring = copperR / NM - it.hole.r;
      reportedOnce.add(posKey);
      if (ring < c.min_via_annular_width - 0.0002) {
        report(
          'annular_width',
          `Annular width (board setup constraints min annular width ${c.min_via_annular_width.toFixed(4)} mm; actual ${ring.toFixed(4)} mm)`,
          [item(it)],
        );
      }
    }

    // 5) via diameter (dimension check, once per via)
    for (const it of items) {
      if (it.kind !== 'via') continue;
      const sizeKey = `viasize:${it.pos.x.toFixed(4)}:${it.pos.y.toFixed(4)}`;
      if (reportedOnce.has(sizeKey)) continue;
      reportedOnce.add(sizeKey);
      let diaNm = 0;
      for (const poly of it.paths)
        for (const v of poly) diaNm = Math.max(diaNm, Math.hypot(v.X - it.pos.x * NM, v.Y - it.pos.y * NM));
      const dia = (2 * diaNm) / NM;
      if (dia < c.min_via_diameter - 0.0002) {
        report(
          'via_diameter',
          `Via diameter (${dia.toFixed(4)} mm; min is ${c.min_via_diameter.toFixed(4)} mm)`,
          [item(it)],
        );
      }
    }

    // 6) through-hole drill size (PTH pads, once per pad position)
    for (const it of items) {
      if (it.kind !== 'pad' || !it.hole) continue;
      const sizeKey = `holesize:${it.pos.x.toFixed(4)}:${it.pos.y.toFixed(4)}`;
      if (reportedOnce.has(sizeKey)) continue;
      reportedOnce.add(sizeKey);
      const dia = it.hole.r * 2;
      if (dia < c.min_through_hole_diameter - 0.0002) {
        report(
          'hole_size',
          `Through-hole size (${dia.toFixed(4)} mm; min is ${c.min_through_hole_diameter.toFixed(4)} mm)`,
          [item(it)],
        );
      }
    }

    // 7) copper to board edge (edge-to-edge gap). Zone fills are EXEMPT:
    // KiCad's own pours sit at the zone's setback from the edge and its DRC
    // does not flag them (verified on the rd golden — its pour sits 0.1 mm
    // from the edge line against a 0.2 rule with no violation); the fill
    // engine's edge pullback governs zone copper, not this rule.
    if (edgePaths.length > 0 && c.min_copper_edge_clearance > 0) {
      for (const it of items) {
        if (it.kind === 'zone') continue;
        if (!nearPaths(it.bbox, edgeBbox, Math.ceil(c.min_copper_edge_clearance * NM))) continue;
        if (gapNm(it.paths, edgePaths) < c.min_copper_edge_clearance * NM - GEOM_TOL_NM) {
          report(
            'copper_edge_clearance',
            `Copper to board edge clearance (min is ${c.min_copper_edge_clearance.toFixed(4)} mm)`,
            [item(it)],
          );
        }
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

  // ------------------------------------------------------------------
  // connectivity (unconnected_items): union-find over ALL copper items of
  // every copper layer; through vias/pads were deduped by uuid so they
  // bridge layers. A net must form ONE connected component.
  //
  // SKIPPED for hatched boards: hatch line PHASE differs between fill
  // engines, so pieces/tracks can read connected in one engine and
  // isolated in the other (a track running parallel inside a void channel
  // touches no line). Solid pours are authoritative; hatched-board
  // connectivity stays with `typecad-pcb drc --kicad`.
  // ------------------------------------------------------------------
  if (!hasHatchedZones) {
    const allItems: CopperItem[] = [];
    const seenUuid = new Map<string, number>();
    for (const layer of copperLayers) {
      const layerItems = [
        ...collectLayerItems(root, layer, netCodeToName),
        ...collectZoneItems(root, layer, netCodeToName, fillCache),
      ];
      for (const it of layerItems) {
        if (it.uuid) {
          const prev = seenUuid.get(it.uuid);
          if (prev !== undefined) {
            // same physical via/pad seen on a sibling layer: keep one item
            // (same shape) and record BOTH layers so it bridges them
            const kept = allItems[prev]!;
            for (const l of it.layers) if (!kept.layers.includes(l)) kept.layers.push(l);
            continue;
          }
          seenUuid.set(it.uuid, allItems.length);
        }
        allItems.push(it);
      }
    }

    const parent = allItems.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]!;
        x = parent[x]!;
      }
      return x;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    const CONNECT_TOL_NM = 1000; // touching counts as connected (1µm)
    for (let i = 0; i < allItems.length; i++) {
      for (let j = i + 1; j < allItems.length; j++) {
        const A = allItems[i]!;
        const B = allItems[j]!;
        if (A.net !== B.net) continue;
        // layer-aware: items on disjoint layers can never connect in XY —
        // only a bridging via/pad (which carries both layers) unions them
        if (!A.layers.some((l) => B.layers.includes(l))) continue;
        if (!near(A, B, CONNECT_TOL_NM)) continue;
        if (pathsIntersect(A.paths, B.paths) || gapNm(A.paths, B.paths) <= CONNECT_TOL_NM) {
          union(i, j);
        }
      }
    }

    // components per net
    const byNetComponent = new Map<string, Map<number, number[]>>();
    allItems.forEach((it, i) => {
      if (it.net === null) return;
      const rootIdx = find(i);
      const perNet = byNetComponent.get(it.net) ?? new Map<number, number[]>();
      const list = perNet.get(rootIdx) ?? [];
      list.push(i);
      perNet.set(rootIdx, list);
      byNetComponent.set(it.net, perNet);
    });
    for (const [, components] of byNetComponent) {
      if (components.size < 2) continue;
      const groups = [...components.values()].sort((a, b) => b.length - a.length);
      const biggest = groups[0]!;
      const rest = groups.slice(1);
      // one entry per disconnected minor component, listing the two items
      // KiCad-style: [major component's first item, minor's first item]
      for (const minor of rest) {
        unconnected_items.push({
          description: 'Missing connection between items',
          items: [item(allItems[biggest[0]]!), item(allItems[minor[0]]!)],
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // non-copper: silkscreen + solder mask
  // ------------------------------------------------------------------
  for (const side of ['F', 'B'] as const) {
    // boards carry either legacy (F.SilkS) or modern (F.Silkscreen) names —
    // collect BOTH and merge (whichever is empty contributes nothing)
    const silkLegacy = collectSilkItems(root, `${side}.SilkS`, netCodeToName);
    const silkModern = collectSilkItems(root, `${side}.Silkscreen`, netCodeToName);
    const silk = {
      segments: [...silkLegacy.segments, ...silkModern.segments],
      texts: [...silkLegacy.texts, ...silkModern.texts],
    };
    const maskLayer = `${side}.Mask`;

    // silk vs board edge: ink edge to edge-line centerline
    const edgeSegs = collectEdgeSegments(root);
    for (const seg of silk.segments) {
      for (const e of edgeSegs) {
        const d = segSegMinDistNm(seg, e) - (seg.width / 2) * NM;
        if (d < c.min_silk_edge_clearance * NM - GEOM_TOL_NM) {
          report(
            'silk_edge_clearance',
            'Silkscreen clipped by board edge',
            [
              { description: 'Segment on Edge.Cuts', pos: e.pos },
              { description: `Segment of ${seg.ref ?? 'silkscreen'} on ${side === "F" ? "F.SilkS" : "B.SilkS"}`, pos: seg.pos },
            ],
          );
        }
      }
    }

    // silk overlapping silk (different footprint) or any text bbox
    for (let i = 0; i < silk.segments.length; i++) {
      const A = silk.segments[i]!;
      for (const t of silk.texts) {
        if (segIntersectsBboxNm(A, t.bboxNm)) {
          report(
            'silk_overlap',
            'Silkscreen clearance',
            [
              { description: `${A.ref ? `Segment of ${A.ref}` : 'Segment'} on ${side === "F" ? "F.SilkS" : "B.SilkS"}`, pos: A.pos },
              { description: `${t.ref ? `Reference field of ${t.ref}` : `Text "${t.text}"`} on ${side === "F" ? "F.SilkS" : "B.SilkS"}`, pos: t.pos },
            ],
          );
        }
      }
      for (let j = i + 1; j < silk.segments.length; j++) {
        const B = silk.segments[j]!;
        if (A.ref && A.ref === B.ref) continue; // same footprint: allowed
        const inkGap = segSegMinDistNm(A, B) - ((A.width + B.width) / 2) * NM;
        if (inkGap < 0.1 * NM) {
          report(
            'silk_overlap',
            'Silkscreen clearance',
            [
              { description: `${A.ref ? `Segment of ${A.ref}` : 'Segment'} on ${side === "F" ? "F.SilkS" : "B.SilkS"}`, pos: A.pos },
              { description: `${B.ref ? `Segment of ${B.ref}` : 'Segment'} on ${side === "F" ? "F.SilkS" : "B.SilkS"}`, pos: B.pos },
            ],
          );
        }
      }
    }

    // solder mask aperture bridging different-net copper: aperture = pad
    // shape on the mask layer; foreign copper touching/overlapping it
    // bridges the two nets' exposures
    const sideWord = side === 'F' ? 'Front' : 'Back';
    const copperItems = [
      ...collectLayerItems(root, `${side}.Cu`, netCodeToName),
      ...collectZoneItems(root, `${side}.Cu`, netCodeToName, fillCache),
    ];
    const apertures: Array<{ paths: Path[]; net: string | null; desc: string; pos: { x: number; y: number } }> = [];
    for (const fp of root.children('footprint')) {
      const fpAt = fp.child('at');
      const fx = scalar(fpAt!, 1, 0);
      const fy = scalar(fpAt!, 2, 0);
      const frot = scalar(fpAt!, 3, 0);
      const cosR = Math.cos((frot * Math.PI) / 180);
      const sinR = Math.sin((frot * Math.PI) / 180);
      const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
      const ref = String(refProp?.raw[2] ?? '?');
      for (const pad of fp.children('pad')) {
        const layersNode = pad.child('layers');
        const layers = layersNode ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string') : [];
        if (!layers.includes(maskLayer) && !layers.includes('*.Mask')) continue;
        const at = pad.child('at')!;
        const lx = scalar(at, 1, 0);
        const ly = scalar(at, 2, 0);
        const angle = scalar(at, 3, 0);
        const wx = fx + lx * cosR + ly * sinR;
        const wy = fy - lx * sinR + ly * cosR;
        const net = netNameOf(pad, netCodeToName);
        const padNum = String(pad.raw[1] ?? '');
        const thru = String(pad.raw[2] ?? '').startsWith('thru');
        // the item description names the pad's COPPER layer (kicad-cli does
        // not rebrand mask apertures to the mask layer name)
        const desc = thru
          ? `PTH pad ${padNum} [${fmtNet(net)}] of ${ref}`
          : `Pad ${padNum} [${fmtNet(net)}] of ${ref} on ${side}.Cu`;
        for (const part of padShapeObstacles(pad, wx, wy, angle)) {
          for (const p of obstaclePaths(part)) {
            apertures.push({
              paths: [p],
              net,
              desc,
              pos: { x: wx, y: wy },
            });
          }
        }
      }
    }
    for (const ap of apertures) {
      for (const cop of copperItems) {
        if (netsEqual(ap.net, cop.net)) continue; // an item never bridges itself
        if (!nearBboxes(bboxOfPaths(ap.paths), cop.bbox, 0)) continue;
        if (pathsIntersect(ap.paths, cop.paths)) {
          report(
            'solder_mask_bridge',
            `${sideWord} solder mask aperture bridges items with different nets`,
            [item(cop), { description: ap.desc, pos: ap.pos }],
          );
        }
      }
    }

    // mask web: the solder mask BETWEEN two apertures below the fab's web
    // minimum chips away (fabs silently enlarge openings instead). Pairwise
    // aperture gap — the web is mask material, i.e. OUTSIDE the aperture
    // union, so a width scan of the union itself would find nothing.
    if (c.min_mask_web > 0) {
      for (let i = 0; i < apertures.length; i++) {
        for (let j = i + 1; j < apertures.length; j++) {
          const A = apertures[i]!;
          const B = apertures[j]!;
          // same physical pad (multi-part customs share the pad position)
          if (A.pos.x === B.pos.x && A.pos.y === B.pos.y) continue;
          if (!nearBboxes(bboxOfPaths(A.paths), bboxOfPaths(B.paths), Math.ceil(c.min_mask_web * NM))) continue;
          if (pathsIntersect(A.paths, B.paths)) continue; // merged openings
          if (gapNm(A.paths, B.paths) < c.min_mask_web * NM - GEOM_TOL_NM) {
            report(
              'mask_web',
              `${sideWord} solder mask web below ${c.min_mask_web.toFixed(4)} mm between nearby apertures`,
              [
                { description: A.desc, pos: A.pos },
                { description: B.desc, pos: B.pos },
              ],
            );
          }
        }
      }
    }

    // courtyard overlap: placement collisions between footprints
    const courtyards = collectCourtyards(root, side, netCodeToName);
    for (let i = 0; i < courtyards.length; i++) {
      for (let j = i + 1; j < courtyards.length; j++) {
        const A = courtyards[i]!;
        const B = courtyards[j]!;
        if (!nearBboxes(A.bbox, B.bbox, 0)) continue;
        if (pathsIntersect(A.paths, B.paths)) {
          report(
            'courtyard_overlap',
            `Courtyard overlap (${A.ref} and ${B.ref})`,
            [
              { description: `Footprint ${A.ref}`, pos: { x: A.bbox.minX / NM, y: A.bbox.minY / NM } },
              { description: `Footprint ${B.ref}`, pos: { x: B.bbox.minX / NM, y: B.bbox.minY / NM } },
            ],
          );
        }
      }
    }

    // silk text manufacturability (height/thickness) + silk over mask
    // openings (clipped by exposed copper at fab)
    const silkName = side === 'F' ? 'F.SilkS' : 'B.SilkS';
    for (const t of silk.texts) {
      if (t.height > 0 && t.height < c.min_silk_text_height - 1e-9) {
        report(
          'text_height',
          `Text height (${t.height.toFixed(4)} mm; min is ${c.min_silk_text_height.toFixed(4)} mm)`,
          [{ description: `${t.ref ? `Text of ${t.ref}` : `Text "${t.text}"`} on ${silkName}`, pos: t.pos }],
        );
      }
      if (t.thickness > 0 && t.thickness < c.min_silk_text_thickness - 1e-9) {
        report(
          'text_thickness',
          `Text thickness (${t.thickness.toFixed(4)} mm; min is ${c.min_silk_text_thickness.toFixed(4)} mm)`,
          [{ description: `${t.ref ? `Text of ${t.ref}` : `Text "${t.text}"`} on ${silkName}`, pos: t.pos }],
        );
      }
    }
    for (const seg of silk.segments) {
      for (const ap of apertures) {
        if (!nearBboxes(
          { minX: Math.round(Math.min(...seg.pts.map((p) => p[0])) * NM), maxX: Math.round(Math.max(...seg.pts.map((p) => p[0])) * NM), minY: Math.round(Math.min(...seg.pts.map((p) => p[1])) * NM), maxY: Math.round(Math.max(...seg.pts.map((p) => p[1])) * NM) },
          bboxOfPaths(ap.paths),
          Math.ceil((seg.width / 2) * NM),
        )) continue;
        if (polylineToPathGapNm(seg, ap.paths) < (seg.width / 2) * NM - GEOM_TOL_NM) {
          report(
            'silk_over_mask',
            'Silkscreen overlaps a solder mask opening (will be clipped)',
            [
              { description: `Segment of ${seg.ref ?? 'silkscreen'} on ${silkName}`, pos: seg.pos },
              { description: ap.desc, pos: ap.pos },
            ],
          );
        }
      }
    }
  }

  // footprints without any courtyard (ignore-by-default: most typeCAD
  // footprint sources ship without them — promote when they matter)
  {
    const withCourtyard = new Set<string>();
    for (const side of ['F', 'B'] as const) {
      for (const cy of collectCourtyards(root, side, netCodeToName)) withCourtyard.add(cy.ref);
    }
    for (const fp of root.children('footprint')) {
      const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
      const ref = String(refProp?.raw[2] ?? '?');
      if (withCourtyard.has(ref)) continue;
      report(
        'missing_courtyard',
        `Footprint ${ref} has no courtyard defined`,
        [{ description: `Footprint ${ref}`, pos: atPoint(fp.child('at')) }],
      );
    }
  }

  // ------------------------------------------------------------------
  // DFM: board outline integrity (closure + self-intersection) — the fill
  // engine silently skips edge pullback when the chain fails, so surface it
  // ------------------------------------------------------------------
  {
    const hasEdgeItems = root.children().some(
      (n) => n.name.startsWith('gr_') && String(n.child('layer')?.raw[1] ?? '') === 'Edge.Cuts',
    );
    if (hasEdgeItems) {
      const outline = chainEdgeOutline(root);
      if (outline.length < 3) {
        report(
          'edge_not_closed',
          'Board outline (Edge.Cuts) does not form a closed loop',
          [{ description: 'Edge.Cuts outline', pos: { x: 0, y: 0 } }],
        );
      } else if (pathSelfIntersectsNm(outline)) {
        report(
          'edge_self_intersection',
          'Board outline (Edge.Cuts) self-intersects',
          [{ description: 'Edge.Cuts outline', pos: { x: outline[0]!.X / NM, y: outline[0]!.Y / NM } }],
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // DFM: dangling tracks, hole-to-edge, drill aspect ratio, acid traps,
  // via-in-pad (advisory warnings; substrate = per-layer collectors)
  // ------------------------------------------------------------------
  for (const layer of copperLayers) {
    const items = [
      ...collectLayerItems(root, layer, netCodeToName),
      ...collectZoneItems(root, layer, netCodeToName, fillCache),
    ];
    // DFM substrate: structural copper only — a hatched pour's strokes are
    // intentionally narrow, angled geometry whose junctions are sub-process
    // features, not fab-hostile defects (acid_trap and copper_sliver)
    const structuralItems = items.filter((it) => !(it.kind === 'zone' && it.hatched));

    // dangling track ends: an endpoint touching no same-net copper other
    // than its own segment
    for (const it of items) {
      if (it.kind !== 'track' || !it.centerline) continue;
      const ends = [it.centerline[0]!, it.centerline[it.centerline.length - 1]!];
      for (const end of ends) {
        let connected = false;
        for (const other of items) {
          if (other === it) continue;
          if (other.net !== it.net) continue;
          if (!other.layers.includes(layer) && other.kind !== 'via' && other.kind !== 'pad') continue;
          if (!nearBboxes(
            { minX: Math.round((end[0] * NM) - 2000), maxX: Math.round(end[0] * NM + 2000), minY: Math.round(end[1] * NM - 2000), maxY: Math.round(end[1] * NM + 2000) },
            other.bbox,
            0,
          )) continue;
          const ex = end[0] * NM;
          const ey = end[1] * NM;
          if (
            pointPathsGapNm(ex, ey, other.paths) <= 2000 ||
            (other.paths[0] !== undefined && pointInPathNm(other.paths[0], ex, ey))
          ) {
            connected = true;
            break;
          }
        }
        if (!connected) {
          report(
            'track_dangling',
            'Track has an unconnected end',
            [{ description: it.description, pos: { x: end[0], y: end[1] } }],
          );
          break; // one report per track (KiCad reports per segment)
        }
      }
    }

    // hole-to-edge + drill aspect ratio (once per hole position)
    for (const it of items) {
      if (!it.hole) continue;
      const key = `hedge:${it.hole.x.toFixed(4)}:${it.hole.y.toFixed(4)}`;
      if (reportedOnce.has(key)) continue;
      reportedOnce.add(key);
      if (edgePaths.length > 0 && c.min_hole_edge_clearance > 0) {
        if (circleGapNm(Math.round(it.hole.x * NM), Math.round(it.hole.y * NM), Math.round(it.hole.r * NM), edgePaths) < c.min_hole_edge_clearance * NM - GEOM_TOL_NM) {
          report(
            'hole_edge_clearance',
            `Hole to board edge clearance (min is ${c.min_hole_edge_clearance.toFixed(4)} mm)`,
            [item(it)],
          );
        }
      }
      if (thickness > 0 && c.max_drill_aspect_ratio > 0) {
        const dia = it.hole.r * 2;
        if (dia > 0 && thickness / dia > c.max_drill_aspect_ratio + 1e-9) {
          report(
            'drill_aspect_ratio',
            `Drill aspect ratio (${(thickness / dia).toFixed(2)}; max is ${c.max_drill_aspect_ratio.toFixed(2)})`,
            [item(it)],
          );
        }
      }
    }

    // acid traps: acute interior angles in UNIONED per-net copper — the
    // wedge forms where two touching items meet, never inside one capsule.
    // Hatch strokes are excluded (structural copper only): their clipped
    // line ends and spoke/pad junctions are sub-process-feature wedges by
    // design and would otherwise swamp the check on every hatched pour
    if (c.min_copper_angle_deg > 0) {
      const minCos = Math.cos((c.min_copper_angle_deg * Math.PI) / 180);
      for (const [net, unioned] of unionedCopperByNet(structuralItems)) {
        for (const poly of unioned) {
          const n = poly.length;
          if (n < 3) continue;
          for (let k = 0; k < n; k++) {
            const prev = poly[(k + n - 1) % n]!;
            const v = poly[k]!;
            const next = poly[(k + 1) % n]!;
            const e1 = Math.hypot(v.X - prev.X, v.Y - prev.Y);
            const e2 = Math.hypot(next.X - v.X, next.Y - v.Y);
            // skip degenerate/tessellation vertices
            if (e1 < 50000 || e2 < 50000) continue;
            const ux = (v.X - prev.X) / e1, uy = (v.Y - prev.Y) / e1;
            const wx = (next.X - v.X) / e2, wy = (next.Y - v.Y) / e2;
            const dot = ux * wx + uy * wy;
            // interior(v) = 180° − angle(u, w): straight run dot=+1 → 180°,
            // acute wedge dot→−1 → ~0°. Skip the wide side (interior ≥ 90°).
            if (dot >= 0) continue;
            const cosInt = -dot;
            if (cosInt > minCos) {
              report(
                'acid_trap',
                `Acid trap (copper angle ≈ ${(Math.acos(Math.min(1, Math.max(-1, cosInt))) * 180 / Math.PI).toFixed(0)}° < ${c.min_copper_angle_deg}°)`,
                [{ description: `Copper of net ${net} on ${layer}`, pos: { x: v.X / NM, y: v.Y / NM } }],
              );
              break; // one report per polygon
            }
          }
        }
      }
    }

    // via-in-pad: same-net via centered inside an SMD pad (assembly wicking)
    if (c.via_in_pad_exempt_radius > 0) {
      const smdPads = items.filter((it) => it.kind === 'pad');
      for (const via of items) {
        if (via.kind !== 'via') continue;
        if (via.hole && via.hole.r * 2 <= c.via_in_pad_exempt_radius) continue; // micro/fillable
        const vx = Math.round(via.pos.x * NM);
        const vy = Math.round(via.pos.y * NM);
        for (const pad of smdPads) {
          if (pad.net === null || pad.net !== via.net) continue;
          if (!nearBboxes(via.bbox, pad.bbox, 0)) continue;
          const outer = pad.paths[0];
          if (!outer) continue;
          if (pointInPathNm(outer, vx, vy)) {
            report(
              'via_in_pad',
              'Via placed inside an SMD pad (wicking risk; tent or relocate)',
              [item(via), item(pad)],
            );
            break;
          }
        }
      }
    }

    // copper slivers: same-net unioned copper narrower than the fab can
    // hold. Thermal spoke roots are intentionally narrow — exempt
    // fragments centered near a same-net pad. Hatched pour strokes are
    // excluded from the union (see structuralItems): their narrowness is
    // the design intent, and the opening over ~1k hatch islands per layer
    // is what made DRC take minutes.
    if (c.min_copper_sliver_width > 0) {
      const padCenters = items
        .filter((it) => it.kind === 'pad' && it.net !== null)
        .map((it) => ({ x: Math.round(it.pos.x * NM), y: Math.round(it.pos.y * NM), net: it.net! }));
      for (const [net, unioned] of unionedCopperByNet(structuralItems)) {
        // 0.01 mm² floor: pours clip line ends into sub-thickness
        // TIPS (triangular, ares ≪ width×length) — inherent to the format,
        // reported only when substantial; silence via conf if unwanted
        for (const frag of narrowRegions(unioned, Math.round(c.min_copper_sliver_width * NM), 1e10)) {
          let cx = 0;
          let cy = 0;
          for (const v of frag.path) {
            cx += v.X;
            cy += v.Y;
          }
          cx /= frag.path.length;
          cy /= frag.path.length;
          const nearSpokeRoot = padCenters.some(
            (pc) => pc.net === net && Math.hypot(pc.x - cx, pc.y - cy) < 1.2 * NM,
          );
          if (nearSpokeRoot) continue;
          report(
            'copper_sliver',
            `Copper sliver (width < ${c.min_copper_sliver_width.toFixed(4)} mm; ${(frag.areaNm2 / (NM * NM)).toFixed(4)} mm² fragment)`,
            [{ description: `Copper of net ${net} on ${layer}`, pos: { x: cx / NM, y: cy / NM } }],
          );
        }
      }
    }

    // thermal spoke resolution: count resolved spokes per same-net pad by
    // ray-sampling the zone fill copper along the four spoke directions
    // (solid boards only — hatched pours defer like connectivity)
    if (!hasHatchedZones && c.min_resolved_spokes > 0) {
      const zoneOuters: Path[] = [];
      let thermalGapNm = 0.5 * NM; // zone's declared gap (first zone on layer)
      for (const zone of root.children('zone')) {
        const layersNode = zone.child('layers') ?? zone.child('layer');
        const names = layersNode ? layersNode.raw.slice(1).filter((v): v is string => typeof v === 'string') : [];
        if (!names.includes(layer)) continue;
        const gapNode = zone.child('fill')?.child('thermal_gap');
        if (gapNode) thermalGapNm = Math.round(scalar(gapNode, 1, 0.5) * NM);
        break;
      }
      for (const it of items) {
        if (it.kind !== 'zone' || !it.paths[0]) continue;
        zoneOuters.push(it.paths[0]!);
      }
      if (zoneOuters.length > 0) {
        for (const it of items) {
          if (it.kind !== 'pad' || it.net === null) continue;
          const px = Math.round(it.pos.x * NM);
          const py = Math.round(it.pos.y * NM);
          // per-axis pad extent (a rect's axis edge, not its corner reach)
          let extX = 0;
          let extY = 0;
          for (const v of it.paths[0] ?? []) {
            extX = Math.max(extX, Math.abs(v.X - px));
            extY = Math.max(extY, Math.abs(v.Y - py));
          }
          if (extX === 0 && extY === 0) continue;
          // a spoke is RESOLVED when pour copper continues past the thermal
          // void edge — sampling ON the axis inside the void would hit the
          // spoke stub itself and always read connected
          let resolved = 0;
          for (let q = 0; q < 4; q++) {
            const axisExtent = q % 2 === 0 ? extX : extY; // E/W use X, N/S use Y
            const voidEdge = axisExtent + thermalGapNm;
            let inside = 0;
            for (const off of [0.05, 0.12, 0.2]) {
              const t = voidEdge + off * NM;
              const sx = px + Math.round(Math.cos((q * Math.PI) / 2) * t);
              const sy = py + Math.round(Math.sin((q * Math.PI) / 2) * t);
              if (zoneOuters.some((zo) => pointInPathNm(zo, sx, sy))) inside++;
            }
            if (inside >= 2) resolved++;
          }
          if (resolved < c.min_resolved_spokes) {
            report(
              'min_resolved_spokes',
              `Thermal relief resolves ${resolved} spokes (min ${c.min_resolved_spokes}) — pad effectively isolated from the pour`,
              [item(it)],
            );
          }
        }
      }
    }
  }

  return { violations, unconnected_items };
}

function item(i: CopperItem): DrcViolation['items'][number] {
  return { description: i.description, pos: i.pos, ...(i.uuid ? { uuid: i.uuid } : {}) };
}
