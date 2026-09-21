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

const board = path.resolve(process.argv[2]!);
const goldenPath = process.argv[3] ? path.resolve(process.argv[3]) : null;

let src = readFileSync(board, 'utf8');
const filled = refillZoneFills(src);
src = filled ?? src;

const t0 = Date.now();
const report = runDrc(src);
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
      .filter((v: any) => !SKIP.has(v.type))
      .map(key),
  );
  const nSet = new Set(
    [...report.violations, ...report.unconnected_items.map((u) => ({ ...u, type: 'unconnected_items' }))].map(key),
  );
  const missing = [...gSet].filter((k) => !nSet.has(k));
  const extra = [...nSet].filter((k) => !gSet.has(k));
  console.log(`\nparity vs ${path.basename(goldenPath)} (lib_footprint_mismatch excluded):`);
  for (const k of missing) console.log(`  MISSING (kicad-only): ${k}`);
  for (const k of extra) console.log(`  EXTRA (native-only): ${k}`);
  if (missing.length === 0 && extra.length === 0) console.log('  PARITY: violation sets identical');
  else console.log(`  DIVERGENCE: ${missing.length} missing, ${extra.length} extra`);
}
