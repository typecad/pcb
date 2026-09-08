/**
 * Track management utilities for length matching.
 *
 * Handles removing/trimming overlapping straight tracks and creating new
 * TrackBuilder instances from fitted sawtooth patterns.
 */

import type { ILengthMatchContext, ITrackBuilder, IStraightSegment } from '../types/length_match.js';

import { chalk, isEnvDebug } from './length_matcher_helpers.js';
import logger from '../../utils/logging.js';
import type { ITrackDetails } from '../../pcb/pcb_interfaces.js';

/**
 * Result of removing/trimming overlapping straight tracks.
 */
export interface IRemovalResult {
  toRemove: string[];
  residuals: { start: { x: number; y: number }; end: { x: number; y: number }; layer: string }[];
}

/**
 * Identify and plan removal of straight tracks that overlap with the target
 * segment. Returns UUIDs to remove and residual segments to re-add.
 */
export function removeOrTrimOverlappingStraight(
  ctx: ILengthMatchContext,
  seg: IStraightSegment,
  builders: ITrackBuilder[],
): IRemovalResult {
  const toRemove: string[] = [];
  const residuals: { start: { x: number; y: number }; end: { x: number; y: number }; layer: string }[] = [];
  const eps = 1e-6;

  const ux = (seg.end.x - seg.start.x) / seg.length;
  const uy = (seg.end.y - seg.start.y) / seg.length;

  const dot = (ax: number, ay: number, bx: number, by: number) => ax * bx + ay * by;
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

  const projT = (p: { x: number; y: number }) => dot(p.x - seg.start.x, p.y - seg.start.y, ux, uy);

  let totalTracks = 0;
  let collinearTracks = 0;
  const overlappingTracks = 0;

  for (const tb of builders) {
    for (const el of tb.getElements()) {
      if (el.type !== 'track') continue;
      totalTracks++;
      const details = el.details as ITrackDetails;
      const layer: string = details.layer;
      if (layer !== seg.start.layer) continue;
      const s = details.start as { x: number; y: number };
      const e = details.end as { x: number; y: number };

      const vx1x = s.x - seg.start.x;
      const vx1y = s.y - seg.start.y;
      const vx2x = e.x - seg.start.x;
      const vx2y = e.y - seg.start.y;

      const dist1 = Math.abs(cross(vx1x, vx1y, ux, uy));
      const dist2 = Math.abs(cross(vx2x, vx2y, ux, uy));
      const distTol = Math.max(1e-3, ctx.traceWidth / 2 + ctx.clearance + 0.02);
      if (dist1 > distTol || dist2 > distTol) {
        continue;
      }

      collinearTracks++;

      let ts = projT(s);
      let te = projT(e);
      if (te < ts) {
        const ttmp = ts;
        ts = te;
        te = ttmp;
      }

      const os = Math.max(0, ts);
      const oe = Math.min(seg.length, te);
      if (oe - os <= eps) continue;

      toRemove.push(el.uuid);

      // residual before overlap
      if (os - ts > eps) {
        const rStart = { x: s.x, y: s.y };
        const rEnd = { x: seg.start.x + ux * os, y: seg.start.y + uy * os };
        residuals.push({ start: rStart, end: rEnd, layer });
      }
      // residual after overlap
      if (te - oe > eps) {
        const rStart2 = { x: seg.start.x + ux * oe, y: seg.start.y + uy * oe };
        const rEnd2 = { x: e.x, y: e.y };
        residuals.push({ start: rStart2, end: rEnd2, layer });
      }
    }
  }

  // Debug output
  const isDebug = isEnvDebug();
  const forceDebug = false;
  if (isDebug || forceDebug) {
    try {
      logger.debug(
        chalk.gray(
          `[LengthMatch] removeOrTrimOverlappingStraight: totalTracks=${totalTracks}, collinearTracks=${collinearTracks}, overlappingTracks=${overlappingTracks}, toRemove=${toRemove.length}, residuals=${residuals.length}`,
        ),
      );
      if (toRemove.length > 0) {
        logger.debug(chalk.gray(`[LengthMatch] Removing tracks: ${toRemove.join(', ')}`));
        for (const tb of builders) {
          for (const el of tb.getElements()) {
            if (el.uuid && toRemove.includes(el.uuid)) {
              logger.debug(
                chalk.gray(
                  `[LengthMatch] Removing track from (${(el.details as ITrackDetails).start.x.toFixed(3)}, ${(el.details as ITrackDetails).start.y.toFixed(3)}) to (${(el.details as ITrackDetails).end.x.toFixed(3)}, ${(el.details as ITrackDetails).end.y.toFixed(3)})`,
                ),
              );
            }
          }
        }
      } else {
        logger.debug(
          chalk.gray(
            `[LengthMatch] No tracks to remove. Segment: ${JSON.stringify({ start: seg.start, end: seg.end, length: seg.length })}`,
          ),
        );
      }
      logger.debug(chalk.gray(`[LengthMatch] All tracks in builders:`));
      for (let bi = 0; bi < builders.length; bi++) {
        const elements = builders[bi].getElements();
        logger.debug(chalk.gray(`[LengthMatch] Builder ${bi}: ${elements.length} elements`));
        for (const el of elements) {
          if (el.type === 'track' && el.details) {
            const details = el.details as ITrackDetails;
            logger.debug(
              chalk.gray(
                `[LengthMatch]   Track ${el.uuid}: (${details.start.x.toFixed(3)}, ${details.start.y.toFixed(3)}) -> (${details.end.x.toFixed(3)}, ${details.end.y.toFixed(3)})`,
              ),
            );
          }
        }
      }
    } catch {
      logger.debug('[LengthMatch] Debug logging failed in findOverlapping');
    }
  }

  return { toRemove, residuals };
}

/**
 * Remove overlapping track elements (by UUID) from a set of builders.
 */
export function removeElementsFromBuilders(uuids: string[], builders: ITrackBuilder[]): void {
  if (uuids.length === 0) return;
  const uuidSet = new Set(uuids);
  for (const builder of builders) {
    const elements = builder.getElements();
    (builder as unknown as { elements: typeof elements }).elements = elements.filter(
      (el) => !(el.uuid && uuidSet.has(el.uuid)),
    );
  }
}

/**
 * Create a new TrackBuilder from a fitted sawtooth pattern, handling
 * removal of overlapping baseline tracks and re-adding residuals.
 */
export function createBuilderFromFittedPattern(
  ctx: ILengthMatchContext,
  segment: IStraightSegment,
  fitted: { points: { x: number; y: number }[]; achievedDelta: number },
  builders: ITrackBuilder[],
): ITrackBuilder | null {
  try {
    const removalAndResiduals = removeOrTrimOverlappingStraight(ctx, segment, builders);
    removeElementsFromBuilders(removalAndResiduals.toRemove, builders);

    const nb = ctx.pcb.track({ locked: !!ctx.locked, net: ctx.net, deferStaging: true });
    const w = ctx.traceWidth;
    const layer = segment.start.layer;

    // Re-add residual baseline straight segments
    for (const rseg of removalAndResiduals.residuals) {
      nb.from({ x: rseg.start.x, y: rseg.start.y }, rseg.layer, w).to({
        x: rseg.end.x,
        y: rseg.end.y,
        layer: rseg.layer,
        width: w,
      });
    }

    const pts = fitted.points;
    if (pts.length > 0) {
      nb.from({ x: pts[0].x, y: pts[0].y }, layer, w);
      for (let i = 1; i < pts.length; i++) {
        nb.to({ x: pts[i].x, y: pts[i].y, layer, width: w });
      }
    }
    if (isEnvDebug()) {
      try {
        logger.debug(
          chalk.cyan(
            `[LengthMatch] createBuilderFromFittedPattern: created builder for segment length=${segment.length.toFixed(3)} achieved=${fitted.achievedDelta.toFixed(3)}`,
          ),
        );
      } catch {
        logger.debug('[LengthMatch] Debug logging failed');
      }
    }
    return nb;
  } catch (err) {
    if (isEnvDebug()) {
      try {
        logger.debug(
          chalk.gray(
            `[LengthMatch] createBuilderFromFittedPattern threw: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      } catch {
        logger.debug('[LengthMatch] Debug logging failed in error handler');
      }
    }
    return null;
  }
}
