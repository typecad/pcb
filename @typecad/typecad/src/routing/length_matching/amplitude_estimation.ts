/**
 * Amplitude estimation for length matching.
 *
 * Provides functions to estimate the maximum available amplitude (perpendicular
 * clearance) on one or both sides of a straight segment, using binary-search
 * sampling against the routing grid.
 */

import type { ILengthMatchContext, IStraightSegment } from '../types/length_match.js';

import { isOccupiedWorld, logZeroClearanceSample, isEnvDebug, chalk } from './length_matcher_helpers.js';
import logger from '../../utils/logging.js';

/**
 * Estimate the maximum symmetric amplitude available on **both** sides of
 * a segment. Returns the minimum clearance found across all sample points.
 */
export function estimateMaxAmplitude(ctx: ILengthMatchContext, seg: IStraightSegment): number {
  const layer = seg.start.layer;

  // Unit vectors along and normal to the segment
  const ux = (seg.end.x - seg.start.x) / seg.length;
  const uy = (seg.end.y - seg.start.y) / seg.length;
  const nx = -uy;
  const ny = ux;

  const samples = 16;
  const baseMargin = ctx.traceWidth + ctx.clearance;
  let margin = Math.max(baseMargin, 0.2);
  margin = Math.min(margin, Math.max(0, seg.length * 0.25));
  const step = (seg.length - 2 * margin) / (samples - 1);
  if (step <= 0) return 0;

  let ampLimit = Infinity;
  for (let i = 0; i < samples; i++) {
    const t = margin + i * step;
    const px = seg.start.x + ux * t;
    const py = seg.start.y + uy * t;

    // Binary search outward for max offset without occupancy
    let low = 0;
    let high = Math.min(5.0, Math.max(seg.length / 2, 1.0));
    for (let iter = 0; iter < 12; iter++) {
      const mid = (low + high) / 2;
      const offXpos = px + nx * mid;
      const offYpos = py + ny * mid;
      const offXneg = px - nx * mid;
      const offYneg = py - ny * mid;

      const occPos = isOccupiedWorld(ctx, offXpos, offYpos, layer, false);
      const occNeg = isOccupiedWorld(ctx, offXneg, offYneg, layer, false);

      if (!occPos && !occNeg) {
        low = mid;
      } else {
        high = mid;
      }
    }
    ampLimit = Math.min(ampLimit, low);
    if (isEnvDebug() && low <= 1e-9) {
      logZeroClearanceSample(ctx, px, py, layer, `estimateMaxAmplitude sample ${i + 1}/${samples}`);
    }
  }

  return Math.max(0, ampLimit);
}

/**
 * One-sided amplitude estimation — measures clearance on only the given
 * normal side (`+1` or `-1`). Used when we intentionally meander on one
 * side of the baseline only.
 */
export function estimateMaxAmplitudeOneSide(ctx: ILengthMatchContext, seg: IStraightSegment, side: 1 | -1): number {
  const layer = seg.start.layer;
  const ux = (seg.end.x - seg.start.x) / seg.length;
  const uy = (seg.end.y - seg.start.y) / seg.length;
  const nx = -uy;
  const ny = ux;

  const samples = 16;
  const baseMargin = ctx.traceWidth + ctx.clearance;
  let margin = Math.max(baseMargin, 0.2);
  margin = Math.min(margin, Math.max(0, seg.length * 0.25));
  const step = (seg.length - 2 * margin) / (samples - 1);

  if (step <= 0) {
    // If we can't sample across the interior due to tiny seg length,
    // still attempt a single-sample check at middle
    const mid = {
      x: seg.start.x + (seg.end.x - seg.start.x) * 0.5,
      y: seg.start.y + (seg.end.y - seg.start.y) * 0.5,
    };
    const ux2 = (seg.end.x - seg.start.x) / seg.length;
    const uy2 = (seg.end.y - seg.start.y) / seg.length;
    const nx2 = -uy2;
    const ny2 = ux2;
    let low = 0;
    let high = Math.min(5.0, Math.max(seg.length / 2, 1.0));
    for (let iter = 0; iter < 12; iter++) {
      const midv = (low + high) / 2;
      const offX = mid.x + nx2 * midv * side;
      const offY = mid.y + ny2 * midv * side;
      const occ = isOccupiedWorld(ctx, offX, offY, seg.start.layer, false);
      if (!occ) low = midv;
      else high = midv;
    }
    return Math.max(0, low);
  }

  const perSample: number[] = [];
  let ampLimit = Infinity;
  for (let i = 0; i < samples; i++) {
    const t = margin + i * step;
    const px = seg.start.x + ux * t;
    const py = seg.start.y + uy * t;
    let low = 0;
    let high = Math.min(5.0, Math.max(seg.length / 2, 1.0));
    for (let iter = 0; iter < 12; iter++) {
      const mid = (low + high) / 2;
      const offX = px + nx * mid * side;
      const offY = py + ny * mid * side;
      const occ = isOccupiedWorld(ctx, offX, offY, layer, false);
      if (!occ) {
        low = mid;
      } else {
        high = mid;
      }
    }
    perSample.push(low);
    ampLimit = Math.min(ampLimit, low);
    if (isEnvDebug() && low <= 1e-9) {
      logZeroClearanceSample(ctx, px, py, layer, `estimateMaxAmplitudeOneSide sample ${i + 1}/${samples} side=${side}`);
    }
    // Optional debug: per-sample occupancy report when enabled via env var
    if (isEnvDebug()) {
      try {
        logger.debug(
          chalk.gray(
            `[LengthMatch] sample ${i + 1}/${samples} at (${px.toFixed(3)},${py.toFixed(3)}) side=${side} -> maxFree=${low.toFixed(3)}`,
          ),
        );
      } catch {
        logger.debug('[LengthMatch] failed to log per-sample debug info');
      }
    }
  }

  // If the strict min across all samples is zero but some samples allow a
  // non-zero offset, consider using the best local offset instead of rejecting
  // the whole segment. This enables placement on a contiguous sub-span.
  const maxPer = perSample.length ? Math.max(...perSample) : 0;
  if (ampLimit <= 1e-9 && maxPer > 1e-9) {
    if (isEnvDebug()) {
      try {
        logger.debug(
          chalk.yellow(
            `[LengthMatch] ampLimit global min=0 but local max=${maxPer.toFixed(3)} — using local best span`,
          ),
        );
      } catch {
        logger.debug('[LengthMatch] failed to log ampLimit fallback info');
      }
    }
    return Math.max(0, maxPer);
  }
  return Math.max(0, ampLimit);
}
