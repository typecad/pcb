#!/usr/bin/env node
// Random PCBWorld-shaped boards for iterating on the router, written by this
// repo (not PCBWorld's generator). They follow the distributions PCBWorld
// documents for its synthetic families, so they stress the same things, but
// they are NOT the paper's instances — for those run `npm run
// bench:pcbworld:fetch` and use the d2a / d1-g<N> sets.
//
//   d2a     80–120 mm two-layer board, 4–6 nets, pads/net 2:60% 3:20% 4:10% 5:10%,
//           2.4 mm pads (30% through-hole, else SMD on a random side), pads on a
//           0.6 mm pitch inside the central 90%, centres >= 4.8 mm apart;
//           rules clearance 0.3 / track 0.3 / via 1.2/0.6, edge clearance 0.3
//   d1-g<N> 100 mm one-layer board, 5 two-pad nets on an N x N grid; cell
//           g = 100/N, clearance = track = pad = g/2
//
// Usage:
//   node bench/pcbworld/synth.mjs --family d2a --n 40 --seed 7
//   node bench/pcbworld/synth.mjs --family d1-g100 --n 40
// Output: bench/pcbworld/data/synth/<family>/s<seed>_<i>.kicad_pcb
// Route with: PCBWORLD_SET=synth-d2a npm run bench:pcbworld
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const family = args.family ?? 'd2a';
const n = Number(args.n ?? 40);
const seed = Number(args.seed ?? 1);
const outDir = path.resolve(args.out ?? path.join(HERE, 'data', 'synth', family));

// mulberry32: small, fast, seedable
function rng(s) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const uuid = (r) => {
  const h = Array.from({ length: 16 }, () => Math.floor(r() * 256));
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
const f = (v) => Number(v.toFixed(4));

function boardText({ width, height, rules, nets, pads, layers, r }) {
  const netTable = ['  (net 0 "")', ...nets.map((name, i) => `  (net ${i + 1} "${name}")`)].join('\n');
  const fps = pads
    .map((p, i) => {
      const code = nets.indexOf(p.net) + 1;
      const back = p.side === 'B';
      const cu = p.tht ? '"*.Cu" "*.Mask"' : back ? '"B.Cu" "B.Paste" "B.Mask"' : '"F.Cu" "F.Paste" "F.Mask"';
      const pad = p.tht
        ? `(pad "1" thru_hole circle (at 0 0) (size ${p.size} ${p.size}) (drill ${f(p.size / 2)}) (layers ${cu}) (net ${code} "${p.net}") (uuid "${uuid(r)}"))`
        : `(pad "1" smd roundrect (at 0 0) (size ${p.size} ${p.size}) (layers ${cu}) (roundrect_rratio 0.25) (net ${code} "${p.net}") (uuid "${uuid(r)}"))`;
      return `  (footprint "Synth:Pad" (layer "${back ? 'B.Cu' : 'F.Cu'}") (at ${f(p.x)} ${f(p.y)}) (uuid "${uuid(r)}")
    (property "Reference" "P${i + 1}" (at 0 -2) (layer "${back ? 'B.Fab' : 'F.Fab'}") (uuid "${uuid(r)}") (effects (font (size 0.6 0.6) (thickness 0.1))))
    ${pad})`;
    })
    .join('\n');
  return `(kicad_pcb (version 20241229) (generator "typecad_synth") (generator_version "9.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (layers
${layers.map((l) => `    ${l}`).join('\n')}
    (44 "Edge.Cuts" user)
    (37 "F.SilkS" user "F.Silkscreen") (36 "B.SilkS" user "B.Silkscreen")
    (39 "F.Mask" user) (38 "B.Mask" user) (35 "F.Paste" user) (34 "B.Paste" user)
    (49 "F.Fab" user) (48 "B.Fab" user))
  (setup (pad_to_mask_clearance 0))
${netTable}
  (net_class "Default" "Default net class"
    (clearance ${rules.clearance}) (trace_width ${rules.track}) (via_dia ${rules.via}) (via_drill ${rules.drill})
    (uvia_dia 0.3) (uvia_drill 0.1))
${fps}
  (gr_rect (start 0 0) (end ${f(width)} ${f(height)}) (stroke (width 0.05) (type solid)) (fill none) (layer "Edge.Cuts") (uuid "${uuid(r)}"))
)
`;
}

function placePads(r, count, { width, height, pitch, minSep, central }) {
  const mx = (width * (1 - central)) / 2;
  const my = (height * (1 - central)) / 2;
  const pts = [];
  for (let tries = 0; pts.length < count && tries < 20000; tries++) {
    const x = Math.round((mx + r() * (width - 2 * mx)) / pitch) * pitch;
    const y = Math.round((my + r() * (height - 2 * my)) / pitch) * pitch;
    if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= minSep - 1e-9)) pts.push({ x, y });
  }
  if (pts.length < count) throw new Error('placement saturated');
  return pts;
}

function d2a(r) {
  const width = 80 + r() * 40;
  const height = 80 + r() * 40;
  const netCount = 4 + Math.floor(r() * 3);
  const perNet = () => {
    const u = r();
    return u < 0.6 ? 2 : u < 0.8 ? 3 : u < 0.9 ? 4 : 5;
  };
  const counts = Array.from({ length: netCount }, perNet);
  const pts = placePads(r, counts.reduce((a, b) => a + b, 0), { width, height, pitch: 0.6, minSep: 4.8, central: 0.9 });
  const nets = counts.map((_, i) => `NET${i + 1}`);
  let k = 0;
  const pads = counts.flatMap((c, ni) =>
    Array.from({ length: c }, () => {
      const p = pts[k++];
      const tht = r() < 0.3;
      return { ...p, net: nets[ni], size: 2.4, tht, side: tht ? 'F' : r() < 0.5 ? 'F' : 'B' };
    }),
  );
  return {
    width,
    height,
    rules: { clearance: 0.3, track: 0.3, via: 1.2, drill: 0.6 },
    nets,
    pads,
    layers: ['(0 "F.Cu" signal)', '(31 "B.Cu" signal)'],
  };
}

function d1(r, grid) {
  const size = 100;
  const g = size / grid;
  const c = g / 2;
  const nets = Array.from({ length: 5 }, (_, i) => `NET${i + 1}`);
  const pts = placePads(r, 10, { width: size, height: size, pitch: g, minSep: g, central: 1 - g / size });
  return {
    width: size + g / 2,
    height: size + g / 2,
    rules: { clearance: f(c), track: f(c), via: f(Math.max(0.6, c * 2)), drill: f(Math.max(0.3, c)) },
    nets,
    pads: pts.map((p, i) => ({ x: p.x + g / 4, y: p.y + g / 4, net: nets[Math.floor(i / 2)], size: f(c), tht: false, side: 'F' })),
    // pads on F.Cu only; B.Cu is declared like PCBWorld's own D1 boards
    // (KiCad will not load a board without it)
    layers: ['(0 "F.Cu" signal)', '(31 "B.Cu" signal)'],
  };
}

fs.mkdirSync(outDir, { recursive: true });
const m = /^d1-g(\d+)$/.exec(family);
if (family !== 'd2a' && !m) {
  console.error(`unknown family ${family} (d2a | d1-g<N>)`);
  process.exit(2);
}
for (let i = 0; i < n; i++) {
  // each board gets its own stream, so board i is the same whatever n is
  const r = rng(crypto.createHash('sha1').update(`${family}:${seed}:${i}`).digest().readUInt32LE(0));
  const spec = m ? d1(r, Number(m[1])) : d2a(r);
  fs.writeFileSync(path.join(outDir, `s${seed}_${String(i).padStart(4, '0')}.kicad_pcb`), boardText({ ...spec, r }));
}
console.error(`[synth] ${n} ${family} boards -> ${outDir}`);
