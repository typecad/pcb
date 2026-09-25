/**
 * Fritzing-inspired component overlay, drawn purely from gerber data plus
 * (optionally) netlist metadata. Two orthogonal decisions drive every glyph:
 *
 *  - GEOMETRY (PackageKind): which archetype to draw — decided by the
 *    footprint name when the netlist provides one, otherwise by the pad
 *    topology, with a generic body as the universal fallback.
 *  - SEMANTICS (SemanticKind): how to color and decorate it — decided by the
 *    reference prefix (R/C/L/D/LED/...) and the netlist value (resistor
 *    color bands).
 *
 * Everything is flat 2D top-view shapes in theme colors: no part library,
 * no lighting, no perspective.
 */
import { evaluateAperture } from '../gerber/apertures.js';
import { fmt, rotatePoint } from '../gerber/geometry.js';
import type { GerberImage, Point } from '../gerber/types.js';
import { contourPoints, stitchBoardOutline } from './outline.js';
import {
  classifyPackageFromName,
  resistorBands,
  semanticFromRef,
  TOLERANCE_BAND,
  type PackageKind,
  type SemanticKind,
} from './packages.js';
import type { Bounds, RenderLayer } from './svg.js';
import type { PcbaTheme } from './theme.js';

export interface ComponentPad {
  at: Point;
  pin: string;
  shape: 'circle' | 'rect' | 'obround' | 'polygon' | 'other';
  w: number;
  h: number;
  hole: number | null;
  /** the drilled hole this pad passes through, matched from the drill layer */
  drill: { at: Point; diameter: number } | null;
}

export type ComponentKind = PackageKind;

/** Netlist metadata for one reference (either field optional). */
export interface NetlistComponent {
  footprint?: string;
  value?: string;
}

export interface BoardComponent {
  ref: string;
  kind: ComponentKind;
  semantic: SemanticKind;
  pads: ComponentPad[];
  throughHole: boolean;
  /** axis-aligned pads bbox in the gerber frame */
  bbox: Bounds;
  /** body orientation in degrees (PCA of the pad layout, y-up frame) */
  angle: number;
  /**
   * package body dimensions from the footprint name (netlist), oriented to
   * the local frame: w along local x, h along local y. Null when the name
   * carries no dimensions.
   */
  bodyDims: { w: number; h: number } | null;
  /** netlist value ("1kohm") — drives resistor color bands */
  value?: string;
  /**
   * exact package body outline from the Fab layer, if one was assigned to
   * this component: a closed polygon in the LOCAL frame (rotated/translated
   * like the pads), preserving quirks like the pin-1 chamfered corner
   */
  fabContour: Point[] | null;
}

export interface ComponentLabel {
  ref: string;
  x: number;
  y: number;
  size: number;
}

export interface ComponentRender {
  /** svg fragment in the gerber frame (inside the y-flip group) */
  glyphs: string;
  /** refdes labels in gerber-frame coordinates (caller maps to the view) */
  labels: ComponentLabel[];
  /** drawn component glyphs (kind !== 'skip') */
  count: number;
}

interface LocalPad {
  pad: ComponentPad;
  at: Point;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * File units per authored-mm constant: coordinates stay in file units, so a
 * constant written in mm must be scaled down for inch files (mm / 25.4).
 */
function mmFactor(units: 'mm' | 'in'): number {
  return units === 'in' ? 1 / 25.4 : 1;
}

function padOf(flash: Extract<import('../gerber/types.js').DrawOp, { type: 'flash' }>, img: GerberImage): ComponentPad {
  const S = mmFactor(img.units);
  const def = img.apertures.get(flash.aperture);
  const ap = def ? evaluateAperture(def, img.macros) : null;
  const t = ap?.template ?? null;
  if (t) {
    const shape: ComponentPad['shape'] =
      t.kind === 'circle' ? 'circle' : t.kind === 'polygon' ? 'polygon' : t.kind;
    const w = t.kind === 'circle' ? t.diameter : t.kind === 'polygon' ? t.outerDiameter : t.width;
    const h = t.kind === 'circle' ? t.diameter : t.kind === 'polygon' ? t.outerDiameter : t.height;
    return { at: flash.at, pin: flash.pin ?? '', shape, w, h, hole: t.hole ? t.hole.diameter : null, drill: null };
  }
  if (ap) {
    // macro aperture (KiCad RoundRect pads): no template, but the evaluated
    // primitives give the real outer extent
    return {
      at: flash.at,
      pin: flash.pin ?? '',
      shape: 'rect',
      w: 2 * (ap.extent.rx || 0.15 * S),
      h: 2 * (ap.extent.ry || 0.15 * S),
      hole: null,
      drill: null,
    };
  }
  return { at: flash.at, pin: flash.pin ?? '', shape: 'other', w: 0.3 * S, h: 0.3 * S, hole: null, drill: null };
}

/** Group the chosen side's pad flashes by %TO.P reference into components. */
export function extractComponents(
  layers: RenderLayer[],
  side: 'front' | 'back',
  netlist: Record<string, NetlistComponent> = {},
): { components: BoardComponent[]; warnings: string[] } {
  const warnings: string[] = [];
  const S = mmFactor(layers[0]?.image.units ?? 'mm');
  const coppers = layers.filter((l) => l.info.kind === 'copper' && l.info.side === side);
  const oppositeRefs = new Set<string>();
  for (const layer of layers) {
    if (layer.info.kind !== 'copper' || layer.info.side === side) continue;
    const img = layer.image;
    if (!('ops' in img)) continue;
    for (const op of img.ops) {
      if (op.type === 'flash' && op.ref) oppositeRefs.add(op.ref);
    }
  }

  const byRef = new Map<string, ComponentPad[]>();
  const seen = new Set<string>(); // dedupe identical (ref,x,y) pads across files
  for (const layer of coppers) {
    const img = layer.image;
    if (!('ops' in img)) continue;
    for (const op of img.ops) {
      if (op.type !== 'flash' || !op.ref) continue;
      const key = `${op.ref}@${fmt(op.at.x)},${fmt(op.at.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pads = byRef.get(op.ref) ?? [];
      pads.push(padOf(op, img));
      byRef.set(op.ref, pads);
    }
  }

  if (byRef.size === 0) {
    warnings.push('no X2 component attributes (%TO.P) found on the copper layers — component overlay skipped');
    return { components: [], warnings };
  }

  const components: BoardComponent[] = [];
  for (const [ref, pads] of byRef) {
    const centroid = {
      x: pads.reduce((s, p) => s + p.at.x, 0) / pads.length,
      y: pads.reduce((s, p) => s + p.at.y, 0) / pads.length,
    };
    const rawAngle = principalAngle(pads.map((p) => p.at));
    const throughHole = oppositeRefs.has(ref);
    const semantic = semanticFromRef(ref);
    const meta = netlist[ref];
    // 1) footprint name (netlist mode), 2) pad topology, 3) generic
    const named = meta?.footprint ? classifyPackageFromName(meta.footprint) : null;
    let kind = named ?? classifyTopology(pads, rawAngle, centroid, throughHole, semantic, S);
    // odd through-hole patterns have no honest top-view glyph
    if (throughHole && (kind === 'qfn' || kind === 'qfp' || kind === 'generic')) kind = 'skip';
    const angle = normalizeAngle(pads, rawAngle, kind, centroid, S);
    components.push({
      ref,
      kind,
      semantic,
      pads,
      throughHole,
      bbox: boundsOf(pads.map((p) => p.at)),
      angle,
      bodyDims: meta?.footprint ? footprintBodyDims(meta.footprint) : null,
      value: meta?.value,
      fabContour: null,
    });
  }
  components.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  assignFabOutlines(components, layers, side);
  assignDrillHoles(components, layers);
  return { components, warnings };
}

/**
 * Match every pad to the drilled hole it passes through: TH pins anchor at
 * their hole (position + diameter) so the glyph can draw pins that reach
 * the board's own drill dots. Holes match by proximity — KiCad drills are
 * centered on their pads.
 */
function assignDrillHoles(components: BoardComponent[], layers: RenderLayer[]): void {
  const S = mmFactor(layers[0]?.image.units ?? 'mm');
  const drills: Array<{ at: Point; diameter: number }> = [];
  for (const layer of layers) {
    const img = layer.image;
    if (!('holes' in img)) continue;
    for (const hole of img.holes) {
      const diameter = img.tools.get(hole.tool)?.diameter ?? 0;
      if (diameter > 0) drills.push({ at: hole.at, diameter });
    }
    for (const slot of img.slots) {
      const diameter = img.tools.get(slot.tool)?.diameter ?? 0;
      if (diameter > 0) {
        drills.push({ at: slot.from, diameter });
        drills.push({ at: slot.to, diameter });
      }
    }
  }
  if (drills.length === 0) return;
  // bucket drills into a coarse grid (cell = the largest pad reach) so the
  // per-pad nearest scan probes 3x3 cells instead of every drill — dense
  // boards are thousands of pads against tens of thousands of holes
  const reachOf = (pad: ComponentPad): number => Math.max(Math.min(pad.w, pad.h) * 0.75, 0.5 * S);
  let cell = 0;
  for (const comp of components) for (const pad of comp.pads) cell = Math.max(cell, reachOf(pad));
  if (cell <= 0) return;
  const buckets = new Map<string, Array<{ at: Point; diameter: number }>>();
  for (const drill of drills) {
    const key = `${Math.floor(drill.at.x / cell)},${Math.floor(drill.at.y / cell)}`;
    const list = buckets.get(key) ?? [];
    list.push(drill);
    buckets.set(key, list);
  }
  for (const comp of components) {
    for (const pad of comp.pads) {
      const reach = reachOf(pad);
      let best: { at: Point; diameter: number } | null = null;
      let bestDist = reach;
      const cx = Math.floor(pad.at.x / cell);
      const cy = Math.floor(pad.at.y / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const drill of buckets.get(`${gx},${gy}`) ?? []) {
            const d = Math.hypot(drill.at.x - pad.at.x, drill.at.y - pad.at.y);
            if (d < bestDist) {
              bestDist = d;
              best = drill;
            }
          }
        }
      }
      pad.drill = best;
    }
  }
}

/**
 * Exact body outlines from the Fab layer: each fab op is assigned to the
 * nearest component centroid (within half its pad span + 4mm), the group is
 * stitched into closed contours, and the largest contour becomes the body
 * polygon — value-text strokes and pin marks lose on area. KiCad draws the
 * package outline on Fab (including orientation quirks like QFN pin-1
 * chamfers), so this sizes bodies exactly where the land pattern pads
 * extend past the package.
 */
function assignFabOutlines(components: BoardComponent[], layers: RenderLayer[], side: 'front' | 'back'): void {
  const fab = layers.find((l) => l.info.kind === 'fab' && l.info.side === side);
  if (!fab || components.length === 0) return;
  const img = fab.image;
  if (!('ops' in img)) return;
  const S = mmFactor(img.units);

  const targets = components.map((comp) => {
    const centroid = {
      x: comp.pads.reduce((s, p) => s + p.at.x, 0) / comp.pads.length,
      y: comp.pads.reduce((s, p) => s + p.at.y, 0) / comp.pads.length,
    };
    const span = Math.max(comp.bbox.maxX - comp.bbox.minX, comp.bbox.maxY - comp.bbox.minY);
    // bodies can overhang their pads substantially (terminal blocks extend
    // past the pins on the wire side), so reach well beyond the land pattern
    return { comp, centroid, radius: span / 2 + 4 * S };
  });

  const opCenter = (op: (typeof img.ops)[number]): Point => {
    if (op.type === 'flash') return op.at;
    if (op.type === 'trace') {
      const pts = [op.from, ...op.segments.map((s) => s.to)];
      return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    }
    const pts = op.contours.flatMap((c) => [c.start, ...c.segments.map((s) => s.to)]);
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  };

  const groups = new Map<number, typeof img.ops>();
  for (let i = 0; i < img.ops.length; i++) {
    const center = opCenter(img.ops[i]!);
    let best = -1;
    let bestDist = Infinity;
    for (let t = 0; t < targets.length; t++) {
      const d = Math.hypot(center.x - targets[t]!.centroid.x, center.y - targets[t]!.centroid.y);
      if (d < bestDist && d <= targets[t]!.radius) {
        best = t;
        bestDist = d;
      }
    }
    if (best >= 0) {
      const list = groups.get(best) ?? [];
      list.push(img.ops[i]!);
      groups.set(best, list);
    }
  }

  for (const [index, ops] of groups) {
    if (ops.length === 0) continue;
    const { comp, centroid } = targets[index]!;
    const stitched = stitchBoardOutline({ info: fab.info, image: { ...img, ops } }, null, img.units);
    let bestPts: Point[] | null = null;
    let bestArea = 0;
    for (const contour of stitched?.contours ?? []) {
      const pts = contourPoints(contour);
      const b = boundsOf(pts);
      const area = (b.maxX - b.minX) * (b.maxY - b.minY);
      if (area > bestArea) {
        bestArea = area;
        bestPts = pts;
      }
    }
    if (!bestPts) continue;
    // sanity: the body outline must be at least half the pad land pattern on
    // both axes — pin-1 marks and stray loops must not win when the real
    // outline failed to chain
    const toLocal = (p: Point): Point => {
      const r = rotatePoint(p, -comp.angle, centroid);
      return { x: r.x - centroid.x, y: r.y - centroid.y };
    };
    const localPts = bestPts.map(toLocal);
    const fb = boundsOf(localPts);
    const padSpanX = comp.bbox.maxX - comp.bbox.minX;
    const padSpanY = comp.bbox.maxY - comp.bbox.minY;
    if (fb.maxX - fb.minX < padSpanX * 0.5 || fb.maxY - fb.minY < padSpanY * 0.5) continue;
    if (bestArea < 0.05 * S * S) continue; // nothing body-sized
    comp.fabContour = localPts;
  }
}

function boundsOf(points: Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Orientation of the pad layout via PCA, snapped to 90° when near-axis. */
function principalAngle(points: Point[]): number {
  if (points.length < 2) return 0;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of points) {
    xx += (p.x - cx) * (p.x - cx);
    xy += (p.x - cx) * (p.y - cy);
    yy += (p.y - cy) * (p.y - cy);
  }
  const deg = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
  const normalized = ((deg % 180) + 180) % 180; // 0..180
  for (const axis of [0, 90]) {
    if (Math.abs(normalized - axis) <= 7 || Math.abs(normalized - axis - 180) <= 7) {
      return axis;
    }
  }
  return normalized;
}

/** Cluster 1-D values into groups within `tol` of each other. */
function clusterRows(values: number[], tol: number): number[][] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(v - g[0]!) <= tol) g.push(v);
    else groups.push([v]);
  }
  return groups;
}

/**
 * Package archetype from the pad pattern alone (no footprint name):
 * two pads → chip/axial, two rows → soic/dip/sot, a single row of
 * through-hole rounds → header, perimeter ring → qfn, else generic.
 */
function classifyTopology(
  pads: ComponentPad[],
  angle: number,
  centroid: Point,
  throughHole: boolean,
  semantic: SemanticKind,
  S: number,
): PackageKind {
  if (pads.length <= 1) return 'skip'; // test point / fiducial
  const small = Math.min(...pads.map((p) => Math.min(p.w, p.h)));
  const mounting = pads.every((p) => p.hole !== null && p.hole >= 0.7 * Math.min(p.w, p.h)) && pads.length <= 4;
  if (mounting) return 'skip'; // mounting hole — the drill punches it

  // drop center exposed pads: they describe no package outline (a perfectly
  // collinear row has a zero axis span — nothing to center on, keep all)
  const centers = pads.map((p) => p.at);
  const all = boundsOf(centers);
  const minSpan = Math.min(all.maxX - all.minX, all.maxY - all.minY);
  const mid = { x: (all.minX + all.maxX) / 2, y: (all.minY + all.maxY) / 2 };
  const shape =
    minSpan > 1e-9
      ? pads.filter(
          (p) => !(Math.hypot(p.at.x - mid.x, p.at.y - mid.y) <= 0.25 * minSpan && Math.min(p.w, p.h) >= 0.35 * minSpan),
        )
      : pads;
  const analysis = shape.length >= 2 ? shape : pads;

  if (analysis.length === 2) {
    if (throughHole) {
      // semantics disambiguate 2-pad TH parts without a footprint name
      if (semantic === 'capacitor') return 'radial';
      if (semantic === 'led') return 'dome';
      if (semantic === 'switch') return 'slide';
      if (semantic === 'connector') return 'header';
      return 'axial';
    }
    // a Y/X reference on a 2-pad part is a crystal even without a netlist
    if (semantic === 'crystal') return 'crystal';
    return 'chip';
  }

  const locals = analysis.map((p) => rotatePoint(p.at, -angle, centroid));
  const xs = locals.map((p) => p.x);
  const ys = locals.map((p) => p.y);
  const rowTol = Math.max(0.35 * S, small * 0.8);

  const yRows = clusterRows(ys, rowTol);
  const xRows = clusterRows(xs, rowTol);

  if (yRows.length === 2 || xRows.length === 2) {
    if (throughHole) return 'dip';
    const counts = yRows.length === 2 ? yRows.map((r) => r.length) : xRows.map((r) => r.length);
    // small transistors: SOT-23 (2+1), SOT-23-5 (3+2), SOT-23-6 (3+3)
    if (Math.max(...counts) <= 3 && analysis.length <= 6) return 'sot';
    return 'soic';
  }
  if ((yRows.length === 1 || xRows.length === 1) && throughHole) {
    // single-row TH with a telling reference: trimmer pot, slide switch,
    // rotary encoder — otherwise a pin header
    if (analysis.length === 3 && semantic === 'potentiometer') return 'trimmer';
    if (analysis.length === 3 && semantic === 'switch') return 'slide';
    if (analysis.length >= 5 && semantic === 'switch') return 'rotary';
    return 'header'; // single-row TH
  }

  // perimeter pads with an empty center → leadless or gull-wing quad
  // package (a QFP's pad lattice also looks like a grid, so this check must
  // come first — ball arrays always have interior pads)
  if (analysis.length >= 4) {
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const fx = Math.max((maxX - minX) * 0.22, rowTol);
    const fy = Math.max((maxY - minY) * 0.22, rowTol);
    const onPerimeter = locals.every((p) => p.x <= minX + fx || p.x >= maxX - fx || p.y <= minY + fy || p.y >= maxY - fy);
    if (onPerimeter) {
      // long protruding pads are gull wings (QFP); short flush ones are
      // leadless (QFN) — measurable without the footprint name
      const padLong = median(analysis.map((p) => Math.max(p.w, p.h)));
      return padLong >= 1.0 * S ? 'qfp' : 'qfn';
    }
  }

  // a fine grid of many small pads with interiors (>= 4 rows and columns)
  // → ball array
  if (analysis.length >= 16 && yRows.length >= 4 && xRows.length >= 4) return 'bga';

  return 'generic';
}

/**
 * Normalize the PCA angle so glyph math can assume one frame: chips and
 * row parts (headers, crystals, axial) spread along local x; dual-row ICs
 * separate their rows along local y.
 */
function normalizeAngle(pads: ComponentPad[], angle: number, kind: PackageKind, centroid: Point, S: number): number {
  const rowKinds: PackageKind[] = ['soic', 'dip', 'sot'];
  const spreadKinds: PackageKind[] = ['chip', 'axial', 'header', 'terminal', 'crystal', 'to', 'radial', 'dome', 'trimmer', 'slide'];
  const locals = pads.map((p) => rotatePoint(p.at, -angle, centroid));
  const small = Math.min(...pads.map((p) => Math.min(p.w, p.h)));
  const rowTol = Math.max(0.35 * S, small * 0.8);
  const ys = locals.map((p) => p.y);
  const xs = locals.map((p) => p.x);
  if (rowKinds.includes(kind) && !splitsInto(ys, rowTol, 2) && splitsInto(xs, rowTol, 2)) return angle + 90;
  if (spreadKinds.includes(kind) && pads.length === 2) {
    const dx = Math.abs(locals[0]!.x - locals[1]!.x);
    const dy = Math.abs(locals[0]!.y - locals[1]!.y);
    if (dy > dx) return angle + 90;
  }
  if (spreadKinds.includes(kind) && pads.length > 2) {
    // orient along the longer spread
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanY > spanX) return angle + 90;
  }
  return angle;
}

function splitsInto(values: number[], tol: number, want: number): boolean {
  const rows = clusterRows(values, tol);
  return rows.length === want && rows.every((r) => r.length >= 2);
}

/**
 * Parse package body dimensions out of a KiCad footprint name:
 *  - chip metric codes: "R_0603_1608Metric" -> 1608 -> 1.6 x 0.8 mm
 *  - explicit sizes: "QFN-24-1EP_4x4mm_P0.5mm" -> 4 x 4 mm (first NxMmm wins,
 *    so the EP size later in the name never wins over the body)
 */
export function footprintBodyDims(name: string): { w: number; h: number } | null {
  const chip = /(\d{2})(\d{2})Metric/i.exec(name);
  if (chip) {
    const w = parseInt(chip[1]!, 10) / 10;
    const h = parseInt(chip[2]!, 10) / 10;
    if (w > 0.2 && h > 0.2) return { w, h };
  }
  const explicit = /(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm/i.exec(name);
  if (explicit) {
    const w = parseFloat(explicit[1]!);
    const h = parseFloat(explicit[2]!);
    if (w > 0.2 && h > 0.2) return { w, h };
  }
  return null;
}

/** Body fill color for a semantic kind. */
function bodyColorFor(semantic: SemanticKind, theme: PcbaTheme): string {
  switch (semantic) {
    case 'capacitor':
      return theme.bodyMlcc;
    case 'inductor':
      return theme.bodyInductor;
    default:
      return theme.body;
  }
}

/**
 * Draw the components in the gerber frame (the caller owns the y-flip and
 * mirrors labels). One glyph per package archetype, decorated by semantics.
 */
export function renderComponentGlyphs(
  components: BoardComponent[],
  theme: PcbaTheme,
  options: { units: 'mm' | 'in' },
): ComponentRender {
  const S = mmFactor(options.units); // file units per mm-constant
  const glyphs: string[] = [];
  const labels: ComponentLabel[] = [];
  let count = 0;

  for (const comp of components) {
    if (comp.kind === 'skip') continue;
    const centroid = {
      x: comp.pads.reduce((s, p) => s + p.at.x, 0) / comp.pads.length,
      y: comp.pads.reduce((s, p) => s + p.at.y, 0) / comp.pads.length,
    };
    // local frame: rotated by -angle around the centroid AND translated to
    // the origin — glyph shapes are authored around (0,0)
    const toLocal = (p: Point): Point => {
      const r = rotatePoint(p, -comp.angle, centroid);
      return { x: r.x - centroid.x, y: r.y - centroid.y };
    };
    const locals: LocalPad[] = comp.pads.map((pad) => ({ pad, at: toLocal(pad.at) }));
    const padSize = median(locals.map((l) => Math.min(l.pad.w, l.pad.h))) || 0.5 * S;

    const centers = locals.map((l) => l.at);
    const cbox = boundsOf(centers);
    const padRects = boundsOfPadRects(locals, comp.angle);
    const pin1 = locals.find((l) => l.pad.pin === '1' || l.pad.pin === 'A1') ?? null;
    const pin2 = locals.find((l) => l.pad.pin === '2') ?? null;
    const bodyColor = bodyColorFor(comp.semantic, theme);
    // the exact Fab-layer body outline: its bounding box is the body square
    // (orientation cuts like pin-1 chamfers are drawing conventions, not
    // package geometry — the pin-1 dot marks orientation instead)
    const fabContour = comp.fabContour;
    const fabBox = fabContour && fabContour.length >= 3 ? boundsOf(fabContour) : null;
    const parts: string[] = [];

    const leads = (skip?: (l: LocalPad) => boolean) => {
      // gull-wing legs: slim rectangles starting under the body edge and
      // covering ~2/3 of the way to the pad's outer edge (a real lead never
      // spans the whole land pad), oriented along each pad's own long axis
      // — land-pattern pads elongate in the lead direction, so this stays
      // correct at any component rotation (the pad extents are rotated into
      // the local frame too). Pads hidden under the body (BGA balls, QFN
      // centers) draw no leg at all.
      const rot = (-comp.angle * Math.PI) / 180;
      const ca = Math.abs(Math.cos(rot));
      const sa = Math.abs(Math.sin(rot));
      const tuck = 0.15 * S;
      for (const l of locals) {
        if (skip?.(l)) continue;
        const { pad } = l;
        const ex = (ca * pad.w + sa * pad.h) / 2; // pad half-extents, local frame
        const ey = (sa * pad.w + ca * pad.h) / 2;
        let vertical: boolean;
        if (ey > ex * 1.15) vertical = true;
        else if (ex > ey * 1.15) vertical = false;
        else {
          // near-square pad: leg points at whichever body edge it overshoots
          const over = [
            (l.at.y + ey) - by1,
            by0 - (l.at.y - ey),
            (l.at.x + ex) - bx1,
            bx0 - (l.at.x - ex),
          ];
          vertical = Math.max(over[0]!, over[1]!) >= Math.max(over[2]!, over[3]!);
        }
        const slim = Math.max(Math.min(ex, ey), 0.15 * S); // ~55% of the pad width — the spec itself, uncapped
        const leg = (x: number, y: number, w: number, h: number) => {
          const rx = Math.min(slim * 0.25, Math.min(w, h) * 0.25);
          parts.push(
            `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(rx)}" fill="${theme.lead}"/>`,
          );
        };
        if (vertical) {
          const out = l.at.y >= 0 ? 1 : -1;
          const outer = l.at.y + out * ey;
          const base = out > 0 ? by1 - tuck : by0 + tuck;
          if ((outer - base) * out < 0.03 * S) continue; // under the body
          const to = base + (outer - base) * 0.65; // ~2/3 of the way out
          leg(l.at.x - slim / 2, Math.min(base, to), slim, Math.abs(to - base));
        } else {
          const out = l.at.x >= 0 ? 1 : -1;
          const outer = l.at.x + out * ex;
          const base = out > 0 ? bx1 - tuck : bx0 + tuck;
          if ((outer - base) * out < 0.03 * S) continue; // under the body
          const to = base + (outer - base) * 0.65;
          leg(Math.min(base, to), l.at.y - slim / 2, Math.abs(to - base), slim);
        }
      }
    };
    const roundLeads = () => {
      // through-hole pins anchor at their drilled hole: a dot at the hole
      // when it sits under the body (headers — pins point straight up),
      // otherwise a slim wire leaving the body PERPENDICULAR to the edge it
      // exits and running straight into the hole, where the drilled hole is
      // punched back over it — DIP rows read as 90-degree wire stubs ending
      // in the board's own drill dots
      const tuck = 0.15 * S;
      for (const l of locals) {
        const padShort = Math.min(l.pad.w, l.pad.h);
        if (!l.pad.drill) {
          // no drill layer: thick dot at the pad, half the pad's short side
          const r = Math.max(Math.min(padShort * 0.5, 0.8 * S), 0.15 * S);
          parts.push(`<circle cx="${fmt(l.at.x)}" cy="${fmt(l.at.y)}" r="${fmt(r)}" fill="${theme.lead}"/>`);
          continue;
        }
        const { diameter } = l.pad.drill;
        // the hole arrives in gerber coordinates — everything inside the
        // glyph group is local (rotated/translated), so transform it the
        // same way the pads were, or the pin shoots off-board
        const hole = toLocal(l.pad.drill.at);
        const pinW = Math.max(Math.min(diameter, padShort * 0.9), 0.35 * S);
        const inside = hole.x >= bx0 && hole.x <= bx1 && hole.y >= by0 && hole.y <= by1;
        if (inside) {
          parts.push(`<circle cx="${fmt(hole.x)}" cy="${fmt(hole.y)}" r="${fmt(pinW / 2)}" fill="${theme.lead}"/>`);
          continue;
        }
        // which body edge the hole is beyond: top, bottom, right, left
        const over = [hole.y - by1, by0 - hole.y, hole.x - bx1, bx0 - hole.x];
        const side = over.indexOf(Math.max(...over));
        // a WIRE, not a slab: well under both the drill and the pad, so the
        // round copper pad stays readable around it — a drill-wide or
        // half-pad band over the pad reads as an SMD termination cap
        // (D2's 1.1mm drill is exactly half its 2.2mm pad, so capping at
        // min(drill, pad/2) changed nothing there)
        const legW = Math.max(Math.min(diameter * 0.7, padShort * 0.45), 0.25 * S);
        const rx = fmt(legW * 0.15);
        if (side <= 1) {
          const edge = side === 0 ? by1 - tuck : by0 + tuck;
          const y0 = Math.min(edge, hole.y);
          const y1 = Math.max(edge, hole.y);
          parts.push(
            `<rect x="${fmt(hole.x - legW / 2)}" y="${fmt(y0)}" width="${fmt(legW)}" height="${fmt(y1 - y0)}" rx="${rx}" fill="${theme.lead}"/>`,
          );
        } else {
          const edge = side === 2 ? bx1 - tuck : bx0 + tuck;
          const x0 = Math.min(edge, hole.x);
          const x1 = Math.max(edge, hole.x);
          parts.push(
            `<rect x="${fmt(x0)}" y="${fmt(hole.y - legW / 2)}" width="${fmt(x1 - x0)}" height="${fmt(legW)}" rx="${rx}" fill="${theme.lead}"/>`,
          );
        }
        // the wire runs into its hole: punch the drilled hole back over the
        // lead — glyphs paint after the drill layer, and without this the
        // leg buries the board's own drill dot (and the pad reads SMD)
        parts.push(`<circle cx="${fmt(hole.x)}" cy="${fmt(hole.y)}" r="${fmt(diameter / 2)}" fill="${theme.hole}"/>`);
      }
    };
    // power/small-signal packages: a distinctly large pad is the metal tab
    // (SOT-223, DPAK, TO-252) — drawn as a wide metal slab over it, and that
    // pad gets no slim leg
    const tabPad = (): LocalPad | null => {
      const areas = locals.map((l) => l.pad.w * l.pad.h);
      const med = median(areas) || 0;
      const tab = locals[areas.indexOf(Math.max(...areas))]!;
      return tab.pad.w * tab.pad.h >= med * 1.8 ? tab : null;
    };
    const drawTab = (tab: LocalPad) => {
      // the tab is a wide slab that STARTS AT the body edge and reaches
      // ~2/3 of the way over its pad — touching the body, never covering
      // the whole copper pad. Unlike a gull-wing pad, the tab pad elongates
      // perpendicular to its radial direction, so the axis is the direction
      // from the body center toward the pad.
      const rot = (-comp.angle * Math.PI) / 180;
      const ca = Math.abs(Math.cos(rot));
      const sa = Math.abs(Math.sin(rot));
      const ex = (ca * tab.pad.w + sa * tab.pad.h) / 2;
      const ey = (sa * tab.pad.w + ca * tab.pad.h) / 2;
      const tuck = 0.15 * S;
      const span = (base: number, outer: number): number => 0.65 * Math.abs(outer - base);
      if (Math.abs(tab.at.x) >= Math.abs(tab.at.y)) {
        const out = tab.at.x >= 0 ? 1 : -1;
        const base = out > 0 ? bx1 - tuck : bx0 + tuck;
        const outer = tab.at.x + out * ex;
        const w = span(base, outer);
        const x0 = out > 0 ? base : base - w;
        body(x0, x0 + w, tab.at.y - ey * 0.9, tab.at.y + ey * 0.9, 0.05 * S, theme.lead);
      } else {
        const out = tab.at.y >= 0 ? 1 : -1;
        const base = out > 0 ? by1 - tuck : by0 + tuck;
        const outer = tab.at.y + out * ey;
        const h = span(base, outer);
        const y0 = out > 0 ? base : base - h;
        body(tab.at.x - ex * 0.9, tab.at.x + ex * 0.9, y0, y0 + h, 0.05 * S, theme.lead);
      }
    };
    const padLeads = () => {
      // full land-pattern pads on top of the body (connectors) — pad w/h
      // live in the gerber frame, so rotate the extents into this local
      // frame exactly like leads() does
      const rot = (-comp.angle * Math.PI) / 180;
      const ca = Math.abs(Math.cos(rot));
      const sa = Math.abs(Math.sin(rot));
      for (const l of locals) {
        const { pad } = l;
        const w = ca * pad.w + sa * pad.h;
        const h = sa * pad.w + ca * pad.h;
        if (pad.shape === 'circle') {
          parts.push(`<circle cx="${fmt(l.at.x)}" cy="${fmt(l.at.y)}" r="${fmt(Math.min(w, h) / 2)}" fill="${theme.lead}"/>`);
        } else {
          const rx = pad.shape === 'obround' ? fmt(Math.min(w, h) / 2) : fmt(Math.min(w, h) * 0.2);
          parts.push(
            `<rect x="${fmt(l.at.x - w / 2)}" y="${fmt(l.at.y - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" rx="${rx}" fill="${theme.lead}"/>`,
          );
        }
      }
    };
    const body = (bx0: number, bx1: number, by0: number, by1: number, rx: number, color = bodyColor, opacity?: number) => {
      const op = opacity !== undefined ? ` fill-opacity="${fmt(opacity)}"` : '';
      parts.push(
        `<rect x="${fmt(bx0)}" y="${fmt(by0)}" width="${fmt(bx1 - bx0)}" height="${fmt(by1 - by0)}" rx="${fmt(rx)}"${op} fill="${color}"/>`,
      );
    };
    const pin1Dot = (bx0: number, bx1: number, by0: number, by1: number) => {
      if (!pin1) return;
      const r = Math.max(Math.min(bx1 - bx0, by1 - by0) * 0.09, 0.07 * S);
      const px = pin1.at.x >= (bx0 + bx1) / 2 ? bx1 - r * 2.2 : bx0 + r * 2.2;
      const py = pin1.at.y >= (by0 + by1) / 2 ? by1 - r * 2.2 : by0 + r * 2.2;
      parts.push(`<circle cx="${fmt(px)}" cy="${fmt(py)}" r="${fmt(r)}" fill="${theme.pin1}"/>`);
    };
    // body rect in local coordinates: [x0, x1] × [y0, y1]
    let bx0 = 0;
    let bx1 = 0;
    let by0 = 0;
    let by1 = 0;
    if (fabBox) {
      // the Fab outline wins over every heuristic
      bx0 = fabBox.minX;
      bx1 = fabBox.maxX;
      by0 = fabBox.minY;
      by1 = fabBox.maxY;
    }

    switch (comp.kind) {
      case 'chip': {
        // full-length sharp body between silver end caps; the board's own
        // exposed pads show past the part: [pad [silver | body | silver] pad]
        if (!fabBox) {
          const spanX = cbox.maxX - cbox.minX;
          const padAcross = median(locals.map((l) => l.pad.h)) || padSize;
          let len = spanX * 1.05;
          let wid = Math.max(Math.min(padAcross * 0.85, len * 0.72), padSize * 0.4);
          applyDims(comp, S, (w, h) => {
            len = w;
            wid = h;
          });
          bx0 = -len / 2;
          bx1 = len / 2;
          by0 = -wid / 2;
          by1 = wid / 2;
        }
        const capLen = Math.min(Math.max((bx1 - bx0) * 0.2, 0.08 * S), (bx1 - bx0) * 0.45);
        const capRx = Math.min(capLen, 0.06 * S);
        const len = bx1 - bx0;
        const wid = by1 - by0;
        const chipOpacity = comp.semantic === 'led' ? 0.82 : undefined;
        body(bx0, bx1, by0, by1, Math.min(wid * 0.12, 0.08 * S), comp.semantic === 'led' ? theme.ledTint : bodyColor, chipOpacity);
        body(bx0, bx0 + capLen, by0, by1, capRx, theme.lead);
        body(bx1 - capLen, bx1, by0, by1, capRx, theme.lead);
        if (comp.semantic === 'diode') {
          // cathode stripe at the pin-2 end (right when unknown)
          const cathodeRight = !pin2 || pin2.at.x >= 0;
          const sx = cathodeRight ? bx1 - capLen - len * 0.1 : bx0 + capLen + len * 0.02;
          body(sx, sx + len * 0.12, by0 + wid * 0.08, by1 - wid * 0.08, 0, theme.stripe);
        } else if (comp.semantic === 'led') {
          // light-emitting die square in the middle
          const d = wid * 0.45;
          body(-d / 2, d / 2, -d / 2, d / 2, d * 0.1, theme.pin1, 0.5);
        } else if (comp.semantic === 'inductor') {
          // winding stripes across the body
          const inner0 = bx0 + capLen + len * 0.04;
          const innerSpan = bx1 - capLen - inner0;
          for (const pos of [0.18, 0.5, 0.82]) {
            const x = inner0 + innerSpan * pos - innerSpan * 0.06;
            parts.push(
              `<rect x="${fmt(x)}" y="${fmt(by0 + wid * 0.08)}" width="${fmt(innerSpan * 0.12)}" height="${fmt(wid * 0.84)}" fill="${theme.stripe}" fill-opacity="0.55"/>`,
            );
          }
        }
        break;
      }

      case 'axial': {
        // lying through-hole part: round pads show, capsule body between
        if (!fabBox) {
          const spanX = cbox.maxX - cbox.minX;
          const padLen = median(locals.map((l) => l.pad.w)) || padSize;
          const h = Math.max(padSize * 0.85, 0.5 * S);
          bx0 = cbox.minX + padLen * 0.55;
          bx1 = cbox.maxX - padLen * 0.55;
          by0 = -h / 2;
          by1 = h / 2;
          if (bx1 - bx0 < padSize * 0.4) {
            bx0 = -spanX / 2;
            bx1 = spanX / 2;
          }
        }
        const h = by1 - by0;
        roundLeads();
        // decorations (resistor bands, the diode cathode stripe) wrap the
        // capsule body, so they clip to it: a plain rect's square corners
        // would poke past the rounded ends (the caps are semicircles)
        const clipId = `pcba-band-${comp.ref.replace(/[^A-Za-z0-9_-]/g, '')}`;
        const bandClip = `<clipPath id="${clipId}"><rect x="${fmt(bx0)}" y="${fmt(by0)}" width="${fmt(bx1 - bx0)}" height="${fmt(h)}" rx="${fmt(h / 2)}"/></clipPath>`;
        const clipped = (rect: string): string => rect.replace('<rect ', `<rect clip-path="url(#${clipId})" `);
        // resistors get the classic tan body; other axial parts (diodes)
        // stay dark
        body(bx0, bx1, by0, by1, h / 2, comp.semantic === 'resistor' ? theme.bodyResistor : undefined);
        if (comp.semantic === 'resistor') {
          // color bands live on through-hole resistors (SMD chips carry a
          // printed code, not bands)
          const bands = resistorBands(comp.value);
          if (bands) {
            parts.push(bandClip);
            const len = bx1 - bx0;
            const bw = Math.max(len * 0.055, 0.1 * S);
            const at = [0.2, 0.36, 0.52];
            bands.forEach((color, i) => {
              const x = bx0 + len * at[i]!;
              parts.push(clipped(`<rect x="${fmt(x)}" y="${fmt(by0)}" width="${fmt(bw)}" height="${fmt(h)}" fill="${color}"/>`));
            });
            parts.push(
              clipped(`<rect x="${fmt(bx0 + len * 0.72)}" y="${fmt(by0)}" width="${fmt(bw)}" height="${fmt(h)}" fill="${TOLERANCE_BAND}"/>`),
            );
          }
        } else if (comp.semantic === 'diode') {
          // full body height, clipped to the capsule: the band wraps the
          // end of the cylinder — tall at its inner edge, following the
          // round cap's arc at its outer edge
          const sx = !pin2 || pin2.at.x >= 0 ? bx1 - h * 0.45 : bx0 + h * 0.15;
          parts.push(bandClip);
          parts.push(
            clipped(`<rect x="${fmt(sx)}" y="${fmt(by0)}" width="${fmt(h * 0.3)}" height="${fmt(h)}" fill="${theme.stripe}"/>`),
          );
        }
        break;
      }

      case 'sot': {
        // small transistor: legs peek on all sides, pin-1 dot; a dominant
        // pad (SOT-223 tab) draws as a wide metal slab instead of a leg
        if (!fabBox) {
          const inset = Math.min((padRects.maxX - padRects.minX) * 0.3, padSize * 0.55);
          const insetY = Math.min((padRects.maxY - padRects.minY) * 0.3, padSize * 0.55);
          bx0 = padRects.minX + inset;
          bx1 = padRects.maxX - inset;
          by0 = padRects.minY + insetY;
          by1 = padRects.maxY - insetY;
        }
        const tab = tabPad();
        leads(tab ? (l) => l === tab : undefined);
        body(bx0, bx1, by0, by1, Math.min(0.15 * S, (by1 - by0) * 0.1));
        if (tab) drawTab(tab);
        pin1Dot(bx0, bx1, by0, by1);
        break;
      }

      case 'soic':
      case 'dip': {
        // two pad rows across local y: body between the rows, extended
        // along the row axis, lead tips peeking past both ends
        if (!fabBox) {
          const rowHi = Math.max(...locals.map((l) => l.at.y));
          const rowLo = Math.min(...locals.map((l) => l.at.y));
          const padH = median(locals.map((l) => l.pad.h)) || padSize;
          bx0 = cbox.minX - padSize * 0.6;
          bx1 = cbox.maxX + padSize * 0.6;
          by0 = rowLo + padH * 0.45;
          by1 = rowHi - padH * 0.45;
          applyDims(comp, S, (w, h) => {
            bx0 = -w / 2;
            bx1 = w / 2;
            by0 = -h / 2;
            by1 = h / 2;
          });
        }
        if (comp.kind === 'dip') roundLeads();
        else leads();
        body(bx0, bx1, by0, by1, Math.min(0.25 * S, (bx1 - bx0) * 0.08));
        pin1Dot(bx0, bx1, by0, by1);
        if (comp.kind === 'dip' && pin1) {
          // DIP notch at the pin-1 end
          const r = Math.min((by1 - by0) * 0.22, (bx1 - bx0) * 0.2);
          const x = pin1.at.x >= (bx0 + bx1) / 2 ? bx1 : bx0;
          const cyN = (by0 + by1) / 2;
          const sweep = x === bx0 ? 1 : 0;
          parts.push(
            `<path d="M ${fmt(x)} ${fmt(cyN - r)} A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(x)} ${fmt(cyN + r)} Z" fill="${theme.hole}" fill-opacity="0.28"/>`,
          );
        }
        break;
      }

      case 'radial': {
        // electrolytic can seen from the top: dark circle with a centered
        // polarity stripe; the pins are under the can, not drawn
        const pitch = Math.max(cbox.maxX - cbox.minX, cbox.maxY - cbox.minY);
        let dia = Math.max(pitch * 2, 2 * S);
        applyDims(comp, S, (w, h) => {
          dia = Math.max(w, h);
        });
        bx0 = -dia / 2;
        bx1 = dia / 2;
        by0 = -dia / 2;
        by1 = dia / 2;
        parts.push(`<circle cx="0" cy="0" r="${fmt(dia / 2)}" fill="${theme.body}"/>`);
        // polarity: the full half of the can opposite pin 1 is light —
        // drawn as a half-disc so it never overhangs the circular body
        const rCan = dia / 2;
        const lightRight = !pin1 || pin1.at.x < 0; // stripe sits opposite pin 1 (+)
        const sweep = lightRight ? 1 : 0; // arc through +x when light on the right
        parts.push(
          `<path d="M 0 ${fmt(-rCan)} A ${fmt(rCan)} ${fmt(rCan)} 0 0 ${sweep} 0 ${fmt(rCan)} Z" fill="${theme.stripe}" fill-opacity="0.85"/>`,
        );
        break;
      }

      case 'dome': {
        // through-hole LED: tinted dome with a die dot
        const pitch = Math.max(cbox.maxX - cbox.minX, cbox.maxY - cbox.minY);
        let dia = Math.max(pitch * 1.8, 2.8 * S);
        applyDims(comp, S, (w, h) => {
          dia = Math.max(w, h);
        });
        bx0 = -dia / 2;
        bx1 = dia / 2;
        by0 = -dia / 2;
        by1 = dia / 2;
        roundLeads();
        parts.push(`<circle cx="0" cy="0" r="${fmt(dia / 2)}" fill="${theme.ledTint}" fill-opacity="0.85"/>`);
        parts.push(`<circle cx="0" cy="0" r="${fmt(dia * 0.18)}" fill="${theme.pin1}" fill-opacity="0.5"/>`);
        break;
      }

      case 'trimmer': {
        // trimmer potentiometer: light-blue body, silver adjustment screw
        // in the bottom-right corner (where the fab layer specs it)
        if (!fabBox) {
          bx0 = cbox.minX - padSize * 0.9;
          bx1 = cbox.maxX + padSize * 0.9;
          const h = Math.max((padRects.maxY - padRects.minY) * 1.8, padSize * 2.2);
          by0 = cbox.minY - h * 0.1;
          by1 = cbox.minY + h;
        }
        if (comp.throughHole) roundLeads();
        body(bx0, bx1, by0, by1, Math.min(0.3 * S, (by1 - by0) * 0.08), theme.bodyTrimmer);
        const rScrew = Math.min((bx1 - bx0) * 0.24, (by1 - by0) * 0.24);
        const cxScrew = bx1 - rScrew * 1.45;
        const cyScrew = by1 - rScrew * 1.45;
        parts.push(
          `<circle cx="${fmt(cxScrew)}" cy="${fmt(cyScrew)}" r="${fmt(rScrew)}" fill="${theme.lead}"/>`,
          `<circle cx="${fmt(cxScrew)}" cy="${fmt(cyScrew)}" r="${fmt(rScrew * 0.42)}" fill="${theme.stripe}" fill-opacity="0.8"/>`,
        );
        break;
      }

      case 'slide': {
        // slide switch: body, an internal rounded track the actuator rides
        // in, and the actuator nub offset to one end
        if (!fabBox) {
          bx0 = cbox.minX - padSize * 0.8;
          bx1 = cbox.maxX + padSize * 0.8;
          by0 = cbox.minY - padSize * 0.8;
          by1 = cbox.maxY + padSize * 0.8;
        }
        if (comp.throughHole) roundLeads();
        else leads();
        body(bx0, bx1, by0, by1, Math.min(0.3 * S, (by1 - by0) * 0.1));
        const bw = bx1 - bx0;
        const bh = by1 - by0;
        // the track: a rounded slot the nub moves along
        const tw = bw * 0.78;
        const th = bh * 0.7;
        const nubRx = th * 0.82 * 0.2;
        parts.push(
          `<rect x="${fmt(-tw / 2)}" y="${fmt(-th / 2)}" width="${fmt(tw)}" height="${fmt(th)}" rx="${fmt(nubRx)}" fill="${theme.hole}" fill-opacity="0.3"/>`,
        );
        const nw = bw * 0.26;
        const nh = th * 0.82;
        parts.push(
          `<rect x="${fmt(tw / 2 - nw - bw * 0.05)}" y="${fmt(-nh / 2)}" width="${fmt(nw)}" height="${fmt(nh)}" rx="${fmt(nubRx)}" fill="${theme.lead}"/>`,
        );
        break;
      }

      case 'rotary': {
        // rotary encoder: the shaft dominates the body — pins to their holes
        if (!fabBox) {
          bx0 = cbox.minX - padSize * 0.8;
          bx1 = cbox.maxX + padSize * 0.8;
          by0 = cbox.minY - padSize * 0.6;
          by1 = cbox.maxY + padSize * 1.2;
        }
        roundLeads();
        body(bx0, bx1, by0, by1, Math.min(0.3 * S, (by1 - by0) * 0.08));
        const rShaft = Math.min((bx1 - bx0) * 0.42, (by1 - by0) * 0.42);
        const cxShaft = (bx0 + bx1) / 2;
        const cyShaft = (by0 + by1) / 2;
        parts.push(
          `<circle cx="${fmt(cxShaft)}" cy="${fmt(cyShaft)}" r="${fmt(rShaft)}" fill="${theme.lead}"/>`,
          `<circle cx="${fmt(cxShaft)}" cy="${fmt(cyShaft)}" r="${fmt(rShaft * 0.55)}" fill="${theme.stripe}" fill-opacity="0.8"/>`,
        );
        break;
      }

      case 'connector': {
        // shrouded connector (USB/barrel/JST): a silver metal shell — the
        // fab outline when there is one, else the pad land pattern extended
        // past the pad row on the wire side. No pin/drill representation:
        // the board's own pads show through where the shell doesn't cover.
        if (!fabBox) {
          const spanY = padRects.maxY - padRects.minY;
          bx0 = padRects.minX - padSize * 0.5;
          bx1 = padRects.maxX + padSize * 0.5;
          by0 = padRects.minY - spanY * 0.45 - padSize * 0.3;
          by1 = padRects.maxY + padSize * 0.3;
        }
        body(bx0, bx1, by0, by1, Math.min(0.3 * S, (by1 - by0) * 0.06), theme.lead);
        // seam detail along the wire-entry edge
        const seamY = by1 - (by1 - by0) * 0.18;
        parts.push(
          `<rect x="${fmt(bx0 + (bx1 - bx0) * 0.06)}" y="${fmt(seamY)}" width="${fmt((bx1 - bx0) * 0.88)}" height="${fmt(Math.max((by1 - by0) * 0.05, 0.15 * S))}" rx="${fmt(0.1 * S)}" fill="${theme.hole}" fill-opacity="0.25"/>`,
        );
        break;
      }

      case 'can': {
        // metal can module (oscillator, RF shield, castellated module):
        // metal lid over the pads, pin-1 dot, no legs
        if (!fabBox) {
          bx0 = padRects.minX - Math.max((padRects.maxX - padRects.minX) * 0.04, 0.05 * S);
          bx1 = padRects.maxX + Math.max((padRects.maxX - padRects.minX) * 0.04, 0.05 * S);
          by0 = padRects.minY - Math.max((padRects.maxY - padRects.minY) * 0.04, 0.05 * S);
          by1 = padRects.maxY + Math.max((padRects.maxY - padRects.minY) * 0.04, 0.05 * S);
        }
        body(bx0, bx1, by0, by1, Math.min(0.25 * S, (bx1 - bx0) * 0.08), theme.crystal);
        // inset lid detail
        parts.push(
          `<rect x="${fmt(bx0 + (bx1 - bx0) * 0.08)}" y="${fmt(by0 + (by1 - by0) * 0.08)}" width="${fmt((bx1 - bx0) * 0.84)}" height="${fmt((by1 - by0) * 0.84)}" rx="${fmt(0.1 * S)}" fill="${theme.stripe}" fill-opacity="0.4"/>`,
        );
        pin1Dot(bx0, bx1, by0, by1);
        break;
      }

      case 'qfn':
      case 'bga': {
        // leadless: no legs at all — the pads sit under the package and the
        // board's own gerber pads peek past the body where they should.
        // With the exact Fab body outline the land-pattern pads peek past
        // the package on every side, exactly like the real part; the
        // heuristic (no fab layer) covers the whole land pattern.
        if (!fabBox) {
          bx0 = padRects.minX - Math.max((padRects.maxX - padRects.minX) * 0.02, 0.05);
          bx1 = padRects.maxX + Math.max((padRects.maxX - padRects.minX) * 0.02, 0.05);
          by0 = padRects.minY - Math.max((padRects.maxY - padRects.minY) * 0.02, 0.05);
          by1 = padRects.maxY + Math.max((padRects.maxY - padRects.minY) * 0.02, 0.05);
          applyDims(comp, S, (w, h) => {
            w = Math.max(w, padRects.maxX - padRects.minX + 0.1);
            h = Math.max(h, padRects.maxY - padRects.minY + 0.1);
            bx0 = -w / 2;
            bx1 = w / 2;
            by0 = -h / 2;
            by1 = h / 2;
          });
        }
        body(bx0, bx1, by0, by1, Math.min(0.25 * S, (bx1 - bx0) * 0.08));
        pin1Dot(bx0, bx1, by0, by1);
        break;
      }

      case 'qfp': {
        // gull-wing on four sides: the lead tips peek around the body
        if (!fabBox) {
          bx0 = cbox.minX - padSize * 0.2;
          bx1 = cbox.maxX + padSize * 0.2;
          by0 = cbox.minY - padSize * 0.2;
          by1 = cbox.maxY + padSize * 0.2;
          applyDims(comp, S, (w, h) => {
            bx0 = -w / 2;
            bx1 = w / 2;
            by0 = -h / 2;
            by1 = h / 2;
          });
        }
        leads();
        body(bx0, bx1, by0, by1, Math.min(0.25 * S, (bx1 - bx0) * 0.08));
        pin1Dot(bx0, bx1, by0, by1);
        break;
      }

      case 'header':
      case 'to': {
        // plastic body over the pin row. Headers: round pin posts, no pin-1
        // marker (silkscreen carries orientation). Power/small-signal "TO"
        // packages: gull-wing rect legs when SMD (SOT-23/SOT-223/DPAK),
        // round pins when through-hole (TO-92/TO-220).
        if (!fabBox) {
          const h = Math.max((padRects.maxY - padRects.minY) * 1.6, padSize * 1.6);
          bx0 = cbox.minX - padSize * 0.55;
          bx1 = cbox.maxX + padSize * 0.55;
          by0 = -h / 2;
          by1 = h / 2;
        }
        body(bx0, bx1, by0, by1, Math.min(0.3 * S, (bx1 - bx0) * 0.05), theme.body);
        if (comp.kind === 'header' || comp.throughHole) roundLeads();
        else {
          const tab = tabPad();
          leads(tab ? (l) => l === tab : undefined);
          if (tab) drawTab(tab);
        }
        if (comp.kind === 'to') pin1Dot(bx0, bx1, by0, by1);
        break;
      }

      case 'terminal': {
        // terminal block: body with gold screw heads at every position
        if (!fabBox) {
          bx0 = cbox.minX - padSize * 0.6;
          bx1 = cbox.maxX + padSize * 0.6;
          by0 = cbox.minY - padSize * 0.7;
          by1 = cbox.maxY + padSize * 0.7;
        }
        body(bx0, bx1, by0, by1, Math.min(0.3 * S, (by1 - by0) * 0.1), theme.body);
        for (const l of locals) {
          parts.push(
            `<circle cx="${fmt(l.at.x)}" cy="${fmt(l.at.y)}" r="${fmt(Math.min(l.pad.w, l.pad.h) * 0.42)}" fill="${theme.pads}"/>`,
            `<circle cx="${fmt(l.at.x)}" cy="${fmt(l.at.y)}" r="${fmt(Math.min(l.pad.w, l.pad.h) * 0.18)}" fill="${theme.stripe}"/>`,
          );
        }
        break;
      }

      case 'crystal': {
        // metal can between its legs
        if (!fabBox) {
          const spanX = cbox.maxX - cbox.minX;
          const h = Math.max(padSize * 1.1, 0.6 * S);
          bx0 = -spanX * 0.42;
          bx1 = spanX * 0.42;
          by0 = -h / 2;
          by1 = h / 2;
        }
        const h = by1 - by0;
        leads();
        body(bx0, bx1, by0, by1, h / 2, theme.crystal);
        const d = h * 0.35;
        body(-d / 2, d / 2, -d / 2, d / 2, d * 0.25, theme.stripe, 0.7);
        break;
      }

      case 'button': {
        // switch body with a round actuator in the middle, pins to their
        // holes like a DIP (a through-hole switch legs through the board)
        if (!fabBox) {
          bx0 = padRects.minX - padSize * 0.4;
          bx1 = padRects.maxX + padSize * 0.4;
          by0 = padRects.minY - padSize * 0.4;
          by1 = padRects.maxY + padSize * 0.4;
        }
        if (comp.throughHole) roundLeads();
        body(bx0, bx1, by0, by1, Math.min(0.3 * S, (by1 - by0) * 0.1));
        const r = Math.min(bx1 - bx0, by1 - by0) * 0.25;
        parts.push(`<circle cx="0" cy="0" r="${fmt(r)}" fill="${theme.lead}"/>`);
        break;
      }

      default: {
        // generic: body first, full pads stay visible on top (SVG paints in
        // document order — pads pushed after the body rect render over it)
        if (!fabBox) {
          bx0 = cbox.minX - padSize * 0.55;
          bx1 = cbox.maxX + padSize * 0.55;
          by0 = cbox.minY - padSize * 0.55;
          by1 = cbox.maxY + padSize * 0.55;
        }
        body(bx0, bx1, by0, by1, Math.min(0.25 * S, (bx1 - bx0) * 0.08));
        padLeads();
        break;
      }
    }

    if (bx1 - bx0 < padSize * 0.15 || by1 - by0 < padSize * 0.15) {
      // degenerate body (pads too close) — leads only
      parts.length = 0;
      leads();
    }

    glyphs.push(
      `<g data-ref="${escapeXml(comp.ref)}" transform="translate(${fmt(centroid.x)} ${fmt(centroid.y)}) rotate(${fmt(comp.angle)})">${parts.join('')}</g>`,
    );

    // below the part: silkscreen refdes text (when present) is drawn by KiCad
    // above the footprint, so the synthetic label stays clear of it
    const size = Math.min(Math.max(0.35 * Math.max(bx1 - bx0, by1 - by0), 0.7 * S), 2 * S);
    labels.push({ ref: comp.ref, x: comp.bbox.minX, y: comp.bbox.minY - size * 0.45 - 0.15 * S, size });
    count++;
  }

  return { glyphs: glyphs.join(''), labels, count };
}

/** Apply footprint-name body dims (axis-mapped, mm → file units) to a box setter. */
function applyDims(comp: BoardComponent, S: number, set: (w: number, h: number) => void): void {
  if (!comp.bodyDims) return;
  const d = comp.bodyDims;
  set(d.w * S, d.h * S);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Union bbox of the pads' own rectangles in the local (rotated) frame. */
function boundsOfPadRects(locals: LocalPad[], angleDeg: number): Bounds {
  // pad w/h are gerber-frame extents; the local frame is rotated by -angle,
  // so a rotated part's pad rectangles transpose (and shear at odd angles) —
  // rotate the extents like leads() does
  const rot = (-angleDeg * Math.PI) / 180;
  const ca = Math.abs(Math.cos(rot));
  const sa = Math.abs(Math.sin(rot));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of locals) {
    const ex = (ca * l.pad.w + sa * l.pad.h) / 2;
    const ey = (sa * l.pad.w + ca * l.pad.h) / 2;
    minX = Math.min(minX, l.at.x - ex);
    maxX = Math.max(maxX, l.at.x + ex);
    minY = Math.min(minY, l.at.y - ey);
    maxY = Math.max(maxY, l.at.y + ey);
  }
  return { minX, minY, maxX, maxY };
}
