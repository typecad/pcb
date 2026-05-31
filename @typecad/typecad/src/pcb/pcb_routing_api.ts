import type { ISchematicNetDefinition } from "../net_manager.js";
import { Pin } from "../pin.js";
import type {
    IAutorouteOptions,
    IAutorouteResult
} from './pcb_interfaces.js';
import { pinToIdentifier } from './pcb_routing_helpers.js';
import { routeNet as extractRouteNet } from './pcb_routing_core.js';
import { autoroute } from './pcb_autoroute.js';
import { autorouteBatch } from './pcb_autoroute_batch.js';
import { IPcbBoardContext } from './pcb_board_context.js';
import { PcbInternalState } from './pcb_state.js';
import logger from '../utils/logging.js';

function isSchematicNetDefinition(value: unknown): value is ISchematicNetDefinition {
    return Boolean(
        value &&
        typeof value === 'object' &&
        'name' in value &&
        typeof (value as { name: unknown }).name === 'string' &&
        'pins' in value &&
        Array.isArray((value as { pins: unknown }).pins)
    );
}

export async function pcbRoute(
    pcb: IPcbBoardContext,
    state: PcbInternalState,
    arg1: ISchematicNetDefinition | IAutorouteOptions,
    options?: import('./pcb_interfaces.js').IAutorouteRouteOptions
): Promise<IAutorouteResult> {
    if (isSchematicNetDefinition(arg1)) {
        return extractRouteNet(pcb, arg1, options);
    }
    const opts = arg1 as IAutorouteOptions;
    const netLabel = opts.net || `${pinToIdentifier(Array.isArray(opts.from) ? opts.from[0] : opts.from)} → ${pinToIdentifier(Array.isArray(opts.to) ? opts.to[0] : opts.to)}`;
    logger.info(`⏳ Routing '${netLabel}'...`);
    const result = await pcbAutoroute(pcb, state, opts);
    if (result.success) {
        logger.info(`✔ Routing '${netLabel}' complete (${result.completedCount}/${result.routeCount} routes)`);
    } else {
        logger.warn(`⚠ Routing '${netLabel}' incomplete (${result.completedCount}/${result.routeCount} routes)`);
    }
    return result;
}

export async function pcbAutoroute(pcb: IPcbBoardContext, state: PcbInternalState, options: IAutorouteOptions): Promise<IAutorouteResult> {
    const task = Promise.resolve(autoroute(pcb, options));
    state.pendingAutoroutes.add(task);
    try {
        return await task;
    } finally {
        state.pendingAutoroutes.delete(task);
    }
}

export async function pcbWaitForPendingAutoroutes(state: PcbInternalState): Promise<void> {
    if (state.pendingAutoroutes.size === 0) return;
    await Promise.all(Array.from(state.pendingAutoroutes));
}

export async function pcbAutorouteBatch(
    pcb: IPcbBoardContext,
    items: Array<{ from: Pin | Pin[]; to: Pin | Pin[]; options?: import('./pcb_interfaces.js').IAutorouteRouteOptions; name?: string }>,
    batchOptions?: {
        rounds?: number;
        reorder?: 'none' | 'reverse' | 'byDistance';
        relaxViaCostPerRound?: number;
        increaseIterationsPerRound?: number;
    }
): Promise<{ results: IAutorouteResult[]; success: boolean; rounds: number }> {
    return autorouteBatch(pcb, items, batchOptions);
}
