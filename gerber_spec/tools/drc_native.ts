// Run the NATIVE DRC engine on a board and (optionally) diff the violation
// set against a kicad-cli golden JSON report. lib_footprint_mismatch is
// excluded from the comparison — it is a library-comparison check the native
// engine intentionally does not implement.
//
// Usage: npx tsx tools/drc_native.ts <board.kicad_pcb> [golden.json]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { refillZoneFills } from '../../@typecad/pcb/src/cli/typecad/commands/export.js';
import { runDrc } from '../../@typecad/pcb/src/pcb/pcb_drc_engine.js';
import { constraintsFromProject } from '../../@typecad/pcb/src/cli/typecad/commands/drc.js';

const board = path.resolve(process.argv[2]!);
const goldenPath = process.argv[3] ? path.resolve(process.argv[3]) : null;

let src = readFileSync(board, 'utf8');
const filled = refillZoneFills(src);
src = filled ?? src;

const t0 = Date.now();
const report = runDrc(src, constraintsFromProject(board));
const elapsed = Date.now() - t0;

console.log(`native DRC: ${report.violations.length} violation(s), ${report.unconnected_items.length} unconnected (${elapsed}ms)`);
for (const v of report.violations) {
  console.log(`  [${v.type}] ${v.description}`);
  for (const it of v.items) console.log(`     - ${it.description} @ ${it.pos.x},${it.pos.y}`);
}
for (const u of report.unconnected_items) {
  console.log(`  [unconnected_items] ${u.description}`);
  for (const it of u.items) console.log(`     - ${it.description} @ ${it.pos.x},${it.pos.y}`);
}

if (goldenPath) {
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  const SKIP = new Set(['lib_footprint_mismatch']);
  // native DFM advisories have no kicad-cli counterpart — report count only
  const DFM_ADVISORY = new Set([
    'track_dangling', 'hole_edge_clearance', 'drill_aspect_ratio', 'acid_trap',
    'text_height', 'text_thickness', 'silk_over_mask', 'via_in_pad',
    'edge_not_closed', 'edge_self_intersection',
  ]);
  const hatched = /\(fill[^)]*\(mode hatch\)/.test(src);
  if (hatched) {
    console.log('note: hatched board — unconnected_items deferred to kicad-cli (hatch phase dependency); excluded from parity');
  }
  // item order within a violation is not part of the contract; sort keys
  const key = (v: { type: string; items: Array<{ pos: { x: number; y: number } }> }): string =>
    [
      v.type,
      ...v.items
        .map((i) => `${i.pos.x.toFixed(2)},${i.pos.y.toFixed(2)}`)
        .sort(),
    ].join('|');
  const gSet = new Set(
    [...(golden.violations ?? []), ...(golden.unconnected_items ?? []).map((u: any) => ({ ...u, type: 'unconnected_items' }))]
      .filter((v: any) => !SKIP.has(v.type) && !(hatched && v.type === 'unconnected_items'))
      .map(key),
  );
  const nSet = new Set(
    [...report.violations]
      .filter((v) => v.type !== 'unconnected_items' && !DFM_ADVISORY.has(v.type))
      .map(key),
  );
  const dfmOnly = report.violations.filter((v) => DFM_ADVISORY.has(v.type)).length;
  const missing = [...gSet].filter((k) => !nSet.has(k));
  const extra = [...nSet].filter((k) => !gSet.has(k));
  console.log(`\nparity vs ${path.basename(goldenPath)} (lib_footprint_mismatch excluded):`);
  for (const k of missing) console.log(`  MISSING (kicad-only): ${k}`);
  for (const k of extra) console.log(`  EXTRA (native-only): ${k}`);
  if (missing.length === 0 && extra.length === 0) {
    console.log(`  PARITY: violation sets identical${dfmOnly ? ` (+${dfmOnly} native DFM advisories, no kicad-cli counterpart)` : ''}`);
  }
  else console.log(`  DIVERGENCE: ${missing.length} missing, ${extra.length} extra`);
}
