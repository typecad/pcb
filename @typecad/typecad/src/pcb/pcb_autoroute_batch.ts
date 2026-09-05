import { Pin } from '../pin.js';
import { IAutorouteRouteOptions, IAutorouteResult, IAutorouteOptions } from './pcb_interfaces.js';
import { PCB, getPcbState } from './pcb.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';

/**
 * Batch autorouter orchestrator with simple rip-up-and-retry.
 * Routes multiple connections together, retrying with different ordering
 * and relaxed parameters across rounds to negotiate congestion.
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

  // Use accessor for staged outlines and track preserved segments across rounds
  const stagedRef = getPcbState(pcb).stagedOutlines;
  const batchBaseline = stagedRef ? stagedRef.length : 0;
  let preservedEnd = batchBaseline; // index up to which tracks are preserved
  const doneSet = new Set<number>(); // indices of items already successfully routed

  let finalResults: IAutorouteResult[] = [];
  let completed = false;

  for (let round = 0; round < rounds; round++) {
    // Rip up non-preserved tracks from previous attempts
    if (stagedRef) {
      stagedRef.splice(preservedEnd);
    }

    // Determine ordering
    const order = [...items];
    if (reorder === 'byDistance') {
      order.sort((a, b) => {
        const aFrom = Array.isArray(a.from) ? a.from[0] : a.from;
        const aTo = Array.isArray(a.to) ? a.to[0] : a.to;
        const bFrom = Array.isArray(b.from) ? b.from[0] : b.from;
        const bTo = Array.isArray(b.to) ? b.to[0] : b.to;
        const aStart = PadResolver.getPadCenter(aFrom);
        const aEnd = PadResolver.getPadCenter(aTo);
        const bStart = PadResolver.getPadCenter(bFrom);
        const bEnd = PadResolver.getPadCenter(bTo);
        const aDist = aStart && aEnd ? Math.hypot(aEnd.x - aStart.x, aEnd.y - aStart.y) : 0;
        const bDist = bStart && bEnd ? Math.hypot(bEnd.x - bStart.x, bEnd.y - bStart.y) : 0;
        return bDist - aDist; // longer first
      });
    } else if (reorder === 'reverse') {
      order.reverse();
    }

    const roundResults: IAutorouteResult[] = [];
    let roundSuccess = true;

    // Only route items not yet done
    for (let idx = 0; idx < order.length; idx++) {
      const item = order[idx];
      const originalIndex = items.indexOf(item);
      if (doneSet.has(originalIndex)) {
        continue;
      }
      const base = item.options ?? ({} as IAutorouteRouteOptions);
      const adjusted: IAutorouteRouteOptions = {
        ...base,
        // Relax via costs progressively
        viaCost: base.viaCost !== undefined ? Math.max(0, base.viaCost - relaxViaCostPerRound * round) : undefined,
        // Increase iteration budgets
        maxIterations:
          base.maxIterations !== undefined ? base.maxIterations + increaseIterationsPerRound * round : undefined,
      };

      const res = pcb.route({ ...adjusted, from: item.from, to: item.to } as IAutorouteOptions);
      roundResults.push(res);
      if (!res.success) {
        roundSuccess = false;
        break; // abort early and retry new round
      } else {
        // Preserve tracks for this successful item going forward
        if (stagedRef) {
          preservedEnd = stagedRef.length;
        }
        doneSet.add(originalIndex);
      }
    }

    if (roundSuccess) {
      finalResults = roundResults;
      completed = true;
      break;
    }
  }

  return { results: finalResults, success: completed, rounds };
}
