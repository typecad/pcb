/**
 * Shared types, interfaces, and pure helper functions extracted from pcb_autoroute.ts.
 *
 * These utilities are used by the manual-route processor, MST router, and
 * pairwise router sub-modules.
 */

import { Component } from '../component.js';
import { Pin } from '../pin.js';
import {
    IAutorouteOptions,
    IAutorouteResult,
    IRoutePath,
    IRouteMetadata,
    IGrLine,
    IOutline
} from './pcb_interfaces.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';
import logger from '../logging.js';
import type { BoardBounds } from './pcb_routing_calculations.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { RoutingGrid } from '../routing/shared/routing_grid.js';
import type { IPcbBoardContext } from './pcb_board_context.js';
import type { IRoutingOptions } from '../routing/router/types.js';
import type { PcbInternalState } from './pcb_state.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Shared context for routing sub-modules. */
export interface AutorouteContext {
    pcb: IPcbBoardContext;
    options: IAutorouteOptions;
    fromPins: Pin[];
    toPins: Pin[];
    validStartPositions: { x: number; y: number; layer: string }[];
    validEndPositions: { x: number; y: number; layer: string }[];
    allPins: Pin[];
    netName: string | undefined;
    traceWidth: number;
    clearance: number;
    bounds: BoardBounds;
    grid: RoutingGrid;
    routingLayers: string[];
    allObstacles: import('../routing/shared/routing_grid.js').IRoutingObstacle[];
    addObstacleToState: (obs: import('../routing/shared/routing_grid.js').IRoutingObstacle) => void;
    freeViaLocations: { x: number; y: number }[];
    baseRouterOptions: IRoutingOptions;
}

/** Mutable output buckets shared across routing phases. */
export interface RoutingOutput {
    result: TrackBuilder[];
    routeDetails: IRouteMetadata[];
    routeTrackBuilders: (TrackBuilder[] | undefined)[];
    allPaths: IRoutePath[];
}

/** Create an empty RoutingOutput. */
export function createEmptyRoutingOutput(): RoutingOutput {
    return {
        result: [],
        routeDetails: [],
        routeTrackBuilders: [],
        allPaths: []
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Conditional debug log – prints when local debug flag is set OR TYPECAD_DEBUG env var is enabled. */
export function debugLog(debug: boolean | undefined, message: string): void {
    if (debug || process.env.TYPECAD_DEBUG === '1' || process.env.TYPECAD_DEBUG === 'true') {
        logger.debug(message);
    }
}

/** Type-guard: distinguishes IAutorouteResult from a plain IRoutePath. */
export function isAutorouteResultRouteItem(routeItem: IRoutePath | IAutorouteResult): routeItem is IAutorouteResult {
    return Array.isArray(routeItem) && 'routeDetails' in routeItem && Array.isArray(routeItem.routeDetails);
}

export function collectComponentsForBounds(pcb: { state: PcbInternalState }, netComponents: Component[]): {
    components: Component[];
    stagedComponents: Component[];
} {
    const componentSet = new Set<Component>(netComponents);
    pcb.state.components.forEach(comp => componentSet.add(comp));

    return {
        components: Array.from(componentSet),
        stagedComponents: [...pcb.state.stagedComponents]
    };
}

/** Expand board bounds to include existing tracks and staged outlines. */
export function expandBoundsToIncludeTracks(
    bounds: BoardBounds,
    tracks: IGrLine[] | undefined,
    stagedOutlines: IOutline[] | undefined,
    margin: number
): BoardBounds {
    let trackMinX = Infinity;
    let trackMinY = Infinity;
    let trackMaxX = -Infinity;
    let trackMaxY = -Infinity;

    const considerPoint = (x?: number, y?: number) => {
        if (typeof x !== 'number' || typeof y !== 'number') {
            return;
        }
        trackMinX = Math.min(trackMinX, x);
        trackMaxX = Math.max(trackMaxX, x);
        trackMinY = Math.min(trackMinY, y);
        trackMaxY = Math.max(trackMaxY, y);
    };

    const considerLine = (line?: IGrLine) => {
        if (!line || line.type !== 'line') return;
        considerPoint(line.start?.x, line.start?.y);
        considerPoint(line.end?.x, line.end?.y);
    };

    (tracks ?? []).forEach(line => considerLine(line));

    (stagedOutlines ?? []).forEach(outline => {
        if (!outline?.elements) return;
        for (const element of outline.elements) {
            if ((element as IGrLine).type === 'line') {
                considerLine(element as IGrLine);
            }
        }
    });

    if (!isFinite(trackMinX) || !isFinite(trackMaxX) || !isFinite(trackMinY) || !isFinite(trackMaxY)) {
        return bounds;
    }

    const expanded: BoardBounds = { ...bounds };
    const tol = 0.01;
    const safeMargin = Math.max(0, Number.isFinite(margin) ? margin : 0);

    if (trackMinX < bounds.minX - tol) {
        expanded.minX = Math.min(expanded.minX, trackMinX - safeMargin);
    }
    if (trackMaxX > bounds.maxX + tol) {
        expanded.maxX = Math.max(expanded.maxX, trackMaxX + safeMargin);
    }
    if (trackMinY < bounds.minY - tol) {
        expanded.minY = Math.min(expanded.minY, trackMinY - safeMargin);
    }
    if (trackMaxY > bounds.maxY + tol) {
        expanded.maxY = Math.max(expanded.maxY, trackMaxY + safeMargin);
    }

    return expanded;
}

/** Collect pad size/type summaries for grid resolution configuration. */
export function collectPadSummariesForRouting(components: Component[]): {
    componentRef?: string;
    size: { width: number; height: number };
    type: 'smd' | 'thru_hole' | 'np_thru_hole' | 'connect';
    layers: string[];
}[] {
    const pads: {
        componentRef?: string;
        size: { width: number; height: number };
        type: 'smd' | 'thru_hole' | 'np_thru_hole' | 'connect';
        layers: string[];
    }[] = [];

    for (const comp of components) {
        const padGeometries = PadResolver.getAllPadGeometries(comp);
        for (const pad of padGeometries) {
            pads.push({
                componentRef: pad.componentRef ?? comp.reference,
                size: { width: pad.size.width, height: pad.size.height },
                type: pad.type,
                layers: pad.layers
            });
        }
    }

    return pads;
}

// ── Autoroute serialization lock ─────────────────────────────────────────

export const enqueueAutoroute: <T>(work: () => Promise<T>) => Promise<T> = (() => {
    let lock: Promise<void> = Promise.resolve();
    return <T>(work: () => Promise<T>): Promise<T> => {
        const next = lock.then(() => work(), () => work());
        lock = next.then(() => undefined, () => undefined);
        return next;
    };
})();
