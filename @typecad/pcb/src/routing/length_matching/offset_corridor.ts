/**
 * Offset corridor and multi-segment pattern strategies for length matching.
 *
 * When a sawtooth cannot be placed directly on a baseline segment (e.g. due
 * to clearance), these functions try offsetting to a parallel corridor or
 * splitting the required length across multiple segments.
 */

import type {
  ILengthMatchConfig,
  ILengthMatchContext,
  ILengthMatchPatternConfig,
  IRoutePath,
  IStraightSegment,
  ITrackBuilder,
} from '../types/length_match.js';

import { chalk } from './length_matcher_helpers.js';
import { collectSegments } from './segment_analysis.js';
import { estimateMaxAmplitudeOneSide } from './amplitude_estimation.js';
import { fitSawtoothWithSide, fitSawtoothBidirectional, validatePolylineDRC } from './sawtooth_fitting.js';
import {
  removeOrTrimOverlappingStraight,
  removeElementsFromBuilders,
  createBuilderFromFittedPattern,
} from './track_management.js';
import logger from '../../utils/logging.js';

// ─── Offset corridor ────────────────────────────────────────────────

/**
 * Try to place a sawtooth pattern on an offset (parallel) corridor when
 * the baseline segment doesn't have enough clearance.
 */
export function tryOffsetCorridorAndPattern(
  ctx: ILengthMatchContext,
  item: { index: number; length: number; path: IRoutePath },
  config: ILengthMatchConfig,
  builders: ITrackBuilder[],
  remainingDelta: number,
): { builder: ITrackBuilder; achieved: number; originalSegment: IStraightSegment } | null {
  const segments = collectSegments(item.path);
  if (!segments.length) return null;
  const totalLen = item.path.length;
  segments.sort(
    (a, b) =>
      b.length - a.length || Math.abs(a.centerAlongPath - totalLen / 2) - Math.abs(b.centerAlongPath - totalLen / 2),
  );

  const pattern = (config.pattern || { type: 'sawtooth' }) as ILengthMatchPatternConfig;
  const desiredAmp = Math.max(ctx.traceWidth, pattern.amplitude ?? ctx.traceWidth * 2);

  for (const base of segments) {
    const corridor = findOffsetCorridor(ctx, base, desiredAmp);
    if (!corridor) continue;

    // Trim overlap on baseline first
    const trimming = removeOrTrimOverlappingStraight(ctx, base, builders);
    if (trimming.toRemove.length > 0) {
      removeElementsFromBuilders(trimming.toRemove, builders);
    }

    const nb = ctx.pcb.track({ locked: !!ctx.locked, net: ctx.net, deferStaging: true });
    const w = ctx.traceWidth;
    const layer = base.start.layer;

    // Re-add residual baseline straight segments
    for (const rseg of trimming.residuals) {
      nb.from({ x: rseg.start.x, y: rseg.start.y }, rseg.layer, w).to({
        x: rseg.end.x,
        y: rseg.end.y,
        layer: rseg.layer,
        width: w,
      });
    }

    // Jog out to offset
    const jogOut = corridor.jogOut;
    nb.from({ x: jogOut[0].x, y: jogOut[0].y }, layer, w);
    for (let i = 1; i < jogOut.length; i++) {
      nb.to({ x: jogOut[i].x, y: jogOut[i].y, layer, width: w });
    }

    // Place sawtooth on offset baseline
    const fitted = fitSawtoothWithSide(
      ctx,
      corridor.offsetSeg,
      remainingDelta,
      config.tolerance,
      pattern,
      config.maxIterations ?? 20,
      !!config.debug,
      corridor.side ?? 1,
    );
    if (!fitted) {
      continue;
    }
    const pts = fitted.points;
    nb.from({ x: pts[0].x, y: pts[0].y }, layer, w);
    for (let i = 1; i < pts.length; i++) {
      nb.to({ x: pts[i].x, y: pts[i].y, layer, width: w });
    }

    // Jog back in
    const jogIn = corridor.jogIn;
    nb.from({ x: jogIn[0].x, y: jogIn[0].y }, layer, w);
    for (let i = 1; i < jogIn.length; i++) {
      nb.to({ x: jogIn[i].x, y: jogIn[i].y, layer, width: w });
    }

    return { builder: nb, achieved: fitted.achievedDelta, originalSegment: base };
  }
  return null;
}

/**
 * Search for a parallel offset corridor where a sawtooth can be placed.
 * Returns the offset segment, jog paths, and side if found.
 */
export function findOffsetCorridor(
  ctx: ILengthMatchContext,
  seg: IStraightSegment,
  requiredAmp: number,
): {
  offsetSeg: IStraightSegment;
  jogOut: { x: number; y: number }[];
  jogIn: { x: number; y: number }[];
  side: 1 | -1;
} | null {
  const layer = seg.start.layer;
  const ux = (seg.end.x - seg.start.x) / seg.length;
  const uy = (seg.end.y - seg.start.y) / seg.length;
  const nx = -uy;
  const ny = ux;

  const gridStep = Math.max(0.05, ctx.grid.getResolution());
  const baseMargin = ctx.traceWidth + ctx.clearance;
  let margin = Math.max(baseMargin, 0.3);
  margin = Math.min(margin, Math.max(0, seg.length * 0.25));
  if (seg.length <= 2 * margin) return null;

  const sMargin = { x: seg.start.x + ux * margin, y: seg.start.y + uy * margin };
  const eMargin = { x: seg.end.x - ux * margin, y: seg.end.y - uy * margin };

  for (let d = ctx.traceWidth + ctx.clearance; d <= 10.0; d += gridStep) {
    for (const side of [1, -1] as const) {
      const sOff = { x: sMargin.x + nx * d * side, y: sMargin.y + ny * d * side };
      const eOff = { x: eMargin.x + nx * d * side, y: eMargin.y + ny * d * side };

      if (!validatePolylineDRC(ctx, [sMargin, sOff], layer)) continue;
      if (!validatePolylineDRC(ctx, [sOff, eOff], layer)) continue;
      if (!validatePolylineDRC(ctx, [eOff, eMargin], layer)) continue;

      const offsetSeg: IStraightSegment = {
        start: { x: sOff.x, y: sOff.y, layer },
        end: { x: eOff.x, y: eOff.y, layer },
        length: Math.hypot(eOff.x - sOff.x, eOff.y - sOff.y),
        centerAlongPath: seg.centerAlongPath,
      };

      const ampMax = estimateMaxAmplitudeOneSide(ctx, offsetSeg, side);
      if (ampMax + 1e-6 < requiredAmp) continue;

      return { offsetSeg, jogOut: [sMargin, sOff], jogIn: [eOff, eMargin], side };
    }
  }
  return null;
}

// ─── Multi-segment pattern ──────────────────────────────────────────

/**
 * Attempt to split remaining delta across multiple eligible segments and
 * place sawtooth patterns on each.
 */
export function tryMultiSegmentPattern(
  ctx: ILengthMatchContext,
  item: { index: number; length: number; path: IRoutePath },
  config: ILengthMatchConfig,
  builders: ITrackBuilder[],
  remainingDelta: number,
): { builders: ITrackBuilder[]; achieved: number } | null {
  const minLen = config.minStraightSegment ?? 2.0;
  const segments = collectSegments(item.path).filter((s) => s.length >= minLen);
  if (!segments.length) return null;

  const maxSegments = Math.min(5, segments.length);
  segments.sort((a, b) => b.length - a.length);

  for (let k = 2; k <= maxSegments; k++) {
    const chosen = segments.slice(0, k);
    if (config.debug) {
      try {
        logger.debug(
          chalk.cyan(
            `[LengthMatch] Trying multi-segment fit: using ${k} segments lengths=[${chosen.map((s) => s.length.toFixed(3)).join(', ')}] for remaining=${remainingDelta.toFixed(3)}`,
          ),
        );
      } catch {
        logger.debug('[LengthMatch] failed to log multi-segment try info');
      }
    }
    const sumLen = chosen.reduce((acc, s) => acc + s.length, 0);
    const perSegDeltas = chosen.map((s) => remainingDelta * (s.length / sumLen));
    const createdBuilders: ITrackBuilder[] = [];
    let achievedTotal = 0;
    let okAll = true;
    for (let si = 0; si < chosen.length; si++) {
      const seg = chosen[si];
      const deltaShare = Math.max(perSegDeltas[si], config.tolerance + 1e-6);
      const fitted = fitSawtoothBidirectional(
        ctx,
        seg,
        deltaShare,
        config.tolerance,
        (config.pattern || { type: 'sawtooth' }) as ILengthMatchPatternConfig,
        config.maxIterations ?? 20,
        !!config.debug,
      );
      if (!fitted) {
        okAll = false;
        break;
      }
      // Build a new builder for this segment using the fitted pattern
      const nb = createBuilderFromFittedPattern(ctx, seg, fitted, builders);
      if (!nb) {
        okAll = false;
        break;
      }
      createdBuilders.push(nb);
      achievedTotal += fitted.achievedDelta;
    }
    if (okAll && achievedTotal > 0) {
      if (config.debug)
        try {
          logger.debug(chalk.cyan(`[LengthMatch] Multi-segment fit succeeded: achieved=${achievedTotal.toFixed(3)}mm`));
        } catch {
          logger.debug('[LengthMatch] failed to log multi-segment success info');
        }
      return { builders: createdBuilders, achieved: achievedTotal };
    }
  }
  return null;
}
