// ---------------------------------------------------------------------------
// Pad manifest for the board viewer.
//
// Pin numbers and net names on pads come from the PCB object — the gerbers
// carry only geometry with X2 tags. This walks the final board contents
// (every footprint, every pad) and writes `build/<board>_pads.json` with
// world pad positions, extents, copper layers, pin numbers, and net names;
// the viewer pipeline auto-discovers it beside the netlist and renders pad
// labels from it. Board (y-down) millimetres throughout.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logging.js';
import { getBuildDir } from '../utils/constants.js';
import type { PCB } from './pcb.js';
import { sym, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';

/** One labeled pad. `layers` lists the COPPER layers the pad touches. */
export interface PadEntry {
  ref: string;
  pin: string;
  /** named net ("VCC"), auto net ("net5"), or null when unconnected */
  net: string | null;
  x: number;
  y: number;
  /** axis-aligned extent in mm, rotation applied */
  w: number;
  h: number;
  layers: string[];
}

export interface PadsManifest {
  pads: PadEntry[];
}

const num = (n: SNode | null | undefined, i: number, d = 0): number => {
  const v = n?.raw[i];
  return typeof v === 'number' ? v : d;
};

/** Extract the manifest from final board contents. Never throws. */
export function computePadsManifest(boardContents: SExpr[], pcb: PCB): PadsManifest {
  const pads: PadEntry[] = [];
  const root = SNode.from([sym('kicad_pcb'), ...boardContents] as SExpr[]);
  for (const fp of root.children('footprint')) {
    const ref =
      String(
        fp.children('property').find((p) => String(p.raw[1]) === 'Reference')?.raw[2] ??
          fp.child('reference')?.raw[1] ??
          '?',
      ) || '?';
    const at = fp.child('at');
    const fx = num(at, 1);
    const fy = num(at, 2);
    const frot = num(at, 3);
    const c = Math.cos((frot * Math.PI) / 180);
    const s = Math.sin((frot * Math.PI) / 180);
    for (const pad of fp.children('pad')) {
      const pin = String(pad.raw[1] ?? '');
      const pa = pad.child('at');
      const lx = num(pa, 1);
      const ly = num(pa, 2);
      // KiCad pad `at` angles are absolute orientation; combined with the
      // footprint rotation they give the shape's angle for the AABB
      const prot = num(pa, 3) + frot;
      const pc = Math.abs(Math.cos((prot * Math.PI) / 180));
      const ps = Math.abs(Math.sin((prot * Math.PI) / 180));
      const sz = pad.child('size');
      const w = num(sz, 1);
      const h = num(sz, 2);
      const netNode = pad.child('net');
      const netName = netNode ? String(netNode.raw[2] ?? '') : '';
      const layers = ((pad.child('layers')?.raw.slice(1) ?? []) as unknown[]).filter(
        (l): l is string => typeof l === 'string',
      );
      const copper = layers.filter((l) => l.endsWith('.Cu') || l === '*.Cu');
      if (copper.length === 0) continue;
      pads.push({
        ref,
        pin,
        net: netName || null,
        x: +(fx + lx * c + ly * s).toFixed(4),
        y: +(fy - lx * s + ly * c).toFixed(4),
        w: +(w * pc + h * ps).toFixed(4),
        h: +(w * ps + h * pc).toFixed(4),
        layers: copper,
      });
    }
  }
  return { pads };
}

/** Serialize the manifest beside the board file. Never throws. */
export function writePadsManifest(boardContents: SExpr[], pcb: PCB): void {
  try {
    const manifest = computePadsManifest(boardContents, pcb);
    const outPath = path.join(getBuildDir(), `${pcb.boardName}_pads.json`);
    fs.mkdirSync(getBuildDir(), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(manifest));
    logger.debug(`pads manifest written: ${outPath} (${manifest.pads.length} pads)`);
  } catch (error) {
    logger.warn(
      `could not write pads manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
