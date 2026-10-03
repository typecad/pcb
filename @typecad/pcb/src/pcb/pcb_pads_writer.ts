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
import { addOutputPath } from '../cli/pending_summary.js';
import { parse, sym, SNode } from '../sexpr/index.js';
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

/** Extract the manifest from final board contents. */
export function computePadsManifest(boardContents: SExpr[]): PadsManifest {
  const pads: PadEntry[] = [];
  const root = SNode.from([sym('kicad_pcb'), ...boardContents] as SExpr[]);
  // Net reference forms vary by who last saved the board: KiCad writes
  // `(net N "name")` inline on the pad, kicad-cli reserializes to name-only
  // `(net "name")`, and legacy boards carry the coded form `(net N)` with
  // the name only in the top-level table. Pads labeled by the pad node's
  // inline name alone go name-less under the other two forms — the viewer
  // then renders pin numbers with no net names until a full typeCAD rebuild
  // rewrites the inline names.
  const netTable = new Map<number, string>();
  for (const net of root.children('net')) {
    if (typeof net.raw[1] === 'string') continue; // name-only form has no code
    netTable.set(num(net, 1), String(net.raw[2] ?? ''));
  }
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
      let netName = '';
      if (netNode) {
        if (typeof netNode.raw[1] === 'string') netName = netNode.raw[1]!;
        // inline name, else the coded form through the board's net table
        else netName = String(netNode.raw[2] ?? netTable.get(num(netNode, 1)) ?? '');
      }
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

/** Atomic-ish manifest write: temp file + rename, retried — a reader
 *  (the extension's query spawn, an AV scan) holding the target open on
 *  Windows must not silently strand the previous revision's labels. */
const sleepSync = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/** Error classes worth retrying: Windows reader/AV locks release in
 *  milliseconds; anything else (temp vanished, read-only directory) will
 *  not heal by waiting. */
const isTransientRenameError = (err: unknown): boolean => {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
};

function writeManifestAtomically(outPath: string, manifest: PadsManifest): void {
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest));
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(tmp, outPath);
        return;
      } catch (err) {
        if (attempt >= 4 || !isTransientRenameError(err)) throw err;
        sleepSync(25 * (attempt + 1));
      }
    }
  } catch (err) {
    // a failed cycle never strands the temp beside the manifest
    try {
      fs.unlinkSync(tmp);
    } catch {
      // already gone
    }
    throw err;
  }
}

/** Serialize the manifest beside the board file. Never throws. */
export function writePadsManifest(boardContents: SExpr[], boardName: string): void {
  try {
    const manifest = computePadsManifest(boardContents);
    const outPath = path.join(getBuildDir(), `${boardName}_pads.json`);
    fs.mkdirSync(getBuildDir(), { recursive: true });
    writeManifestAtomically(outPath, manifest);
    // Loud on purpose: measured pad geometry is placement-grade data — the
    // summary line is what makes agents reach for it instead of datasheets.
    addOutputPath(outPath);
    logger.info(
      `pads manifest: ${manifest.pads.length} pads (measured position, extents, copper layers, nets) -> ${outPath}`,
    );
  } catch (error) {
    logger.warn(
      `could not write pads manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Heal a stale manifest straight from the board file: whenever
 * `<stem>_pads.json` is missing or older than `<stem>.kicad_pcb`, recompute
 * it. The manifest is a derived artifact — normally rewritten by the build's
 * board write — but a KiCad-side edit that flows through sync without a full
 * rebuild (or a locked write that left the old file behind) leaves it one
 * revision behind, and the viewer renders pad labels from it: copper moves,
 * labels don't. Returns true when a rewrite happened. Never throws.
 */
export function refreshPadsManifestFromBoard(boardPath: string): boolean {
  let boardStat: fs.Stats;
  let text: string;
  try {
    boardStat = fs.statSync(boardPath);
    text = fs.readFileSync(boardPath, 'utf-8');
    // A board rewritten between stat and read would tag the manifest NEWER
    // than the board while holding the previous revision's text — that
    // suppresses the next heal until the board moves again. Bail; the next
    // cycle re-reads the settled board.
    if (fs.statSync(boardPath).mtimeMs !== boardStat.mtimeMs) return false;
  } catch {
    return false;
  }
  const boardName = path.basename(boardPath).replace(/\.kicad_pcb$/, '');
  const outPath = path.join(path.dirname(boardPath), `${boardName}_pads.json`);
  try {
    const padsStat = fs.statSync(outPath);
    if (padsStat.mtimeMs >= boardStat.mtimeMs) return false;
  } catch {
    // missing — write it
  }
  try {
    const rootRaw = parse(text) as unknown as SExpr[];
    const manifest = computePadsManifest(rootRaw.slice(1));
    writeManifestAtomically(outPath, manifest);
    logger.info(
      `pads manifest refreshed from board (was stale): ${manifest.pads.length} pads -> ${outPath}`,
    );
    return true;
  } catch (error) {
    logger.warn(
      `could not refresh pads manifest from ${boardPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
