// ---------------------------------------------------------------------------
// Canonical layer table + graphics-layer plotting for the native gerber
// writer. Conventions captured from KiCad 10.0.0 golden fixtures
// (gerber_spec): file naming by long layer name, per-layer FileFunction /
// FilePolarity, gr_/fp_ primitive rendering, and pad-derived mask/paste.
//
// Ordering rules (observed):
//   - board-level gr_* graphics plot first, then footprint fp_* items and
//     pads, both in file order;
//   - footprint graphics open a %TO.C group BEFORE the aperture select,
//     mask/paste pads open it AFTER;
//   - a filled gr_poly renders as a stroked outline AND a G36 region;
//     gr_circle renders as two G02 semicircle arcs.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { boardStem, projectGuid, TYPECAD_SOFTWARE } from './writer_utils.js';
import { parse, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/index.js';
import { GerberWriter, type Point } from './gerber_writer.js';
import {
  arcCenter,
  atPoint,
  g,
  padShapeApertures,
  scalar,
  strings,
} from './copper.js';
import { parseEffects, renderStrokeText } from './text.js';

export interface LayerSpec {
  /** canonical short name as used by board items (e.g. F.SilkS) */
  short: string;
  /** filename stem (e.g. F_Silkscreen) */
  stem: string;
  extension: string;
  fileFunction: string;
  polarity?: 'Positive' | 'Negative';
}

/** Graphics (non-copper) layers KiCad emits by default, in observed order. */
export const GRAPHIC_LAYERS: LayerSpec[] = [
  { short: 'F.Paste', stem: 'F_Paste', extension: 'gtp', fileFunction: 'Paste,Top', polarity: 'Positive' },
  { short: 'B.Paste', stem: 'B_Paste', extension: 'gbp', fileFunction: 'Paste,Bot', polarity: 'Positive' },
  { short: 'F.SilkS', stem: 'F_Silkscreen', extension: 'gto', fileFunction: 'Legend,Top', polarity: 'Positive' },
  { short: 'B.SilkS', stem: 'B_Silkscreen', extension: 'gbo', fileFunction: 'Legend,Bot', polarity: 'Positive' },
  { short: 'F.Mask', stem: 'F_Mask', extension: 'gts', fileFunction: 'Soldermask,Top', polarity: 'Negative' },
  { short: 'B.Mask', stem: 'B_Mask', extension: 'gbs', fileFunction: 'Soldermask,Bot', polarity: 'Negative' },
  { short: 'F.Adhes', stem: 'F_Adhesive', extension: 'gta', fileFunction: 'Glue,Top', polarity: 'Positive' },
  { short: 'B.Adhes', stem: 'B_Adhesive', extension: 'gba', fileFunction: 'Glue,Bot', polarity: 'Positive' },
  { short: 'Edge.Cuts', stem: 'Edge_Cuts', extension: 'gm1', fileFunction: 'Profile,NP' },
  { short: 'Margin', stem: 'Margin', extension: 'gbr', fileFunction: 'Other,User' },
  { short: 'F.CrtYd', stem: 'F_Courtyard', extension: 'gbr', fileFunction: 'Other,User' },
  { short: 'B.CrtYd', stem: 'B_Courtyard', extension: 'gbr', fileFunction: 'Other,User' },
  { short: 'F.Fab', stem: 'F_Fab', extension: 'gbr', fileFunction: 'AssemblyDrawing,Top' },
  { short: 'B.Fab', stem: 'B_Fab', extension: 'gbr', fileFunction: 'AssemblyDrawing,Bot' },
  { short: 'Dwgs.User', stem: 'User_Drawings', extension: 'gbr', fileFunction: 'OtherDrawing,Comment' },
  { short: 'Cmts.User', stem: 'User_Comments', extension: 'gbr', fileFunction: 'Other,Comment' },
  { short: 'Eco1.User', stem: 'User_Eco1', extension: 'gbr', fileFunction: 'Other,ECO1' },
  { short: 'Eco2.User', stem: 'User_Eco2', extension: 'gbr', fileFunction: 'Other,ECO2' },
  { short: 'User.1', stem: 'User_1', extension: 'gbr', fileFunction: 'Other,User' },
  { short: 'User.2', stem: 'User_2', extension: 'gbr', fileFunction: 'Other,User' },
  { short: 'User.3', stem: 'User_3', extension: 'gbr', fileFunction: 'Other,User' },
  { short: 'User.4', stem: 'User_4', extension: 'gbr', fileFunction: 'Other,User' },
];

/** Pad-layer token that drives a graphics layer (mask/paste/adhesive). */
function padLayerToken(short: string): string | null {
  if (short === 'F.Mask' || short === 'B.Mask') return short;
  if (short === 'F.Paste' || short === 'B.Paste') return short;
  if (short === 'F.Adhes' || short === 'B.Adhes') return short;
  return null;
}

export interface GraphicsPlotOptions {
  outDir: string;
  generationSoftware?: string;
  creationDate?: string;
  projectGuid?: string;
}

function itemLayer(item: SNode): string {
  const ln = item.child('layer');
  return ln ? String(ln.raw[1] ?? '') : '';
}

function widthOf(item: SNode): number {
  const w = item.child('width') ?? item.child('stroke')?.child('width');
  return w ? scalar(w, 1, 0) : 0;
}

function ptsOf(item: SNode): Point[] {
  const pts = item.child('pts');
  if (!pts) return [];
  return pts.children('xy').map((xy) => ({ x: scalar(xy, 1), y: scalar(xy, 2) }));
}

export function plotGraphicsLayersFromSource(
  source: string,
  boardPath: string,
  opts: GraphicsPlotOptions,
): string[] {
  const root = SNode.from(parse(source) as SExpr[]);
  const stem = path.basename(boardPath).replace(/\.kicad_pcb$/, '');
  const guid = opts.projectGuid ?? projectGuid(stem);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const written: string[] = [];
  for (const layer of GRAPHIC_LAYERS) {
    const w = new GerberWriter();
    plotGraphicsLayer(w, root, layer);
    const text = w.render({
      fileFunction: layer.fileFunction,
      polarity: layer.polarity,
      projectName: stem,
      projectGuid: guid,
      projectRevision: 'rev?',
      generationSoftware: opts.generationSoftware ?? TYPECAD_SOFTWARE,
      creationDate: opts.creationDate ?? new Date().toISOString(),
    });
    const out = path.join(opts.outDir, `${stem}-${layer.stem}.${layer.extension}`);
    fs.writeFileSync(out, text);
    written.push(out);
  }
  return written;
}

function plotGraphicsLayer(w: GerberWriter, root: SNode, layer: LayerSpec): void {
  const isProfile = layer.short === 'Edge.Cuts';
  const padToken = padLayerToken(layer.short);

  // --- board-level graphics, file order -----------------------------------
  for (const item of root.children()) {
    if (!item.name.startsWith('gr_')) continue;
    if (itemLayer(item) !== layer.short) continue;
    if (item.name === 'gr_text') {
      drawTextItem(w, item, layer.short.startsWith('B.'), (p) => p);
      continue;
    }
    drawGraphicItem(w, item, { isProfile, map: (p) => p });
  }

  // --- footprint fp_* graphics: one %TO.C per footprint (replacing, no
  // inter-group TD), exactly one trailing TD when any group was opened -----
  let anyGroup = false;
  for (const fp of root.children('footprint')) {
    const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
    const fpAt = fp.child('at');
    const fpPos = atPoint(fpAt);
    const fpRot = fpAt ? scalar(fpAt, 3, 0) : 0;
    const c = Math.cos((fpRot * Math.PI) / 180);
    const s = Math.sin((fpRot * Math.PI) / 180);

    // texts render in a first pass, bare (no TO.C groups); graphics follow
    // in a second pass opening one attribute group per footprint
    const refValue = String(refProp?.raw[2] ?? '');
    const valProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Value');
    const valValue = String(valProp?.raw[2] ?? '');
    for (const item of fp.children()) {
      const isProp = item.name === 'property';
      const isFpText = item.name === 'fp_text';
      if (!isProp && !isFpText) continue;
      if (itemLayer(item) !== layer.short) continue;
      // KiCad substitutes ${REFERENCE}/${VALUE} tokens at plot time (shown
      // text) — both in legacy fp_text items and properties
      const raw = item.name === 'property' ? String(item.raw[2] ?? '') : String(item.raw[2] ?? '');
      const shown = raw
        .replace(/\$\{REFERENCE\}/gi, refValue)
        .replace(/\$\{VALUE\}/gi, valValue);
      drawTextItem(w, item, layer.short.startsWith('B.'), (p) => ({
        x: fpPos.x + p.x * c + p.y * s,
        y: fpPos.y - p.x * s + p.y * c,
      }), shown !== raw ? shown : undefined);
    }
  }
  for (const fp of root.children('footprint')) {
    const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
    const fpAt = fp.child('at');
    const fpPos = atPoint(fpAt);
    const fpRot = fpAt ? scalar(fpAt, 3, 0) : 0;
    const c = Math.cos((fpRot * Math.PI) / 180);
    const s = Math.sin((fpRot * Math.PI) / 180);

    let openedGroup = false;
    for (const item of fp.children()) {
      if (!item.name.startsWith('fp_') || item.name === 'fp_text') continue;
      if (itemLayer(item) !== layer.short) continue;
      if (!openedGroup) {
        w.componentAttr(refProp ? String(refProp.raw[2] ?? '') : ''); // attribute BEFORE aperture select
        openedGroup = true;
        anyGroup = true;
      }
      drawGraphicItem(w, item, {
        isProfile,
        map: (p) => ({ x: fpPos.x + p.x * c + p.y * s, y: fpPos.y - p.x * s + p.y * c }),
      });
    }
  }
  if (anyGroup) w.closeComponent();

  // --- mask/paste/adhesive pads: per-footprint groups closed with TD ------
  if (padToken) {
    const kind = padToken.split('.')[1]; // Mask | Paste | Adhes
    for (const fp of root.children('footprint')) {
      const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
      const ref = refProp ? String(refProp.raw[2] ?? '') : '';
      const fpAt = fp.child('at');
      const fpPos = atPoint(fpAt);
      const fpRot = fpAt ? scalar(fpAt, 3, 0) : 0;
      const c = Math.cos((fpRot * Math.PI) / 180);
      const s = Math.sin((fpRot * Math.PI) / 180);
      let flashed = false;
      for (const pad of fp.children('pad')) {
        const padLayers = strings(pad.child('layers') ?? fp.child('layers')!);
        const matches = padLayers.some((l) => l === padToken || l === `*.${kind}` || l === '*');
        if (!matches) continue;
        const padAt = pad.child('at')!;
        const local = atPoint(padAt);
        const angle = scalar(padAt, 3, 0);
        const world = {
          x: fpPos.x + local.x * c + local.y * s,
          y: fpPos.y - local.x * s + local.y * c,
        };
        const { flashes } = padShapeApertures(pad, angle);
        w.selectAperture(w.aperture(flashes[0]!));
        if (!flashed) {
          w.componentAttr(ref); // pads: aperture select first, then group
          flashed = true;
        }
        for (const shape of flashes) w.flash(w.aperture(shape), g(world));
      }
      w.closeComponent();
    }
  }
}


/**
 * KiCad's filled-poly rings (stroke AND region) start at the highest
 * board-frame vertex, tie-broken by max x (observed on both fixtures;
 * Clipper-style ring canonicalization).
 */
function ringFromTop(pts: Point[]): Point[] {
  if (pts.length < 2) return pts;
  // KiCad's SHAPE_LINE_CHAIN drops a repeated closing vertex
  let p = pts;
  if (p.length > 1 && p[0]!.x === p[p.length - 1]!.x && p[0]!.y === p[p.length - 1]!.y)
    p = p.slice(0, -1);
  pts = p;
  let best = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[best]!;
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) best = i;
  }
  return [...pts.slice(best), ...pts.slice(0, best)];
}

interface DrawOpts {
  isProfile: boolean;
  /** board-frame transform (identity for gr_*, rotate+translate for fp_*) */
  map: (p: Point) => Point;
}

function drawGraphicItem(w: GerberWriter, item: SNode, opts: DrawOpts): void {
  const width = widthOf(item);
  const aper = () => w.aperture({ kind: 'C', dia: width }, opts.isProfile ? 'Profile' : undefined);
  const B = (n: string): Point => opts.map(atPoint(item.child(n)));
  switch (item.name) {
    case 'gr_line':
    case 'fp_line': {
      const s = B('start');
      const e = B('end');
      w.selectAperture(aper());
      w.moveTo(g(s));
      w.lineTo(g(e));
      break;
    }
    case 'gr_rect':
    case 'fp_rect': {
      // KiCad canonicalizes rects to the min corner first, CW on screen
      const s = B('start');
      const e = B('end');
      const x1 = Math.min(s.x, e.x);
      const x2 = Math.max(s.x, e.x);
      const y1 = Math.min(s.y, e.y);
      const y2 = Math.max(s.y, e.y);
      const c1 = { x: x1, y: y1 };
      const c2 = { x: x2, y: y1 };
      const c3 = { x: x2, y: y2 };
      const c4 = { x: x1, y: y2 };
      w.selectAperture(aper());
      w.moveTo(g(c1));
      for (const p of [c2, c3, c4, c1]) w.lineTo(g(p));
      break;
    }
    case 'gr_arc':
    case 'fp_arc': {
      const s = B('start');
      const m = B('mid');
      const e = B('end');
      const c = arcCenter(s, m, e);
      const gs = g(s);
      const ge = g(e);
      const gc = g(c);
      const cross = (m.x - s.x) * (e.y - m.y) - (m.y - s.y) * (e.x - m.x);
      const clockwise = cross > 0;
      w.selectAperture(aper());
      if (opts.isProfile && !clockwise) {
        // KiCad normalizes outline arcs to clockwise (G02) traversal,
        // reversing start/end while keeping the same arc geometry
        w.moveTo(ge);
        w.arcTo(gs, { x: gc.x - ge.x, y: gc.y - ge.y }, true);
      } else {
        w.moveTo(gs);
        w.arcTo(ge, { x: gc.x - gs.x, y: gc.y - gs.y }, clockwise);
      }
      break;
    }
    case 'gr_circle':
    case 'fp_circle': {
      // KiCad renders circles as two G02 semicircle arcs. Unfilled: path at
      // the item radius from its end point. FILLED: a fat pen of r + w/2 on
      // a half-radius path (covers the disk plus half-stroke growth).
      const ctr = B('center');
      const end = B('end');
      const r = Math.hypot(end.x - ctr.x, end.y - ctr.y);
      const fill = item.child('fill');
      const filled = fill ? ['yes', 'solid'].includes(String(fill.raw[1] ?? '')) : false;
      const pathR = filled ? (r + width / 2) / 2 : r;
      const startPt = filled ? { x: ctr.x + pathR, y: ctr.y } : end;
      const mirror = { x: 2 * ctr.x - startPt.x, y: 2 * ctr.y - startPt.y };
      const dia = filled ? r + width / 2 : width;
      const gEnd = g(startPt);
      const gMirror = g(mirror);
      const gCtr = g(ctr);
      w.selectAperture(w.aperture({ kind: 'C', dia }, opts.isProfile ? 'Profile' : undefined));
      w.moveTo(gEnd);
      w.arcTo(gMirror, { x: gCtr.x - gEnd.x, y: gCtr.y - gEnd.y }, true);
      w.moveTo(gMirror);
      w.arcTo(gEnd, { x: gCtr.x - gMirror.x, y: gCtr.y - gMirror.y }, true);
      break;
    }
    case 'gr_poly':
    case 'fp_poly': {
      const raw = ptsOf(item);
      if (raw.length === 0) break;
      const pts = raw.map(opts.map);
      const fill = item.child('fill');
      const filled = fill ? ['yes', 'solid'].includes(String(fill.raw[1] ?? '')) : false;
      if (width > 0) {
        w.selectAperture(aper());
        if (filled) {
          const ring = ringFromTop(pts);
          w.moveTo(g(ring[0]!));
          for (const p of ring.slice(1)) w.lineTo(g(p));
          w.lineTo(g(ring[0]!));
        } else {
          w.moveTo(g(pts[0]!));
          for (const p of pts.slice(1)) w.lineTo(g(p));
          w.lineTo(g(pts[0]!));
        }
      }
      if (filled) {
        const ring = ringFromTop(pts);
        w.beginRegion();
        w.moveTo(g(ring[0]!));
        for (const p of ring.slice(1)) w.regionPoint(g(p));
        w.regionPoint(g(ring[0]!));
        w.endRegion();
      }
      break;
    }
    default:
      break;
  }
}



/**
 * Render a text item (gr_text / fp_text / footprint property). TTF texts
 * (effects font face) are skipped — outline-font rendering isn't implemented
 * (rendered as filled regions by KiCad; Phase 4+ scope).
 */
function drawTextItem(
  w: GerberWriter,
  item: SNode,
  isBack: boolean,
  map: (p: Point) => Point,
  textOverride?: string,
): void {
  const hideTok = item.child('hide')?.raw[1];
  const hidden = hideTok !== undefined && String((hideTok as { name?: string }).name ?? hideTok) === 'yes';
  if (hidden) return;
  const fx = parseEffects(item);
  const cache = fx.face ? item.children('render_cache')[0] : undefined;
  if (fx.face && cache) {
    // TTF text: boards carry KiCad's pre-rendered polygon cache (absolute
    // board coords) — render each polygon as stroke + filled region
    const size = fx.size ?? { x: 1, y: 1 };
    const pen = Math.min(fx.thickness ?? size.y / 8, size.y / 4);
    // regions only — KiCad selects the pen aperture but never strokes
    w.selectAperture(w.aperture({ kind: 'C', dia: pen }));
    for (const poly of cache.children('polygon')) {
      const ptsNode = poly.child('pts');
      if (!ptsNode) continue;
      const pts = ptsNode.children('xy').map((xy) => ({
        x: scalar(xy, 1),
        y: scalar(xy, 2),
      }));
      if (pts.length === 0) continue;
      w.beginRegion();
      w.moveTo(g(pts[0]!));
      for (const p of pts.slice(1)) w.regionPoint(g(p));
      w.regionPoint(g(pts[0]!));
      w.endRegion();
    }
    return;
  }
  // raw layouts differ: gr_text [token, TEXT, at…], property [token, key,
  // VALUE, at…], fp_text [token, type, TEXT, at…]
  const text =
    textOverride ??
    (item.name === 'gr_text' ? String(item.raw[1] ?? '') : String(item.raw[2] ?? ''));
  const at = item.child('at');
  if (!at || !text) return;
  const world = map({ x: scalar(at, 1, 0), y: scalar(at, 2, 0) });
  const angle = scalar(at, 3, 0); // saved text angles are absolute
  const size = fx.size ?? { x: 1, y: 1 };
  // positions use the raw thickness; the plotted pen is clamped to width/4
  // (KiCad ClampTextPenSize — probe-verified: th 0.3 at W 0.8 plots 0.2)
  const thickness = fx.thickness ?? size.y / 8;
  const pen = Math.min(thickness, size.y / 4);
  renderStrokeText(w, {
    text,
    at: world,
    angle,
    size,
    thickness,
    hJustify: fx.hJustify,
    vJustify: fx.vJustify,
    italic: fx.italic,
    mirror: fx.mirror || isBack,
    pen,
  });
}
