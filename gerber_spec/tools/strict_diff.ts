// One-off: show the actual hard diff lines for a layer pair.
import { readFileSync } from 'node:fs';
const golden = readFileSync(process.argv[2]!, 'utf8').split('\n');
const native = readFileSync(process.argv[3]!, 'utf8').split('\n');
// naive: compare directly (region/TXT tokens are embedded in the files as comments in parity's strict build; here just show line diffs that parity would see as hard)
const NUM = /-?\d+(?:\.\d+)?/g;
const softEqual = (x: string, y: string): boolean => {
  if (x === y) return true;
  const nx = x.match(NUM), ny = y.match(NUM);
  if (!nx || !ny || nx.length !== ny.length) return false;
  if (x.replace(NUM, '#') !== y.replace(NUM, '#')) return false;
  return nx.every((v, i) => Math.abs(Number(v) - Number(ny[i])) <= 1);
};
let hard = 0;
const n = Math.max(golden.length, native.length);
for (let i = 0; i < n; i++) {
  const g = golden[i] ?? '<none>', nn = native[i] ?? '<none>';
  if (g === nn) continue;
  if (g.startsWith('##') || nn.startsWith('##')) continue; // TXT tokens tolerated
  if (softEqual(g, nn)) continue;
  hard++;
  if (hard <= 14) console.log(`line ${i}: -${g.slice(0, 90)}\n         +${nn.slice(0, 90)}`);
}
console.log('hard (non-TXT):', hard);
