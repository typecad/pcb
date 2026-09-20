// Plots the probe board with the NATIVE exporter and compares each isolated
// text's ink box against the kicad-cli golden. Reports, per case, the ink
// bbox relative to the anchor in the gerber frame (y-up) — a healthy match
// has both extents within tolerance; a Y-flip shows as extents swapping.
import fs from 'node:fs';
import path from 'node:path';
import { plotGraphicsLayersFromSource } from '../../@typecad/pcb/src/gerber_export/index.js';

const board = 'tools/text_probe.kicad_pcb';
fs.rmSync('tools/text_probe_native', { recursive: true, force: true });
fs.mkdirSync('tools/text_probe_native', { recursive: true });
plotGraphicsLayersFromSource(fs.readFileSync(board, 'utf8'), board, { outDir: 'tools/text_probe_native' });

function strokes(file: string): Array<[number, number, number, number]> {
  const text = fs.readFileSync(file, 'utf8');
  const out: Array<[number, number, number, number]> = [];
  let x = 0, y = 0;
  for (const m of text.matchAll(/X(-?[\d.]+)Y(-?[\d.]+)D0(1|2|3)\*/g)) {
    const nx = parseFloat(m[1]!) / 1e6;
    const ny = parseFloat(m[2]!) / 1e6;
    if (m[3] === '1') out.push([x, y, nx, ny]);
    x = nx; y = ny;
  }
  return out;
}

function box(seg: Array<[number, number, number, number]>, ax: number, ay: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
  for (const [x1, y1, x2, y2] of seg) {
    for (const [px, py] of [[x1, y1], [x2, y2]] as const) {
      if (Math.abs(px - ax) > 8 || Math.abs(py - ay) > 8) continue;
      n++;
      minX = Math.min(minX, px - ax); maxX = Math.max(maxX, px - ax);
      minY = Math.min(minY, py - ay); maxY = Math.max(maxY, py - ay);
    }
  }
  return n ? { minX, maxX, minY, maxY, n } : null;
}

const fmt = (b: { minX: number; maxX: number; minY: number; maxY: number } | null) =>
  b ? `dx=[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}] dy=[${b.minY.toFixed(2)},${b.maxY.toFixed(2)}]` : 'NO INK';

const gold = strokes('tools/text_probe_golden/text_probe-F_Silkscreen.gto');
const natv = strokes(path.join('tools/text_probe_native', 'text_probe-F_Silkscreen.gto'));

const labels = [
  'Jg ang0', 'Jg ang90', 'Jg ang180', 'Jg ang270', 'Jg ang0 italic', 'Jg ang90 italic',
  'Jg left', 'Jg right', 'Jg top', 'Jg bottom', 'Jg mirror', '2-line ang0', '2-line ang90',
  'Jg left th0.6', 'JgJgJg left', 'Jg sy3 left', 'Jg right th0.6', 'JgJgJg right',
];
let bad = 0;
// Fonts differ in glyph widths (Hershey vs newstroke), so the FAR edge of
// each axis may diverge proportionally — but at least one edge per axis
// must match tightly (a Y-flip breaks BOTH edges of the rotated axis).
const xTol = (g: { minX: number; maxX: number } | null) =>
  g ? Math.max(0.9, (g.maxX - g.minX) * 0.5) : 0.9;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) < tol;
for (let i = 0; i < labels.length; i++) {
  const ax = 100;
  const ay = -(40 + i * 12);
  const g = box(gold, ax, ay);
  const n = box(natv, ax, ay);
  // healthy: at least one edge per axis matches (flip breaks both edges;
  // font-width divergence moves only the far edge)
  const ok = g && n &&
    (near(g.minY, n.minY, 0.3) || near(g.maxY, n.maxY, 0.3)) &&
    (near(g.minX, n.minX, xTol(g)) || near(g.maxX, n.maxX, xTol(g)));
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${labels[i]}`);
  console.log(`     golden ${fmt(g)}`);
  console.log(`     native ${fmt(n)}`);
}
console.log(bad === 0 ? '\nALL OK' : `\n${bad} FAIL`);
process.exit(bad ? 1 : 0);
