// ---------------------------------------------------------------------------
// Copper-layer plotting: walk a parsed .kicad_pcb and emit one gerber per
// copper layer, following the KiCad conventions captured in gerber_spec.
//
// .kicad_pcb orientation rules this relies on (verified against golden
// fixtures and the rot_probe board):
//   - a pad's `(at x y angle)` angle is its ABSOLUTE orientation — footprint
//     rotation is already baked in by whoever wrote the board;
//   - a pad's `(at x y)` position is RELATIVE to the footprint and rotated
//     by the footprint angle at load: (x cosθ + y sinθ, −x sinθ + y cosθ);
//   - pad SHAPE rotation uses the transposed matrix (cosθ, −sinθ / sinθ,
//     cosθ) — verified numerically on the rotated roundrect corners.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { parse, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/index.js';
import { GerberWriter, type AperFunction, type ApertureShape, type Point } from './gerber_writer.js';

const DEG = Math.PI / 180;

export function scalar(node: SNode, index: number, fallback?: number): number {
  const v = node.raw[index];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number.parseFloat(v);
  return fallback ?? Number.NaN;
}

export function strings(node: SNode): string[] {
  return node.raw.slice(1).filter((v): v is string => typeof v === 'string');
}

/** rotate a local offset by a footprint angle (position transform) */
function rotatePos(x: number, y: number, deg: number): Point {
  const t = deg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: x * c + y * s, y: -x * s + y * c };
}

/** rotate a shape offset by a pad angle (shape transform — transposed) */
function rotateShape(p: Point, deg: number): Point {
  const t = deg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Circle through three points (arc tracks store start/mid/end). Uses
 * kimath's ArcCenter arrangement so float rounding matches KiCad's output. */
export function arcCenter(a: Point, m: Point, b: Point): Point {
  const sa = m.x - a.x;
  const sb = m.y - a.y;
  const sc = b.x - a.x;
  const sd = b.y - a.y;
  const se = sa * (a.x + m.x) + sb * (a.y + m.y);
  const sf = sc * (a.x + b.x) + sd * (a.y + b.y);
  const sg = 2 * (sa * (b.y - m.y) - sb * (b.x - m.x));
  return { x: (sd * se - sb * sf) / sg, y: (sa * sf - sc * se) / sg };
}

function polygonizeCircle(center: Point, radius: number, startDeg = 0): Point[] {
  // KiCad's observed fidelity: a 0.5 mm circle flattens to 21 vertices; the
  // native plotter targets comparable (not byte-identical) tessellation.
  const n = Math.max(8, Math.ceil((2 * Math.PI) / (2 * Math.acos(Math.max(0, 1 - 0.006 / radius)))));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (startDeg / 180) * Math.PI + (i * 2 * Math.PI) / n;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

interface CopperLayer {
  /** canonical name, e.g. F.Cu, In1.Cu, B.Cu */
  name: string;
  /** 1-based gerber file function index (F.Cu = 1 … B.Cu = N) */
  index: number;
  role: 'Top' | 'Bot' | 'Inr';
  extension: string;
}

export function copperLayers(root: SNode): CopperLayer[] {
  const names = new Set<string>();
  const layers = root.child('layers');
  if (layers) {
    for (const l of layers.children()) {
      const name = l.raw[1];
      if (typeof name === 'string' && name.endsWith('.Cu')) names.add(name);
    }
  } else {
    // typeCAD-written boards carry no layers block — infer the copper set
    // from what items reference (defaulting to a 2-layer board)
    names.add('F.Cu');
    names.add('B.Cu');
    for (const item of root.children()) {
      for (const key of ['layer', 'layers']) {
        const ln = item.child(key);
        if (ln)
          for (const v of ln.raw.slice(1))
            if (typeof v === 'string' && /^(In\d+\.Cu|F\.Cu|B\.Cu)$/.test(v)) names.add(v);
      }
    }
  }
  // Order by name: F.Cu, InN.Cu by N, B.Cu last — layer table ids are NOT
  // stable (kicad-cli --save-board renumbers them), but names/positions are.
  const inner = (n: string) => Number.parseInt(/^In(\d+)\.Cu$/.exec(n)?.[1] ?? '0', 10);
  const ordered = [...names].sort((a, b) => {
    const rank = (n: string) => (n === 'F.Cu' ? -1 : n === 'B.Cu' ? 999 : inner(n));
    return rank(a) - rank(b);
  });
  return ordered.map((name, i) => ({
    name,
    index: i + 1,
    role: i === 0 ? 'Top' : i === ordered.length - 1 ? 'Bot' : 'Inr',
    extension: name === 'F.Cu' ? 'gtl' : name === 'B.Cu' ? 'gbl' : `g${inner(name)}`,
  }));
}

function padTouchesLayer(padLayers: string[], layerName: string): boolean {
  if (padLayers.includes('*.Cu') || padLayers.includes('*')) return true;
  return padLayers.includes(layerName);
}

interface PadShapeResult {
  flashes: ApertureShape[]; // anchor first, then custom-pad primitives
}

export function padShapeApertures(pad: SNode, angle: number): PadShapeResult {
  const shape = String(pad.raw[3] ?? 'circle');
  const sizeNode = pad.child('size');
  const w = scalar(sizeNode!, 1);
  const h = scalar(sizeNode!, 2);
  switch (shape) {
    case 'circle':
      return { flashes: [{ kind: 'C', dia: w }] };
    case 'rect': {
      const norm = ((angle % 360) + 360) % 360;
      if (norm === 0) return { flashes: [{ kind: 'R', w, h }] };
      if (norm === 90 || norm === 270) return { flashes: [{ kind: 'R', w: h, h: w }] };
      return { flashes: [{ kind: 'RotRect', w, h, rot: angle }] };
    }
    case 'oval': {
      const norm = ((angle % 360) + 360) % 360;
      if (norm === 0 || norm === 180) return { flashes: [{ kind: 'O', w, h }] };
      if (norm === 90 || norm === 270) return { flashes: [{ kind: 'O', w: h, h: w }] };
      // thick line of the narrow dimension along the (rotated) major axis
      const minor = Math.min(w, h);
      const half = (Math.max(w, h) - minor) / 2;
      const dir = h >= w ? rotateShape({ x: 0, y: 1 }, angle) : rotateShape({ x: 1, y: 0 }, angle);
      return {
        flashes: [
          {
            kind: 'HorizOval',
            w: minor,
            end1: { x: dir.x * half, y: dir.y * half },
            end2: { x: -dir.x * half, y: -dir.y * half },
          },
        ],
      };
    }
    case 'roundrect': {
      const rratio = pad.child('roundrect_rratio');
      const r = (rratio ? scalar(rratio, 1, 0.25) : 0.25) * Math.min(w, h);
      const cx = w / 2 - r;
      const cy = h / 2 - r;
      const local: [Point, Point, Point, Point] = [
        { x: -cx, y: -cy },
        { x: cx, y: -cy },
        { x: cx, y: cy },
        { x: -cx, y: cy },
      ];
      return {
        flashes: [{ kind: 'RoundRect', r, corners: local.map((p) => rotateShape(p, angle)) as never }],
      };
    }
    case 'trapezoid': {
      const delta = pad.child('rect_delta');
      const dx = delta ? scalar(delta, 1, 0) : 0;
      const hw = w / 2;
      const hh = h / 2;
      const corners: [Point, Point, Point, Point] = [
        { x: -hw, y: -(hh + dx / 2) },
        { x: hw, y: -(hh - dx / 2) },
        { x: hw, y: hh - dx / 2 },
        { x: -hw, y: hh + dx / 2 },
      ];
      return { flashes: [{ kind: 'Outline4P', corners, rot: angle }] };
    }
    case 'custom': {
      const flashes: ApertureShape[] = [];
      const prims = pad.child('primitives');
      if (prims && prims.children().length > 0) {
        // KiCad flashes the primitives only — the anchor pad shape is not
        // emitted when a custom pad carries primitives (observed D14-18).
        for (const prim of prims.children()) {
          flashes.push(...primitiveAperture(prim, angle));
        }
        return { flashes };
      }
      const hw = w / 2;
      const hh = h / 2;
      flashes.push({
        kind: 'FreePoly',
        verts: [
          { x: -hw, y: -hh },
          { x: hw, y: -hh },
          { x: hw, y: hh },
          { x: -hw, y: hh },
        ],
        rot: angle,
      });
      return { flashes };
    }
    default:
      return { flashes: [{ kind: 'C', dia: Math.max(w, h) }] };
  }
}

function primitiveAperture(prim: SNode, angle: number): ApertureShape[] {
  switch (prim.name) {
    case 'gr_poly': {
      const pts = prim.child('pts');
      const verts: Point[] = [];
      if (pts) {
        for (const xy of pts.children('xy')) verts.push({ x: scalar(xy, 1), y: scalar(xy, 2) });
      }
      return [{ kind: 'FreePoly', verts, rot: angle }];
    }
    case 'gr_circle': {
      const c = prim.child('center')!;
      const e = prim.child('end')!;
      const center = { x: scalar(c, 1), y: scalar(c, 2) };
      const end = { x: scalar(e, 1), y: scalar(e, 2) };
      const r = Math.hypot(end.x - center.x, end.y - center.y);
      return [{ kind: 'FreePoly', verts: polygonizeCircle(center, r), rot: angle }];
    }
    case 'gr_rect': {
      const s = prim.child('start')!;
      const e = prim.child('end')!;
      const x1 = Math.min(scalar(s, 1), scalar(e, 1));
      const x2 = Math.max(scalar(s, 1), scalar(e, 1));
      const y1 = Math.min(scalar(s, 2), scalar(e, 2));
      const y2 = Math.max(scalar(s, 2), scalar(e, 2));
      return [
        {
          kind: 'FreePoly',
          verts: [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ],
          rot: angle,
        },
      ];
    }
    case 'gr_arc': {
      const s = prim.child('start')!;
      const m = prim.child('mid')!;
      const e = prim.child('end')!;
      const a = { x: scalar(s, 1), y: scalar(s, 2) };
      const mid = { x: scalar(m, 1), y: scalar(m, 2) };
      const b = { x: scalar(e, 1), y: scalar(e, 2) };
      const c = arcCenter(a, mid, b);
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const a0 = Math.atan2(a.y - c.y, a.x - c.x);
      let a1 = Math.atan2(b.y - c.y, b.x - c.x);
      // sweep direction from the mid point
      const cross = (mid.x - a.x) * (b.y - mid.y) - (mid.y - a.y) * (b.x - mid.x);
      if (cross > 0 && a1 < a0) a1 += 2 * Math.PI;
      if (cross < 0 && a1 > a0) a1 -= 2 * Math.PI;
      const verts: Point[] = [];
      const n = 32;
      for (let i = 0; i <= n; i++) {
        const t = a0 + ((a1 - a0) * i) / n;
        verts.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
      }
      return [{ kind: 'FreePoly', verts, rot: angle }];
    }
    case 'gr_line': {
      const s = prim.child('start')!;
      const e = prim.child('end')!;
      const wNode = prim.child('width');
      const width = wNode ? scalar(wNode, 1, 0) : 0;
      const a = { x: scalar(s, 1), y: scalar(s, 2) };
      const b = { x: scalar(e, 1), y: scalar(e, 2) };
      if (width <= 0) return [];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = ((b.y - a.y) / len) * (width / 2);
      const ny = (-(b.x - a.x) / len) * (width / 2) * -1;
      return [
        {
          kind: 'FreePoly',
          verts: [
            { x: a.x + nx, y: a.y + ny },
            { x: b.x + nx, y: b.y + ny },
            { x: b.x - nx, y: b.y - ny },
            { x: a.x - nx, y: a.y - ny },
          ],
          rot: angle,
        },
      ];
    }
    default:
      return [];
  }
}

/** map net code → net name (legacy `(net N "name")`); "" → N/C at emission */
function netNames(root: SNode): Map<number, string> {
  const map = new Map<number, string>();
  for (const net of root.children('net')) {
    if (typeof net.raw[1] === 'string') continue; // kicad-cli reserialized: name-only
    map.set(scalar(net, 1, 0), String(net.raw[2] ?? ''));
  }
  return map;
}

/**
 * Resolve an item's `(net …)` child: legacy `(net N)`, `(net N "name")`, or
 * kicad-cli's reserialized name-only `(net "name")`.
 */
function netOf(item: SNode, nets: Map<number, string>): string | null {
  const n = item.child('net');
  if (!n) return null;
  if (typeof n.raw[1] === 'string') return n.raw[1] === '' ? 'N/C' : n.raw[1];
  const code = scalar(n, 1, 0);
  const inline = typeof n.raw[2] === 'string' ? n.raw[2] : undefined;
  const name = inline ?? nets.get(code);
  return name === undefined || name === '' ? 'N/C' : name;
}

export function g(v: Point): Point {
  return { x: v.x, y: -v.y }; // board y-up → gerber y-down
}

export function atPoint(node: SNode | null, fallback: Point = { x: 0, y: 0 }): Point {
  if (!node) return fallback;
  return { x: scalar(node, 1, 0), y: scalar(node, 2, 0) };
}

export interface CopperPlotOptions {
  outDir: string;
  /** for %TF.GenerationSoftware (parity runs use "KiCad,Pcbnew,10.0.0") */
  generationSoftware?: string;
  creationDate?: string;
}

function boardStem(boardPath: string): string {
  return path.basename(boardPath).replace(/\.kicad_pcb$/, '');
}

function projectGuid(stem: string): string {
  // KiCad derives the ProjectId GUID from the board filename with uuid-v4
  // version/variant nibbles overlaid (not derivable); this matches the
  // observed shape without pretending to match KiCad's random tail.
  const bytes: number[] = [];
  for (const ch of `${stem}.kicad_pcb`) bytes.push(ch.charCodeAt(0) & 0xff);
  while (bytes.length < 16) bytes.push(0);
  bytes[6] = 0x40 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function plotCopperLayers(boardPath: string, opts: CopperPlotOptions): string[] {
  return plotCopperLayersFromSource(fs.readFileSync(boardPath, 'utf8'), boardPath, opts);
}

/** Parse + plot; split out so tests can pass source text directly. */
export function plotCopperLayersFromSource(
  source: string,
  boardPath: string,
  opts: CopperPlotOptions,
): string[] {
  const root = SNode.from(parse(source) as SExpr[]);
  const layers = copperLayers(root);
  const nets = netNames(root);
  const stem = boardStem(boardPath);
  fs.mkdirSync(opts.outDir, { recursive: true });

  const written: string[] = [];
  for (const layer of layers) {
    const w = new GerberWriter();
    const fileStem = layer.name.replace('.', '_'); // F.Cu → F_Cu
    plotOneCopperLayer(w, root, layer, layers, nets);
    const text = w.render({
      fileFunction: `Copper,L${layer.index},${layer.role}`,
      polarity: 'Positive',
      projectName: stem,
      projectGuid: projectGuid(stem),
      projectRevision: 'rev?',
      generationSoftware: opts.generationSoftware ?? 'typeCAD,gerber_export,0.1.0',
      creationDate: opts.creationDate ?? new Date().toISOString(),
    });
    const out = path.join(opts.outDir, `${stem}-${fileStem}.${layer.extension}`);
    fs.writeFileSync(out, text);
    written.push(out);
  }
  return written;
}

function plotOneCopperLayer(
  w: GerberWriter,
  root: SNode,
  layer: CopperLayer,
  layers: CopperLayer[],
  nets: Map<number, string>,
): void {
  // --- pads (footprints in file order, pads in file order) ----------------
  for (const fp of root.children('footprint')) {
    const fpAt = fp.child('at');
    const fpPos = atPoint(fpAt);
    const fpRot = fpAt ? scalar(fpAt, 3, 0) : 0;
    // footprint Reference property is the gerber %TO.P ref
    const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
    const ref = refProp ? String(refProp.raw[2] ?? '') : '';
    for (const pad of fp.children('pad')) {
      const padLayers = strings(pad.child('layers') ?? fp.child('layers')!);
      if (!padTouchesLayer(padLayers, layer.name)) continue;
      // NPTH pads whose size equals the drill are mechanical holes only —
      // KiCad does not flash them on copper (observed on J5's empty pad)
      const kindEarly = String(pad.raw[2]);
      if (kindEarly === 'np_thru_hole') {
        const sz = pad.child('size');
        const dr = pad.child('drill');
        if (sz && dr) {
          const dw = scalar(dr, 1, Number.NaN);
          const dh = dr && typeof dr.raw[2] === 'number' ? scalar(dr, 2, dw) : dw;
          if (
            Math.abs(scalar(sz, 1) - dw) < 1e-9 &&
            Math.abs(scalar(sz, 2) - (Number.isNaN(dh) ? dw : dh)) < 1e-9
          )
            continue;
        }
      }
      const padAt = pad.child('at')!;
      const local = atPoint(padAt);
      const angle = scalar(padAt, 3, 0);
      const world = {
        x: fpPos.x + rotatePos(local.x, local.y, fpRot).x,
        y: fpPos.y + rotatePos(local.x, local.y, fpRot).y,
      };
      const netNode = pad.child('net');
      const net = netNode ? netOf(pad, nets) : null;
      const hasNetAttr = netNode !== null; // no net child → no TO.N emission
      const kind = String(pad.raw[2]);
      const { flashes } = padShapeApertures(pad, angle);
      // AperFunction taxonomy (observed): thru_hole → ComponentPad (unless
      // giant → HeatsinkPad); smd → SMDPad,CuDef (tiny → BGAPad, CuDef)
      let aperFn: AperFunction = 'ComponentPad';
      if (kind === 'smd') {
        const sz = pad.child('size')!;
        const w1 = scalar(sz, 1);
        const h1 = scalar(sz, 2);
        if (w1 < 0.254 && h1 < 0.254) aperFn = 'BGAPad,CuDef';
        else if (w1 > 2.54 && h1 > 2.54) aperFn = 'HeatsinkPad';
        else aperFn = 'SMDPad,CuDef';
      }
      // attribute context before the first flash of the pad; inner layers
      // carry net + component attrs, outer layers net + pad-number
      const d0 = w.aperture(flashes[0]!, aperFn);
      w.selectAperture(d0);
      if (layer.role === 'Inr') w.innerPadAttrs(ref, hasNetAttr ? net : null);
      else w.padAttrs(ref, String(pad.raw[1] ?? ''), hasNetAttr ? net : null);
      for (const shape of flashes) {
        w.flash(w.aperture(shape, aperFn), g(world));
      }
    }
    // KiCad clears object attributes after each footprint's pads
    w.clearAttrs();
  }

  // --- vias ---------------------------------------------------------------
  // Through vias (no `type`, or `type through`) flash on EVERY copper layer;
  // only typed blind/buried/micro vias restrict to their span (observed:
  // KiCad plots the annulus wherever the type permits, ignoring `layers` for
  // through vias).
  const curIdx = layers.findIndex((l) => l.name === layer.name);
  for (const via of root.children('via')) {
    const vtype = via.child('type') ? String(via.child('type')!.raw[1]) : 'through';
    if (vtype === 'blind' || vtype === 'micro') {
      const span = strings(via.child('layers')!);
      const spanIdx = layers.filter((l) => span.includes(l.name)).map((l) => l.index);
      if (spanIdx.length === 0 || curIdx < 0) continue;
      const li = layers[curIdx]!.index;
      if (li < Math.min(...spanIdx) || li > Math.max(...spanIdx)) continue;
    }
    const size = scalar(via.child('size')!, 1);
    const at = atPoint(via.child('at'));
    const net = netOf(via, nets);
    w.selectAperture(w.aperture({ kind: 'C', dia: size }, 'ViaPad'));
    w.netAttr(net);
    w.flash(w.aperture({ kind: 'C', dia: size }, 'ViaPad'), g(at));
  }
  w.clearAttrs();

  // --- tracks: KiCad keeps segments and arcs in separate collections and
  // plots all segments first, then all arcs (observed on B_Cu ordering) -----
  for (const item of root.children()) {
    if (item.name !== 'segment') continue;
    if (String(item.child('layer')?.raw[1] ?? '') !== layer.name) continue;
    const width = scalar(item.child('width')!, 1);
    w.netAttr(netOf(item, nets));
    const d = w.aperture({ kind: 'C', dia: width }, 'Conductor');
    if (item.name === 'segment') {
      const s = atPoint(item.child('start'));
      const e = atPoint(item.child('end'));
      w.selectAperture(d);
      w.moveTo(g(s));
      w.lineTo(g(e));
    }
  }
  for (const item of root.children()) {
    if (item.name !== 'arc') continue;
    if (String(item.child('layer')?.raw[1] ?? '') !== layer.name) continue;
    const width = scalar(item.child('width')!, 1);
    w.netAttr(netOf(item, nets));
    const d = w.aperture({ kind: 'C', dia: width }, 'Conductor');
    {
      const s = atPoint(item.child('start'));
      const m = atPoint(item.child('mid'));
      const e = atPoint(item.child('end'));
      const c = arcCenter(s, m, e);
      const gs = g(s);
      const ge = g(e);
      const gc = g(c);
      // sweep direction: board-frame cross product (verified against golden)
      const cross = (m.x - s.x) * (e.y - m.y) - (m.y - s.y) * (e.x - m.x);
      w.selectAperture(d);
      w.moveTo(gs);
      w.arcTo(ge, { x: gc.x - gs.x, y: gc.y - gs.y }, cross > 0);
    }
  }
  w.clearAttrs();

  // --- zone pours (saved fills only — refill is the consumer's job) -------
  for (const zone of root.children('zone')) {
    // zones carry either (layers "A" "B") or kicad-cli's singular (layer "A")
    const layersNode = zone.child('layers') ?? zone.child('layer');
    if (!layersNode) continue;
    const zoneLayers = strings(layersNode);
    if (!zoneLayers.includes(layer.name)) continue;
    const fills = zone
      .children('filled_polygon')
      .filter((f) => !f.child('layer') || strings(f.child('layer')!).includes(layer.name));
    if (fills.length === 0) continue;
    w.objectAperFunction('Conductor');
    const nn = zone.child('net_name');
    w.netAttr(nn ? String(nn.raw[1] ?? '') || netOf(zone, nets) : netOf(zone, nets));
    // one G36 region per filled_polygon: hatch fills arrive as many
    // independent pieces (border band + line pieces), each a simple contour
    // — separate regions keep every region single-contour, which every
    // viewer tessellates trivially
    for (const fill of fills) {
      const pts = fill.child('pts');
      if (!pts) continue;
      const xy = pts.children('xy');
      if (xy.length === 0) continue;
      // KiCad closes each contour with an explicit repeat of the first vertex
      const firstPt = g({ x: scalar(xy[0]!, 1), y: scalar(xy[0]!, 2) });
      w.beginRegion();
      w.moveTo(firstPt);
      for (const p of xy.slice(1)) w.regionPoint(g({ x: scalar(p, 1), y: scalar(p, 2) }));
      w.regionPoint(firstPt);
      w.endRegion();
    }
    w.clearAperFunction();
  }
  w.clearAttrs();
}
