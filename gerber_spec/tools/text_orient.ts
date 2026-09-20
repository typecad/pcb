// Compares TEXT ORIENTATION between the kicad golden gerbers and our native
// output: for every F.SilkS text item, extract stroke points near the anchor
// from both files and report the ink bbox relative to the anchor (gerber
// frame, y-up). A Y-flip bug shows as golden/native extents mirrored about 0.
// Fonts differ (newstroke vs Hershey) so exact sizes differ — SIGN PATTERN
// must match. Usage: npx tsx tools/text_orient.ts [goldenDir nativeDir]
import fs from 'node:fs';
import path from 'node:path';
import { parse, SNode } from '../../@typecad/pcb/src/sexpr/index.js';
import { scalar, atPoint } from '../../@typecad/pcb/src/gerber_export/copper.js';

const goldenDir = process.argv[2] ?? 'golden/rd_skeleton/default';
const nativeDir = process.argv[3] ?? 'analysis/hatch_e2e';
const boardPath = 'boards/rd_skeleton/hw/build/rd_skeleton.kicad_pcb';
const LAYER = 'F.SilkS';

interface TextAnchor {
  label: string;
  x: number;
  y: number;
  angle: number;
  sizeY: number;
  justify: string;
}

function collectAnchors(): TextAnchor[] {
  const root = SNode.from(parse(fs.readFileSync(boardPath, 'utf8')) as any[]);
  const out: TextAnchor[] = [];
  const fxJust = (item: SNode) => {
    const j = item.child('effects')?.child('justify');
    const toks = j ? j.raw.slice(1).filter((v) => typeof v === 'string') : [];
    return toks.length ? toks.join(',') : 'center,center';
  };
  const fxSize = (item: SNode) => {
    const sz = item.child('effects')?.child('font')?.child('size');
    return sz ? scalar(sz, 2, 1) : 1; // height = W (raw 2)
  };
  for (const item of root.children()) {
    if (item.name !== 'gr_text') continue;
    if (String(item.child('layer')?.raw[1]) !== LAYER) continue;
    const at = item.child('at')!;
    out.push({
      label: `gr_text "${String(item.raw[1])}"`,
      x: scalar(at, 1),
      y: scalar(at, 2),
      angle: scalar(at, 3, 0),
      sizeY: fxSize(item),
      justify: fxJust(item),
    });
  }
  for (const fp of root.children('footprint')) {
    const fpAt = fp.child('at');
    const fx0 = atPoint(fpAt).x;
    const fy0 = atPoint(fpAt).y;
    const rot = fpAt ? scalar(fpAt, 3, 0) : 0;
    const c = Math.cos((rot * Math.PI) / 180);
    const s = Math.sin((rot * Math.PI) / 180);
    const refProp = fp.children('property').find((pr) => String(pr.raw[1]) === 'Reference');
    const ref = String(refProp?.raw[2] ?? '?');
    for (const item of fp.children()) {
      if (item.name !== 'fp_text' && item.name !== 'property') continue;
      if (String(item.child('layer')?.raw[1]) !== LAYER) continue;
      const hideTok = item.child('hide')?.raw[1];
      if (hideTok !== undefined && String((hideTok as any).name ?? hideTok) === 'yes') continue;
      const at = item.child('at');
      if (!at) continue;
      const lx = scalar(at, 1, 0);
      const ly = scalar(at, 2, 0);
      out.push({
        label: `${ref} ${item.name === 'property' ? String(item.raw[1]) : String(item.raw[1])} "${String(item.raw[2])}"`,
        x: fx0 + lx * c + ly * s,
        y: fy0 - lx * s + ly * c,
        angle: scalar(at, 3, 0), // absolute
        sizeY: fxSize(item),
        justify: fxJust(item),
      });
    }
  }
  return out;
}

/** Parse a gerber into stroke segments (mm, gerber frame y-up). */
function strokes(file: string): Array<[number, number, number, number]> {
  const text = fs.readFileSync(file, 'utf8');
  const out: Array<[number, number, number, number]> = [];
  let x = 0;
  let y = 0;
  for (const m of text.matchAll(/X(-?[\d.]+)Y(-?[\d.]+)D0(1|2|3)\*/g)) {
    const nx = parseFloat(m[1]!) / 1e6; // file coords are 1e-6 mm integers
    const ny = parseFloat(m[2]!) / 1e6;
    if (m[3] === '1') out.push([x, y, nx, ny]);
    x = nx;
    y = ny;
  }
  return out;
}

function inkBox(seg: Array<[number, number, number, number]>, ax: number, ay: number, wy: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
  for (const [x1, y1, x2, y2] of seg) {
    for (const [px, py] of [[x1, y1], [x2, y2]] as const) {
      if (Math.abs(px - ax) > 7) continue;
      if (Math.abs(py - ay) > wy) continue;
      n++;
      minX = Math.min(minX, px - ax); maxX = Math.max(maxX, px - ax);
      minY = Math.min(minY, py - ay); maxY = Math.max(maxY, py - ay);
    }
  }
  return n > 4 ? { minX, maxX, minY, maxY, n } : null;
}

const anchors = collectAnchors();
const gold = strokes(path.join(goldenDir, 'rd_skeleton-F_Silkscreen.gto'));
const natv = strokes(path.join(nativeDir, 'rd_skeleton-F_Silkscreen.gto'));

console.log('anchor → gerber frame (y-up). "above" = ink at +Y of anchor.');
console.log('pad padding anchorY for text: value text');
let flip = 0, agree = 0;
for (const a of anchors) {
  const ax = a.x;
  const ay = -a.y;
  const wy = a.sizeY * 0.9;
  const gB = inkBox(gold, ax, ay, wy);
  const nB = inkBox(natv, ax, ay, wy);
  if (!gB || !nB) { console.log(`  ${a.label}: (no ink g=${!!gB} n=${!!nB})`); continue; }
  const gAbove = gB.maxY > -gB.minY ? 'above' : 'below';
  const nAbove = nB.maxY > -nB.minY ? 'above' : 'below';
  if (gAbove !== nAbove) flip++; else agree++;
  console.log(
    `  ${a.label} ang=${a.angle} j=${a.justify}\n` +
    `    golden dy=[${gB.minY.toFixed(2)},${gB.maxY.toFixed(2)}] (${gAbove}, ${gB.n} pts)\n` +
    `    native dy=[${nB.minY.toFixed(2)},${nB.maxY.toFixed(2)}] (${nAbove}, ${nB.n} pts)`,
  );
}
console.log(`\nsign agreement: ${agree}, DISAGREE (flip): ${flip}`);
