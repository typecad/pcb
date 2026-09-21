// A/B gerber comparison: from ONE materialized board, plot gerbers through
// the native writer AND kicad-cli, rasterize each layer pair with the same
// SVG renderer + resvg, and diff pixel-by-pixel.
//
// Zone fills are materialized ONCE (native engine) and both plotters draw
// those saved fills — fill-engine differences are excluded by construction,
// so copper diffs measure pure plotting fidelity. Text layers (silkscreen/
// fab/comments — Hershey vs KiCad's GPL newstroke) are reported as
// informational, not failures.
//
// Usage: npx tsx tools/compare_kicad_native.ts [board.kicad_pcb] [outdir]
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import { parse as parseSexpr, SNode } from '../../@typecad/pcb/src/sexpr/index.js';
import { refillZoneFills } from '../../@typecad/pcb/src/cli/typecad/commands/export.js';
import { executeKiCADCommand } from '../../@typecad/pcb/src/kicad_commands.js';
import { parseGerber } from '../../@typecad/pcb/src/gerber_viewer/gerber/parse_gerber.js';
import { parseExcellon } from '../../@typecad/pcb/src/gerber_viewer/gerber/parse_excellon.js';
import { detectLayer } from '../../@typecad/pcb/src/gerber_viewer/detect_layer.js';
import { renderSvg } from '../../@typecad/pcb/src/gerber_viewer/render/svg.js';

const REPO = path.resolve(__dirname, '..', '..');
const BIN = path.join(REPO, 'node_modules', '.bin', 'typecad-pcb') + (process.platform === 'win32' ? '.cmd' : '');
const BOARD = path.resolve(process.argv[2] ?? 'demo/gerber-demo/build/gerber_demo.kicad_pcb');
const OUT = path.resolve(process.argv[3] ?? 'gerber_spec/analysis/ab_compare');
const WIDTH = 1600;
const STRICT_MAX_PCT = 0.5; // strict layers fail above this deviation

// text-carrying layers diverge by design (Hershey vs KiCad's GPL newstroke)
const TEXT_EXEMPT = /-F_Silkscreen|-B_Silkscreen|-F_Fab|-B_Fab|-User_Comments|-User_Drawings|-User_Eco/;

async function main(): Promise<void> {
// ---------------------------------------------------------------- prepare --
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const d of ['native', 'kicad']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const source = fs.readFileSync(BOARD, 'utf8');
const filled = refillZoneFills(source);
const filledBoard = path.join(OUT, 'board.refilled.kicad_pcb');
fs.writeFileSync(filledBoard, filled ?? source);
console.log(`board: ${BOARD}`);
console.log(`fills: ${filled ? 'materialized (native engine)' : 'none in source — plotting declarations only'}`);

// ---------------------------------------------------------------- exports --
spawnSync(BIN, ['export', 'gerbers', '--saved-fills', '--out', path.join(OUT, 'native'), filledBoard], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: REPO,
});
// kicad-cli WITHOUT --check-zones plots the saved fills as-is (pure plotter)
await executeKiCADCommand(
  'pcb',
  ['export', 'gerbers', '--output', path.join(OUT, 'kicad'), filledBoard],
  { stdio: 'inherit' },
);
try {
  await executeKiCADCommand('pcb', ['export', 'drill', '--output', path.join(OUT, 'kicad'), filledBoard], { stdio: 'pipe' });
} catch (e) {
  console.log(`kicad drill export failed (${(e as Error).message.split('\n')[0]}) — drill layer not compared`);
}

// ---------------------------------------------------------------- pairing --
const nativeFiles = new Set(fs.readdirSync(path.join(OUT, 'native')));
const kicadFiles = new Set(fs.readdirSync(path.join(OUT, 'kicad')));
const names = [...nativeFiles].filter((f) => kicadFiles.has(f) && !f.endsWith('.kicad_pcb') && !f.endsWith('.gbrjob'));
const onlyNative = [...nativeFiles].filter((f) => !kicadFiles.has(f) && !f.endsWith('.kicad_pcb'));
const onlyKicad = [...kicadFiles].filter((f) => !nativeFiles.has(f));
if (onlyNative.length) console.log('only in native:', onlyNative.join(', '));
if (onlyKicad.length) console.log('only in kicad:', onlyKicad.join(', '));

// ---------------------------------------------------------------- raster ----
function renderLayerPng(dir: string, file: string): { pixels: Uint8Array; width: number; height: number } {
  const full = path.join(dir, file);
  const isDrill = file.endsWith('.drl');
  const content = fs.readFileSync(full, 'utf8');
  const image = isDrill ? parseExcellon(content, { name: file }) : parseGerber(content, { name: file });
  const info = detectLayer(file, image);
  info.defaultVisible = true; // renderSvg hides non-default layers otherwise
  // anchor the frame with the pair's edge layer so both sides share a viewbox
  const edgeFile = [...nativeFiles, ...kicadFiles].find((f) => f.includes('-Edge_Cuts'));
  let layers: any[] = [{ info, image }];
  if (edgeFile && !file.includes('-Edge_Cuts')) {
    const edgeImage = parseGerber(fs.readFileSync(path.join(dir, edgeFile), 'utf8'), { name: edgeFile });
    const edgeInfo = detectLayer(edgeFile, edgeImage);
    edgeInfo.defaultVisible = true;
    layers = [{ info: edgeInfo, image: edgeImage }, ...layers];
  }
  const svg = renderSvg(layers, { background: '#ffffff' });
  // renderSvg leaves the page transparent — paint the backdrop so ink
  // classification has a known background
  const withBg = svg.replace(/(<svg[^>]*>)/, '$1<rect width="100%" height="100%" fill="#ffffff"/>');
  const resvg = new Resvg(withBg, { fitTo: { mode: 'width', value: WIDTH } });
  const rendered = resvg.render();
  return { pixels: rendered.pixels as Uint8Array, width: rendered.width, height: rendered.height };
}

// ------------------------------------------------------------------ diff ----
/** ink-ness via luminance distance from the image's own corner (background) */
function inkMask(img: { pixels: Uint8Array; width: number; height: number }): Uint8Array {
  const { pixels, width, height } = img;
  const bg = [pixels[0]!, pixels[1]!, pixels[2]!];
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const o = p * 4;
    const d =
      Math.abs(pixels[o]! - bg[0]!) + Math.abs(pixels[o + 1]! - bg[1]!) + Math.abs(pixels[o + 2]! - bg[2]!);
    mask[p] = d > 90 ? 1 : 0;
  }
  return mask;
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngEncode(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.subarray(y * width * 4, (y + 1) * width * 4).forEach((v, i) => {
      raw[y * (width * 4 + 1) + 1 + i] = v;
    });
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function diffLayer(name: string): { pct: number } {
  const nat = renderLayerPng(path.join(OUT, 'native'), name);
  const kic = renderLayerPng(path.join(OUT, 'kicad'), name);
  if (nat.width !== kic.width || nat.height !== kic.height) {
    console.log(`  ${name}: SIZE MISMATCH ${nat.width}x${nat.height} vs ${kic.width}x${kic.height}`);
    return { pct: 100 };
  }
  const inkN = inkMask(nat);
  const inkK = inkMask(kic);
  let onlyN = 0, onlyK = 0;
  const total = nat.width * nat.height;
  const diff = Buffer.alloc(total * 4, 0xff); // white background
  for (let p = 0; p < total; p++) {
    if (inkN[p] !== inkK[p]) {
      const o = p * 4;
      // magenta = native-only ink, cyan = kicad-only ink
      const c = inkN[p] ? [255, 0, 200] : [0, 200, 255];
      diff[o] = c[0]; diff[o + 1] = c[1]; diff[o + 2] = c[2]; diff[o + 3] = 255;
      if (inkN[p]) onlyN++; else onlyK++;
    }
  }
  const pct = ((onlyN + onlyK) / total) * 100;
  fs.writeFileSync(path.join(OUT, name + '.diff.png'), pngEncode(nat.width, nat.height, diff));
  return { pct };
}

// ------------------------------------------------------------------ report --
console.log('\nlayer                                    deviation   verdict');
let failures = 0;
const sorted = [...names].sort();
for (const name of sorted) {
  const exempt = TEXT_EXEMPT.test(name);
  let line = `  ${name.padEnd(40)}`;
  try {
    const { pct } = diffLayer(name);
    line += `${pct.toFixed(3)}%`.padStart(9);
    if (exempt) line += '  informational (text: Hershey vs newstroke)';
    else if (pct > STRICT_MAX_PCT) {
      line += '  FAIL';
      failures++;
    } else line += '  ok';
  } catch (e) {
    line += `  ERROR: ${(e as Error).message.split('\n')[0]}`;
    failures++;
  }
  console.log(line);
}
console.log(failures === 0 ? '\nA/B COMPARE: all strict layers within tolerance' : `\nA/B COMPARE: ${failures} layer(s) FAILED`);
process.exitCode = failures ? 1 : 0;
}
void main();
