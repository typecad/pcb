/**
 * Routes a PCBWorld board with the typecad autorouter, through the public
 * API only: each board footprint becomes a Component whose footprint is
 * served from `<buildDir>/lib/footprints/` (the loader's fallback library),
 * nets are declared under their original names, and the copper comes back
 * out of the board `pcb.create()` writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PCB } from '../../../src/pcb/pcb.js';
import { Component } from '../../../src/component.js';
import { prettyPrint, SNode, Sym, isList, type SExpr } from '../../../src/sexpr/index.js';
import type { IAutorouteRouteOptions } from '../../../src/pcb/pcb_interfaces.js';
import { readBoard, padsByNet, type BenchBoard, type BoardFootprint } from './board.js';

export interface RouteOptions {
  /** Router grid, mm per cell (typecad default 0.1). */
  gridResolution?: number;
  /** Per-search wall-clock budget, ms. */
  timeBudgetMs?: number;
  /** Per-net wall-clock budget, ms. */
  netTimeBudgetMs?: number;
  /** Extra options forwarded to every `pcb.route()` call. */
  extra?: Partial<IAutorouteRouteOptions>;
}

export interface NetOutcome {
  net: string;
  pads: number;
  success: boolean;
  completed: number;
  attempted: number;
  error?: string;
  ms: number;
}

export interface RouteRun {
  /** Copper nodes as written by typecad (segment/arc/via), net still by name. */
  copper: Array<{ node: SExpr[]; net: string }>;
  nets: NetOutcome[];
  /** Pads whose position/layers in typecad's board disagree with the input. */
  importMismatches: string[];
  routeMs: number;
  totalMs: number;
}

const sym = (n: string) => Sym.for(n);

/** Library-footprint form of a placed board footprint (pads only, local frame). */
export function toLibraryFootprint(fp: BoardFootprint, name: string): SExpr[] {
  const flip = fp.side === 'back';
  const swap = (s: string) => (flip ? s.replace(/^F\./, '\0').replace(/^B\./, 'F.').replace(/^\0/, 'B.') : s);
  const strip = new Set(['at', 'uuid', 'path', 'fp_line', 'fp_rect', 'fp_circle', 'fp_arc', 'fp_poly', 'fp_text', 'model', 'net', 'sheetname', 'sheetfile', 'attr']);

  const fixLayers = (node: SExpr[]): SExpr[] =>
    node.map((v, i) => (i > 0 && typeof v === 'string' && /^[FB]\./.test(v) ? swap(v) : v));

  const out: SExpr[] = [sym('footprint'), name, [sym('layer'), 'F.Cu']];
  for (const child of fp.raw.slice(1)) {
    if (!isList(child) || child.length === 0) continue;
    const n = SNode.from(child);
    if (strip.has(n.name) || n.name === 'layer') continue;
    if (n.name === 'property') {
      const key = n.getString(1);
      if (key !== 'Reference' && key !== 'Value') continue;
      out.push(child.filter((c) => !(isList(c) && ['uuid', 'at', 'layer', 'effects', 'hide'].includes(SNode.from(c).name))));
      continue;
    }
    if (n.name !== 'pad') continue;
    const pad: SExpr[] = [];
    for (const part of child) {
      if (!isList(part)) {
        pad.push(part);
        continue;
      }
      const p = SNode.from(part);
      if (p.name === 'net' || p.name === 'uuid') continue;
      if (p.name === 'at') {
        const px = p.getNumber(1);
        const py = p.getNumber(2);
        // board files store the pad angle absolute; libraries store it local
        let ang = p.getNumber(3) - fp.rotation;
        if (flip) ang = -ang;
        ang = Math.round((((ang % 360) + 360) % 360) * 1e6) / 1e6;
        pad.push([sym('at'), px, flip ? -py : py, ...(ang ? [ang] : [])]);
        continue;
      }
      if (p.name === 'layers') {
        pad.push(fixLayers(part));
        continue;
      }
      pad.push(part);
    }
    out.push(pad);
  }
  return out;
}

export function routeBoard(board: BenchBoard, workDir: string, opts: RouteOptions = {}): RouteRun {
  const t0 = performance.now();
  fs.rmSync(workDir, { recursive: true, force: true });
  const libDir = path.join(workDir, 'lib', 'footprints');
  fs.mkdirSync(libDir, { recursive: true });

  const prevBuild = process.env.TYPECAD_BUILD_DIR;
  process.env.TYPECAD_BUILD_DIR = workDir;
  try {
    const r = board.rules;
    // KiCad uses 0 for "no constraint"; typecad requires positive values
    const pos = (v: number) => Math.max(v, 0.001);
    const pcb = new PCB(board.id, {
      // typecad boards have >= 2 copper layers; routing is still restricted
      // to the input's own layers below (a 1-layer board gets no vias)
      layers: Math.max(2, board.copperLayers.length),
      rules: {
        min_clearance: pos(r.clearance),
        min_track_width: pos(r.trackWidth),
        min_via_diameter: pos(r.viaDiameter),
        min_through_hole_diameter: pos(r.viaDrill),
        min_via_annular_width: pos(r.viaAnnularWidth),
        min_copper_edge_clearance: pos(r.copperEdgeClearance),
        min_hole_to_copper: pos(r.holeClearance),
        min_hole_to_hole: pos(r.holeToHole),
      },
    });

    const o = board.outline?.outer;
    if (o?.kind === 'rect') pcb.outline(o.x, o.y, o.width, o.height);
    else if (o?.kind === 'polygon') pcb.outlinePolygon(o.points);
    else if (o?.kind === 'circle') pcb.outlineCircle(o.cx, o.cy, o.r);
    for (const c of board.outline?.cutouts ?? []) pcb.cutout(c);

    for (const z of board.zones) {
      if (z.keepout) {
        pcb.keepout({
          layers: z.layers,
          points: z.points,
          restrictions: { tracks: z.restrictions?.tracks, vias: z.restrictions?.vias, copperpour: z.restrictions?.copperpour },
        });
      } else {
        pcb.zone({ net: z.net || undefined, layers: z.layers, points: z.points, priority: z.priority });
      }
    }

    const comps = new Map<BoardFootprint, Component>();
    board.footprints.forEach((fp, i) => {
      // Content-addressed name: identical footprints share one library file
      const body = prettyPrint(toLibraryFootprint(fp, 'X'));
      const name = `FP_${createHash('sha1').update(body).digest('hex').slice(0, 16)}`;
      const file = path.join(libDir, `${name}.kicad_mod`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, prettyPrint(toLibraryFootprint(fp, name)));
      const c = new Component({ footprint: `Bench:${name}`, reference: fp.ref || `X${i}` });
      for (const pad of fp.pads) if (pad.number) c.pin(pad.number);
      c.pcb = { x: fp.x, y: fp.y, rotation: fp.rotation, side: fp.side };
      comps.set(fp, c);
    });
    const all = [...comps.values()];
    pcb.add(...all);
    pcb.stage(...all);

    // nets in ascending span order: short nets claim the direct paths first
    const groups = [...padsByNet(board)].filter(([, pads]) => pads.length >= 2);
    const span = (pads: Array<{ pad: { x: number; y: number } }>) => {
      const xs = pads.map((p) => p.pad.x);
      const ys = pads.map((p) => p.pad.y);
      return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
    };
    groups.sort((a, b) => span(a[1]) - span(b[1]));

    const routeOpts: IAutorouteRouteOptions = {
      width: r.trackWidth,
      clearance: r.clearance,
      layers: board.copperLayers,
      allowVias: board.copperLayers.length > 1,
      gridResolution: opts.gridResolution,
      timeBudgetMs: opts.timeBudgetMs ?? 15000,
      netTimeBudgetMs: opts.netTimeBudgetMs ?? 60000,
      ...opts.extra,
    };

    const netDefs = groups.map(([net, pads]) => ({
      net,
      pads: pads.length,
      // pads repeating a number are one pin; typecad routes each of its pads
      def: pcb.named(net).net(...new Set(pads.map(({ fp, pad }) => comps.get(fp)!.pin(pad.number)))),
    }));

    const tr = performance.now();
    const nets: NetOutcome[] = [];
    for (const { net, pads, def } of netDefs) {
      const ts = performance.now();
      try {
        const res = pcb.route(def, routeOpts);
        nets.push({
          net,
          pads,
          success: res.success,
          completed: res.completedCount,
          attempted: res.routeCount,
          error: res.success ? undefined : res.routeDetails.find((d) => !d.success)?.error,
          ms: performance.now() - ts,
          ...(process.env.BENCH_DEBUG_PATHS ? { paths: res.routeDetails.map((d) => d.path?.nodes.map((n) => `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.layer[0]}`).join(' ')) } : {}),
        });
      } catch (e) {
        nets.push({ net, pads, success: false, completed: 0, attempted: pads - 1, error: errMsg(e), ms: performance.now() - ts });
      }
    }
    const routeMs = performance.now() - tr;

    pcb.create(...all);
    const written = path.join(workDir, `${board.id}.kicad_pcb`);
    const out = readBoard(written, { copperLayers: board.copperLayers });

    return {
      copper: collectCopper(out),
      nets,
      importMismatches: comparePads(board, out),
      routeMs,
      totalMs: performance.now() - t0,
    };
  } finally {
    if (prevBuild === undefined) delete process.env.TYPECAD_BUILD_DIR;
    else process.env.TYPECAD_BUILD_DIR = prevBuild;
  }
}

function collectCopper(b: BenchBoard): RouteRun['copper'] {
  const out: RouteRun['copper'] = [];
  for (const kind of ['segment', 'arc', 'via']) {
    for (const n of b.root.children(kind)) {
      const netNode = n.child('net');
      const net = netNode
        ? typeof netNode.rawAt(1) === 'number'
          ? (b.nets.get(netNode.getNumber(1)) ?? '')
          : (netNode.getString(1) ?? '')
        : '';
      out.push({ node: n.raw, net });
    }
  }
  return out;
}

/** Every input pad must land where it started, on the same copper — else the score is meaningless. */
function comparePads(input: BenchBoard, written: BenchBoard): string[] {
  // typecad may rename references (PTOP -> F1), so match on what matters to
  // routing: pin name, position, copper layers and net
  const placed = written.footprints.flatMap((fp) => fp.pads);
  const layersKey = (l: string[]) => [...l].sort().join('+');
  // single-pad nets are never declared to typecad (nothing to route), so
  // their pads come back net-less — that is expected, not a mismatch
  const routed = new Set([...padsByNet(input)].filter(([, p]) => p.length >= 2).map(([n]) => n));
  const bad: string[] = [];
  for (const fp of input.footprints)
    for (const p of fp.pads) {
      const near = placed.filter((q) => q.number === p.number && Math.hypot(q.x - p.x, q.y - p.y) < 1e-3);
      const netOk = (q: { net: string }) => q.net === p.net || (!routed.has(p.net) && q.net === '');
      if (near.some((q) => layersKey(q.layers) === layersKey(p.layers) && netOk(q))) continue;
      const got = near[0];
      bad.push(
        `${fp.ref || '?'}.${p.number} @(${p.x.toFixed(3)},${p.y.toFixed(3)}) ${layersKey(p.layers)} [${p.net}]` +
          (got ? ` -> ${layersKey(got.layers)} [${got.net}]` : ' -> not at this position'),
      );
    }
  return bad;
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 300);
}
