/**
 * The bench loop: for each board, read → route → splice → score, writing the
 * routed board, one JSON row per board, and a summary. Rows are written as
 * they finish, so an interrupted run still leaves usable results.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readBoard } from './board.js';
import { routeBoard, type RouteOptions } from './route.js';
import { spliceCopper } from './splice.js';
import { findKicadCli, scoreKicad, scoreNative, writeProject, type Score } from './score.js';
import { boardIdFor } from './sets.js';

export type CheckerChoice = 'kicad' | 'native' | 'both';

export interface RunConfig {
  setName: string;
  files: string[];
  outDir: string;
  checker: CheckerChoice;
  route: RouteOptions;
  /** Keep per-board typecad work dirs (default: deleted after scoring). */
  keepWork?: boolean;
  onRow?: (row: Row) => void;
}

export interface Row {
  id: string;
  file: string;
  pads: number;
  nets: number;
  layers: number;
  rulesSource: string;
  perNetClasses: boolean;
  /** Set when the bench could not stage the board faithfully — the scores are not meaningful. */
  invalid?: string;
  /** Router's own view: nets it reported as fully routed. */
  routerNetsOk: number;
  routerErrors: string[];
  routeSeconds: number;
  /** The score PCBWorld would report (kicad-cli when available). */
  score?: Score;
  native?: Score;
  kicad?: Score;
  /** native and kicad-cli disagree on clean pass. */
  checkerDisagree?: boolean;
  crash?: string;
}

export interface Summary {
  set: string;
  boards: number;
  scored: number;
  invalid: number;
  crashed: number;
  checker: string;
  cleanPass: number;
  cleanPassRate: number;
  routability: number;
  drv: number;
  wirelength: number;
  vias: number;
  routeSeconds: number;
  checkerDisagreements: number;
  drvByType: Record<string, number>;
  startedAt: string;
  finishedAt: string;
  config: { route: RouteOptions; checker: CheckerChoice };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function runBench(cfg: RunConfig): { rows: Row[]; summary: Summary } {
  const startedAt = new Date().toISOString();
  const boardsDir = path.join(cfg.outDir, 'boards');
  const workRoot = path.join(cfg.outDir, 'work');
  fs.mkdirSync(boardsDir, { recursive: true });
  const rowsPath = path.join(cfg.outDir, 'rows.jsonl');
  fs.writeFileSync(rowsPath, '');

  const cli = cfg.checker === 'native' ? null : findKicadCli();
  if (cfg.checker === 'kicad' && !cli) throw new Error('PCBWORLD_CHECKER=kicad but kicad-cli was not found (set KICAD_CLI)');

  const rows: Row[] = [];
  for (const file of cfg.files) {
    const row = benchOne(file, cfg, cli, boardsDir, workRoot);
    rows.push(row);
    fs.appendFileSync(rowsPath, JSON.stringify(row) + '\n');
    cfg.onRow?.(row);
  }
  if (!cfg.keepWork) fs.rmSync(workRoot, { recursive: true, force: true });

  const summary = summarize(cfg, rows, startedAt, cli ? 'kicad-cli' : 'native');
  fs.writeFileSync(path.join(cfg.outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(cfg.outDir, 'summary.md'), renderMarkdown(summary, rows));
  return { rows, summary };
}

function benchOne(file: string, cfg: RunConfig, cli: string | null, boardsDir: string, workRoot: string): Row {
  let board;
  try {
    board = readBoard(file, { id: boardIdFor(file) });
  } catch (e) {
    return blankRow(path.basename(file), file, { crash: `read: ${msg(e)}` });
  }
  const pads = board.footprints.reduce((s, f) => s + f.pads.filter((p) => p.net).length, 0);
  const base = blankRow(board.id, file, {
    pads,
    nets: new Set(board.footprints.flatMap((f) => f.pads.map((p) => p.net)).filter(Boolean)).size,
    layers: board.copperLayers.length,
    rulesSource: board.rules.source,
    perNetClasses: !!board.rules.perNetClasses,
  });
  if (!board.outline) return { ...base, invalid: `outline: ${board.outlineProblem}` };

  try {
    const run = routeBoard(board, path.join(workRoot, board.id), cfg.route);
    const { text, dropped } = spliceCopper(board, run.copper);
    const out = path.join(boardsDir, `${board.id}.kicad_pcb`);
    fs.writeFileSync(out, text);
    writeProject(board, path.join(boardsDir, `${board.id}.kicad_pro`));

    const row: Row = {
      ...base,
      routerNetsOk: run.nets.filter((n) => n.success).length,
      routerErrors: [...new Set(run.nets.filter((n) => n.error).map((n) => n.error!))].slice(0, 5),
      routeSeconds: run.routeMs / 1000,
    };
    if (run.importMismatches.length) row.invalid = `import: ${run.importMismatches.length} pad(s) misplaced, e.g. ${run.importMismatches[0]}`;
    else if (dropped) row.invalid = `splice: ${dropped} copper item(s) on undeclared nets`;

    if (cfg.checker !== 'kicad') row.native = scoreNative(board, text);
    if (cli) row.kicad = scoreKicad(board, text, cli, cfg.keepWork ? path.join(workRoot, board.id, 'drc') : undefined);
    row.score = row.kicad ?? row.native;
    if (row.kicad && row.native) row.checkerDisagree = row.kicad.cleanPass !== row.native.cleanPass;
    return row;
  } catch (e) {
    return { ...base, crash: msg(e) };
  }
}

function blankRow(id: string, file: string, extra: Partial<Row>): Row {
  return {
    id,
    file,
    pads: 0,
    nets: 0,
    layers: 0,
    rulesSource: '',
    perNetClasses: false,
    routerNetsOk: 0,
    routerErrors: [],
    routeSeconds: 0,
    ...extra,
  };
}

function summarize(cfg: RunConfig, rows: Row[], startedAt: string, checker: string): Summary {
  const scored = rows.filter((r) => r.score && !r.invalid);
  const s = scored.map((r) => r.score!);
  const drvByType: Record<string, number> = {};
  for (const sc of s) for (const [k, v] of Object.entries(sc.drvByType)) drvByType[k] = (drvByType[k] ?? 0) + v;
  const cp = s.filter((x) => x.cleanPass).length;
  const crashed = rows.filter((r) => r.crash).length;
  // crashed boards count as failures (a router that throws has not routed);
  // invalid boards are excluded — the bench, not the router, failed there
  const denom = scored.length + crashed;
  return {
    set: cfg.setName,
    boards: rows.length,
    scored: scored.length,
    invalid: rows.filter((r) => r.invalid).length,
    crashed,
    checker,
    cleanPass: cp,
    cleanPassRate: denom ? cp / denom : 0,
    routability: mean(s.map((x) => x.routability)),
    drv: mean(s.map((x) => x.drv)),
    wirelength: mean(s.map((x) => x.wirelength)),
    vias: mean(s.map((x) => x.vias)),
    routeSeconds: mean(scored.map((r) => r.routeSeconds)),
    checkerDisagreements: rows.filter((r) => r.checkerDisagree).length,
    drvByType,
    startedAt,
    finishedAt: new Date().toISOString(),
    config: { route: cfg.route, checker: cfg.checker },
  };
}

function renderMarkdown(s: Summary, rows: Row[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `# PCBWorld bench — ${s.set}`,
    '',
    `${s.boards} boards · ${s.scored} scored · ${s.invalid} invalid · ${s.crashed} crashed · checker: ${s.checker}`,
    '',
    '| CP | Rout. | DRV | WL (mm) | Via | Route s |',
    '|---:|---:|---:|---:|---:|---:|',
    `| ${pct(s.cleanPassRate)} (${s.cleanPass}) | ${pct(s.routability)} | ${s.drv.toFixed(2)} | ${s.wirelength.toFixed(1)} | ${s.vias.toFixed(2)} | ${s.routeSeconds.toFixed(1)} |`,
    '',
    `DRV by type: ${Object.entries(s.drvByType).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    s.checkerDisagreements ? `\nNative and kicad-cli disagree on ${s.checkerDisagreements} board(s).` : '',
    '',
    '| board | pads | CP | Rout. | DRV | WL | Via | s | note |',
    '|---|---:|:-:|---:|---:|---:|---:|---:|---|',
    ...rows.map((r) => {
      const sc = r.score;
      const note = r.crash ? `crash: ${r.crash}` : r.invalid ? `invalid: ${r.invalid}` : (r.routerErrors[0] ?? '');
      return `| ${r.id} | ${r.pads} | ${sc ? (sc.cleanPass ? '✓' : '✗') : '–'} | ${sc ? pct(sc.routability) : '–'} | ${sc?.drv ?? '–'} | ${sc ? sc.wirelength.toFixed(1) : '–'} | ${sc?.vias ?? '–'} | ${r.routeSeconds.toFixed(1)} | ${note.replace(/\|/g, '/').slice(0, 120)} |`;
    }),
    '',
  ];
  return lines.join('\n');
}

/** Regression check against a previous summary.json. Returns human-readable failures. */
export function compareToBaseline(current: Summary, baseline: Summary, tol = { cleanPassRate: 0.0, routability: 0.005 }): string[] {
  const fail: string[] = [];
  if (current.cleanPassRate < baseline.cleanPassRate - tol.cleanPassRate)
    fail.push(`clean pass ${(current.cleanPassRate * 100).toFixed(1)}% < baseline ${(baseline.cleanPassRate * 100).toFixed(1)}%`);
  if (current.routability < baseline.routability - tol.routability)
    fail.push(`routability ${(current.routability * 100).toFixed(1)}% < baseline ${(baseline.routability * 100).toFixed(1)}%`);
  if (current.crashed > baseline.crashed) fail.push(`crashes ${current.crashed} > baseline ${baseline.crashed}`);
  return fail;
}

function msg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 300);
}
