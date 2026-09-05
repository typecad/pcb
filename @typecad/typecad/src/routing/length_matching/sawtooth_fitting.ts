/**
 * Sawtooth pattern fitting for length matching.
 *
 * Contains the iterative fitting algorithms that determine sawtooth amplitude,
 * pitch, and tooth count, as well as polyline construction and DRC validation.
 */

import type { ILengthMatchContext, ILengthMatchPatternConfig, IStraightSegment } from '../types/length_match.js';

import { pointsEqual, isOccupiedWorld, logZeroClearanceSample, isEnvDebug, chalk } from './length_matcher_helpers.js';
import { estimateMaxAmplitude, estimateMaxAmplitudeOneSide } from './amplitude_estimation.js';
import logger from '../../utils/logging.js';

// ─── Polyline construction ──────────────────────────────────────────

/**
 * Build a sawtooth (zigzag) polyline along a straight segment.
 *
 * @param seg    The baseline straight segment
 * @param n      Number of teeth to place
 * @param pitch  Distance between tooth centers along the baseline
 * @param amplitude  Perpendicular height of each tooth
 * @param margin Margin at both ends to keep away from bends
 * @param side   Normal side (+1 or -1) for the zigzag direction
 */
export function buildSawtoothPolyline(
  seg: IStraightSegment,
  n: number,
  pitch: number,
  amplitude: number,
  margin: number,
  side: 1 | -1 = +1,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];

  // Unit vectors
  const ux = (seg.end.x - seg.start.x) / seg.length;
  const uy = (seg.end.y - seg.start.y) / seg.length;
  const nx = -uy;
  const ny = ux;

  // Center pattern within the segment
  const forwardAvail = seg.length - 2 * margin;
  const usedForward = n * pitch;
  const padStart = margin + (forwardAvail - usedForward) / 2;

  // Helper to map local (t along, s normal) to world
  const map = (t: number, s: number) => ({
    x: seg.start.x + ux * t + nx * (s * side),
    y: seg.start.y + uy * t + ny * (s * side),
  });

  // Start at segment start
  pts.push({ x: seg.start.x, y: seg.start.y });

  // Straight to start of pattern
  if (padStart > 0) {
    pts.push(map(padStart, 0));
  }

  let t = padStart;
  // Construct n full teeth; each tooth: baseline s -> up diag -> down diag -> baseline
  for (let i = 0; i < n; i++) {
    const s = (pitch - 2 * amplitude) / 2; // baseline before/after slants
    if (s > 0) {
      t += s;
      pts.push(map(t, 0));
    }
    // Up (45°): advance +amplitude along and +amplitude normal
    t += amplitude;
    pts.push(map(t, amplitude));
    // Down (45°): advance +amplitude along and -amplitude normal back to baseline
    t += amplitude;
    pts.push(map(t, 0));
    if (s > 0) {
      t += s;
      pts.push(map(t, 0));
    }
  }

  // Straight to end
  const endT = seg.length - margin;
  if (t < endT) {
    pts.push(map(endT, 0));
  }
  // Ensure final waypoint is exactly the segment end
  pts.push({ x: seg.end.x, y: seg.end.y });

  // Remove duplicates
  const compact: { x: number; y: number }[] = [];
  for (const p of pts) {
    if (compact.length === 0 || !pointsEqual(compact[compact.length - 1], p)) {
      compact.push(p);
    }
  }

  // Coalesce colinear points to avoid overlapping segments and fragmentation
  const coalesced: { x: number; y: number }[] = [];
  const isColinearContinue = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ) => {
    const abx = b.x - a.x,
      aby = b.y - a.y;
    const bcx = c.x - b.x,
      bcy = c.y - b.y;
    const crossVal = abx * bcy - aby * bcx;
    const dotVal = abx * bcx + aby * bcy;
    const eps = 1e-9;
    return Math.abs(crossVal) < eps && dotVal >= 0; // same direction
  };
  for (const p of compact) {
    const m = coalesced.length;
    if (m < 2) {
      coalesced.push(p);
      continue;
    }
    const a = coalesced[m - 2];
    const b = coalesced[m - 1];
    if (isColinearContinue(a, b, p)) {
      // extend the last segment to p
      coalesced[m - 1] = p;
    } else {
      coalesced.push(p);
    }
  }
  return coalesced;
}

// ─── DRC validation ─────────────────────────────────────────────────

/** Validate a polyline by sampling along each segment for DRC clearance. */
export function validatePolylineDRC(ctx: ILengthMatchContext, pts: { x: number; y: number }[], layer: string): boolean {
  if (pts.length < 2) return false;
  const step = Math.max(ctx.grid.getResolution() / 2, 0.05);

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    const count = Math.max(2, Math.ceil(segLen / step));
    for (let k = 0; k <= count; k++) {
      const t = Math.min(segLen, k * step);
      const x = a.x + ux * t;
      const y = a.y + uy * t;
      // For length matching, ignore same-net occupancy to allow replacing baseline
      if (isOccupiedWorld(ctx, x, y, layer, false)) {
        return false;
      }
    }
  }
  return true;
}

// ─── Core fitting algorithms ────────────────────────────────────────

/**
 * Iteratively fit a sawtooth pattern on a segment (symmetric amplitude).
 *
 * Adjusts amplitude and pitch to achieve the required `deltaL` length
 * extension within the given `tolerance`.
 */
export function fitSawtooth(
  ctx: ILengthMatchContext,
  seg: IStraightSegment,
  deltaL: number,
  tolerance: number,
  pattern: ILengthMatchPatternConfig,
  maxIterations: number,
  debug: boolean = false,
): { points: { x: number; y: number }[]; achievedDelta: number } | null {
  const ampMax = estimateMaxAmplitude(ctx, seg);
  if (ampMax <= 0) {
    if (debug) {
      try {
        logger.debug(chalk.gray(`[LengthMatch] fit aborted: ampMax=0 for segment length=${seg.length.toFixed(3)}`));
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
    }
    return null;
  }

  const fixedAmp = typeof pattern.amplitude === 'number';
  const fixedPitch = typeof pattern.pitch === 'number';

  let amplitude = pattern.amplitude ?? Math.min(ampMax, Math.max(ctx.traceWidth, ampMax * 0.3));
  amplitude = Math.min(amplitude, ampMax);
  if (debug) {
    try {
      logger.debug(
        chalk.gray(
          `[LengthMatch] fit init: ampMax=${ampMax.toFixed(3)} requestedAmp=${pattern.amplitude ?? 'auto'} usingAmp=${amplitude.toFixed(3)}`,
        ),
      );
    } catch {
      logger.debug('[SawtoothFitting] logging failure');
    }
  }

  let nNeeded = 1;
  let pitch = pattern.pitch ?? Math.max(2 * amplitude, seg.length * 0.15);

  const margin = Math.max(ctx.traceWidth + ctx.clearance, amplitude * 0.25);

  let best: { points: { x: number; y: number }[]; achievedDelta: number } | null = null;
  for (let iter = 0; iter < maxIterations; iter++) {
    if (pitch < 2 * amplitude) {
      if (fixedPitch && fixedAmp) {
        if (debug) {
          try {
            logger.debug(
              chalk.gray(
                `[LengthMatch] fit fail: fixed pitch ${pitch.toFixed(3)} < 2*amp ${(2 * amplitude).toFixed(3)}`,
              ),
            );
          } catch {
            logger.debug('[SawtoothFitting] logging failure');
          }
        }
        return null;
      }
      pitch = 2 * amplitude;
    }

    const dPerTooth = 2 * amplitude * (Math.SQRT2 - 1);
    nNeeded = Math.max(1, Math.ceil(deltaL / dPerTooth));

    const forwardAvail = seg.length - 2 * margin;
    if (forwardAvail <= 0) {
      if (debug) {
        try {
          logger.debug(
            chalk.gray(
              `[LengthMatch] fit fail: forwardAvail<=0 (segLen=${seg.length.toFixed(3)} margin=${margin.toFixed(3)})`,
            ),
          );
        } catch {
          logger.debug('[SawtoothFitting] logging failure');
        }
      }
      return null;
    }
    const maxPitchToFitAllNeeded = forwardAvail / nNeeded;
    const desiredPitch = Math.max(2 * amplitude, pattern.pitch ?? maxPitchToFitAllNeeded);
    const maxPitchToFit = Math.min(desiredPitch, forwardAvail);
    if (maxPitchToFit < 2 * amplitude) {
      if (fixedAmp) {
        if (debug) {
          try {
            logger.debug(
              chalk.gray(
                `[LengthMatch] fit fail: fixed amp ${amplitude.toFixed(3)} too large for forwardAvail=${forwardAvail.toFixed(3)} (maxPitchToFit=${maxPitchToFit.toFixed(3)})`,
              ),
            );
          } catch {
            logger.debug('[SawtoothFitting] logging failure');
          }
        }
        return null;
      }
      amplitude = Math.max(Math.min(amplitude * 0.9, maxPitchToFit / 2), Math.min(ctx.traceWidth, ampMax));
      continue;
    }

    pitch = Math.min(Math.max(2 * amplitude, desiredPitch), maxPitchToFit);

    const nPlace = Math.max(1, Math.min(nNeeded, Math.floor((forwardAvail + 1e-9) / pitch)));
    const pts = buildSawtoothPolyline(seg, nPlace, pitch, amplitude, margin);

    const ok = validatePolylineDRC(ctx, pts, seg.start.layer);
    if (!ok) {
      if (fixedAmp && fixedPitch) return null;
      amplitude = Math.max(Math.min(amplitude * 0.9, ampMax), Math.min(ctx.traceWidth, ampMax));
      continue;
    }

    const achieved = nPlace * dPerTooth;
    const err = Math.abs(achieved - deltaL);
    if (debug) {
      try {
        logger.debug(
          chalk.gray(
            `[LengthMatch] fit try: amp=${amplitude.toFixed(3)} pitch=${pitch.toFixed(3)} n=${nPlace} achieved=${achieved.toFixed(3)} err=${err.toFixed(3)}`,
          ),
        );
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
    }

    // Fine tune amplitude if both params are algorithmic and we need better precision
    if (!fixedAmp && err > tolerance && achieved !== 0) {
      const grad = 2 * (Math.SQRT2 - 1) * nPlace;
      const adjust = (achieved - deltaL) / grad;
      const newAmp = Math.min(ampMax, Math.max(ctx.traceWidth, amplitude - adjust));
      if (Math.abs(newAmp - amplitude) < 1e-4) {
        best = { points: pts, achievedDelta: achieved };
        break;
      }
      amplitude = newAmp;
      continue;
    }

    best = { points: pts, achievedDelta: achieved };
    if (err <= tolerance) break;

    if (!fixedAmp) {
      if (achieved < deltaL) {
        amplitude = Math.min(amplitude * 1.05, ampMax);
      } else {
        amplitude = Math.max(amplitude * 0.95, Math.min(ctx.traceWidth, ampMax));
      }
    }
  }

  return best;
}

/**
 * Side-constrained fitter: places zigzags on the given normal side only.
 */
export function fitSawtoothWithSide(
  ctx: ILengthMatchContext,
  seg: IStraightSegment,
  deltaL: number,
  tolerance: number,
  pattern: ILengthMatchPatternConfig,
  maxIterations: number,
  debug: boolean,
  side: 1 | -1,
): { points: { x: number; y: number }[]; achievedDelta: number } | null {
  const ampMax = estimateMaxAmplitudeOneSide(ctx, seg, side);
  if (ampMax <= 0) {
    if (debug) {
      try {
        logger.debug(
          chalk.gray(`[LengthMatch] fit aborted (side=${side}): ampMax=0 for segment length=${seg.length.toFixed(3)}`),
        );
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
    }
    return null;
  }

  const fixedAmp = typeof pattern.amplitude === 'number';
  const fixedPitch = typeof pattern.pitch === 'number';

  let amplitude = pattern.amplitude ?? Math.min(ampMax, Math.max(ctx.traceWidth, ampMax * 0.3));
  amplitude = Math.min(amplitude, ampMax);
  if (debug) {
    try {
      logger.debug(
        chalk.gray(
          `[LengthMatch] fit init (side=${side}): ampMax=${ampMax.toFixed(3)} requestedAmp=${pattern.amplitude ?? 'auto'} usingAmp=${amplitude.toFixed(3)}`,
        ),
      );
    } catch {
      logger.debug('[SawtoothFitting] logging failure');
    }
  }

  let nNeeded = 1;
  let pitch = pattern.pitch ?? Math.max(2 * amplitude, seg.length * 0.15);

  const margin = Math.max(ctx.traceWidth + ctx.clearance, amplitude * 0.25);

  let best: { points: { x: number; y: number }[]; achievedDelta: number } | null = null;
  for (let iter = 0; iter < maxIterations; iter++) {
    if (pitch < 2 * amplitude) {
      if (fixedPitch && fixedAmp) {
        if (debug) {
          try {
            logger.debug(
              chalk.gray(
                `[LengthMatch] fit fail (side=${side}): fixed pitch ${pitch.toFixed(3)} < 2*amp ${(2 * amplitude).toFixed(3)}`,
              ),
            );
          } catch {
            logger.debug('[SawtoothFitting] logging failure');
          }
        }
        return null;
      }
      pitch = 2 * amplitude;
    }

    const dPerTooth = 2 * amplitude * (Math.SQRT2 - 1);
    nNeeded = Math.max(1, Math.ceil(deltaL / dPerTooth));

    const forwardAvail = seg.length - 2 * margin;
    if (forwardAvail <= 0) {
      if (debug) {
        try {
          logger.debug(
            chalk.gray(
              `[LengthMatch] fit fail (side=${side}): forwardAvail<=0 (segLen=${seg.length.toFixed(3)} margin=${margin.toFixed(3)})`,
            ),
          );
        } catch {
          logger.debug('[SawtoothFitting] logging failure');
        }
      }
      return null;
    }
    const maxPitchToFitAllNeeded = forwardAvail / nNeeded;
    const desiredPitch = Math.max(2 * amplitude, pattern.pitch ?? maxPitchToFitAllNeeded);
    const maxPitchToFit = Math.min(desiredPitch, forwardAvail);
    if (maxPitchToFit < 2 * amplitude) {
      if (fixedAmp) {
        if (debug) {
          try {
            logger.debug(
              chalk.gray(
                `[LengthMatch] fit fail (side=${side}): fixed amp ${amplitude.toFixed(3)} too large for forwardAvail=${forwardAvail.toFixed(3)} (maxPitchToFit=${maxPitchToFit.toFixed(3)})`,
              ),
            );
          } catch {
            logger.debug('[SawtoothFitting] logging failure');
          }
        }
        return null;
      }
      amplitude = Math.max(Math.min(amplitude * 0.9, maxPitchToFit / 2), Math.min(ctx.traceWidth, ampMax));
      continue;
    }

    pitch = Math.min(Math.max(2 * amplitude, desiredPitch), maxPitchToFit);

    const nPlace = Math.max(1, Math.min(nNeeded, Math.floor((forwardAvail + 1e-9) / pitch)));
    const pts = buildSawtoothPolyline(seg, nPlace, pitch, amplitude, margin, side);

    const ok = validatePolylineDRC(ctx, pts, seg.start.layer);
    if (!ok) {
      if (fixedAmp && fixedPitch) return null;
      amplitude = Math.max(Math.min(amplitude * 0.9, ampMax), Math.min(ctx.traceWidth, ampMax));
      continue;
    }

    const achieved = nPlace * dPerTooth;
    const err = Math.abs(achieved - deltaL);
    if (debug) {
      try {
        logger.debug(
          chalk.gray(
            `[LengthMatch] fit try (side=${side}): amp=${amplitude.toFixed(3)} pitch=${pitch.toFixed(3)} n=${nPlace} achieved=${achieved.toFixed(3)} err=${err.toFixed(3)}`,
          ),
        );
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
    }

    if (!fixedAmp && err > tolerance && achieved !== 0) {
      const grad = 2 * (Math.SQRT2 - 1) * nPlace;
      const adjust = (achieved - deltaL) / grad;
      const newAmp = Math.min(ampMax, Math.max(ctx.traceWidth, amplitude - adjust));
      if (Math.abs(newAmp - amplitude) < 1e-4) {
        best = { points: pts, achievedDelta: achieved };
        if (debug)
          try {
            logger.debug(
              chalk.cyan(`[LengthMatch] fit best (side=${side}) achieved=${achieved.toFixed(3)} err=${err.toFixed(3)}`),
            );
          } catch {
            logger.debug('[SawtoothFitting] logging failure');
          }
        break;
      }
      amplitude = newAmp;
      continue;
    }

    best = { points: pts, achievedDelta: achieved };
    if (debug)
      try {
        logger.debug(
          chalk.cyan(
            `[LengthMatch] fit success (side=${side}) amp=${amplitude.toFixed(3)} pitch=${pitch.toFixed(3)} n=${nPlace} achieved=${achieved.toFixed(3)} err=${err.toFixed(3)}`,
          ),
        );
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
    if (err <= tolerance) break;

    if (!fixedAmp) {
      if (achieved < deltaL) {
        amplitude = Math.min(amplitude * 1.05, ampMax);
      } else {
        amplitude = Math.max(amplitude * 0.95, Math.min(ctx.traceWidth, ampMax));
      }
    }
  }

  return best;
}

/**
 * Try both sides of the segment normal and pick the first successful fit
 * (prefers side with more free space).
 */
export function fitSawtoothBidirectional(
  ctx: ILengthMatchContext,
  seg: IStraightSegment,
  deltaL: number,
  tolerance: number,
  pattern: ILengthMatchPatternConfig,
  maxIterations: number,
  debug: boolean = false,
): { points: { x: number; y: number }[]; achievedDelta: number } | null {
  // Prefer the side that appears more open by quick sampling
  const ampOneSidePos = estimateMaxAmplitudeOneSide(ctx, seg, +1);
  const ampOneSideNeg = estimateMaxAmplitudeOneSide(ctx, seg, -1);
  const sides: (1 | -1)[] = ampOneSidePos >= ampOneSideNeg ? [1, -1] : [-1, 1];

  for (const side of sides) {
    const res = fitSawtoothWithSide(ctx, seg, deltaL, tolerance, pattern, maxIterations, debug, side);
    if (res) return res;
  }
  // If direct bidirectional attempts failed, try fitting on the longest contiguous free sub-span
  try {
    const sub = attemptSubSpanFit(ctx, seg, deltaL, tolerance, pattern, maxIterations, debug);
    if (sub) return sub;
  } catch (err) {
    if (debug)
      try {
        logger.debug(
          chalk.gray(`[LengthMatch] sub-span attempt threw: ${err instanceof Error ? err.message : String(err)}`),
        );
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
  }
  return null;
}

/**
 * Try to find the longest contiguous sub-span of `seg` that has free
 * clearance and attempt to fit a sawtooth pattern on that sub-span.
 */
export function attemptSubSpanFit(
  ctx: ILengthMatchContext,
  seg: IStraightSegment,
  deltaL: number,
  tolerance: number,
  pattern: ILengthMatchPatternConfig,
  maxIterations: number,
  debug: boolean,
): { points: { x: number; y: number }[]; achievedDelta: number } | null {
  const ux = (seg.end.x - seg.start.x) / seg.length;
  const uy = (seg.end.y - seg.start.y) / seg.length;
  const nx = -uy;
  const ny = ux;

  const samples = 32;
  const baseMargin = Math.max(ctx.traceWidth + ctx.clearance, 0.1);
  let margin = Math.max(baseMargin, 0.1);
  margin = Math.min(margin, Math.max(0, seg.length * 0.25));
  const avail = seg.length - 2 * margin;
  if (avail <= 0) return null;
  const step = avail / Math.max(1, samples - 1);

  for (const side of [1, -1] as const) {
    const perSample: number[] = [];
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
        const occ = isOccupiedWorld(ctx, offX, offY, seg.start.layer, false);
        if (!occ) low = mid;
        else high = mid;
      }
      perSample.push(low);
      if (isEnvDebug() && low <= 1e-9) {
        logZeroClearanceSample(ctx, px, py, seg.start.layer, `subspan sample ${i + 1}/${samples} side=${side}`);
      }
      if (isEnvDebug() && debug) {
        try {
          logger.debug(
            chalk.gray(
              `[LengthMatch] subspan sample ${i + 1}/${samples} at (${(seg.start.x + ux * (margin + i * step)).toFixed(3)},${(seg.start.y + uy * (margin + i * step)).toFixed(3)}) side=${side} -> maxFree=${low.toFixed(3)}`,
            ),
          );
        } catch {
          logger.debug('[SawtoothFitting] logging failure');
        }
      }
    }

    // Consider a sample eligible if free >= minFreeThreshold
    const minFreeThreshold = Math.max(0.25, ctx.traceWidth * 0.5);
    let bestStart = -1;
    let bestEnd = -1;
    let curStart = -1;
    for (let i = 0; i < perSample.length; i++) {
      if (perSample[i] >= minFreeThreshold) {
        if (curStart < 0) curStart = i;
      } else {
        if (curStart >= 0) {
          if (bestStart < 0 || i - curStart > bestEnd - bestStart + 1) {
            bestStart = curStart;
            bestEnd = i - 1;
          }
          curStart = -1;
        }
      }
    }
    if (curStart >= 0) {
      if (bestStart < 0 || perSample.length - curStart > bestEnd - bestStart + 1) {
        bestStart = curStart;
        bestEnd = perSample.length - 1;
      }
    }

    if (bestStart < 0) continue;

    const tStart = margin + bestStart * step;
    const tEnd = margin + bestEnd * step;
    const subStart = { x: seg.start.x + ux * tStart, y: seg.start.y + uy * tStart, layer: seg.start.layer };
    const subEnd = { x: seg.start.x + ux * tEnd, y: seg.start.y + uy * tEnd, layer: seg.start.layer };
    const subSeg: IStraightSegment = {
      start: subStart,
      end: subEnd,
      length: Math.hypot(subEnd.x - subStart.x, subEnd.y - subStart.y),
      centerAlongPath: seg.centerAlongPath,
    };

    if (debug) {
      try {
        logger.debug(
          chalk.cyan(
            `[LengthMatch] Found free sub-span side=${side} samples=${bestStart}-${bestEnd} length=${subSeg.length.toFixed(3)}mm, attempting fit`,
          ),
        );
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
    }

    // First try multi-subspan stitching
    const multi = attemptMultiFitOnSubSeg(ctx, subSeg, deltaL, tolerance, pattern, maxIterations, debug, side);
    if (multi) return multi;

    // Attempt to fit on this sub-segment (allow both sides but prefer this side)
    const res = fitSawtoothWithSide(ctx, subSeg, deltaL, tolerance, pattern, maxIterations, debug, side);
    if (res) return res;
    const resOther = fitSawtoothWithSide(
      ctx,
      subSeg,
      deltaL,
      tolerance,
      pattern,
      maxIterations,
      debug,
      side === 1 ? -1 : 1,
    );
    if (resOther) return resOther;
  }

  return null;
}

/**
 * Try to split a long free sub-segment into multiple contiguous sub-segments
 * and fit sawtooth patterns on each. Returns a combined fitted pattern if
 * all sub-fits succeed.
 */
export function attemptMultiFitOnSubSeg(
  ctx: ILengthMatchContext,
  subSeg: IStraightSegment,
  deltaL: number,
  tolerance: number,
  pattern: ILengthMatchPatternConfig,
  maxIterations: number,
  debug: boolean,
  preferredSide: 1 | -1,
): { points: { x: number; y: number }[]; achievedDelta: number } | null {
  const totalLen = subSeg.length;
  for (const parts of [2, 3, 4, 5]) {
    const pieceLen = totalLen / parts;
    const minPiece = Math.max(0.8, ctx.traceWidth * 2);
    if (pieceLen < minPiece) continue;

    const fittedList: { points: { x: number; y: number }[]; achievedDelta: number }[] = [];
    let okAll = true;
    for (let i = 0; i < parts; i++) {
      const t0 = i * pieceLen;
      const t1 = (i + 1) * pieceLen;
      const ux = (subSeg.end.x - subSeg.start.x) / subSeg.length;
      const uy = (subSeg.end.y - subSeg.start.y) / subSeg.length;
      const a = { x: subSeg.start.x + ux * t0, y: subSeg.start.y + uy * t0, layer: subSeg.start.layer };
      const b = { x: subSeg.start.x + ux * t1, y: subSeg.start.y + uy * t1, layer: subSeg.start.layer };
      const piece: IStraightSegment = {
        start: a,
        end: b,
        length: Math.hypot(b.x - a.x, b.y - a.y),
        centerAlongPath: subSeg.centerAlongPath,
      };

      const share = deltaL * (piece.length / totalLen);
      const want = Math.max(share, tolerance + 1e-6);

      let fitted = fitSawtoothWithSide(ctx, piece, want, tolerance, pattern, maxIterations, debug, preferredSide);
      if (!fitted)
        fitted = fitSawtoothWithSide(
          ctx,
          piece,
          want,
          tolerance,
          pattern,
          maxIterations,
          debug,
          preferredSide === 1 ? -1 : 1,
        );
      if (!fitted) {
        okAll = false;
        break;
      }
      fittedList.push(fitted);
    }

    if (!okAll || fittedList.length !== parts) continue;

    // Stitch points together
    const combined: { x: number; y: number }[] = [];
    let achievedSum = 0;
    for (const f of fittedList) {
      achievedSum += f.achievedDelta;
      for (const p of f.points) {
        if (combined.length === 0 || !pointsEqual(combined[combined.length - 1], p)) combined.push(p);
      }
    }

    if (debug)
      try {
        logger.debug(
          chalk.cyan(`[LengthMatch] multi-subspan fit succeeded parts=${parts} achieved=${achievedSum.toFixed(3)}mm`),
        );
      } catch {
        logger.debug('[SawtoothFitting] logging failure');
      }
    return { points: combined, achievedDelta: achievedSum };
  }
  return null;
}
