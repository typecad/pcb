// Sanity-checks a native gerber export dir: file set, pour regions on every
// copper layer, drill tools, and the job file. Exit 1 when a copper layer
// carries no pour region (this board always declares a GND zone, so a
// missing pour means the refill path broke).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'build/gerbers';
const files = readdirSync(dir).filter((f) => !f.startsWith('.')).sort();
let failed = false;

const copper = files.filter((f) => /\.(gtl|gbl|g\d+)$/.test(f));
for (const f of copper) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  const regions = (text.match(/^G36\*?$/gm) ?? []).length;
  const flashes = (text.match(/D03\*?$/gm) ?? []).length;
  console.log(`  ${f}: ${regions} pour region(s), ${flashes} pad flash(es)`);
  if (regions === 0) {
    console.error(`    ERROR: no pour region — zone refill did not reach this layer`);
    failed = true;
  }
}

for (const f of files.filter((f) => f.endsWith('.drl'))) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  const tools = (text.match(/^T\d+[\s.]/gm) ?? []).length;
  console.log(`  ${f}: ${tools} drill tool(s)`);
  if (tools === 0) {
    console.error(`    ERROR: no drill tools`);
    failed = true;
  }
}

const job = files.find((f) => f.endsWith('.gbrjob'));
if (!job) {
  console.error('  ERROR: no .gbrjob file');
  failed = true;
} else {
  const jobJson = JSON.parse(readFileSync(path.join(dir, job), 'utf8'));
  const entries = jobJson.FilesAttributes ?? jobJson.Files ?? [];
  console.log(`  ${job}: ${entries.length} file entr(ies)`);
}

console.log(`\n${files.length} file(s): ${files.join(', ')}`);
process.exit(failed ? 1 : 0);
