// Fills rd F.Cu as a SOLID pour (mode hatch stripped) and counts ring
// self-crossings — decides whether solid pours need the same treatment.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, SNode } from '../../@typecad/pcb/src/sexpr/index.js';
import { fillZone } from '../../@typecad/pcb/src/pcb/pcb_zone_fill_engine.js';

let src = readFileSync('boards/rd_skeleton/hw/build/rd_skeleton.kicad_pcb', 'utf8');
src = src.replace(/\(mode hatch\)/g, ''); // solid fill
writeFileSync('tools/rd_solid_tmp.kicad_pcb', src);
const root = SNode.from(parse(src) as any[]);
const zone = root.children('zone')[0]!;
const t0 = Date.now();
const res = fillZone(root, zone, 'F.Cu')!;
console.log('fill time:', Date.now() - t0, 'ms; islands:', res.islands.length, 'net:', res.totalAreaMm2.toFixed(0), 'mm²');
const ring = res.islands[0]!.ring;
console.log('ring pts:', ring.length / 2);
// count interior crossings via grid hash (verified against brute force shape)
function cross(a1,a2,b1,b2) {
  const d = (a2[0]-a1[0])*(b2[1]-b1[1]) - (a2[1]-a1[1])*(b2[0]-b1[0]);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((b1[0]-a1[0])*(b2[1]-b1[1]) - (b1[1]-a1[1])*(b2[0]-b1[0]))/d;
  const u = ((b1[0]-a1[0])*(a2[1]-a1[1]) - (b1[1]-a1[1])*(a2[0]-a1[0]))/d;
  return t > 1e-9 && t < 1-1e-9 && u > 1e-9 && u < 1-1e-9; // interior only
}
const CELL = 2e6;
const grid = new Map();
const segs = [];
for (let i = 0; i < ring.length / 2; i++) {
  const a = [ring[i*2], ring[i*2+1]];
  const b = [ring[(i+1)*2], ring[(i+1)*2+1]];
  segs.push([a, b]);
  for (let cx = Math.floor(Math.min(a[0],b[0])/CELL); cx <= Math.floor(Math.max(a[0],b[0])/CELL); cx++)
    for (let cy = Math.floor(Math.min(a[1],b[1])/CELL); cy <= Math.floor(Math.max(a[1],b[1])/CELL); cy++) {
      const k = cx+','+cy;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
}
let hits = 0;
for (const list of grid.values()) {
  for (let x = 0; x < list.length; x++) for (let y = x+2; y < list.length; y++) {
    const i = list[x], j = list[y];
    if (Math.abs(i-j) <= 1) continue;
    const [a1,a2] = segs[i], [b1,b2] = segs[j];
    if (cross(a1,a2,b1,b2)) hits++;
  }
}
console.log('interior crossings (grid, per-cell pairs):', hits);
