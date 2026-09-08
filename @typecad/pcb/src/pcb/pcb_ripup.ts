/**
 * Rip-up-and-reroute for the autorouter.
 *
 * When a route fails (or lands far worse than the pin-to-pin distance
 * implies), the router records which nets' copper blocked the search (see
 * GridSearch's `blockedBy`). This module rips up those conflicting nets'
 * router-staged tracks, re-routes the victim net, then re-routes the ripped
 * nets — rolling the board back to the exact prior state unless the outcome
 * strictly improves. Only nets the router itself staged are ever ripped
 * (state.routerRoutedNets); manual tracks and user geometry are untouched.
 */

import type { IGrLine, IOutline } from './pcb_interfaces.js';
import type { IAutorouteResult, IAutorouteRouteOptions } from './pcb_interfaces.js';
import type { Pin } from '../pin.js';
import { Component } from '../component.js';
import { PCB, getPcbState } from './pcb.js';
import { routeNet as routeNetCore } from './pcb_routing_core.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';
import logger from '../utils/logging.js';

/** A via is worth roughly this much trace when comparing outcomes. */
const VIA_COST_MM = 3.0;
/** A route longer than this multiple of its pin-to-pin span is "congested". */
const POOR_QUALITY_RATIO = 3.0;
/** Maximum rip-up-and-reroute attempts for one route() call. */
const MAX_RIPUP_ROUNDS = 2;
/** Corridor margin (mm) around the victim's pins when filtering blockers. */
const CORRIDOR_MARGIN_MM = 2.0;
/** How many blocking nets may be ripped per round (bounded blast radius). */
const MAX_BLOCKERS_PER_ROUND = 4;

interface RipupSnapshot {
  /** stagedOutlines/stagedComponents lengths right after the rip — the
   *  attempt's additions end at this mark, and the ripped items re-stack
   *  after it on rollback. */
  attemptStartOutlines: number;
  attemptStartComponents: number;
  /** The victim's own previous attempt copper, dropped by truncation. */
  victimOutlines: IOutline[];
  victimComponents: Component[];
  rippedOutlines: IOutline[];
  rippedComponents: Component[];
}

interface RippedNet {
  outlines: IOutline[];
  components: Component[];
}

/** Remove a net's router-staged tracks and vias; returns them for rollback. */
function ripupNetTracks(pcb: PCB, net: string): RippedNet {
  const state = getPcbState(pcb);
  const keptOutlines: IOutline[] = [];
  const outlines: IOutline[] = [];
  for (const outline of state.stagedOutlines) {
    const belongs = (outline.elements ?? []).some(
      (el) => (el as IGrLine).type === 'line' && (el as IGrLine).net === net,
    );
    (belongs ? outlines : keptOutlines).push(outline);
  }
  const keptComponents: Component[] = [];
  const components: Component[] = [];
  for (const comp of state.stagedComponents) {
    (comp.via === true && comp.viaData?.net === net ? components : keptComponents).push(comp);
  }
  state.stagedOutlines = keptOutlines;
  state.stagedComponents = keptComponents;
  state.routerRoutedNets.delete(net);
  return { outlines, components };
}

/** Collect rip-up candidates from every attempt's recorded blockers. */
function collectBlockers(pcb: PCB, recorded: Set<string>, victimPins: Pin[]): string[] {
  const state = getPcbState(pcb);
  // Only nets the router itself staged — never rip user-drawn copper.
  const eligible = [...recorded].filter((n) => state.routerRoutedNets.has(n));
  if (eligible.length === 0 || victimPins.length === 0) {
    return eligible.slice(0, MAX_BLOCKERS_PER_ROUND);
  }

  // Corridor filter: prefer blockers whose staged copper actually sits near
  // the victim's pins — a failed search may also record nets it grazed far
  // from the useful corridor.
  const centers = victimPins
    .map((p) => PadResolver.getPadCenter(p))
    .filter((c): c is { x: number; y: number; layer: string } => Boolean(c));
  if (centers.length === 0) {
    return eligible.slice(0, MAX_BLOCKERS_PER_ROUND);
  }
  const minX = Math.min(...centers.map((c) => c.x)) - CORRIDOR_MARGIN_MM;
  const maxX = Math.max(...centers.map((c) => c.x)) + CORRIDOR_MARGIN_MM;
  const minY = Math.min(...centers.map((c) => c.y)) - CORRIDOR_MARGIN_MM;
  const maxY = Math.max(...centers.map((c) => c.y)) + CORRIDOR_MARGIN_MM;
  const near = eligible.filter((net) =>
    state.stagedOutlines.some((outline) =>
      (outline.elements ?? []).some((el) => {
        const line = el as IGrLine;
        if (line.type !== 'line' || line.net !== net) return false;
        return (
          (line.start.x >= minX && line.start.x <= maxX && line.start.y >= minY && line.start.y <= maxY) ||
          (line.end.x >= minX && line.end.x <= maxX && line.end.y >= minY && line.end.y <= maxY)
        );
      }),
    ),
  );
  return (near.length > 0 ? near : eligible).slice(0, MAX_BLOCKERS_PER_ROUND);
}

/** Lower is better: total trace length with vias priced as trace. */
function outcomeCost(result: IAutorouteResult): number {
  let length = 0;
  let vias = 0;
  for (const rd of result.routeDetails ?? []) {
    length += rd.length ?? 0;
    vias += rd.viaCount ?? 0;
  }
  return length + vias * VIA_COST_MM;
}

function pinSpan(victimPins: Pin[]): number {
  const centers = victimPins
    .map((p) => PadResolver.getPadCenter(p))
    .filter((c): c is { x: number; y: number; layer: string } => Boolean(c));
  if (centers.length < 2) return 0;
  let span = 0;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      span = Math.max(span, Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y));
    }
  }
  return span;
}

/** Needs rip-up: hard failure, or a route far longer than its span implies. */
function needsRipup(result: IAutorouteResult, victimPins: Pin[]): boolean {
  if (!result.success) return true;
  const span = pinSpan(victimPins);
  if (span <= 0) return false;
  return outcomeCost(result) > span * POOR_QUALITY_RATIO + VIA_COST_MM;
}

/** Restore the board to the pre-attempt state (dropping the attempt's staging). */
function rollback(pcb: PCB, snap: RipupSnapshot): void {
  const state = getPcbState(pcb);
  state.stagedOutlines.length = snap.attemptStartOutlines;
  state.stagedComponents.length = snap.attemptStartComponents;
  for (const outline of snap.rippedOutlines) state.stagedOutlines.push(outline);
  for (const comp of snap.rippedComponents) state.stagedComponents.push(comp);
  for (const outline of snap.victimOutlines) state.stagedOutlines.push(outline);
  for (const comp of snap.victimComponents) state.stagedComponents.push(comp);
  const restoredNets = new Set<string>();
  for (const outline of snap.rippedOutlines) {
    for (const el of outline.elements ?? []) {
      const line = el as IGrLine;
      if (line.type === 'line' && line.net) restoredNets.add(line.net);
    }
  }
  for (const comp of snap.rippedComponents) {
    if (comp.viaData?.net) restoredNets.add(comp.viaData.net);
  }
  for (const outline of snap.victimOutlines) {
    for (const el of outline.elements ?? []) {
      const line = el as IGrLine;
      if (line.type === 'line' && line.net) restoredNets.add(line.net);
    }
  }
  for (const comp of snap.victimComponents) {
    if (comp.viaData?.net) restoredNets.add(comp.viaData.net);
  }
  for (const net of restoredNets) state.routerRoutedNets.add(net);
}

/**
 * Run a route attempt with rip-up-and-reroute. `run` performs the actual
 * routing (with rip-up disabled to avoid recursion); when the outcome is a
 * failure or a badly congested detour, conflicting router-staged nets are
 * ripped together with the victim's own previous staging, the victim is
 * re-routed, and the ripped nets are re-routed — keeping the new board only
 * when every net routes and the victim strictly improves.
 */
export function withRipup(
  pcb: PCB,
  run: () => IAutorouteResult,
  options: IAutorouteRouteOptions | undefined,
  victimPins: Pin[],
  netLabel: string,
): IAutorouteResult {
  if (options?.ripup === false) {
    return run();
  }

  // No staging state means nothing was ever staged — rip-up has nothing to
  // act on (also covers stateless test doubles).
  if (!getPcbState(pcb)) {
    return run();
  }

  // Everything the victim's own attempt stages lands after this mark, so a
  // retry can drop exactly that copper (truncate) without touching other
  // routes that share the victim's nets — pair-routed buses keep their
  // tracks and their routing intent.
  const entry = {
    outlines: getPcbState(pcb)!.stagedOutlines.length,
    components: getPcbState(pcb)!.stagedComponents.length,
  };

  let best = run();
  // Blockers accumulate across attempts: a failed retry runs on the ripped
  // board, so its blockers describe a world the rollback erases — the union
  // of all attempts is the honest picture for the next round.
  const recordedBlockers = new Set<string>();
  const recordBlockers = (result: IAutorouteResult) => {
    for (const rd of result.routeDetails ?? []) {
      for (const net of rd.path?.blockedBy ?? []) {
        if (net) recordedBlockers.add(net);
      }
    }
  };
  recordBlockers(best);
  if (!needsRipup(best, victimPins)) {
    return best;
  }

  const rerouteOptions: IAutorouteRouteOptions = {
    gridResolution: options?.gridResolution,
    width: options?.width,
    clearance: options?.clearance,
    heuristicWeight: options?.heuristicWeight,
    debug: options?.debug,
    ripup: false,
  };

  for (let round = 0; round < MAX_RIPUP_ROUNDS; round++) {
    const blockers = collectBlockers(pcb, recordedBlockers, victimPins);
    if (blockers.length === 0) break;

    logger.info(`♻ '${netLabel}' blocked by ${blockers.join(', ')} — rip-up round ${round + 1}`);
    const snap: RipupSnapshot = {
      attemptStartOutlines: 0,
      attemptStartComponents: 0,
      victimOutlines: [],
      victimComponents: [],
      rippedOutlines: [],
      rippedComponents: [],
    };

    // Drop the victim's own previous (failed/poor) staging first, while the
    // array tail is still exactly that attempt's copper.
    const state = getPcbState(pcb);
    snap.victimOutlines = state.stagedOutlines.splice(entry.outlines);
    snap.victimComponents = state.stagedComponents.splice(entry.components);

    // Then rip the blocking nets (they are re-routed after the victim).
    for (const net of blockers) {
      const ripped = ripupNetTracks(pcb, net);
      snap.rippedOutlines.push(...ripped.outlines);
      snap.rippedComponents.push(...ripped.components);
    }
    // The retry stages anything new after this mark; rollback truncates
    // here and re-stacks the ripped items.
    snap.attemptStartOutlines = state.stagedOutlines.length;
    snap.attemptStartComponents = state.stagedComponents.length;

    const retry = run();
    recordBlockers(retry);
    if (!retry.success) {
      rollback(pcb, snap);
      // The failed retry may name different blockers — the accumulated set
      // feeds one more round before giving up.
      best = retry;
      continue;
    }

    // Re-route the ripped blocker nets. If any fails to come back, roll
    // everything back — never trade one connected net for another.
    let allRecovered = true;
    for (const net of blockers) {
      try {
        const again = routeNetCore(pcb, net, rerouteOptions);
        if (!again.success) {
          allRecovered = false;
          break;
        }
      } catch {
        allRecovered = false;
        break;
      }
    }

    if (!allRecovered) {
      logger.warn(`♻ rip-up round ${round + 1} could not re-route '${netLabel}'s blockers — rolled back`);
      rollback(pcb, snap);
      break;
    }

    // A successful retry always beats a failed baseline (which has no
    // tracks and therefore zero cost); otherwise compare outcomes.
    if (!best.success || outcomeCost(retry) < outcomeCost(best)) {
      logger.info(`♻ rip-up round ${round + 1} improved '${netLabel}' — kept`);
      return retry;
    }

    // Victim routed but no better: keep the original board so the blockers
    // keep their (already valid) routes.
    logger.info(`♻ rip-up round ${round + 1} found no better route for '${netLabel}' — rolled back`);
    rollback(pcb, snap);
    break;
  }

  return best;
}
