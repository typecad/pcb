/**
 * Length matching orchestrator.
 *
 * This module provides the public `LengthMatcher.apply()` API and delegates
 * to focused sub-modules:
 *
 *   - `length_matcher_helpers` — shared utilities (config normalization, geometry, occupancy)
 *   - `segment_analysis`       — straight segment collection & candidate selection
 *   - `amplitude_estimation`   — perpendicular clearance estimation
 *   - `sawtooth_fitting`       — iterative sawtooth pattern fitting & DRC validation
 *   - `track_management`       — overlapping track removal & builder creation
 *   - `offset_corridor`        — offset corridor & multi-segment strategies
 */

import type {
  ILengthMatchConfig,
  ILengthMatchContext,
  ILengthMatchPatternConfig,
  IRoutePath,
  ITrackBuilder,
} from '../types/length_match.js';
import { RoutingError } from '../../utils/errors.js';
import { getCallSite } from '../../utils/stack_trace.js';
import { formatSourceError } from '../../utils/error_reporter.js';

import { normalizeConfig, segmentKey, chalk } from './length_matcher_helpers.js';
import { collectSegments, pickCandidateSegment } from './segment_analysis.js';
import { fitSawtoothBidirectional } from './sawtooth_fitting.js';
import {
  removeOrTrimOverlappingStraight,
  removeElementsFromBuilders,
  createBuilderFromFittedPattern,
} from './track_management.js';
import { tryOffsetCorridorAndPattern, tryMultiSegmentPattern } from './offset_corridor.js';

import logger from '../../utils/logging.js';

export class LengthMatcher {
  /**
   * Apply length matching to a set of routed paths.
   *
   * Extends shorter routes with sawtooth meanders so that all routes are
   * within `tolerance` of the longest route.
   */
  static apply(
    ctx: ILengthMatchContext,
    routeDetails: { path: IRoutePath; success: boolean }[],
    routeTrackBuilders: (ITrackBuilder[] | undefined)[],
    rawConfig: number | ILengthMatchConfig,
  ): { updates: { index: number; newLength: number }[]; builders: ITrackBuilder[] } {
    const config = normalizeConfig(rawConfig);

    // Allow env override for debug: TYPECAD_LM_DEBUG=1|true
    try {
      const envDbg =
        typeof process !== 'undefined' &&
        process?.env &&
        (process.env.TYPECAD_LM_DEBUG === '1' || process.env.TYPECAD_LM_DEBUG === 'true');
      if (envDbg) {
        config.debug = true;
      }
    } catch {
      logger.debug('[LengthMatch] env debug check failed');
    }

    // Collect only successful routes with their indices
    const items: { index: number; length: number; path: IRoutePath }[] = [];
    for (let i = 0; i < routeDetails.length; i++) {
      const rd = routeDetails[i];
      if (rd && rd.success && rd.path && rd.path.nodes && rd.path.nodes.length > 1) {
        items.push({ index: i, length: rd.path.length, path: rd.path });
      }
    }
    if (config.debug) {
      try {
        const lengths = items.map((it) => it.length.toFixed(3)).join(', ');
        logger.debug(
          chalk.cyan(`[LengthMatch] Candidates: ${items.length} successful route(s). Lengths = [${lengths}]`),
        );
      } catch {
        logger.debug('[LengthMatch] failed to log candidate debug info');
      }
    }
    if (items.length < 2) {
      if (config.debug) logger.debug(chalk.yellow(`[LengthMatch] Skipping: need >= 2 successful routes to match`));
      return { updates: [], builders: [] };
    }

    const Lmax = Math.max(...items.map((it) => it.length));

    // Sort ascending by length so we try to extend shorter ones first
    items.sort((a, b) => a.length - b.length);

    const createdBuilders: ITrackBuilder[] = [];
    const modifiedIndices = new Set<number>();

    for (const item of items) {
      const deltaNeeded = Lmax - item.length;
      if (config.debug)
        logger.debug(
          chalk.gray(
            `[LengthMatch] Processing Item ${item.index}: length=${item.length.toFixed(3)}, Lmax=${Lmax.toFixed(3)}, deltaNeeded=${deltaNeeded.toFixed(3)}, tolerance=${config.tolerance}`,
          ),
        );
      if (deltaNeeded <= config.tolerance) {
        if (config.debug)
          logger.debug(
            chalk.gray(
              `[LengthMatch] Item ${item.index}: already within tolerance (ΔL=${deltaNeeded.toFixed(3)} <= ${config.tolerance})`,
            ),
          );
        continue;
      }

      const builders = routeTrackBuilders[item.index] || [];
      if (!builders || builders.length === 0) {
        const err = new RoutingError(
          formatSourceError(`[LengthMatch] No track builders available for route index ${item.index}`, getCallSite()),
        );
        err.stack = err.message;
        throw err;
      }

      let remaining = deltaNeeded;
      const attemptedThisRound = new Set<string>();
      const pattern = config.pattern || { type: 'sawtooth' as const };
      if (pattern.type !== 'sawtooth') {
        const err = new RoutingError(
          formatSourceError(`[LengthMatch] Unsupported pattern type: ${pattern.type}`, getCallSite()),
        );
        err.stack = err.message;
        throw err;
      }
      // Validate fixed sawtooth parameters early: pitch must be >= 2*amplitude
      if (typeof pattern.pitch === 'number' && typeof pattern.amplitude === 'number') {
        const p = pattern.pitch;
        const a = pattern.amplitude;
        if (p < 2 * a - 1e-9) {
          const err = new RoutingError(
            formatSourceError(
              `[LengthMatch] Invalid sawtooth parameters: pitch=${p}mm < 2*amplitude=${(2 * a).toFixed(3)}mm. Increase pitch or reduce amplitude, or omit one to allow auto-adjust.`,
              getCallSite(),
            ),
          );
          err.stack = err.message;
          throw err;
        }
      }

      while (remaining > config.tolerance) {
        // Debug: dump straight segments and eligibility
        const minLen = config.minStraightSegment ?? 2.0;
        if (config.debug) {
          const dbgSegs = collectSegments(item.path);
          const allLens = dbgSegs.map((s) => s.length.toFixed(3)).join(', ');
          const eligLens = dbgSegs
            .filter((s) => s.length >= minLen)
            .map((s) => s.length.toFixed(3))
            .join(', ');
          try {
            logger.debug(chalk.cyan(`[LengthMatch] Segments: [${allLens}]`));
            logger.debug(chalk.cyan(`[LengthMatch] Eligible (>=${minLen}): [${eligLens}]`));
          } catch {
            logger.debug('[LengthMatch] failed to log segment debug info');
          }
        }

        const segment = pickCandidateSegment(ctx, item.path, minLen, attemptedThisRound);
        if (!segment) {
          // First try placing pattern on an offset corridor (may create room)
          const created = tryOffsetCorridorAndPattern(ctx, item, config, builders, remaining);
          if (created) {
            item.length += created.achieved;
            modifiedIndices.add(item.index);
            remaining -= created.achieved;
            createdBuilders.push(created.builder);
            attemptedThisRound.clear();
            continue;
          }

          // Relaxed fallback: try any straight segment (even if below minLen) in descending length order.
          const allSegs = collectSegments(item.path).filter((s) => !attemptedThisRound.has(segmentKey(s)));
          allSegs.sort((a, b) => b.length - a.length);
          let relaxedFitted = false;
          for (const cand of allSegs) {
            const fitted = fitSawtoothBidirectional(
              ctx,
              cand,
              remaining,
              config.tolerance,
              pattern as ILengthMatchPatternConfig,
              config.maxIterations ?? 20,
              !!config.debug,
            );
            if (!fitted) {
              attemptedThisRound.add(segmentKey(cand));
              continue;
            }
            const nb = createBuilderFromFittedPattern(ctx, cand, fitted, builders);
            if (!nb) {
              attemptedThisRound.add(segmentKey(cand));
              continue;
            }
            createdBuilders.push(nb);
            item.length += fitted.achievedDelta;
            modifiedIndices.add(item.index);
            remaining -= fitted.achievedDelta;
            attemptedThisRound.clear();
            relaxedFitted = true;
            break;
          }
          if (relaxedFitted) continue;
        }
        if (!segment) {
          const tried = Array.from(attemptedThisRound).map((k) => k.slice(k.indexOf(':') + 1));
          const triedDesc = tried.length ? tried.join(';') : 'none';
          const err = new RoutingError(
            formatSourceError(
              `[LengthMatch] No eligible straight segment found for remaining ΔL=${remaining.toFixed(3)}mm (minStraightSegment=${config.minStraightSegment ?? 2.0}mm). Segments attempted: ${triedDesc}`,
              getCallSite(),
            ),
          );
          err.stack = err.message;
          throw err;
        }

        const fitted = fitSawtoothBidirectional(
          ctx,
          segment,
          remaining,
          config.tolerance,
          pattern as ILengthMatchPatternConfig,
          config.maxIterations ?? 20,
          !!config.debug,
        );

        if (!fitted) {
          // Try placing a pattern on an offset corridor to allow larger amplitude/pitch
          const created = tryOffsetCorridorAndPattern(ctx, item, config, builders, remaining);
          if (created) {
            item.length += created.achieved;
            modifiedIndices.add(item.index);
            remaining -= created.achieved;
            createdBuilders.push(created.builder);
            attemptedThisRound.clear();
            continue;
          }
          // Otherwise try another base segment
          attemptedThisRound.add(segmentKey(segment));
          continue;
        }

        // Try splitting the remaining delta across multiple eligible straight segments
        const multi = tryMultiSegmentPattern(ctx, item, config, builders, remaining);
        if (multi) {
          for (const x of multi.builders) createdBuilders.push(x);
          item.length += multi.achieved;
          modifiedIndices.add(item.index);
          remaining -= multi.achieved;
          attemptedThisRound.clear();
          continue;
        }

        // Apply: remove/trim any overlapping straight track and add new pattern
        if (config.debug) {
          try {
            logger.debug(
              chalk.gray(
                `[LengthMatch] About to remove overlapping tracks for segment length=${segment.length.toFixed(3)}, builders count=${builders.length}`,
              ),
            );
          } catch {
            logger.debug('[LengthMatch] failed to log removal debug info');
          }
        }
        const removalAndResiduals = removeOrTrimOverlappingStraight(ctx, segment, builders);
        if (config.debug) {
          try {
            logger.debug(
              chalk.gray(
                `[LengthMatch] Removal result: toRemove=${removalAndResiduals.toRemove.length}, residuals=${removalAndResiduals.residuals.length}`,
              ),
            );
          } catch {
            logger.debug('[LengthMatch] failed to log removal result debug info');
          }
        }
        if (removalAndResiduals.toRemove.length > 0) {
          removeElementsFromBuilders(removalAndResiduals.toRemove, builders);
        }

        // Re-add residual straight pieces that are not covered by the pattern
        const nb = ctx.pcb.track({ locked: !!ctx.locked, net: ctx.net, deferStaging: true });

        let startPoint: { x: number; y: number };
        let startLayer: string;

        if (removalAndResiduals.residuals.length > 0) {
          const firstResidual = removalAndResiduals.residuals[0];
          startPoint = { x: firstResidual.start.x, y: firstResidual.start.y };
          startLayer = firstResidual.layer;
          nb.from(startPoint, startLayer, ctx.traceWidth);

          let lastPoint = startPoint;
          for (const residual of removalAndResiduals.residuals) {
            if (Math.abs(lastPoint.x - residual.start.x) > 1e-6 || Math.abs(lastPoint.y - residual.start.y) > 1e-6) {
              nb.from({ x: residual.start.x, y: residual.start.y }, residual.layer, ctx.traceWidth);
            }
            nb.to({
              x: residual.end.x,
              y: residual.end.y,
              layer: residual.layer,
              width: ctx.traceWidth,
            });
            lastPoint = { x: residual.end.x, y: residual.end.y };
          }

          const patternPts = fitted.points;
          if (patternPts.length > 0) {
            if (Math.abs(lastPoint.x - patternPts[0].x) > 1e-6 || Math.abs(lastPoint.y - patternPts[0].y) > 1e-6) {
              nb.from({ x: patternPts[0].x, y: patternPts[0].y }, segment.start.layer, ctx.traceWidth);
            }
            for (let i = 1; i < patternPts.length; i++) {
              nb.to({
                x: patternPts[i].x,
                y: patternPts[i].y,
                layer: segment.start.layer,
                width: ctx.traceWidth,
              });
            }
          }
        } else {
          const patternPts = fitted.points;
          if (patternPts.length > 0) {
            nb.from({ x: patternPts[0].x, y: patternPts[0].y }, segment.start.layer, ctx.traceWidth);
            for (let i = 1; i < patternPts.length; i++) {
              nb.to({
                x: patternPts[i].x,
                y: patternPts[i].y,
                layer: segment.start.layer,
                width: ctx.traceWidth,
              });
            }
          }
        }

        createdBuilders.push(nb);

        const achieved = fitted.achievedDelta;
        item.length += achieved;
        modifiedIndices.add(item.index);
        remaining -= achieved;
        attemptedThisRound.clear();
      }
    }

    // Final verification: ensure all are within tolerance
    const newMax = Math.max(...items.map((it) => it.length));
    for (const it of items) {
      if (newMax - it.length > config.tolerance + 1e-6) {
        const err = new RoutingError(
          formatSourceError(
            `[LengthMatch] Post-apply verification failed: length mismatch exceeds tolerance (${(newMax - it.length).toFixed(3)}mm > ${config.tolerance}mm)`,
            getCallSite(),
          ),
        );
        err.stack = err.message;
        throw err;
      }
    }

    return {
      updates: Array.from(modifiedIndices).map((index) => ({
        index,
        newLength: items.find((it) => it.index === index)!.length,
      })),
      builders: createdBuilders,
    };
  }
}
