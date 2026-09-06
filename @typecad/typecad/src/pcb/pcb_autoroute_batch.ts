import { Pin } from '../pin.js';
import { IAutorouteRouteOptions, IAutorouteResult, IAutorouteOptions } from './pcb_interfaces.js';
import { PCB, getPcbState } from './pcb.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';

/** Matches AStarRouter's default via cost, so relaxation applies even when
 *  the caller never set an explicit viaCost. */
const DEFAULT_VIA_COST = 20;

function failedResult(): IAutorouteResult {
  return Object.assign([], {
    success: false,
    routeCount: 0,
    completedCount: 0,
    routeDetails: [],
  }) as IAutorouteResult;
}

/**
 * Batch autorouter orchestrator with rip-up-and-retry.
 * Routes multiple connections together, retrying failures with relaxed via
 * costs and varied ordering across rounds to negotiate congestion.
 *
 * Every item gets a result: successfully routed items keep theirs across
 * rounds, and unrouted items return a failed result — the `results` array is
 * always parallel to `items`, so partial progress is never lost.
 */
export function autorouteBatch(
  pcb: PCB,
  items: Array<{ from: Pin | Pin[]; to: Pin | Pin[]; options?: IAutorouteRouteOptions; name?: string }>,
  batchOptions?: {
    rounds?: number;
    reorder?: 'none' | 'reverse' | 'byDistance';
    relaxViaCostPerRound?: number;
    increaseIterationsPerRound?: number;
  },
): { results: IAutorouteResult[]; success: boolean; rounds: number } {
  const rounds = batchOptions?.rounds ?? 3;
  const reorder = batchOptions?.reorder ?? 'byDistance';
  const relaxViaCostPerRound = batchOptions?.relaxViaCostPerRound ?? 5;
  const increaseIterationsPerRound = batchOptions?.increaseIterationsPerRound ?? 25000;

  // Track preserved segments across rounds. Via components stage alongside
  // track outlines, so both arrays are truncated together — otherwise failed
  // attempts leave orphan vias that become obstacles (and unconnected holes).
  const state = getPcbState(pcb);
  const stagedRef = state.stagedOutlines;
  const stagedComponents = state.stagedComponents;
  const batchBaseline = stagedRef ? stagedRef.length : 0;
  const batchBaselineComponents = stagedComponents ? stagedComponents.length : 0;
  let preservedEnd = batchBaseline; // index up to which tracks are preserved
  let preservedComponents = batchBaselineComponents;

  const results: IAutorouteResult[] = new Array(items.length).fill(undefined).map(() => failedResult());
  const doneSet = new Set<number>(); // indices of items already successfully routed
  let roundsRun = 0;

  for (let round = 0; round < rounds; round++) {
    roundsRun = round + 1;

    // Rip up non-preserved tracks and vias from previous attempts
    if (stagedRef) {
      stagedRef.splice(preservedEnd);
    }
    if (stagedComponents) {
      stagedComponents.splice(preservedComponents);
    }

    // Determine ordering. Retries vary the sequence (byDistance, then its
    // reverse) so a failed round doesn't replay an identical congestion order.
    const order = items.map((item, index) => ({ item, index }));
    if (reorder === 'byDistance') {
      const distanceOf = (item: (typeof items)[number]) => {
        const from = Array.isArray(item.from) ? item.from[0] : item.from;
        const to = Array.isArray(item.to) ? item.to[0] : item.to;
        const start = PadResolver.getPadCenter(from);
        const end = PadResolver.getPadCenter(to);
        return start && end ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
      };
      order.sort((a, b) => distanceOf(b.item) - distanceOf(a.item)); // longer first
      if (round % 2 === 1) {
        order.reverse();
      }
    } else if (reorder === 'reverse') {
      order.reverse();
    }

    // Route every item not yet done — a failure does not abort the round:
    // later items still get their chance (their results are kept too).
    for (const { item, index } of order) {
      if (doneSet.has(index)) {
        continue;
      }

      const base = item.options ?? ({} as IAutorouteRouteOptions);
      const adjusted: IAutorouteRouteOptions = {
        ...base,
        // Relax via costs progressively — applies to the router default too,
        // not just explicitly configured values.
        viaCost: Math.max(0, (base.viaCost ?? DEFAULT_VIA_COST) - relaxViaCostPerRound * round),
        // Increase iteration budgets when the caller set one
        maxIterations:
          base.maxIterations !== undefined ? base.maxIterations + increaseIterationsPerRound * round : undefined,
        // The batch owns retries (ordering + relaxation across rounds);
        // per-item rip-up-and-reroute would multiply with it. Opt back in
        // per item with `options: { ripup: true }`.
        ripup: base.ripup === true,
      };

      const attemptStart = stagedRef ? stagedRef.length : 0;
      const attemptStartComponents = stagedComponents ? stagedComponents.length : 0;
      const res = pcb.route({ ...adjusted, from: item.from, to: item.to } as IAutorouteOptions);

      if (res.success) {
        results[index] = res;
        doneSet.add(index);
        // Preserve tracks and vias for this successful item going forward
        if (stagedRef) {
          preservedEnd = stagedRef.length;
        }
        if (stagedComponents) {
          preservedComponents = stagedComponents.length;
        }
      } else {
        // Rip up this attempt's partial tracks and vias right away so later
        // items in the round route against a clean board (and the preserved
        // marks stay meaningful — they only ever span successful attempts).
        if (stagedRef) {
          stagedRef.splice(attemptStart);
        }
        if (stagedComponents) {
          stagedComponents.splice(attemptStartComponents);
        }
      }
    }

    if (doneSet.size === items.length) {
      break;
    }
  }

  return { results, success: doneSet.size === items.length, rounds: roundsRun };
}
