#!/usr/bin/env node
// Build the PCBWorld benchmark sets the bench routes, under bench/pcbworld/data/.
//
// PCBWorld does not distribute its synthetic boards — it ships the generator,
// and the boards are regenerated bit-for-bit from fixed seeds. This script
// clones PCBWorld (sparse, pinned commit) and runs that generator:
//
//   d2a        D2-A test split: 128 two-layer boards (4–6 nets, 2–5 pads/net),
//              exactly the paper's synth_2L_v2 test set (seed 9999, legacy seeding)
//   d1-g<N>    D1-shaped test split at grid N: 128 one-layer boards, 5 nets × 2 pads
//              (PCBWorld's make_grid_dataset recipe; the paper's own D1 arrays are
//              not distributed)
//
// D3 (the 677 real PCBench boards) needs PCBWorld's KiCad-9 pcbnew build and is
// prepared with their tools/quickstart/prepare_pcbench.sh (Linux); this script
// only fetches configs/datasets/d3.json so the bench can read that split.
//
// Usage (any shell — plain Node, no bash needed):
//   npm run bench:pcbworld:fetch -w @typecad/pcb                      # d2a only
//   npm run bench:pcbworld:fetch -w @typecad/pcb -- --d1 "10 100 500" # + three D1 grids
//   node bench/pcbworld/fetch.mjs --dry-run                           # print the commands
//
// Needs git and Python 3.9+ (the generator is stdlib-only); set PYTHON to pick
// an interpreter. Re-running regenerates.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PCBWORLD_SHA = '57738250415db0d409f44aca36dd43af25432971';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(process.env.PCBWORLD_BENCH_DATA ?? path.join(HERE, 'data'));
const SRC = path.join(DATA, 'PCBWorld');

// ── arguments ───────────────────────────────────────────────────────────────
let d2aN = 128;
let d1Grids = [];
let d1Nets = 5;
let dryRun = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const val = () => {
    if (i + 1 >= argv.length) fail(`${a} needs a value`);
    return argv[++i];
  };
  if (a === '--d1') d1Grids = val().split(/[\s,]+/).filter(Boolean);
  else if (a === '--d1-nets') d1Nets = Number(val());
  else if (a === '--d2a-n') d2aN = Number(val());
  else if (a === '--dry-run') dryRun = true;
  else if (a === '-h' || a === '--help') {
    const head = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 25);
    console.log(head.map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  } else fail(`unknown argument: ${a} (see --help)`);
}
for (const g of d1Grids) if (!/^\d+$/.test(g)) fail(`--d1 grid sizes must be integers, got "${g}"`);

function fail(msg) {
  console.error(`[fetch] ${msg}`);
  process.exit(2);
}

function run(cmd, args, { allowFail = false } = {}) {
  console.error(`+ ${[cmd, ...args].map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(' ')}`);
  if (dryRun) return 0;
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) fail(`${cmd} exited with ${r.status}`);
  return r.status;
}

// ── python: first interpreter that is really 3.9+ (Windows' python3 may be a store stub)
function findPython() {
  const candidates = process.env.PYTHON
    ? [[process.env.PYTHON]]
    : [['python3'], ['python'], ['py', '-3']];
  for (const [cmd, ...pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'], {
      stdio: 'ignore',
    });
    if (!r.error && r.status === 0) return [cmd, ...pre];
  }
  return null;
}
const py = findPython();
if (!py) fail('Python 3.9+ not found; install it or set PYTHON=<path to python>');
if (spawnSync('git', ['--version'], { stdio: 'ignore' }).error) fail('git not found on PATH');
const [PY, ...PY_PRE] = py;

const countBoards = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.kicad_pcb')).length : 0);
const resetDir = (dir) => {
  if (dryRun) return;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
};

// ── 1. PCBWorld at the pinned commit (generator + split files only) ────────
if (!fs.existsSync(path.join(SRC, '.git'))) {
  if (!dryRun) fs.mkdirSync(DATA, { recursive: true });
  run('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', 'https://github.com/LGAI-Research/PCBWorld.git', SRC]);
}
run('git', [
  '-C', SRC, 'sparse-checkout', 'set', '--no-cone',
  '/LICENSE', '/docs/METRICS.md', '/tools/datagen/synthetic_generator/', '/configs/datasets/', '/configs/drc/', '/configs/__init__.py', '/configs/loader/',
  '/experiments/kdd/configs/datasets/', '/experiments/kdd/configs/drc/',
]);
run('git', ['-C', SRC, 'fetch', '--quiet', 'origin', PCBWORLD_SHA], { allowFail: true });
run('git', ['-C', SRC, 'checkout', '--quiet', PCBWORLD_SHA]);
const GEN = path.join(SRC, 'tools', 'datagen', 'synthetic_generator');

// ── 2. D2-A test split (generate_2layer_v2.sh's arguments, test side) ──────
const d2aOut = path.join(DATA, 'd2a', 'test');
resetDir(d2aOut);
run(PY, [
  ...PY_PRE, path.join(GEN, 'generate_synthetic_boards.py'),
  '--n', String(d2aN), '--seed', '9999', '--seed-mode', 'legacy', '--out-dir', d2aOut,
  '--mode', 'grid', '--pitch-formula', 'c+w', '--board-size-min', '80.0', '--board-size-max', '120.0',
  '--clearance', '0.3', '--trace-width', '0.3', '--pad-size', '2.4', '--via-dia', '1.2', '--via-drill', '0.6',
  '--num-layers', '2', '--thru-hole-prob', '0.3', '--central-frac', '0.9', '--nets-min', '4', '--nets-max', '6',
  '--pads-per-net-min', '2', '--pads-per-net-max', '5', '--pads-per-net-weights', '0.6,0.2,0.1,0.1',
  '--min-sep-formula', 'four-pitch',
]);
if (!dryRun) console.error(`[fetch] d2a: ${countBoards(d2aOut)} boards in ${d2aOut}`);

// ── 3. D1-shaped grids ─────────────────────────────────────────────────────
for (const g of d1Grids) {
  const gridDir = path.join(DATA, 'd1', `grid${g}`);
  const prefix = path.join(gridDir, 'gen'); // absolute: used as-is by the generator
  resetDir(gridDir);
  run(PY, [
    ...PY_PRE, path.join(GEN, 'generate_grid_boards.py'),
    '--grid', g, '--test-only', '--n-test', '128', '--seed-test', '1',
    '--nets', String(d1Nets), '--pins-per-net', '2', '--num-layers', '1', '--out-prefix', prefix,
  ]);
  if (!dryRun) {
    fs.renameSync(`${prefix}_test`, path.join(gridDir, 'test'));
    console.error(`[fetch] d1-g${g}: ${countBoards(path.join(gridDir, 'test'))} boards`);
  }
}

console.error(dryRun ? '[fetch] dry run: nothing executed' : '[fetch] done. Route them with:\n  PCBWORLD_SET=d2a npm run bench:pcbworld -w @typecad/pcb');
