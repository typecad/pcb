/**
 * PCBWorld bench entry point. Runs under vitest (the repo's TypeScript
 * runtime) via its own config, so it never runs as part of `npm test`:
 *
 *   npm run bench:pcbworld -w @typecad/pcb
 *
 * Configured through environment variables (see README.md):
 *   PCBWORLD_SET        smoke | fixtures | d2a | d1-g<N> | d3a|d3b|d3c | <dir|file>   (default smoke)
 *   PCBWORLD_LIMIT      route at most N boards
 *   PCBWORLD_FILTER     only boards whose path contains this substring
 *   PCBWORLD_CHECKER    kicad | native | both                                (default both)
 *   PCBWORLD_GRID       router grid resolution, mm                           (typecad default 0.1)
 *   PCBWORLD_TIME_MS    per-search time budget, ms                           (default 15000)
 *   PCBWORLD_NET_MS     per-net time budget, ms                              (default 60000)
 *   PCBWORLD_OUT        output dir           (default bench/pcbworld/results/<set>/<timestamp>)
 *   PCBWORLD_BASELINE   summary.json to compare against; the run fails on a regression
 *   PCBWORLD_KEEP_WORK  1 = keep typecad's per-board build dirs and DRC reports
 */
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSet, BENCH_DIR } from './lib/sets.js';
import { runBench, compareToBaseline, type CheckerChoice, type Summary } from './lib/run.js';

const env = process.env;
const num = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v));

it(`pcbworld bench: ${env.PCBWORLD_SET ?? 'smoke'}`, () => {
  const set = resolveSet(env.PCBWORLD_SET ?? 'smoke');
  let files = set.files;
  if (env.PCBWORLD_FILTER) files = files.filter((f) => f.includes(env.PCBWORLD_FILTER!));
  const limit = num(env.PCBWORLD_LIMIT);
  if (limit) files = files.slice(0, limit);
  if (files.length === 0) throw new Error(`no boards for set "${set.name}" — ${set.hint ?? 'check the path'}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = env.PCBWORLD_OUT ?? path.join(BENCH_DIR, 'results', set.name, stamp);
  const t0 = Date.now();
  const log = (s: string) => process.stdout.write(s + '\n');
  log(`[pcbworld] ${set.name}: ${files.length} board(s) -> ${outDir}`);

  const { summary } = runBench({
    setName: set.name,
    files,
    outDir,
    checker: (env.PCBWORLD_CHECKER as CheckerChoice) ?? 'both',
    keepWork: env.PCBWORLD_KEEP_WORK === '1',
    route: {
      gridResolution: num(env.PCBWORLD_GRID),
      timeBudgetMs: num(env.PCBWORLD_TIME_MS),
      netTimeBudgetMs: num(env.PCBWORLD_NET_MS),
      extra: env.PCBWORLD_NO_STEINER === '1' ? { useSteinerOptimization: false } : undefined,
    },
    onRow: (r) => {
      const sc = r.score;
      const verdict = r.crash ? `CRASH ${r.crash}` : r.invalid ? `INVALID ${r.invalid}` : sc ? `${sc.cleanPass ? 'CLEAN' : 'fail '} rout=${(sc.routability * 100).toFixed(0)}% drv=${sc.drv}` : '';
      log(`[pcbworld]   ${r.id.padEnd(40)} ${verdict}  ${r.routeSeconds.toFixed(1)}s`);
    },
  });

  log(
    `[pcbworld] CP ${(summary.cleanPassRate * 100).toFixed(1)}% (${summary.cleanPass}/${summary.scored + summary.crashed})` +
      `  Rout ${(summary.routability * 100).toFixed(1)}%  DRV ${summary.drv.toFixed(2)}  WL ${summary.wirelength.toFixed(1)}mm` +
      `  Via ${summary.vias.toFixed(2)}  [${summary.checker}, ${((Date.now() - t0) / 1000).toFixed(0)}s] -> ${path.join(outDir, 'summary.md')}`,
  );

  if (env.PCBWORLD_BASELINE) {
    const baseline = JSON.parse(fs.readFileSync(env.PCBWORLD_BASELINE, 'utf8')) as Summary;
    const regressions = compareToBaseline(summary, baseline);
    expect(regressions, `regressions vs ${env.PCBWORLD_BASELINE}`).toEqual([]);
  }
});
