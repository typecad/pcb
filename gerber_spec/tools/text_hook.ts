// Focus probe: for refdes starting with "J" (hooked glyph), locate the hook:
// within the FIRST glyph's ink box, find the leftmost stroke point; report
// whether it sits in the bottom or top half. Golden vs native must agree.
import fs from 'node:fs';
import path from 'node:path';
import { parse, SNode } from '../../@typecad/pcb/src/sexpr/index.js';
import { scalar, atPoint } from '../../@typecad/pcb/src/gerber_export/copper.js';

const goldenDir = process.argv[2] ?? 'golden/rd_skeleton/default';
const nativeDir = process.argv[3] ?? 'analysis/hatch_e2e';
const boardPath = 'boards/rd_skeleton/hw/build/rd_skeleton.kicad_pcb';

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

const root = SNode.from(parse(fs.readFileSync(boardPath, 'utf8')) as any[]);
const gold = strokes(path.join(goldenDir, 'rd_skeleton-F_Silkscreen.gto'));
const natv = strokes(path.join(nativeDir, 'rd_skeleton-F_Silkscreen.gto'));

interface Pt { x: number; y: number }
function ptsNear(seg: Array<[number, number, number, number]>, ax: number, ay: number, wx: number, wy: number): Pt[] {
  const out: Pt[] = [];
  for (const [x1, y1, x2, y2] of seg) {
    for (const [px, py] of [[x1, y1], [x2, y2]] as const) {
      if (Math.abs(px - ax) <= wx && Math.abs(py - ay) <= wy) out.push({ x: px, y: py });
    }
  }
  return out;
}

function hookSide(label: string, pts: Pt[]) {
  if (pts.length === 0) return console.log(`  ${label}: no ink`);
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  // first glyph = chars until a big x gap; simpler: ink of leftmost glyph
  const leftPts = pts.filter((p) => p.x < minX + (maxX - minX) * 0.45);
  if (leftPts.length === 0) return console.log(`  ${label}: no left-glyph ink`);
  const gMinY = Math.min(...leftPts.map((p) => p.y));
  const gMaxY = Math.max(...leftPts.map((p) => p.y));
  // hook = leftmost point of the glyph
  const hook = leftPts.reduce((a, b) => (b.x < a.x ? b : a));
  const frac = (hook.y - gMinY) / (gMaxY - gMinY || 1); // 0 = bottom, 1 = top (gerber y-up)
  console.log(`  ${label}: glyph y[${gMinY.toFixed(3)},${gMaxY.toFixed(3)}] hook at frac=${frac.toFixed(2)} → ${frac < 0.5 ? 'BOTTOM (upright J)' : 'TOP (flipped J)'}`);
}

for (const fp of root.children('footprint')) {
  const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
  const ref = String(refProp?.raw[2] ?? '');
  if (!ref.startsWith('J') || ref.length > 2) continue;
  const fpAt = fp.child('at');
  const fx0 = atPoint(fpAt).x;
  const fy0 = atPoint(fpAt).y;
  const rot = fpAt ? scalar(fpAt, 3, 0) : 0;
  const c = Math.cos((rot * Math.PI) / 180);
  const s = Math.sin((rot * Math.PI) / 180);
  for (const item of fp.children()) {
    if (item.name !== 'property') continue;
    if (String(item.child('layer')?.raw[1]) !== 'F.SilkS') continue;
    const at = item.child('at')!;
    const lx = scalar(at, 1, 0);
    const ly = scalar(at, 2, 0);
    const ax = fx0 + lx * c + ly * s;
    const ayG = -(fy0 - lx * s + ly * c); // gerber frame
    hookSide(`${ref} golden`, ptsNear(gold, ax, ayG, 2, 1));
    hookSide(`${ref} native`, ptsNear(natv, ax, ayG, 2, 1));
  }
}
