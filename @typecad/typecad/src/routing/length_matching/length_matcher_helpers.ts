/**
 * Shared utility functions used across the length matching modules.
 *
 * These are small, stateless helpers for configuration normalization,
 * geometry comparisons, occupancy queries, and debug diagnostics.
 */

import type { ILengthMatchConfig, ILengthMatchContext } from '../types/length_match.js';

import logger from '../../utils/logging.js';

// Chalk fallback for colorized output (no runtime chalk dependency)
export const chalk = {
  cyan: (str: string) => str,
  yellow: (str: string) => str,
  gray: (str: string) => str,
};

/** Normalize a raw config (number or object) into a full ILengthMatchConfig. */
export function normalizeConfig(raw: number | ILengthMatchConfig): ILengthMatchConfig {
  if (typeof raw === 'number') {
    return { tolerance: raw };
  }
  return raw;
}

/** Check whether two 2-D points are equal within `eps`. */
export function pointsEqual(a: { x: number; y: number }, b: { x: number; y: number }, eps: number = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/** Produce a deterministic string key for a straight segment (used for dedup). */
export function segmentKey(s: {
  start: { x: number; y: number; layer: string };
  end: { x: number; y: number; layer: string };
}): string {
  return `${s.start.layer}:${s.start.x.toFixed(6)},${s.start.y.toFixed(6)}->${s.end.x.toFixed(6)},${s.end.y.toFixed(6)}`;
}

/** Check whether a world-coordinate point is occupied on the routing grid. */
export function isOccupiedWorld(
  ctx: ILengthMatchContext,
  x: number,
  y: number,
  layer: string,
  ignoreSameNetExemption: boolean = false,
): boolean {
  const g = ctx.grid.worldToGrid(x, y);
  const netArg = ignoreSameNetExemption ? undefined : ctx.net;
  return ctx.grid.isOccupied(g.x, g.y, layer, ctx.clearance + ctx.traceWidth / 2, netArg, true);
}

/** Check whether the TYPECAD_LM_DEBUG env var is set. */
export function isEnvDebug(): boolean {
  try {
    return (
      typeof process !== 'undefined' &&
      process?.env &&
      (process.env.TYPECAD_LM_DEBUG === '1' || process.env.TYPECAD_LM_DEBUG === 'true')
    );
  } catch {
    return false;
  }
}

/**
 * Diagnostic helper: when a sample reports zero free clearance, log nearby
 * grid cell and precise track-obstacle checks to help identify what's
 * blocking the sample point.
 */
export function logZeroClearanceSample(
  ctx: ILengthMatchContext,
  worldX: number,
  worldY: number,
  layer: string,
  note?: string,
): void {
  if (!isEnvDebug()) return;

  try {
    const g = ctx.grid.worldToGrid(worldX, worldY);
    interface ICellInfo {
      occupied?: boolean;
      net?: string;
      isManualRoute?: boolean;
      absoluteBlock?: boolean;
      clearance?: number;
      obstacleHalfWidthMm?: number;
    }
    const cell =
      typeof ctx.grid.getCell === 'function' ? (ctx.grid.getCell(g.x, g.y, layer) as ICellInfo | undefined) : undefined;
    const gridEx = ctx.grid as unknown as {
      checkTrackObstaclePrecise?: (x: number, y: number, layer: string, clearance: number, net: string) => boolean;
    };
    const precise =
      typeof gridEx.checkTrackObstaclePrecise === 'function'
        ? gridEx.checkTrackObstaclePrecise(worldX, worldY, layer, ctx.clearance, ctx.net ?? '')
        : undefined;
    try {
      logger.debug(
        chalk.yellow(
          `[LengthMatch] ZERO-CLEAR sample at (${worldX.toFixed(3)},${worldY.toFixed(3)}) grid=(${g.x},${g.y}) layer=${layer} note=${note || ''}`,
        ),
      );
    } catch {
      logger.debug('[LengthMatch] logZeroClearanceSample: failed to log ZERO-CLEAR sample');
    }
    try {
      logger.debug(
        chalk.yellow(
          `[LengthMatch]   cell: ${cell ? JSON.stringify({ occupied: cell.occupied, net: cell.net, isManualRoute: cell.isManualRoute, absoluteBlock: cell.absoluteBlock, clearance: cell.clearance, obstacleHalfWidthMm: cell.obstacleHalfWidthMm }) : 'null'}`,
        ),
      );
    } catch {
      logger.debug('[LengthMatch] logZeroClearanceSample: failed to log cell info');
    }
    try {
      logger.debug(chalk.yellow(`[LengthMatch]   checkTrackObstaclePrecise => ${String(precise)}`));
    } catch {
      logger.debug('[LengthMatch] logZeroClearanceSample: failed to log checkTrackObstaclePrecise');
    }
  } catch (err) {
    try {
      logger.debug(
        chalk.gray(`[LengthMatch] logZeroClearanceSample threw: ${err instanceof Error ? err.message : String(err)}`),
      );
    } catch {
      logger.debug('[LengthMatch] logZeroClearanceSample: failed to log error info');
    }
  }
}
