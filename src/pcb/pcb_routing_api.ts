import type { ISchematicNetDefinition } from '../net_manager.js';
import { Pin } from '../pin.js';
import type { IAutorouteOptions, IAutorouteResult } from './pcb_interfaces.js';
import { pinToIdentifier } from './pcb_routing_helpers.js';
import { routeNet as extractRouteNet } from './pcb_routing_core.js';
import { autoroute } from './pcb_autoroute.js';
import { autorouteBatch } from './pcb_autoroute_batch.js';
import { withRipup } from './pcb_ripup.js';
import { PCB, getPcbState } from './pcb.js';
import { PcbInternalState } from './pcb_state.js';
import logger from '../utils/logging.js';
import { TypeCadError } from '../utils/errors.js';

function isSchematicNetDefinition(value: unknown): value is ISchematicNetDefinition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'name' in value &&
    typeof (value as { name: unknown }).name === 'string' &&
    'pins' in value &&
    Array.isArray((value as { pins: unknown }).pins),
  );
}

/**
 * Route calls after create() are a known bad-code pattern: create() writes
 * the board and consumes the staging state the router needs, so routes
 * staged afterwards never reach the board file. Reject loudly instead of
 * returning a silently-failed result.
 */
function assertRoutingBeforeCreate(pcb: PCB): void {
  if (getPcbState(pcb)?.boardWritten) {
    throw new TypeCadError(
      'route() was called after create(). The board is already written, so routes staged now can never reach it. ' +
        'Reorder the program: put the pins on a net, call route() BEFORE create(), then call create(). ' +
        '(If you need to route more, move every route() above the first create().)',
    );
  }
}

export function pcbRoute(
  pcb: PCB,
  state: PcbInternalState,
  arg1: ISchematicNetDefinition | IAutorouteOptions,
  options?: import('./pcb_interfaces.js').IAutorouteRouteOptions,
): IAutorouteResult {
  assertRoutingBeforeCreate(pcb);
  if (isSchematicNetDefinition(arg1)) {
    const pins = (arg1.pins ?? []).filter((pin: Pin): pin is Pin => Boolean(pin));
    // Rip-up reroutes use the same pins; disable inside the thunk to avoid
    // recursion (the orchestrator re-invokes this exact route).
    const run = () => extractRouteNet(pcb, arg1, { ...options, ripup: false });
    return logOutcome(arg1.name, withRipup(pcb, run, options, pins, `'${arg1.name}'`));
  }
  const opts = arg1 as IAutorouteOptions;
  const netLabel =
    opts.net ||
    `${pinToIdentifier(Array.isArray(opts.from) ? opts.from[0] : opts.from)} → ${pinToIdentifier(Array.isArray(opts.to) ? opts.to[0] : opts.to)}`;
  const pins: Pin[] = [
    ...(Array.isArray(opts.from) ? opts.from : [opts.from]),
    ...(Array.isArray(opts.to) ? opts.to : [opts.to]),
  ];
  logger.info(`⏳ Routing '${netLabel}'...`);
  const run = () => pcbAutoroute(pcb, state, { ...opts, ripup: false });
  const result = withRipup(pcb, run, opts, pins, `'${netLabel}'`);
  return logOutcome(netLabel, result);
}

function logOutcome(netLabel: string, result: IAutorouteResult): IAutorouteResult {
  if (result.success) {
    logger.info(`✔ Routing '${netLabel}' complete (${result.completedCount}/${result.routeCount} routes)`);
  } else {
    logger.warn(`⚠ Routing '${netLabel}' incomplete (${result.completedCount}/${result.routeCount} routes)`);
  }
  return result;
}

export function pcbAutoroute(pcb: PCB, state: PcbInternalState, options: IAutorouteOptions): IAutorouteResult {
  return autoroute(pcb, options);
}

export function pcbWaitForPendingAutoroutes(_state: PcbInternalState): void {}

export function pcbAutorouteBatch(
  pcb: PCB,
  items: Array<{
    from: Pin | Pin[];
    to: Pin | Pin[];
    options?: import('./pcb_interfaces.js').IAutorouteRouteOptions;
    name?: string;
  }>,
  batchOptions?: {
    rounds?: number;
    reorder?: 'none' | 'reverse' | 'byDistance';
    relaxViaCostPerRound?: number;
    increaseIterationsPerRound?: number;
  },
): { results: IAutorouteResult[]; success: boolean; rounds: number } {
  assertRoutingBeforeCreate(pcb);
  return autorouteBatch(pcb, items, batchOptions);
}
