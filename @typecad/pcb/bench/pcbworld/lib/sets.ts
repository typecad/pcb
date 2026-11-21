/**
 * Board sets the bench knows by name. Generated data lives under
 * `bench/pcbworld/data/` (gitignored; written by fetch.sh), the smoke set
 * ships with the repo in `fixtures/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.PCBWORLD_BENCH_DATA ?? path.join(BENCH_DIR, 'data');
export const FIXTURES_DIR = path.join(BENCH_DIR, 'fixtures');

/** Small boards that route in a few seconds and come back clean — the CI gate. */
export const SMOKE_BOARDS = [
  'two_net_multiterm_board',
  'simple_routing_board',
  'simple_obstacle_board',
  'simple_keepout_board',
  'shared_path_board',
  'crossover_board',
  'jumanji_grid1000_board_00000',
  'donut_cutout_board',
  'corner_staircase_edge',
];

export interface BoardSet {
  name: string;
  files: string[];
  /** Human hint printed when a set resolves to nothing. */
  hint?: string;
}

function kicadPcbsIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.kicad_pcb'))
    .sort()
    .map((f) => path.join(dir, f));
}

const FETCH_HINT = 'run `bash bench/pcbworld/fetch.sh` first (see bench/pcbworld/README.md)';

/**
 * Resolve a set name:
 *   smoke | fixtures          bundled PCBWorld test fixtures
 *   d2a                       D2-A test split (128 synthetic 2-layer boards)
 *   d1-g<N>                   D1 test split at grid N (10, 50, 100, 200, 500)
 *   d3a | d3b | d3c           D3 real boards; needs PCBWORLD_DATA_ROOT with
 *                             pcbench/exacad_sorted from PCBWorld's prep chain
 *   <dir> | <file.kicad_pcb>  anything else
 */
export function resolveSet(name: string): BoardSet {
  if (name === 'smoke') {
    return { name, files: SMOKE_BOARDS.map((b) => path.join(FIXTURES_DIR, `${b}.kicad_pcb`)) };
  }
  if (name === 'fixtures') return { name, files: kicadPcbsIn(FIXTURES_DIR) };
  if (name === 'd2a') return { name, files: kicadPcbsIn(path.join(DATA_DIR, 'd2a', 'test')), hint: FETCH_HINT };
  const d1 = /^d1-g(\d+)$/.exec(name);
  if (d1) return { name, files: kicadPcbsIn(path.join(DATA_DIR, 'd1', `grid${d1[1]}`, 'test')), hint: FETCH_HINT };

  const d3 = /^d3([abc])$/.exec(name);
  if (d3) {
    const tier = { a: 'easy', b: 'medium', c: 'hard' }[d3[1] as 'a' | 'b' | 'c'];
    const splitPath = path.join(DATA_DIR, 'PCBWorld', 'configs', 'datasets', 'd3.json');
    const root = process.env.PCBWORLD_DATA_ROOT;
    const hint = `${FETCH_HINT}, then build D3 with PCBWorld's tools/quickstart/prepare_pcbench.sh and set PCBWORLD_DATA_ROOT`;
    if (!root || !fs.existsSync(splitPath)) return { name, files: [], hint };
    const split = JSON.parse(fs.readFileSync(splitPath, 'utf8'));
    const boardFile: string = split.board_filename ?? 'processed_v9_guide_v3.kicad_pcb';
    const dir = path.join(root, 'pcbench', 'exacad_sorted');
    const ids: string[] = split[tier]?.test ?? [];
    return { name, files: ids.map((id) => path.join(dir, id, boardFile)).filter((f) => fs.existsSync(f)), hint };
  }

  if (fs.existsSync(name)) {
    return { name: path.basename(name), files: fs.statSync(name).isDirectory() ? kicadPcbsIn(name) : [name] };
  }
  return { name, files: [], hint: `unknown set "${name}"` };
}

/** A D3 board is identified by its folder, not by the shared board filename. */
export function boardIdFor(file: string): string {
  const base = path.basename(file, '.kicad_pcb');
  return base.startsWith('processed_') ? path.basename(path.dirname(file)) : base;
}
