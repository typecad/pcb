/**
 * Scoring, following PCBWorld's docs/METRICS.md:
 *   CP   clean pass — fully connected AND zero error-level violations
 *   Rout routability = (R0 - R) / R0, R = remaining ratsnest edges
 *   DRV  error-level violations (unconnected items are counted by Rout, not DRV)
 *   WL   routed copper length, mm;  Via  via count
 *
 * Two checkers: `kicad-cli pcb drc` (authoritative, what PCBWorld uses) and
 * typecad's native engine (no install needed; runs in CI). Both read the
 * spliced board, so the router never scores itself.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, SNode, type SExpr } from '../../../src/sexpr/index.js';
import { runDrc, type DrcReport } from '../../../src/pcb/pcb_drc_engine.js';
import type { BenchBoard } from './board.js';

export type Checker = 'kicad-cli' | 'native';

export interface Score {
  checker: Checker;
  cleanPass: boolean;
  routability: number;
  /** Ratsnest edges on the bare board (R0) and after routing (R). */
  ratsnestBefore: number;
  ratsnestAfter: number;
  drv: number;
  /** Error-level violations by type. */
  drvByType: Record<string, number>;
  wirelength: number;
  vias: number;
}

export function findKicadCli(): string | null {
  const candidates = [
    process.env.KICAD_CLI,
    'C:/Program Files/KiCad/10.0/bin/kicad-cli.exe',
    'C:/Program Files/KiCad/9.0/bin/kicad-cli.exe',
    '/usr/bin/kicad-cli',
    '/usr/local/bin/kicad-cli',
    '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli',
  ].filter((c): c is string => Boolean(c));
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/** Ratsnest edges of the unrouted board: Σ (pads − 1) over nets with ≥2 pads. */
export function bareRatsnest(board: BenchBoard): number {
  const count = new Map<string, number>();
  for (const fp of board.footprints) for (const p of fp.pads) if (p.net) count.set(p.net, (count.get(p.net) ?? 0) + 1);
  let r = 0;
  for (const n of count.values()) r += Math.max(0, n - 1);
  return r;
}

export function copperStats(text: string): { wirelength: number; vias: number } {
  const root = SNode.from(parse(text) as SExpr[]);
  let wl = 0;
  const pt = (n: SNode | null) => [n?.getNumber(1) ?? 0, n?.getNumber(2) ?? 0] as const;
  for (const s of root.children('segment')) {
    const [ax, ay] = pt(s.child('start'));
    const [bx, by] = pt(s.child('end'));
    wl += Math.hypot(bx - ax, by - ay);
  }
  for (const a of root.children('arc')) {
    // chord-through-mid approximation; arcs are rare in router output
    const [ax, ay] = pt(a.child('start'));
    const [mx, my] = pt(a.child('mid'));
    const [bx, by] = pt(a.child('end'));
    wl += Math.hypot(mx - ax, my - ay) + Math.hypot(bx - mx, by - my);
  }
  return { wirelength: wl, vias: root.children('via').length };
}

function summarize(report: DrcReport, checker: Checker, board: BenchBoard, text: string): Score {
  const drvByType: Record<string, number> = {};
  let drv = 0;
  for (const v of report.violations) {
    if (v.severity !== 'error') continue;
    drv++;
    drvByType[v.type] = (drvByType[v.type] ?? 0) + 1;
  }
  const before = bareRatsnest(board);
  const after = report.unconnected_items.length;
  // R0 counts pad-to-pad edges only; a board whose nets also include copper
  // graphics or zones can report unconnected items with R0 = 0 — that is
  // unrouted, not perfect
  const routability = before === 0 ? (after === 0 ? 1 : 0) : Math.max(0, (before - after) / before);
  return {
    checker,
    cleanPass: after === 0 && drv === 0,
    routability,
    ratsnestBefore: before,
    ratsnestAfter: after,
    drv,
    drvByType,
    ...copperStats(text),
  };
}

export function scoreNative(board: BenchBoard, text: string): Score {
  const r = board.rules;
  const report = runDrc(text, {
    min_clearance: r.clearance,
    min_track_width: r.trackWidth,
    min_via_diameter: r.viaDiameter,
    min_through_hole_diameter: r.viaDrill,
    min_copper_edge_clearance: r.copperEdgeClearance,
    min_via_annular_width: r.viaAnnularWidth,
    min_hole_to_hole: r.holeToHole,
    min_hole_to_copper: r.holeClearance,
  });
  return summarize(report, 'native', board, text);
}

/**
 * The project file the scored board is checked against: the input's own
 * `.kicad_pro` when it has one, else one written from the rules the bench
 * read (raw generator output carries only a legacy net_class block, which
 * KiCad 6+ does not apply as project rules). KiCad fills omitted keys with
 * its defaults.
 */
export function writeProject(board: BenchBoard, dest: string): void {
  if (board.proPath) {
    fs.copyFileSync(board.proPath, dest);
    return;
  }
  const r = board.rules;
  const pro = {
    board: {
      design_settings: {
        rules: {
          min_clearance: 0,
          min_track_width: 0,
          min_via_diameter: r.viaDiameter,
          min_through_hole_diameter: r.viaDrill,
          min_via_annular_width: r.viaAnnularWidth,
          min_copper_edge_clearance: r.copperEdgeClearance,
          min_hole_clearance: r.holeClearance,
          min_hole_to_hole: r.holeToHole,
        },
      },
    },
    meta: { filename: path.basename(dest), version: 3 },
    net_settings: {
      classes: [
        {
          name: 'Default',
          clearance: r.clearance,
          track_width: r.trackWidth,
          via_diameter: r.viaDiameter,
          via_drill: r.viaDrill,
          microvia_diameter: 0.3,
          microvia_drill: 0.1,
          diff_pair_gap: r.clearance,
          diff_pair_width: r.trackWidth,
          priority: 2147483647,
        },
      ],
      meta: { version: 4 },
    },
  };
  fs.writeFileSync(dest, JSON.stringify(pro, null, 2) + '\n');
}

/**
 * `kicad-cli pcb drc` on the spliced board, with the input's `.kicad_pro`
 * copied alongside so the board is checked against its own rules.
 */
export function scoreKicad(board: BenchBoard, text: string, cli: string, keepDir?: string): Score {
  const dir = keepDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pcbworld-drc-'));
  fs.mkdirSync(dir, { recursive: true });
  const pcbPath = path.join(dir, `${board.id}.kicad_pcb`);
  const reportPath = path.join(dir, `${board.id}.drc.json`);
  fs.writeFileSync(pcbPath, text);
  writeProject(board, path.join(dir, `${board.id}.kicad_pro`));
  try {
    execFileSync(cli, ['pcb', 'drc', '--format', 'json', '--severity-all', '--units', 'mm', '--output', reportPath, pcbPath], {
      stdio: 'pipe',
      timeout: 300_000,
    });
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as DrcReport;
    return summarize(report, 'kicad-cli', board, text);
  } finally {
    if (!keepDir) fs.rmSync(dir, { recursive: true, force: true });
  }
}
