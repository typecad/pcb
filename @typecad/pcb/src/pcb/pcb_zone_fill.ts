import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logging.js';
import { parse, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import { fillZone } from './pcb_zone_fill_engine.js';
import type { PCB } from './pcb.js';
import type { PcbInternalState } from './pcb_state.js';
import { getBuildDir } from '../utils/constants.js';

/**
 * Zone-fill materialization, native: the same fill engine the native DRC
 * and the gerber export use, applied to the written board file — no
 * kicad-cli round-trip. NOT called by create() — zone fills are the
 * consumer's responsibility (`export gerbers` refills in memory, `check`
 * refills during DRC); this remains exported for the public API and for
 * callers that want to force a fill-and-save.
 *
 * The refill is deterministic: identical boards fill to byte-identical
 * files, and the written geometry is the same substrate every native
 * consumer (DRC, gerbers, docgen images) computes — writer and checkers
 * cannot disagree.
 */

/** True when at least one copper pour requests filling. */
function zoneFillRequested(state: PcbInternalState): boolean {
  return state.zones.some((z) => (z as { filled?: boolean }).filled === true);
}

function boardFilePath(pcb: PCB): string {
  return path.resolve(getBuildDir(), `${pcb.boardName}.kicad_pcb`);
}

/** Global opt-out (`new PCB(name, { fill_zones: false })`). */
function fillZonesEnabled(state: PcbInternalState): boolean {
  return state.options.fill_zones !== false;
}

/**
 * Materialize declared zone fills on the written board. Best-effort by
 * design: on failure the board is still valid — zones carry their fill
 * configuration and KiCad fills them on demand — but fabrication exports
 * will lack the pour copper until a fill runs, so the skip is always
 * surfaced in a warning.
 */
export function materializeZoneFills(pcb: PCB, state: PcbInternalState): void {
  if (!fillZonesEnabled(state)) return;
  if (!zoneFillRequested(state)) return;

  const boardPath = boardFilePath(pcb);
  if (!fs.existsSync(boardPath)) {
    logger.warn('[ZoneFill] Board file not found after write — zone fills left unmaterialized.');
    return;
  }

  try {
    const filled = refillZoneFills(fs.readFileSync(boardPath, 'utf8'));
    if (filled === null) {
      logger.warn(
        '[ZoneFill] The native fill engine produced no fill — zones are left as declarations ' +
          'and exports will not include pour copper.',
      );
      return;
    }
    fs.writeFileSync(boardPath, filled, 'utf8');
    logger.info('⏦ Zone fills materialized (native fill engine, no kicad-cli).');
  } catch (error) {
    logger.warn(
      `[ZoneFill] native zone fill failed — zones left unmaterialized: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Compute zone fills with the native engine and inject them into the board
 * source as `filled_polygon` children (keyhole rings, KiCad-readable).
 * Returns the new source, or null when no zone could be filled.
 */
export function refillZoneFills(source: string): string | null {
  const root = SNode.from(parse(source) as SExpr[]);
  const zones = root.children('zone'); // one array: SNode wrappers are not
  // reference-stable across children() calls, so the ordinal is the handle
  let out = stripFilledPolygons(source);
  let filledAny = false;
  for (let z = 0; z < zones.length; z++) {
    const zone = zones[z]!;
    const layerNode = zone.child('layer') ?? zone.child('layers');
    const layerNames = layerNode
      ? layerNode.raw.slice(1).filter((v): v is string => typeof v === 'string')
      : [];
    const layers = layerNames.length ? layerNames : ['F.Cu'];
    const blocks: string[] = [];
    for (const layer of layers) {
      const res = fillZone(root, zone, layer);
      if (!res) continue;
      // inject the KEYHOLED ring — KiCad's own gerbers carry exactly this
      // form (single contour per island, zero-width channels), which every
      // viewer including gerbview renders correctly. Separate outer+hole
      // sub-contours in one region are the spec-tolerated alternative but
      // gerbview fills them WITHOUT even-odd subtraction → solid slabs.
      const toPts = (ring: number[]) =>
        ring.reduce((s, v, i) => (i % 2 === 0 ? s + `(xy ${v.toFixed(6)} ` : s + `${v.toFixed(6)}) `), '').trim();
      for (const isl of res.islands) {
        blocks.push(`(filled_polygon (layer "${layer}") (pts ${toPts(isl.ring)}))`);
      }
    }
    if (blocks.length === 0) continue;
    filledAny = true;
    // inject before the zone's final closing paren: locate this zone's
    // balanced region in the current source and splice
    const zoneStart = nthZoneStart(out, z);
    if (zoneStart < 0) continue;
    const closeIdx = balancedClose(out, zoneStart);
    if (closeIdx < 0) continue;
    const indent = '\n    ';
    out =
      out.slice(0, closeIdx) +
      indent +
      blocks.join(indent) +
      out.slice(closeIdx);
  }
  return filledAny ? out : null;
}

// `(zone` but not `(zone_defaults`/`(zone_connect` — the token must end here.
// typeCAD's serializer puts the node name on its own line (`(\n  zone`), so
// whitespace between the paren and the name is allowed.
const ZONE_OPEN = /\(\s*zone(?![\w-])/g;

function nthZoneStart(source: string, ordinal: number): number {
  ZONE_OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = ZONE_OPEN.exec(source))) {
    if (n === ordinal) return m.index;
    n++;
  }
  return -1;
}

/** Remove every (filled_polygon …) block so a refill replaces stale fills. */
function stripFilledPolygons(source: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const j = source.indexOf('(filled_polygon', i);
    if (j < 0) break;
    const close = balancedClose(source, j);
    if (close < 0) break;
    out += source.slice(i, j);
    i = close + 1;
  }
  if (out === '') return source;
  return out + source.slice(i);
}

function balancedClose(source: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
