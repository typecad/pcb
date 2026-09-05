/**
 * Segment analysis utilities for length matching.
 *
 * Responsible for collecting straight segments from a route path and
 * picking the best candidate segment for sawtooth pattern placement.
 */

import type { ILengthMatchContext, IRoutePath, IStraightSegment } from '../types/length_match.js';

import { segmentKey, isOccupiedWorld, chalk } from './length_matcher_helpers.js';
import { estimateMaxAmplitudeOneSide } from './amplitude_estimation.js';
import logger from '../../utils/logging.js';

/**
 * Build straight segments by grouping near-colinear steps from a route path.
 * Tolerant to tiny jitters (allows ~5° angular deviation).
 */
export function collectSegments(path: IRoutePath): IStraightSegment[] {
  const nodes = path.nodes;
  if (!nodes || nodes.length < 2) return [];

  const segments: IStraightSegment[] = [];
  let accumulated = 0; // distance along path

  let segStart = nodes[0];
  // Use unit vector for direction; allow small angular tolerance (~5 degrees)
  const cosTol = Math.cos((5 * Math.PI) / 180);
  let lastVec: { ux: number; uy: number } | null = null;

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const curr = nodes[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen <= 0) continue;
    const ux = dx / segLen;
    const uy = dy / segLen;

    const sameDir = lastVec ? ux * lastVec.ux + uy * lastVec.uy >= cosTol : false;
    if (!sameDir && lastVec) {
      // close previous segment
      const sdx = prev.x - segStart.x;
      const sdy = prev.y - segStart.y;
      const L = Math.hypot(sdx, sdy);
      segments.push({
        start: { ...segStart, layer: prev.layer },
        end: { ...prev, layer: prev.layer },
        length: L,
        centerAlongPath: accumulated - L / 2,
      });
      segStart = prev;
    }
    accumulated += segLen;
    lastVec = { ux, uy };
  }

  // finalize last segment
  const lastNode = nodes[nodes.length - 1];
  const totalDx = lastNode.x - segStart.x;
  const totalDy = lastNode.y - segStart.y;
  const Llast = Math.hypot(totalDx, totalDy);
  segments.push({
    start: { ...segStart, layer: lastNode.layer },
    end: { ...lastNode, layer: lastNode.layer },
    length: Llast,
    centerAlongPath: accumulated - Llast / 2,
  });

  return segments;
}

/**
 * Pick the best candidate straight segment for sawtooth placement.
 *
 * Scores eligible segments by a heuristic combining usable amplitude and
 * length — segments where `(usableAmplitude * length)` is largest are
 * preferred, as they are most likely to accept a sawtooth pattern.
 */
export function pickCandidateSegment(
  ctx: ILengthMatchContext,
  path: IRoutePath,
  minLen: number,
  exclude?: Set<string>,
): IStraightSegment | null {
  const segments = collectSegments(path);
  if (!segments.length) return null;

  const eligible = segments.filter((s) => s.length >= minLen).filter((s) => !exclude?.has(segmentKey(s)));
  if (!eligible.length) return null;

  const scored: { seg: IStraightSegment; score: number; amp: number }[] = [];
  for (const s of eligible) {
    try {
      const ampPos = estimateMaxAmplitudeOneSide(ctx, s, +1);
      const ampNeg = estimateMaxAmplitudeOneSide(ctx, s, -1);
      const amp = Math.max(ampPos, ampNeg);
      const score = amp * s.length; // simple multiplicative score
      scored.push({ seg: s, score, amp });
    } catch {
      // If estimation fails, deprioritize segment
      scored.push({ seg: s, score: 0, amp: 0 });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.seg.length - a.seg.length);
  return scored.length ? scored[0].seg : null;
}
