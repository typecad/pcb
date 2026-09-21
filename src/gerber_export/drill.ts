// ---------------------------------------------------------------------------
// Excellon drill writer. Emits the kicad-cli default single merged file
// (PTH + NPTH) matching the golden fixtures:
//   - tool sections: ViaDrill (asc dia) → ComponentDrill (asc) → NPTH (asc),
//     NPTH D-codes numbered from T10
//   - decimal mm coordinates, trailing zeros trimmed to ≥ 1 decimal, Y
//     negated (same flip as gerbers)
//   - oval/obround drills plot as routed G85 slots (minor-dia tool), each
//     slot line followed by G05
//   - NPTH pads whose size equals the drill still drill (holes are real)
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { parse, SNode } from '../sexpr/index.js';
import { boardStem, TYPECAD_SOFTWARE } from './writer_utils.js';
import type { SExpr } from '../sexpr/index.js';
import { scalar } from './copper.js';

interface Hit {
  x: number;
  y: number;
}

interface Tool {
  dia: number;
  /** ViaDrill < ComponentDrill < NPTH */
  klass: 'ViaDrill' | 'ComponentDrill' | 'NPTH';
  plated: boolean;
  hits: Hit[];
  slots: Array<{ start: Hit; end: Hit }>;
}

const CLASS_ORDER = { ViaDrill: 0, ComponentDrill: 1, NPTH: 2 } as const;

/**
 * KiCad parses a decimal literal digit-wise: integer part × 10⁶ plus
 * trunc(strtod("0." + fraction) × 10⁶). Binary-inexact fractions (.0375)
 * therefore land 1nm BELOW the tie, exact ones (.9375) on it.
 */
function kicadNm(mm: number): number {
  const s = String(mm);
  const neg = s.startsWith('-');
  const [intPart, frac = ''] = s.replace('-', '').split('.');
  const nm = Number(intPart) * 1e6 + (frac ? Math.trunc(parseFloat(`0.${frac}`) * 1e6) : 0);
  return neg ? -nm : nm;
}

function fmtCoord(mm: number): string {
  // KiCad: xt = nm * 1e-6 (a double multiply — the direction its error
  // rounds is value-dependent), then fmt "{:.3f}" = round-half-even on the
  // exact double. Verified against 16 probe + golden data points.
  const nm = kicadNm(mm);
  const sign = nm < 0 ? -1 : 1;
  const scaled = Math.abs(nm) * 1e-6 * 1000;
  let q = Math.floor(scaled);
  const frac = scaled - q;
  if (frac > 0.5 || (frac === 0.5 && q % 2 === 1)) q += 1;
  mm = sign * (q / 1000);
  // 3 decimals, trailing zeros trimmed, at least one decimal kept
  let s = mm.toFixed(3);
  s = s.replace(/(\.\d*?)0+$/, '$1');
  if (s.endsWith('.')) s += '0';
  return s;
}

function diaKey(d: number): number {
  return Math.round(d * 1e6); // group tools at nm granularity
}

function padDrill(
  pad: SNode,
): { dia: number; major: number | null; majorIsX: boolean } | null {
  const dr = pad.child('drill');
  if (!dr) return null;
  // forms: (drill 1.6), (drill 0.6 1.8), (drill oval 0.6 1.8)
  let idx = 1;
  const first = dr.raw[1];
  if (first && typeof first === 'object' && 'name' in (first as object)) {
    idx = 2; // `(drill oval A B)` — the sym itself carries no diameter
  }
  const dia = scalar(dr, idx, Number.NaN);
  if (Number.isNaN(dia)) return null;
  const a = typeof dr.raw[idx] === 'number' || typeof dr.raw[idx] === 'string' ? scalar(dr, idx, 0) : 0;
  const bRaw = dr.raw[idx + 1];
  const b = typeof bRaw === 'number' || typeof bRaw === 'string' ? scalar(dr, idx + 1, 0) : a;
  return {
    dia: Math.min(a, b),
    major: b !== a ? Math.max(a, b) : null,
    majorIsX: a >= b,
  };
}

export interface DrillOptions {
  outDir: string;
  generationSoftware?: string;
  creationDate?: string;
  copperLayerCount: number;
}

function byHitOrder(a: Hit, b: Hit): number {
  // KiCad normalizes hits: ascending x, then descending gerber y (= board y asc)
  return a.x - b.x || b.y - a.y;
}

export function plotDrillFromSource(
  source: string,
  boardPath: string,
  opts: DrillOptions,
): string {
  const root = SNode.from(parse(source) as SExpr[]);
  const stem = boardStem(boardPath);
  const tools = new Map<string, Tool>();

  const toolFor = (dia: number, klass: Tool['klass']): Tool => {
    const key = `${klass}:${diaKey(dia)}`;
    let t = tools.get(key);
    if (!t) {
      t = { dia, klass, plated: klass !== 'NPTH', hits: [], slots: [] };
      tools.set(key, t);
    }
    return t;
  };

  const gerberY = (y: number): number => -y;

  // --- vias ----------------------------------------------------------------
  for (const via of root.children('via')) {
    const drill = scalar(via.child('drill')!, 1);
    const at = via.child('at')!;
    toolFor(drill, 'ViaDrill').hits.push({
      x: scalar(at, 1),
      y: gerberY(scalar(at, 2)),
    });
  }

  // --- pads with drills -----------------------------------------------------
  for (const fp of root.children('footprint')) {
    const fpAt = fp.child('at');
    const fpPos = { x: scalar(fpAt!, 1, 0), y: scalar(fpAt!, 2, 0) };
    const fpRot = ((fpAt ? scalar(fpAt, 3, 0) : 0) * Math.PI) / 180;
    const c = Math.cos(fpRot);
    const s = Math.sin(fpRot);
    for (const pad of fp.children('pad')) {
      const kind = String(pad.raw[2]);
      if (kind !== 'thru_hole' && kind !== 'np_thru_hole') continue;
      const d = padDrill(pad);
      if (!d) continue;
      const klass: Tool['klass'] = kind === 'np_thru_hole' ? 'NPTH' : 'ComponentDrill';
      const at = pad.child('at')!;
      const lx = scalar(at, 1);
      const ly = scalar(at, 2);
      // pad position rotates with the footprint (position matrix)
      const wx = fpPos.x + lx * c + ly * s;
      const wy = fpPos.y - lx * s + ly * c;
      const padAngle = scalar(at, 3, 0); // absolute (includes fp rotation)
      const t = toolFor(d.dia, klass);
      if (d.major !== null) {
        // slot: cap centers along the major axis. `(drill oval A B)` gives
        // A along pad-local X and B along local Y; the axis rotates with
        // the pad's absolute angle via the position matrix:
        //   local x → (cos θ, -sin θ)   local y → (sin θ, cos θ)
        const half = (d.major - d.dia) / 2;
        const ang = (padAngle * Math.PI) / 180;
        const cc = Math.cos(ang);
        const ss = Math.sin(ang);
        const dx = d.majorIsX ? cc * half : ss * half;
        const dy = d.majorIsX ? -ss * half : cc * half;
        const p1 = { x: wx + dx, y: gerberY(wy + dy) };
        const p2 = { x: wx - dx, y: gerberY(wy - dy) };
        // KiCad normalizes endpoints: ascending x, then ascending board y
        // (board y = -gerber y, so descending gerber y)
        const [a, b] =
          p1.x < p2.x || (p1.x === p2.x && p1.y > p2.y) ? [p1, p2] : [p2, p1];
        t.slots.push({ start: a, end: b });
      } else {
        t.hits.push({ x: wx, y: gerberY(wy) });
      }
    }
  }

  const ordered = [...tools.values()].sort(
    (a, b) => CLASS_ORDER[a.klass] - CLASS_ORDER[b.klass] || a.dia - b.dia,
  );

  const gen = opts.generationSoftware ?? TYPECAD_SOFTWARE;
  const now = opts.creationDate ?? new Date();
  const iso = now instanceof Date ? now.toISOString() : now;
  const lines: string[] = [];
  lines.push('M48');
  lines.push(`; DRILL file KiCad 10.0.0 date ${iso.slice(0, 19).replace('T', ' ')}`);
  lines.push('; FORMAT={-:-/ absolute / metric / decimal}');
  lines.push(`; #@! TF.CreationDate,${iso}`);
  lines.push(`; #@! TF.GenerationSoftware,${gen}`);
  lines.push(`; #@! TF.FileFunction,MixedPlating,1,${opts.copperLayerCount}`);
  lines.push('FMAT,2');
  lines.push('METRIC');

  // tools number sequentially (T1..Tn) in emission order — plated classes
  // first, NPTH last; no special NPTH numbering
  const dcodes = new Map<Tool, number>();
  ordered.forEach((t, i) => dcodes.set(t, i + 1));

  for (const t of ordered) {
    const fn = t.klass === 'ViaDrill' ? 'Plated,PTH,ViaDrill' : t.klass === 'ComponentDrill' ? 'Plated,PTH,ComponentDrill' : 'NonPlated,NPTH,ComponentDrill';
    lines.push(`; #@! TA.AperFunction,${fn}`);
    lines.push(`T${dcodes.get(t)}C${t.dia.toFixed(3)}`);
  }
  lines.push('%');
  lines.push('G90');
  lines.push('G05');
  // KiCad writes the body in two passes: every tool's plain hits first
  // (vias → component drills → NPTH), then the routed slots grouped by tool
  // again — a tool's section can therefore appear twice.
  const withHits = ordered.filter((t) => t.hits.length > 0);
  const withSlots = ordered.filter((t) => t.slots.length > 0);
  for (const t of withHits) {
    lines.push(`T${dcodes.get(t)}`);
    for (const h of [...t.hits].sort(byHitOrder)) lines.push(`X${fmtCoord(h.x)}Y${fmtCoord(h.y)}`);
  }
  for (const t of withSlots) {
    lines.push(`T${dcodes.get(t)}`);
    for (const sl of [...t.slots].sort((a, b) => byHitOrder(a.start, b.start))) {
      lines.push(
        `X${fmtCoord(sl.start.x)}Y${fmtCoord(sl.start.y)}G85X${fmtCoord(sl.end.x)}Y${fmtCoord(sl.end.y)}`,
      );
      lines.push('G05');
    }
  }
  lines.push('M30');

  const out = path.join(opts.outDir, `${stem}.drl`);
  fs.mkdirSync(opts.outDir, { recursive: true });
  fs.writeFileSync(out, lines.join('\r\n') + '\r\n');
  return out;
}
