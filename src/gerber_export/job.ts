// ---------------------------------------------------------------------------
// KiCad job file (<board>-job.gbrjob) writer. JSON with header, general
// specs, derived design rules, per-file attributes, and material stackup —
// matching the kicad-cli 10.0.0 golden fixtures.
//
// Derived values (all verified against goldens):
//   - Size = Edge.Cuts bounding box expanded by half the outline stroke on
//     each side (features: 35 bbox + 0.05×2 = 35.1; rd: 104 + 0.025×2)
//   - DesignRules: Outer (+ Inner when present) entries; clearances from the
//     default net class (0.2), MinLineWidth = min track width on that layer
//     set, TrackToRegion/RegionToRegion = min zone clearance there (omitted
//     when no zones exist on the set)
//   - FilesAttributes list every plotted gerber EXCEPT courtyard and margin
//     files, in KiCad's canonical order
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { parse, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/index.js';
import { copperLayers, scalar } from './copper.js';

export interface JobFileInfo {
  Path: string;
  FileFunction: string;
  FilePolarity?: string;
}

export interface JobOptions {
  outDir: string;
  creationDate?: Date;
  generationSoftware?: { vendor: string; application: string; version: string };
}

function localIso(d: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
}

function edgeSize(root: SNode): { X: number; Y: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of root.children()) {
    const layer = item.child('layer');
    if (!layer || String(layer.raw[1] ?? '') !== 'Edge.Cuts') continue;
    if (!item.name.startsWith('gr_')) continue;
    const w = item.child('stroke')?.child('width') ?? item.child('width');
    const half = w ? scalar(w, 1, 0.1) / 2 : 0.05;
    for (const key of ['start', 'end', 'mid', 'center']) {
      const n = item.child(key);
      if (n) {
        minX = Math.min(minX, scalar(n, 1) - half);
        maxX = Math.max(maxX, scalar(n, 1) + half);
        minY = Math.min(minY, scalar(n, 2) - half);
        maxY = Math.max(maxY, scalar(n, 2) + half);
      }
    }
  }
  if (!Number.isFinite(minX)) return { X: 0, Y: 0 };
  const r = (x: number): number => Math.round(x * 100) / 100;
  return { X: r(maxX - minX), Y: r(maxY - minY) };
}

function designRules(root: SNode, hasInner: boolean): unknown[] {
  const minTrack = (inner: boolean): number | null => {
    let min = Infinity;
    for (const item of root.children()) {
      if (item.name !== 'segment' && item.name !== 'arc') continue;
      const layer = String(item.child('layer')?.raw[1] ?? '');
      const isInner = layer.startsWith('In');
      if (isInner !== inner) continue;
      const w = scalar(item.child('width')!, 1);
      if (w > 0) min = Math.min(min, w);
    }
    return Number.isFinite(min) ? min : null;
  };
  const zoneClearance = (inner: boolean): number | null => {
    let min = Infinity;
    for (const zone of root.children('zone')) {
      const layer = zone.child('layer');
      const layers = zone.child('layers');
      const names = layers
        ? layers.raw.slice(1).filter((v): v is string => typeof v === 'string')
        : layer
          ? [String(layer.raw[1] ?? '')]
          : [];
      const anyInner = names.some((n) => n.startsWith('In'));
      if (anyInner !== inner) continue;
      const cl = zone.child('connect_pads')?.child('clearance');
      if (cl) min = Math.min(min, scalar(cl, 1, 0.2));
    }
    return Number.isFinite(min) ? min : null;
  };
  const rules: unknown[] = [];
  const entry = (name: string, inner: boolean): unknown => {
    const zc = zoneClearance(inner);
    return {
      Layers: name,
      PadToPad: 0.2,
      PadToTrack: 0.2,
      TrackToTrack: 0.2,
      MinLineWidth: minTrack(inner) ?? 0.2,
      ...(zc !== null ? { TrackToRegion: zc, RegionToRegion: zc } : {}),
    };
  };
  rules.push(entry('Outer', false));
  if (hasInner) rules.push(entry('Inner', true));
  return rules;
}

const DIELECTRIC_COLORS: Record<string, string> = {
  // KiCad converts named dielectric colors to RGB in the job file
  'FR4 natural': 'R109G116B75',
};

const CU_T = 0.035;
const MASK_T = 0.01;

/** KiCad's default 2-layer stackup, synthesized when the board has none. */
function defaultStackup(thickness: number): string {
  const die = Math.round((thickness - 2 * CU_T - 2 * MASK_T) * 100) / 100;
  return JSON.stringify([
    { Type: 'Legend', Name: 'Top Silk Screen' },
    { Type: 'SolderPaste', Name: 'Top Solder Paste' },
    { Type: 'SolderMask', Thickness: MASK_T, Name: 'Top Solder Mask' },
    { Type: 'Copper', Thickness: CU_T, Name: 'F.Cu' },
    {
      Type: 'Dielectric',
      Thickness: die,
      Material: 'FR4',
      Name: 'F.Cu/B.Cu',
      Notes: 'Type: dielectric layer 1 (from F.Cu to B.Cu)',
    },
    { Type: 'Copper', Thickness: CU_T, Name: 'B.Cu' },
    { Type: 'SolderMask', Thickness: MASK_T, Name: 'Bottom Solder Mask' },
    { Type: 'SolderPaste', Name: 'Bottom Solder Paste' },
    { Type: 'Legend', Name: 'Bottom Silk Screen' },
  ]);
}

function materialStackup(root: SNode, thickness: number): unknown[] {
  const stackup = root.child('setup')?.child('stackup');
  if (!stackup) return JSON.parse(defaultStackup(thickness)) as unknown[];
  // first pass: normalized rows in file order
  const rows: Array<Record<string, unknown>> = [];
  for (const layer of stackup.children('layer')) {
    const name = String(layer.raw[1] ?? '');
    const kind = (() => {
      if (name.includes('SilkS')) return 'Legend';
      if (name.includes('Paste')) return 'SolderPaste';
      if (name.includes('Mask')) return 'SolderMask';
      if (name === 'F.Cu' || name === 'B.Cu' || /^In\d+\.Cu$/.test(name)) return 'Copper';
      if (name.startsWith('dielectric')) return 'Dielectric';
      return 'Other';
    })();
    const row: Record<string, unknown> = { Type: kind };
    const typeStr = String(layer.child('type')?.raw[1] ?? '');
    const color = layer.child('color');
    if (color) {
      const c = String(color.raw[1]);
      row['Color'] = kind === 'Dielectric' ? (DIELECTRIC_COLORS[c] ?? c) : c;
    }
    const thickness = layer.child('thickness');
    // KiCad keeps a decimal point on whole-number thicknesses ("1.0");
    // emit as a string sentinel, converted back after JSON.stringify
    if (thickness) row['Thickness'] = Number.isInteger(scalar(thickness, 1, 0)) ? `@@${scalar(thickness, 1, 0)}.0@@` : scalar(thickness, 1, 0);
    const material = layer.child('material');
    if (material) row['Material'] = String(material.raw[1]);
    row['_type'] = typeStr;
    row['_name'] = name;
    rows.push(row);
  }
  // second pass: dielectric names are the surrounding copper layers joined
  // by '/', with a "Notes" line numbering the dielectric
  const copperNames = rows
    .filter((r) => r['Type'] === 'Copper')
    .map((r) => String(r['_name']));
  let dieCount = 0;
  let copperIdx = 0;
  const out: unknown[] = [];
  for (const row of rows) {
    if (row['Type'] === 'Copper') {
      row['Name'] = String(row['_name']);
      delete row['_type'];
      delete row['_name'];
      copperIdx++;
    } else if (row['Type'] === 'Dielectric') {
      dieCount++;
      const from = copperNames[copperIdx - 1] ?? '';
      const to = copperNames[copperIdx] ?? '';
      row['Name'] = `${from}/${to}`;
      row['Notes'] = `Type: dielectric layer ${dieCount} (from ${from} to ${to})`;
      delete row['_type'];
      delete row['_name'];
    } else {
      // physical layers carry the stackup type as their name
      row['Name'] = String(row['_type']);
      delete row['_type'];
      delete row['_name'];
    }
    out.push(row);
  }
  return out;
}

/** The job file uses its own FileFunction dialect for some layers. */
function jobFileFunction(gerberFn: string): string {
  if (gerberFn.startsWith('Paste,')) return gerberFn.replace('Paste,', 'SolderPaste,');
  if (gerberFn.startsWith('Soldermask,')) return gerberFn.replace('Soldermask,', 'SolderMask,');
  if (gerberFn === 'Profile,NP') return 'Profile';
  if (gerberFn.startsWith('Other')) return 'Other,User';
  return gerberFn;
}

const JOB_FILE_ORDER: Array<[string, string]> = [
  // [stem suffix, extension] in KiCad's canonical FilesAttributes order
  ['F_Cu', 'gtl'],
  ['@INNER@', ''],
  ['B_Cu', 'gbl'],
  ['F_Adhesive', 'gta'],
  ['B_Adhesive', 'gba'],
  ['F_Paste', 'gtp'],
  ['B_Paste', 'gbp'],
  ['F_Silkscreen', 'gto'],
  ['B_Silkscreen', 'gbo'],
  ['F_Mask', 'gts'],
  ['B_Mask', 'gbs'],
  ['User_Drawings', 'gbr'],
  ['User_Comments', 'gbr'],
  ['User_Eco1', 'gbr'],
  ['User_Eco2', 'gbr'],
  ['Edge_Cuts', 'gm1'],
  ['F_Fab', 'gbr'],
  ['B_Fab', 'gbr'],
  ['User_1', 'gbr'],
  ['User_2', 'gbr'],
  ['User_3', 'gbr'],
  ['User_4', 'gbr'],
];

/**
 * Build the FilesAttributes entries for the files this exporter writes.
 * `fileFor(stem)` returns { fileFunction, filePolarity } or null when the
 * file wasn't plotted (the job omits it).
 */
function filesAttributes(
  stem: string,
  innerNames: string[],
  fileFor: (name: string) => { fileFunction: string; filePolarity?: string } | null,
): JobFileInfo[] {
  const entries: JobFileInfo[] = [];
  const push = (fileStem: string, ext: string): void => {
    const info = fileFor(fileStem);
    if (!info) return;
    entries.push({
      Path: `${stem}-${fileStem}.${ext}`,
      FileFunction: jobFileFunction(info.fileFunction),
      FilePolarity: info.filePolarity ?? 'Positive',
    });
  };
  for (const [suffix, ext] of JOB_FILE_ORDER) {
    if (suffix === '@INNER@') {
      for (const name of innerNames) {
        push(name.replace('.', '_'), `g${name.match(/^In(\d+)\./)?.[1] ?? '1'}`);
      }
      continue;
    }
    // courtyard and margin files are omitted from the job
    if (suffix.includes('Courtyard') || suffix === 'Margin') continue;
    push(suffix, ext);
  }
  return entries;
}

export function plotJobFromSource(
  source: string,
  boardPath: string,
  fileFor: (name: string) => { fileFunction: string; filePolarity?: string } | null,
  opts: JobOptions,
): string {
  const root = SNode.from(parse(source) as SExpr[]);
  const stem = path.basename(boardPath).replace(/\.kicad_pcb$/, '');
  const gen = opts.generationSoftware ?? { vendor: 'KiCad', application: 'Pcbnew', version: '10.0.0' };
  const now = opts.creationDate ?? new Date();
  const general = root.child('general');
  const thickness = general ? scalar(general, 1, 1.6) : 1.6;
  const coppers = copperLayers(root);
  const copperCount = coppers.length;
  const innerNames = coppers.filter((l) => l.role === 'Inr').map((l) => l.name);
  const finish =
    root
      .child('setup')
      ?.child('stackup')
      ?.child('copper_finish')
      ?.raw[1] ?? undefined;

  const job = {
    Header: {
      GenerationSoftware: {
        Vendor: gen.vendor,
        Application: gen.application,
        Version: gen.version,
      },
      CreationDate: localIso(now),
    },
    GeneralSpecs: {
      ProjectId: {
        Name: stem,
        // real KiCad GUIDs aren't derivable (random tail); consumers ignore it
        GUID: '',
        Revision: 'rev?',
      },
      Size: edgeSize(root),
      LayerNumber: copperCount,
      BoardThickness: thickness,
      ...(finish !== undefined ? { Finish: finish } : { Finish: 'None' }),
    },
    DesignRules: designRules(root, innerNames.length > 0),
    FilesAttributes: filesAttributes(stem, innerNames, fileFor),
    MaterialStackup: materialStackup(root, thickness),
  };
  const out = path.join(opts.outDir, `${stem}-job.gbrjob`);
  fs.mkdirSync(opts.outDir, { recursive: true });
  // thickness sentinels → bare numbers with the decimal KiCad keeps ("1.0")
  const text = JSON.stringify(job, null, 2).replace(/"@@([\d.]+)@@"/g, '$1');
  fs.writeFileSync(out, text + '\n');
  return out;
}
