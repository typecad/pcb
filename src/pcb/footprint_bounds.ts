import fs from 'node:fs';
import { KiCAD } from '../kicad.js';
import { parse } from '../sexpr/index.js';
import { SNode } from '../sexpr/query.js';
import type { SExpr } from '../sexpr/types.js';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import logger from '../utils/logging.js';

/** Footprints already warned about for unresolved bounds — warn once each. */
const unresolvedFootprintWarnings = new Set<string>();

/** Full occupied box of a footprint, relative to its origin. */
export interface FootprintBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const boundsCache = new Map<string, FootprintBox | null>();

/**
 * Clears the footprint bounds cache. Useful in tests or when footprint
 * files have changed on disk during a session.
 */
export function clearFootprintBoundsCache(): void {
  boundsCache.clear();
}

/**
 * Computes and caches the occupied box of a KiCad footprint (relative to its
 * origin) by parsing its `.kicad_mod` file. Results are cached per footprint
 * name. The box is origin-relative: many footprints' origin is pin 1 or a
 * corner, not the body center — `minX/minY/maxX/maxY` carry that offset.
 * `width`/`height` are kept for compatibility.
 *
 * Looks up the footprint via KiCad's library paths, then falls back to
 * `./build/lib/footprints/`.
 *
 * @param footprintName - Footprint identifier in `"Library:Footprint"` format.
 * @returns The origin-relative box in mm (includes `width`/`height`), or
 *   `null` if the footprint cannot be resolved.
 */
export function getFootprintBounds(footprintName: string): FootprintBox | null {
  if (!footprintName || !footprintName.includes(LIBRARY_SEPARATOR)) return null;

  const cached = boundsCache.get(footprintName);
  if (cached !== undefined) return cached;

  const result = computeFootprintBounds(footprintName);
  boundsCache.set(footprintName, result);
  if (result === null && !unresolvedFootprintWarnings.has(footprintName)) {
    unresolvedFootprintWarnings.add(footprintName);
    logger.warn(
      `[placement] Footprint "${footprintName}" could not be resolved to bounds — ` +
        `edge-to-edge placement treats it as zero-size. Check the footprint name/library path.`,
    );
  }
  return result;
}

function resolveFootprintPath(footprintName: string): string | null {
  const parts = footprintName.split(LIBRARY_SEPARATOR);
  const kicad = KiCAD.instance;
  const libraryPaths = kicad.getLibraryPaths();

  if (libraryPaths.footprints) {
    const path = `${libraryPaths.footprints}/${parts[0]}.pretty/${parts[1]}.kicad_mod`;
    if (fs.existsSync(path)) return path;
  }

  const buildPath = `./build/lib/footprints/${parts[1]}.kicad_mod`;
  if (fs.existsSync(buildPath)) return buildPath;

  return null;
}

function computeFootprintBounds(footprintName: string): FootprintBox | null {
  const filePath = resolveFootprintPath(footprintName);
  if (!filePath) {
    logger.debug(`[footprint_bounds] Footprint file not found for: ${footprintName}`);
    return null;
  }

  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    const parsed = parse(contents);
    if (!Array.isArray(parsed)) return null;

    const sn = SNode.from(parsed as SExpr[]);
    return extractBoundsFromFootprint(sn);
  } catch (e) {
    logger.debug(`[footprint_bounds] Error parsing footprint ${footprintName}:`, e);
    return null;
  }
}

function extractBoundsFromFootprint(sn: SNode): FootprintBox | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let foundAny = false;

  const padElements = sn.children('pad');
  for (const pad of padElements) {
    const atNode = pad.child('at');
    if (atNode) {
      const px = atNode.getNumber(1);
      const py = atNode.getNumber(2);
      updateBounds(px, py, px, py);
      foundAny = true;
    }

    const sizeNode = pad.child('size');
    if (sizeNode && atNode) {
      const sw = sizeNode.getNumber(1) / 2;
      const sh = sizeNode.getNumber(2) / 2;
      const px = atNode.getNumber(1);
      const py = atNode.getNumber(2);
      updateBounds(px - sw, py - sh, px + sw, py + sh);
    }
  }

  for (const child of sn.children()) {
    const name = child.name;
    if (name === 'fp_line' || name === 'fp_rect') {
      const start = child.child('start');
      const end = child.child('end');
      if (start && end) {
        updateBounds(start.getNumber(1), start.getNumber(2), end.getNumber(1), end.getNumber(2));
        foundAny = true;
      }
    } else if (name === 'fp_circle') {
      const center = child.child('center');
      const end = child.child('end');
      if (center && end) {
        const cx = center.getNumber(1);
        const cy = center.getNumber(2);
        const ex = end.getNumber(1);
        const ey = end.getNumber(2);
        const radius = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
        updateBounds(cx - radius, cy - radius, cx + radius, cy + radius);
        foundAny = true;
      }
    } else if (name === 'fp_arc') {
      const start = child.child('start');
      const end = child.child('end');
      const mid = child.child('mid');
      if (start) {
        updatePoint(start.getNumber(1), start.getNumber(2));
        foundAny = true;
      }
      if (end) {
        updatePoint(end.getNumber(1), end.getNumber(2));
        foundAny = true;
      }
      if (mid) {
        updatePoint(mid.getNumber(1), mid.getNumber(2));
      }
    } else if (name === 'fp_poly') {
      const pts = child.child('pts');
      if (pts) {
        for (const xy of pts.children('xy')) {
          updatePoint(xy.getNumber(1), xy.getNumber(2));
          foundAny = true;
        }
      }
    }
  }

  if (!foundAny) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };

  function updateBounds(x1: number, y1: number, x2: number, y2: number): void {
    minX = Math.min(minX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxX = Math.max(maxX, x1, x2);
    maxY = Math.max(maxY, y1, y2);
  }

  function updatePoint(x: number, y: number): void {
    updateBounds(x, y, x, y);
  }
}
