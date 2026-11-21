/**
 * Reads a PCBWorld benchmark instance (`.kicad_pcb` + optional sibling
 * `.kicad_pro`) into the facts the bench needs: footprints with their pads
 * and nets, the board outline, zones/keepouts, and the design rules the
 * board is scored against.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse, SNode, type SExpr } from '../../../src/sexpr/index.js';

export interface Pt {
  x: number;
  y: number;
}

export interface BoardPad {
  number: string;
  /** Absolute pad centre on the board, mm. */
  x: number;
  y: number;
  /** Copper layers the pad sits on (`*.Cu` expanded). */
  layers: string[];
  net: string;
}

export interface BoardFootprint {
  ref: string;
  x: number;
  y: number;
  rotation: number;
  side: 'front' | 'back';
  /** The footprint node as it appears in the board file. */
  raw: SExpr[];
  pads: BoardPad[];
}

export type Contour =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'polygon'; points: Pt[] }
  | { kind: 'circle'; cx: number; cy: number; r: number };

export interface Outline {
  outer: Contour;
  /** Inner closed contours (milled cutouts), as polygons. */
  cutouts: Pt[][];
}

export interface BoardZone {
  /** Copper pour (net may be '') or rule-area keepout. */
  keepout: boolean;
  net: string;
  layers: string[];
  points: Pt[];
  priority: number;
  restrictions?: { tracks: boolean; vias: boolean; copperpour: boolean };
}

export interface BoardRules {
  clearance: number;
  trackWidth: number;
  viaDiameter: number;
  viaDrill: number;
  copperEdgeClearance: number;
  holeClearance: number;
  holeToHole: number;
  viaAnnularWidth: number;
  /** Where the rules came from — a scored board should never say 'fallback'. */
  source: 'kicad_pro' | 'legacy_net_class' | 'fallback';
  /**
   * The project defines net classes beyond Default (D3 boards do). The bench
   * routes every net with the Default class, so per-net widths/clearances are
   * not honoured yet — rows carry this flag so such results can be filtered.
   */
  perNetClasses?: boolean;
}

export interface BenchBoard {
  id: string;
  pcbPath: string;
  proPath: string | null;
  text: string;
  root: SNode;
  copperLayers: string[];
  /** net code -> name, as declared in the board (code 0 = no net). */
  nets: Map<number, string>;
  footprints: BoardFootprint[];
  outline: Outline | null;
  /** Why `outline` is null, when it is. */
  outlineProblem?: string;
  zones: BoardZone[];
  rules: BoardRules;
  /** Existing copper (segments/arcs/vias) — reference routing, if any. */
  existingCopper: number;
}

/** PCBWorld's `configs/drc/pcbworld_drc.yaml` — used only when a board carries no rules. */
export const PCBWORLD_FALLBACK_RULES: BoardRules = {
  clearance: 0.15,
  trackWidth: 0.2,
  viaDiameter: 0.6,
  viaDrill: 0.3,
  copperEdgeClearance: 0.15,
  holeClearance: 0.25,
  holeToHole: 0.25,
  viaAnnularWidth: 0.1,
  source: 'fallback',
};

const COPPER = /^(F|B|In\d+)\.Cu$/;

export function readBoard(pcbPath: string, opts: { copperLayers?: string[]; id?: string } = {}): BenchBoard {
  const text = fs.readFileSync(pcbPath, 'utf8').replace(/^﻿/, '');
  const root = SNode.from(parse(text) as SExpr[]);
  if (!root.is('kicad_pcb')) throw new Error(`${pcbPath}: not a kicad_pcb file`);

  const declared = (root.child('layers')?.children() ?? []).map((l) => l.getString(1) ?? '').filter((n) => COPPER.test(n));
  const copperLayers = declared.length > 0 ? declared : (opts.copperLayers ?? ['F.Cu', 'B.Cu']);

  const nets = new Map<number, string>();
  for (const n of root.children('net')) nets.set(n.getNumber(1), n.getString(2) ?? '');

  const footprints = root.children('footprint').map((fp) => readFootprint(fp, nets, copperLayers));

  const proPath = pcbPath.replace(/\.kicad_pcb$/, '.kicad_pro');
  const hasPro = fs.existsSync(proPath);
  const outline = readOutline(root);

  return {
    // ids name work dirs and output files: keep them filesystem-safe
    id: (opts.id ?? path.basename(pcbPath, '.kicad_pcb')).replace(/[^A-Za-z0-9_.-]+/g, '_'),
    pcbPath,
    proPath: hasPro ? proPath : null,
    text,
    root,
    copperLayers,
    nets,
    footprints,
    outline: typeof outline === 'string' ? null : outline,
    outlineProblem: typeof outline === 'string' ? outline : undefined,
    zones: readZones(root, nets, copperLayers),
    rules: readRules(root, hasPro ? proPath : null),
    existingCopper: ['segment', 'arc', 'via'].reduce((s, k) => s + root.children(k).length, 0),
  };
}

function netNameOf(node: SNode | null, nets: Map<number, string>): string {
  if (!node) return '';
  // KiCad ≤9: (net <code> "<name>") or (net <code>); KiCad 10: (net "<name>")
  if (typeof node.rawAt(1) === 'number') return node.getString(2) ?? nets.get(node.getNumber(1)) ?? '';
  return node.getString(1) ?? '';
}

function layerList(node: SNode | null): string[] {
  const out: string[] = [];
  for (let i = 1; node && i < node.length; i++) out.push(node.getString(i) ?? '');
  return out;
}

function readFootprint(fp: SNode, nets: Map<number, string>, copperLayers: string[]): BoardFootprint {
  const at = fp.child('at');
  const x = at?.getNumber(1) ?? 0;
  const y = at?.getNumber(2) ?? 0;
  const rotation = at?.getNumber(3) ?? 0;
  const side = fp.child('layer')?.getString(1) === 'B.Cu' ? 'back' : 'front';
  const ref =
    fp
      .children('property')
      .find((p) => p.getString(1) === 'Reference')
      ?.getString(2) ??
    fp
      .children('fp_text')
      .find((t) => t.getString(1) === 'reference')
      ?.getString(2) ??
    '';

  const rad = (rotation * Math.PI) / 180;
  const pads: BoardPad[] = fp.children('pad').map((pad) => {
    const number = pad.getString(1) ?? '';
    const pat = pad.child('at');
    const px = pat?.getNumber(1) ?? 0;
    const py = pat?.getNumber(2) ?? 0;
    // KiCad rotates footprint-local coords by the footprint angle (y down)
    const ax = x + px * Math.cos(rad) + py * Math.sin(rad);
    const ay = y - px * Math.sin(rad) + py * Math.cos(rad);
    const layers = expandCopper(layerList(pad.child('layers')), copperLayers);
    return { number, x: ax, y: ay, layers, net: netNameOf(pad.child('net'), nets) };
  });

  return { ref, x, y, rotation, side, raw: fp.raw, pads };
}

function expandCopper(names: string[], copperLayers: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    if (n === '*.Cu') copperLayers.forEach((l) => out.add(l));
    else if (n === 'F&B.Cu') ['F.Cu', 'B.Cu'].forEach((l) => out.add(l));
    else if (COPPER.test(n)) out.add(n);
  }
  return [...out];
}

// ── outline ─────────────────────────────────────────────────────────────

const pt = (n: SNode | null): Pt => ({ x: n?.getNumber(1) ?? 0, y: n?.getNumber(2) ?? 0 });

/** Points along a 3-point arc, start → end, at most `maxSeg` mm apart. */
export function arcPoints(a: Pt, m: Pt, b: Pt, maxSeg = 0.5): Pt[] {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-12) return [a, b];
  const sq = (p: Pt) => p.x * p.x + p.y * p.y;
  const cx = (sq(a) * (m.y - b.y) + sq(m) * (b.y - a.y) + sq(b) * (a.y - m.y)) / d;
  const cy = (sq(a) * (b.x - m.x) + sq(m) * (a.x - b.x) + sq(b) * (m.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  const ang = (p: Pt) => Math.atan2(p.y - cy, p.x - cx);
  const a0 = ang(a);
  const norm = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccwEnd = norm(ang(b) - a0);
  const ccwMid = norm(ang(m) - a0);
  const sweep = ccwMid <= ccwEnd ? ccwEnd : ccwEnd - 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(sweep) * r) / maxSeg));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  out[0] = a;
  out[n] = b;
  return out;
}

function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]!;
    s += p[i]!.x * q.y - q.x * p[i]!.y;
  }
  return Math.abs(s) / 2;
}

function contourPolygon(c: Contour): Pt[] {
  if (c.kind === 'polygon') return c.points;
  if (c.kind === 'rect')
    return [
      { x: c.x, y: c.y },
      { x: c.x + c.width, y: c.y },
      { x: c.x + c.width, y: c.y + c.height },
      { x: c.x, y: c.y + c.height },
    ];
  return Array.from({ length: 64 }, (_, i) => ({
    x: c.cx + c.r * Math.cos((i / 64) * 2 * Math.PI),
    y: c.cy + c.r * Math.sin((i / 64) * 2 * Math.PI),
  }));
}

/**
 * The Edge.Cuts contours: the largest is the board, the rest are cutouts.
 * Board-level gr_* items and footprint-level fp_* items (a board-shaped
 * footprint) both count; footprint geometry is moved into board coordinates.
 */
function readOutline(root: SNode): Outline | string {
  type Tf = (p: Pt) => Pt;
  const identity: Tf = (p) => p;
  const items: Array<{ kind: string; node: SNode; tf: Tf }> = [];
  for (const n of root.children()) {
    if (n.name.startsWith('gr_') && n.child('layer')?.getString(1) === 'Edge.Cuts') {
      items.push({ kind: n.name.slice(3), node: n, tf: identity });
    }
    if (n.is('footprint')) {
      const at = n.child('at');
      const fx = at?.getNumber(1) ?? 0;
      const fy = at?.getNumber(2) ?? 0;
      const rad = ((at?.getNumber(3) ?? 0) * Math.PI) / 180;
      const tf: Tf = (p) => ({
        x: fx + p.x * Math.cos(rad) + p.y * Math.sin(rad),
        y: fy - p.x * Math.sin(rad) + p.y * Math.cos(rad),
      });
      for (const g of n.children()) {
        if (g.name.startsWith('fp_') && g.child('layer')?.getString(1) === 'Edge.Cuts') {
          items.push({ kind: g.name.slice(3), node: g, tf });
        }
      }
    }
  }
  if (items.length === 0) return 'no Edge.Cuts outline';

  const contours: Contour[] = [];
  const open: Pt[][] = []; // polylines from line / arc pieces, to be chained
  for (const { kind, node: e, tf } of items) {
    const P = (n: SNode | null) => tf(pt(n));
    if (kind === 'rect') {
      const a = pt(e.child('start'));
      const b = pt(e.child('end'));
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }].map(tf);
      const axis = tf === identity || corners.every((c, i) => c.x === corners[(i + 1) % 4]!.x || c.y === corners[(i + 1) % 4]!.y);
      if (axis) {
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        contours.push({ kind: 'rect', x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
      } else {
        contours.push({ kind: 'polygon', points: corners });
      }
    } else if (kind === 'circle') {
      const c = P(e.child('center'));
      const q = P(e.child('end'));
      contours.push({ kind: 'circle', cx: c.x, cy: c.y, r: Math.hypot(q.x - c.x, q.y - c.y) });
    } else if (kind === 'poly') {
      const points = (e.child('pts')?.children('xy') ?? []).map((n) => tf(pt(n)));
      if (points.length >= 3) contours.push({ kind: 'polygon', points });
    } else if (kind === 'line') {
      open.push([P(e.child('start')), P(e.child('end'))]);
    } else if (kind === 'arc') {
      open.push(arcPoints(P(e.child('start')), P(e.child('mid')), P(e.child('end'))));
    } else {
      return `unsupported Edge.Cuts item ${e.name}`;
    }
  }

  // chain open polylines into closed loops (endpoint match within 1µm)
  const key = (p: Pt) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const used = new Set<number>();
  for (let s = 0; s < open.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    const loop = [...open[s]!];
    for (;;) {
      const tail = key(loop[loop.length - 1]!);
      if (tail === key(loop[0]!) && loop.length > 2) break;
      const i = open.findIndex((seg, idx) => !used.has(idx) && (key(seg[0]!) === tail || key(seg[seg.length - 1]!) === tail));
      if (i < 0) return 'Edge.Cuts contour is not closed';
      used.add(i);
      const seg = key(open[i]![0]!) === tail ? open[i]! : [...open[i]!].reverse();
      loop.push(...seg.slice(1));
    }
    loop.pop();
    contours.push({ kind: 'polygon', points: loop });
  }

  const ranked = contours.map((c) => ({ c, poly: contourPolygon(c) })).sort((a, b) => polygonArea(b.poly) - polygonArea(a.poly));
  return { outer: ranked[0]!.c, cutouts: ranked.slice(1).map((r) => r.poly) };
}

// ── zones ───────────────────────────────────────────────────────────────

function readZones(root: SNode, nets: Map<number, string>, copperLayers: string[]): BoardZone[] {
  const out: BoardZone[] = [];
  for (const z of root.children('zone')) {
    const layers = expandCopper([...layerList(z.child('layers')), ...layerList(z.child('layer'))], copperLayers);
    const points = (z.child('polygon')?.child('pts')?.children('xy') ?? []).map(pt);
    if (layers.length === 0 || points.length < 3) continue;
    const ko = z.child('keepout');
    const allowed = (k: string) => ko?.child(k)?.getString(1) === 'allowed';
    out.push({
      keepout: !!ko,
      net: z.child('net_name')?.getString(1) ?? netNameOf(z.child('net'), nets),
      layers,
      points,
      priority: z.child('priority')?.getNumber(1) ?? 0,
      restrictions: ko ? { tracks: !allowed('tracks'), vias: !allowed('vias'), copperpour: !allowed('copperpour') } : undefined,
    });
  }
  return out;
}

// ── rules ───────────────────────────────────────────────────────────────

/**
 * Effective Default-class rules: KiCad enforces the larger of the net class
 * value and the board-setup minimum, so the router must honour that max.
 */
function readRules(root: SNode, proPath: string | null): BoardRules {
  const f = PCBWORLD_FALLBACK_RULES;
  if (proPath) {
    try {
      const pro = JSON.parse(fs.readFileSync(proPath, 'utf8'));
      const cls = (pro?.net_settings?.classes ?? []).find((c: { name?: string }) => c.name === 'Default');
      const m = pro?.board?.design_settings?.rules ?? {};
      if (cls) {
        const mx = (a: unknown, b: unknown, d: number) => Math.max(Number(a ?? 0) || 0, Number(b ?? 0) || 0) || d;
        return {
          clearance: mx(cls.clearance, m.min_clearance, f.clearance),
          trackWidth: mx(cls.track_width, m.min_track_width, f.trackWidth),
          viaDiameter: mx(cls.via_diameter, m.min_via_diameter, f.viaDiameter),
          viaDrill: mx(cls.via_drill, m.min_through_hole_diameter, f.viaDrill),
          copperEdgeClearance: Number(m.min_copper_edge_clearance ?? f.copperEdgeClearance),
          holeClearance: Number(m.min_hole_clearance ?? f.holeClearance),
          holeToHole: Number(m.min_hole_to_hole ?? f.holeToHole),
          viaAnnularWidth: Number(m.min_via_annular_width ?? f.viaAnnularWidth),
          source: 'kicad_pro',
          perNetClasses:
            (pro?.net_settings?.classes ?? []).length > 1 ||
            (pro?.net_settings?.netclass_patterns ?? []).length > 0 ||
            Object.keys(pro?.net_settings?.netclass_assignments ?? {}).length > 0,
        };
      }
    } catch {
      /* fall through to the legacy block */
    }
  }
  // Raw PCBWorld generator output: rules live in a legacy (net_class) block.
  // PCBWorld's own rule files for these sets (synth_2L_v2.yaml) put edge
  // clearance = clearance and leave hole-to-hole unconstrained.
  const legacy = root.children('net_class').find((c) => c.getString(1) === 'Default');
  if (legacy) {
    const num = (k: string, d: number) => legacy.child(k)?.getNumber(1) ?? d;
    const clearance = num('clearance', f.clearance);
    return {
      clearance,
      trackWidth: num('trace_width', f.trackWidth),
      viaDiameter: num('via_dia', f.viaDiameter),
      viaDrill: num('via_drill', f.viaDrill),
      copperEdgeClearance: clearance,
      holeClearance: clearance,
      holeToHole: 0,
      viaAnnularWidth: 0,
      source: 'legacy_net_class',
      perNetClasses: root.children('net_class').length > 1,
    };
  }
  return { ...f };
}

/** Pads grouped by net name, net-less pads dropped. */
export function padsByNet(board: BenchBoard): Map<string, Array<{ fp: BoardFootprint; pad: BoardPad }>> {
  const out = new Map<string, Array<{ fp: BoardFootprint; pad: BoardPad }>>();
  for (const fp of board.footprints) {
    for (const pad of fp.pads) {
      if (!pad.net) continue;
      const list = out.get(pad.net) ?? [];
      list.push({ fp, pad });
      out.set(pad.net, list);
    }
  }
  return out;
}
