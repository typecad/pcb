/**
 * Centroid (pick-and-place) row computation and CSV rendering.
 *
 * Coordinates stay in the KiCad board frame (mm, Y-down) — profiles emit
 * them as-is per the provider notes in profiles.ts. The local→board
 * transport is the one the rest of the toolchain already trusts:
 *
 *   wx = px + lx·cosθ + ly·sinθ
 *   wy = py − lx·sinθ + ly·cosθ
 *
 * (pad-verified: a footprint at (137.6, 84.8, 90) stores pad 3 at local
 * (-1.76, 0) and plots at board (137.6, 86.56) = origin + R(−90)·local —
 * same math as parseBoardLabels in the gerber viewer).
 */
import type { BoardComponent } from '../cli/typecad/board_model.js';
import type { CentroidMode, PlacementProfile } from './profiles.js';

/** Footprint-local point → board coordinates, both mm. */
export function footprintLocalToBoard(
  at: { x: number; y: number; rotation: number },
  local: { x: number; y: number },
): { x: number; y: number } {
  const rad = (at.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: at.x + local.x * c + local.y * s,
    y: at.y - local.x * s + local.y * c,
  };
}

/**
 * The placement datum for one component in board coordinates.
 *
 * - anchor: the footprint's `at` origin (what KiCad's own pos export reports)
 * - body: the measured fab-outline bbox center (what assemblers mean by
 *   "center of the component body"); falls back to the anchor when the
 *   footprint has no measurable geometry
 * - pads: the mean of the transformed pad centers; falls back to the anchor
 *   for pad-less footprints
 */
export function componentCentroid(
  comp: BoardComponent,
  mode: CentroidMode,
): { x: number; y: number } {
  if (mode === 'pads' && comp.pads.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const pad of comp.pads) {
      const p = footprintLocalToBoard(comp.at, pad.at);
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / comp.pads.length, y: sy / comp.pads.length };
  }
  if (mode === 'body' && comp.bodyCenter) {
    return footprintLocalToBoard(comp.at, comp.bodyCenter);
  }
  return { x: comp.at.x, y: comp.at.y };
}

export interface PlacementRow {
  ref: string;
  value: string;
  footprint: string;
  x: number;
  y: number;
  rotation: number;
  side: 'front' | 'back';
  dnp: boolean;
  /** Fiducial marks ride the same rows — OpenPnP types them instead of excluding them. */
  kind?: 'placement' | 'fiducial';
}

export interface PlacementBuildOptions {
  mode: CentroidMode;
  side: 'front' | 'back' | 'both';
  /** Coordinate origin the rows are rebased onto ('board' = as stored). */
  origin: { x: number; y: number };
  /** Extra rotation for every part, degrees (profile + CLI merged by caller). */
  rotationOffset: number;
  /** Extra rotation for bottom-side parts only, degrees. */
  bottomRotation: number;
  /** OpenPnP/KiCad bottom convention: negate x for bottom-side parts. */
  flipBottomX?: boolean;
  /** OpenPnP/KiCad bottom convention: mirror bottom rotation (rot → 180 − rot). */
  mirrorBottomRotation?: boolean;
  /** Ref globs to drop (further to the profile's own list). */
  exclude: string[];
  includeDnp: boolean;
  /** Ref globs that ride along as fiducial rows (OpenPnP types them). */
  fiducials?: string[];
}

/** Glob match on reference designators: `*` and `?`, case-insensitive. */
export function refMatches(pattern: string, ref: string): boolean {
  const re = new RegExp(
    `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
    'i',
  );
  return re.test(ref);
}

function excludedBy(patterns: string[], ref: string): boolean {
  return patterns.some((p) => refMatches(p, ref));
}

function normalizeDegrees(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  // a -ε rotation (or +180 adjust landing just under 360) must read as 0,
  // not 360.000000 — KiCad writes [0, 360)
  return r >= 359.9999995 ? 0 : Object.is(r, -0) ? 0 : r;
}

export function buildPlacementRows(
  components: BoardComponent[],
  opts: PlacementBuildOptions,
): { rows: PlacementRow[]; skipped: { ref: string; reason: string }[] } {
  const rows: PlacementRow[] = [];
  const skipped: { ref: string; reason: string }[] = [];
  for (const comp of components) {
    const reason = comp.excludeFromPos
      ? 'exclude_from_pos_files'
      : comp.dnp && !opts.includeDnp
        ? 'dnp'
        : opts.side !== 'both' && comp.side !== opts.side
          ? 'side filter'
          : excludedBy(opts.exclude, comp.reference)
            ? 'excluded'
            : null;
    if (reason) {
      skipped.push({ ref: comp.reference, reason });
      continue;
    }
    const centroid = componentCentroid(comp, opts.mode);
    // The OpenPnP/KiCad bottom transform mirrors the board about the Y
    // axis: it applies to the CAD rotation itself (mirrored first), with
    // the caller's offsets added after — same order as OpenPnP's own
    // KicadPosImporter.
    const mirrored =
      comp.side === 'back' && opts.mirrorBottomRotation === true
        ? 180 - comp.at.rotation
        : comp.at.rotation;
    rows.push({
      ref: comp.reference,
      value: comp.value,
      footprint: comp.footprint,
      x:
        comp.side === 'back' && opts.flipBottomX === true
          ? -(centroid.x - opts.origin.x)
          : centroid.x - opts.origin.x,
      y: centroid.y - opts.origin.y,
      rotation: normalizeDegrees(
        mirrored + opts.rotationOffset + (comp.side === 'back' ? opts.bottomRotation : 0),
      ),
      side: comp.side,
      dnp: comp.dnp,
      kind: opts.fiducials?.some((p) => refMatches(p, comp.reference)) ? 'fiducial' : 'placement',
    });
  }
  rows.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  return { rows, skipped };
}

export function csvEscape(value: string, delimiter: string, mode: 'always' | 'minimal'): string {
  if (mode === 'always' || value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  // avoid "-0.000" outputs for tiny negatives
  return /^-0(?:\.0+)?$/.test(fixed) ? (0).toFixed(decimals) : fixed;
}

/** mm → the profile's units. */
function convert(value: number, units: 'mm' | 'in' | 'mils'): number {
  if (units === 'in') return value / 25.4;
  if (units === 'mils') return value / 0.0254;
  return value;
}

export interface RenderPlacementOptions {
  units?: 'mm' | 'in' | 'mils';
  decimals?: number;
  rotationDecimals?: number;
}

/** Rows → the profile's CSV text (comments + header + data lines). */
export function renderPlacementCsv(
  rows: PlacementRow[],
  profile: PlacementProfile,
  opts: RenderPlacementOptions = {},
): string {
  const units = opts.units ?? profile.units;
  const decimals = opts.decimals ?? profile.decimals;
  const rotationDecimals = opts.rotationDecimals ?? profile.rotationDecimals;
  const esc = (v: string) => csvEscape(v, profile.delimiter, profile.quote);
  const lines: string[] = [];
  for (const comment of profile.comments?.(units) ?? []) lines.push(comment);
  // numeric columns and the header row stay unquoted even under 'always' —
  // that's KiCad's own pos-CSV shape ("R1","1k",25.4,127.0,90.0,top)
  lines.push(profile.columns.map((c) => c.header).join(profile.delimiter));
  for (const row of rows) {
    const fields = profile.columns.map((c) => {
      switch (c.key) {
        case 'ref':
          return esc(row.ref);
        case 'value':
          return esc(row.value);
        case 'footprint':
          return esc(row.footprint);
        case 'side':
          // bare even under 'always' — profile side tokens never need
          // quoting and KiCad's own pos file leaves Side unquoted
          return row.side === 'front' ? profile.side.front : profile.side.back;
        case 'rotation':
          return formatNumber(row.rotation, rotationDecimals);
        case 'x':
          return formatNumber(convert(row.x, units), decimals);
        case 'y':
          return formatNumber(convert(row.y, units), decimals);
      }
    });
    lines.push(fields.join(profile.delimiter));
  }
  return lines.join('\n') + '\n';
}
