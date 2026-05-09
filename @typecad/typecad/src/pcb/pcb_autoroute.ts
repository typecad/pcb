/**
 * PCB autorouter – slim orchestrator.
 *
 * The heavy logic has been extracted into focused modules:
 *   - pcb_autoroute_helpers.ts   – shared types, helpers, serialization lock
 *   - pcb_autoroute_manual_routes.ts – manual route pre-processing
 *   - pcb_autoroute_mst.ts       – MST single-net routing
 *   - pcb_autoroute_pairwise.ts  – pairwise routing fallback
 */

import chalk from 'chalk';
import { Component } from '../component.js';
import { Pin } from '../pin.js';
import { RoutingError } from '../errors.js';
import {
    IAutorouteOptions,
    IAutorouteResult,
    IGrLine,
} from './pcb_interfaces.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';
import { RoutingGrid } from '../routing/shared/routing_grid.js';
import { ObstacleBuilder } from '../routing/shared/obstacle_builder.js';
import { DebugVisualizer } from '../routing/utils/debug_visualizer.js';
import logger from '../logging.js';
import { LengthMatcher } from '../routing/length_matching/length_matcher.js';
import { configureGridResolution } from '../routing/grid_resolution_policy.js';

import {
    calculateBoardBounds,
    calculateMinTraceWidth
} from './pcb_routing_calculations.js';
import {
    pinToIdentifier,
    pinsMatch,
    validatePin
} from './pcb_routing_helpers.js';
import {
    pathToTrackBuilder,
} from './pcb_routing_core.js';
import { collectManualViaFreeLocations } from './manual_via_helpers.js';
import os from 'os';

// Extracted sub-modules
import {
    debugLog,
    isAutorouteResultRouteItem,
    collectComponentsForBounds,
    expandBoundsToIncludeTracks,
    collectPadSummariesForRouting,
    AutorouteContext,
    RoutingOutput,
    createEmptyRoutingOutput,
} from './pcb_autoroute_helpers.js';
import { processManualRoutes } from './pcb_autoroute_manual_routes.js';
import { routeMstNet } from './pcb_autoroute_mst.js';
import { routePairwise } from './pcb_autoroute_pairwise.js';

// Re-export enqueueAutoroute for pcb_routing_core.ts (which imports it)
export { enqueueAutoroute } from './pcb_autoroute_helpers.js';

// pcb parameter is intentionally `any` — this function accesses private PCB fields via
// (pcb as any) for component collection, grid configuration, and obstacle building.
// Typing it as IPcbBoardContext broke routing because the interface getters returned
// empty arrays during the routing phase while the private #fields were populated.
export function autoroute(pcb: any, options: IAutorouteOptions): IAutorouteResult {
    // ── 1. Validate required parameters ──────────────────────────────────
    if (!options.from || !options.to) {
        const callSite = pcb.getCallSite();
        const callSiteInfo = callSite ? ` (called from ${callSite.file}:${callSite.line})` : '';
        throw new RoutingError(`autoroute() requires both 'from' and 'to' parameters${callSiteInfo}`);
    }

    debugLog(options.debug, chalk.blue(`[PCB] Starting autoroute operation`));

    // ── 2. Normalize pins to arrays ──────────────────────────────────────
    const fromPins = Array.isArray(options.from) ? options.from : [options.from];
    const toPins = Array.isArray(options.to) ? options.to : [options.to];

    // ── 3. Validate provided routes and excluded connections ─────────────
    const providedRoutes = options.routes ?? [];
    const excludeConnections = options.excludeConnections || [];

    if (providedRoutes.length > 0) {
        for (let i = 0; i < providedRoutes.length; i++) {
            const routeItem = providedRoutes[i];
            const context = `Route ${i + 1}`;
            let path: any;
            if (isAutorouteResultRouteItem(routeItem)) {
                const rd = routeItem.routeDetails;
                if (rd.length === 0 || !rd[0].path) {
                    const callSite = pcb.getCallSite();
                    const callSiteInfo = callSite ? ` (called from ${callSite.file}:${callSite.line})` : '';
                    throw new RoutingError(`${context}: IAutorouteResult has no path data${callSiteInfo}`);
                }
                path = rd[0].path;
            } else {
                path = routeItem;
            }
            if (!path || !path.nodes || path.nodes.length < 2) {
                const callSite = pcb.getCallSite();
                const callSiteInfo = callSite ? ` (called from ${callSite.file}:${callSite.line})` : '';
                throw new RoutingError(`${context}: Path must have at least 2 nodes${callSiteInfo}`);
            }
        }
    }

    if (excludeConnections.length > 0) {
        for (let i = 0; i < excludeConnections.length; i++) {
            const exclude = excludeConnections[i];
            const context = `Excluded connection ${i + 1}`;
            validatePin(exclude.from, `${context} 'from' pin`);
            validatePin(exclude.to, `${context} 'to' pin`);
            if (pinsMatch(exclude.from, exclude.to)) {
                const callSite = pcb.getCallSite();
                const callSiteInfo = callSite ? ` (called from ${callSite.file}:${callSite.line})` : '';
                throw new RoutingError(`${context}: 'from' and 'to' pins are the same (${pinToIdentifier(exclude.from)})${callSiteInfo}`);
            }
        }
    }

    // ── 4. Resolve pin positions with layer preference ───────────────────
    const preferredLayer = options.layers && options.layers.length > 0 ? options.layers[0] : undefined;

    const startPositions: ({ x: number; y: number; layer: string } | null)[] = fromPins.map(pin => {
        const pos = PadResolver.getPadCenter(pin);
        if (pos && preferredLayer && pin.owner) {
            const geometry = PadResolver.getPadGeometry(pin.owner, pin.number);
            if (geometry && (geometry.type === 'thru_hole' || geometry.type === 'np_thru_hole')) {
                if (geometry.layers.includes(preferredLayer)) {
                    return { ...pos, layer: preferredLayer };
                }
            }
        }
        return pos;
    });

    const endPositions: ({ x: number; y: number; layer: string } | null)[] = toPins.map(pin => {
        const pos = PadResolver.getPadCenter(pin);
        if (pos && preferredLayer && pin.owner) {
            const geometry = PadResolver.getPadGeometry(pin.owner, pin.number);
            if (geometry && (geometry.type === 'thru_hole' || geometry.type === 'np_thru_hole')) {
                if (geometry.layers.includes(preferredLayer)) {
                    return { ...pos, layer: preferredLayer };
                }
            }
        }
        return pos;
    });

    const invalidStarts = startPositions.filter(p => p === null).length;
    const invalidEnds = endPositions.filter(p => p === null).length;

    if (invalidStarts > 0 || invalidEnds > 0) {
        const callSite = pcb.getCallSite();
        const callSiteInfo = callSite ? ` (called from ${callSite.file}:${callSite.line})` : '';
        throw new RoutingError(`Unable to resolve pin positions: ${invalidStarts} invalid start pins, ${invalidEnds} invalid end pins${callSiteInfo}`);
    }

    const validStartPositions = startPositions.filter((p): p is { x: number; y: number; layer: string } => p !== null);
    const validEndPositions = endPositions.filter((p): p is { x: number; y: number; layer: string } => p !== null);

    // ── 5. Determine routing layers ──────────────────────────────────────
    const padLayers = new Set<string>();
    for (const pos of [...validStartPositions, ...validEndPositions]) {
        padLayers.add(pos.layer);
    }

    let routingLayers = options.layers || ['F.Cu', 'B.Cu'];

    if (options.layers && options.layers.length > 0) {
        const missingLayers = Array.from(padLayers).filter(l => !options.layers!.includes(l));
        if (missingLayers.length > 0) {
            debugLog(options.debug, chalk.yellow(`[PCB] WARNING: Some pads exist on layers not included in routing layers`));
            debugLog(options.debug, chalk.yellow(`[PCB]   Requested layers: ${options.layers.join(', ')}`));
            debugLog(options.debug, chalk.yellow(`[PCB]   Pads exist on layers: ${Array.from(padLayers).join(', ')}`));
            debugLog(options.debug, chalk.yellow(`[PCB]   Missing layers: ${missingLayers.join(', ')}`));
            debugLog(options.debug, chalk.yellow(`[PCB]   Automatically expanding routing layers to include all pad layers`));
            routingLayers = Array.from(new Set([...options.layers, ...padLayers]));
            debugLog(options.debug, chalk.blue(`[PCB]   Final routing layers: ${routingLayers.join(', ')}`));
        }
    }

    // ── 6. Extract components from pins and schematic nets ───────────────
    const componentsFromPins: Component[] = [];
    for (const pin of [...fromPins, ...toPins]) {
        if (pin.owner && !componentsFromPins.includes(pin.owner)) {
            componentsFromPins.push(pin.owner);
        }
    }

    if (pcb.Schematic && pcb.Schematic.Nodes) {
        for (const node of pcb.Schematic.Nodes) {
            if (node.nodes) {
                for (const schematicPin of node.nodes) {
                    if (schematicPin.owner && !componentsFromPins.includes(schematicPin.owner)) {
                        componentsFromPins.push(schematicPin.owner);
                    }
                }
            }
        }
    }

    if (pcb.Schematic && Array.isArray(pcb.Schematic.components)) {
        for (const comp of pcb.Schematic.components) {
            if (comp && !componentsFromPins.includes(comp)) {
                componentsFromPins.push(comp);
            }
        }
    }

    debugLog(options.debug, chalk.blue(`[PCB] Found ${componentsFromPins.length} components from pins and schematic nets`));

    // ── 7. Infer net from pins ───────────────────────────────────────────
    let netName = options.net;
    if (!netName && pcb.Schematic && pcb.Schematic.Nodes) {
        const firstPin = fromPins[0];
        debugLog(options.debug, chalk.blue(`[PCB] Attempting to infer net from pin ${firstPin.reference}.${firstPin.number}`));
        if (firstPin.owner) {
            debugLog(options.debug, chalk.blue(`[PCB] Pin owner: ${firstPin.owner.reference}, searching ${pcb.Schematic.Nodes.length} schematic nodes`));
            for (const schematicNode of pcb.Schematic.Nodes) {
                if (schematicNode.nodes) {
                    const pinInSchematic = schematicNode.nodes.find((p: any) =>
                        p.reference === firstPin.owner!.reference &&
                        String(p.number) === String(firstPin.number)
                    );
                    if (pinInSchematic) {
                        netName = schematicNode.name;
                        debugLog(options.debug, chalk.green(`[PCB] ✓ Inferred net from pins: ${netName}`));
                        break;
                    }
                }
            }
            if (!netName) {
                debugLog(options.debug, chalk.yellow(`[PCB] Could not find net for pin in schematic`));
            }
        }
    } else if (!netName) {
        debugLog(options.debug, chalk.yellow(`[PCB] No schematic available for net inference (Schematic: ${!!pcb.Schematic}, Nodes: ${pcb.Schematic?.Nodes?.length || 0})`));
    }

    // ── 8. Determine trace width ─────────────────────────────────────────
    let traceWidth = options.width;
    let powerInfo = options.powerInfo;
    let powerInfoSource = 'options';

    if (!traceWidth && !powerInfo) {
        const allPinsForPower = [...fromPins, ...toPins];
        for (const pin of allPinsForPower) {
            if (pin && (pin as any).powerInfo) {
                powerInfo = (pin as any).powerInfo;
                powerInfoSource = 'pin';
                debugLog(options.debug, chalk.blue(`[PCB] Found power info on pin ${pin.owner?.reference || 'unknown'}.${pin.number}: ${powerInfo?.current}A`));
                break;
            }
        }
    }

    if (!traceWidth && powerInfo) {
        const layer = options.layers?.[0] || validStartPositions[0].layer;
        traceWidth = calculateMinTraceWidth(
            powerInfo.current,
            layer,
            powerInfo.maxTempRise || 10,
            powerInfo.thickness || pcb.copper_thickness
        );
        debugLog(options.debug, chalk.blue(`[PCB] Calculated trace width from power info: ${traceWidth.toFixed(3)}mm for ${powerInfo.current}A (source: ${powerInfoSource})`));
    }

    if (powerInfo && !options.powerInfo) {
        options.powerInfo = powerInfo;
    }

    traceWidth = traceWidth || 0.2; // Default 0.2mm

    // ── 9. Determine clearance ───────────────────────────────────────────
    const baseClearance = options.clearance || 0.2;
    const clearanceBuffer = Math.min(0.05, baseClearance * 0.25);
    const clearance = baseClearance + clearanceBuffer;

    // ── 10. Calculate board bounds ───────────────────────────────────────
    const { components: componentsForBounds, stagedComponents: stagedComponentsForBounds } =
        collectComponentsForBounds(pcb, componentsFromPins);
    let bounds = calculateBoardBounds(componentsForBounds, pcb.outlines, stagedComponentsForBounds);

    const stagedOutlines = typeof pcb._getStagedOutlines === 'function' ? pcb._getStagedOutlines() : [];
    const requestedGridResolution = options.gridResolution ?? 0.1;
    const boundsExpansionMargin = Math.max(
        5,
        traceWidth * 8,
        clearance * 4,
        requestedGridResolution * 80
    );

    const expandedBounds = expandBoundsToIncludeTracks(
        bounds,
        Array.isArray(pcb.grLines) ? pcb.grLines as IGrLine[] : [],
        stagedOutlines,
        boundsExpansionMargin
    );
    const boundsChanged = expandedBounds.minX !== bounds.minX ||
        expandedBounds.maxX !== bounds.maxX ||
        expandedBounds.minY !== bounds.minY ||
        expandedBounds.maxY !== bounds.maxY;
    bounds = expandedBounds;

    if (boundsChanged) {
        debugLog(options.debug, chalk.blue(`[PCB] Expanded routing bounds to (${bounds.minX}, ${bounds.minY}) - (${bounds.maxX}, ${bounds.maxY}) to include existing tracks`));
    }
    debugLog(options.debug, chalk.blue(`[PCB] Board bounds: (${bounds.minX}, ${bounds.minY}) to (${bounds.maxX}, ${bounds.maxY})`));

    // ── 11. Build routing grid ───────────────────────────────────────────
    let gridResolution = requestedGridResolution;

    try {
        const padSummaries = collectPadSummariesForRouting(componentsFromPins);
        const gridConfig = configureGridResolution({
            requestedResolution: requestedGridResolution,
            defaultResolution: 0.1,
            pads: padSummaries
        });

        if (gridConfig && typeof gridConfig.gridResolution === 'number' && gridConfig.gridResolution > 0) {
            const reasonText = gridConfig.reason ? ` (${gridConfig.reason})` : '';
            debugLog(options.debug, chalk.yellow(`[PCB] Router selected grid resolution ${gridConfig.gridResolution}mm${reasonText}`));
            gridResolution = gridConfig.gridResolution;
        }
    } catch (error: any) {
        debugLog(options.debug, chalk.yellow(`[PCB] Grid configurator threw: ${error?.message ?? error}`));
    }

    const grid = new RoutingGrid(bounds, gridResolution, routingLayers, options.debug);

    // ── 12. Add obstacles ────────────────────────────────────────────────
    const obstacles = ObstacleBuilder.buildFromPCB(pcb, clearance, componentsFromPins, options.debug);
    const allObstacles: any[] = [];
    const addObstacleToState = (obs: any) => {
        allObstacles.push(obs);
        grid.addObstacle(obs);
    };
    obstacles.forEach(addObstacleToState);

    const stats = grid.getStats();
    debugLog(options.debug, chalk.blue(`[PCB] Grid stats: ${stats.occupiedCells} occupied cells (${stats.occupancyPercent.toFixed(1)}%)`));

    // ── 13. Collect free via locations ───────────────────────────────────
    const freeViaLocations: { x: number; y: number }[] = [];

    if (netName && pcb.Schematic && pcb.Schematic.Nodes) {
        const schematicNode = pcb.Schematic.Nodes.find((node: any) => node.name === netName);
        if (schematicNode && schematicNode.nodes) {
            for (const schematicPin of schematicNode.nodes) {
                if (schematicPin.owner) {
                    const geometry = PadResolver.getPadGeometry(schematicPin.owner, schematicPin.number);
                    if (geometry) {
                        if (geometry.type === 'thru_hole' || geometry.type === 'np_thru_hole') {
                            freeViaLocations.push({ x: geometry.center.x, y: geometry.center.y });
                        }
                    }
                }
            }
        }
    } else {
        for (const pin of [...fromPins, ...toPins]) {
            if (pin.owner) {
                const geometry = PadResolver.getPadGeometry(pin.owner, pin.number);
                if (geometry && (geometry.type === 'thru_hole' || geometry.type === 'np_thru_hole')) {
                    freeViaLocations.push({ x: geometry.center.x, y: geometry.center.y });
                }
            }
        }
    }
    debugLog(options.debug, chalk.blue(`[PCB] Identified ${freeViaLocations.length} through-hole pad locations as free via points for net ${netName || 'unknown'}`));

    if (netName) {
        const manualViaLocations = collectManualViaFreeLocations(pcb, netName);
        if (manualViaLocations.length > 0) {
            let addedManual = 0;
            manualViaLocations.forEach(loc => {
                const alreadyPresent = freeViaLocations.some(existing =>
                    Math.abs(existing.x - loc.x) < 1e-6 && Math.abs(existing.y - loc.y) < 1e-6
                );
                if (!alreadyPresent) {
                    freeViaLocations.push(loc);
                    addedManual++;
                }
            });
            if (addedManual > 0) {
                debugLog(options.debug, chalk.blue(`[PCB] Added ${addedManual} manual via location(s) as free via points for net ${netName}`));
            }
        }
    }

    // ── 14. Build coarse grid factory and base router options ────────────
    const buildCoarseGrid = (resolution: number) => {
        const coarseGrid = new RoutingGrid(bounds, resolution, routingLayers, options.debug);
        allObstacles.forEach(obs => coarseGrid.addObstacle(obs));
        return coarseGrid;
    };

    const defaultParallelWorkers = Math.max(1, (os.cpus()?.length ?? 1) - 1);
    const baseRouterOptions = {
        traceWidth,
        clearance,
        viaClearance: options.viaClearance,
        allowedLayers: routingLayers,
        preferredLayers: options.layers,
        viaCost: options.viaCost,
        bendCost: options.bendCost,
        maxIterations: options.maxIterations,
        allowVias: options.allowVias,
        impedance: options.impedance,
        freeViaLocations,
        heuristicWeight: options.heuristicWeight,
        requestedGridResolution: gridResolution,
        resumeGridResolution: gridResolution,
        coarseGridFactory: buildCoarseGrid,
        parallelMSTWorkers: options.parallelMSTWorkers ?? defaultParallelWorkers,
        gridObstacles: allObstacles,
        gridBounds: bounds,
        debug: options.debug
    } as const;

    // ── 15. Build shared context ─────────────────────────────────────────
    const allPins = [...fromPins, ...toPins];

    const ctx: AutorouteContext = {
        pcb,
        options,
        fromPins,
        toPins,
        validStartPositions,
        validEndPositions,
        allPins,
        netName,
        traceWidth,
        clearance,
        bounds,
        grid,
        routingLayers,
        allObstacles,
        addObstacleToState,
        freeViaLocations,
        baseRouterOptions,
    };

    const out: RoutingOutput = createEmptyRoutingOutput();

    // ── 16. Process manual routes ────────────────────────────────────────
    const { manuallyRoutedPinPairs, manualRouteDataMap } = processManualRoutes(
        pcb, options, allPins, traceWidth, clearance, netName, addObstacleToState
    );

    // ── 17. Route: MST or pairwise ───────────────────────────────────────
    const handledSingleNet = routeMstNet(ctx, out, manuallyRoutedPinPairs, manualRouteDataMap);

    if (!handledSingleNet) {
        routePairwise(ctx, out, manuallyRoutedPinPairs, manualRouteDataMap);
    }

    // ── 18. Merge track builders ─────────────────────────────────────────
    const result = out.result;
    const routeDetails = out.routeDetails;
    const routeTrackBuilders = out.routeTrackBuilders;

    for (const builders of routeTrackBuilders) {
        if (builders) {
            for (const builder of builders) {
                result.push(builder);
            }
        }
    }

    // ── 19. Stage deferred tracks ────────────────────────────────────────
    debugLog(options.debug, chalk.blue(`[PCB] Staging ${result.length} TrackBuilder(s) with ${result.reduce((sum, builder) => sum + builder.getElements().length, 0)} total elements`));
    for (let i = 0; i < result.length; i++) {
        const builder = result[i];
        const elements = builder.getElements();
        if ((builder as any)._deferStaging && elements.length > 0) {
            debugLog(options.debug, chalk.gray(`[PCB] Staging builder ${i} with ${elements.length} elements (deferStaging=true)`));
            for (const el of elements) {
                if (el.type === 'track' && el.details) {
                    const trackDetails = el.details as any;
                    debugLog(options.debug, chalk.gray(`[PCB] Staging track: (${trackDetails.start.x.toFixed(3)}, ${trackDetails.start.y.toFixed(3)}) -> (${trackDetails.end.x.toFixed(3)}, ${trackDetails.end.y.toFixed(3)})`));
                    pcb._track(
                        trackDetails.start,
                        trackDetails.end,
                        trackDetails.width,
                        trackDetails.layer,
                        trackDetails.locked || false,
                        el.uuid,
                        (builder as any)._net
                    );
                }
            }
        } else if ((builder as any)._deferStaging) {
            debugLog(options.debug, chalk.gray(`[PCB] Skipping builder ${i} (deferStaging=true but no elements)`));
        } else {
            debugLog(options.debug, chalk.gray(`[PCB] Skipping builder ${i} (deferStaging=false)`));
        }
    }

    // ── 20. Report results ───────────────────────────────────────────────
    debugLog(options.debug, chalk.gray(`[PCB][DEBUG] After processing track builders: stagedOutlines=${pcb.stagedOutlines.length}, tracks=${pcb.tracks.length}, outlines_public=${pcb.outlines_public.length}`));
    if (options.debug && pcb.stagedOutlines.length > 0) {
        try {
            const sample = pcb.stagedOutlines.slice(0, 5).map((o: any) => ({ uuid: o.uuid, elements: o.elements.map((el: any) => ({ type: el.type, layer: el.layer ?? el.details?.layer, start: el.details?.start, end: el.details?.end })) }));
            logger.debug('[PCB][DEBUG] stagedOutlines sample:', JSON.stringify(sample, null, 2));
        } catch (e) { /* ignore */ }
    }

    const successCount = routeDetails.filter(d => d.success).length;
    const failureCount = routeDetails.length - successCount;
    const overallSuccess = successCount === routeDetails.length;

    debugLog(options.debug, chalk[overallSuccess ? 'green' : 'yellow'](
        `[PCB] Autoroute complete: ${successCount}/${routeDetails.length} routes successful`
    ));

    if (failureCount > 0) {
        const callSite = pcb.getCallSite();
        const callSiteInfo = callSite ? ` (called from ${callSite.file}:${callSite.line})` : '';

        debugLog(options.debug, chalk.red(`[PCB] Failed routes:`));
        routeDetails.forEach((detail, idx) => {
            if (!detail.success) {
                const errorMsg = detail.error || 'Unknown error';
                debugLog(options.debug, chalk.red(`[PCB]   Route ${idx + 1}: ${errorMsg}`));
            }
        });

        logger.warn(`[PCB] WARNING: Some routes failed. Check routing constraints and available space${callSiteInfo}`);
    }

    // ── 21. Debug visualization ──────────────────────────────────────────
    if (options.debug) {
        try {
            const cellSize = 1;
            DebugVisualizer.visualizeAllLayers(
                grid,
                obstacles,
                out.allPaths,
                `routing_debug_${netName || 'unknown'}`,
                cellSize,
                undefined,
                options.debug
            );
        } catch (error: any) {
            logger.warn(`[PCB] Failed to generate debug visualization: ${error.message}`);
        }
    }

    // ── 22. Add provided routes not yet added ────────────────────────────
    if (providedRoutes.length > 0) {
        debugLog(options.debug, chalk.blue(`[PCB] Checking ${providedRoutes.length} provided route(s)...`));
        for (const routeItem of providedRoutes) {
            let path: any;
            if (isAutorouteResultRouteItem(routeItem)) {
                path = routeItem.routeDetails[0].path!;
            } else {
                path = routeItem;
            }

            const alreadyAdded = routeDetails.some(detail =>
                detail.path === path
            );

            if (!alreadyAdded) {
                debugLog(options.debug, chalk.blue(`[PCB] Provided route was not used during routing, adding it now`));

                if (isAutorouteResultRouteItem(routeItem)) {
                    for (const tb of routeItem) {
                        result.push(tb);
                        const elements = tb.getElements();
                        for (const el of elements) {
                            if (el.type === 'track' && el.details && 'start' in el.details) {
                                const trackDetails = el.details as import('./pcb_interfaces.js').ITrackDetails;
                                pcb._track(
                                    trackDetails.start,
                                    trackDetails.end,
                                    trackDetails.width,
                                    trackDetails.layer,
                                    trackDetails.locked ?? false,
                                    el.uuid,
                                    undefined
                                );
                            }
                        }
                    }
                    debugLog(options.debug, chalk.blue(`[PCB] Reused ${(routeItem as any).length} existing TrackBuilder(s) from provided route`));
                } else {
                    const track = pathToTrackBuilder(pcb, path, traceWidth, options, netName, freeViaLocations);
                    if (track) {
                        result.push(track);
                    }
                }

                const metadata: import('./pcb_interfaces.js').IRouteMetadata = {
                    length: path.length,
                    viaCount: path.viaCount,
                    layers: [...new Set<string>(path.nodes.map((n: any) => n.layer))],
                    success: path.success,
                    error: path.error,
                    path: path
                };
                routeDetails.push(metadata);
            } else {
                debugLog(options.debug, chalk.blue(`[PCB] Provided route was already used during routing, skipping duplicate`));
            }
        }
    }

    // ── 23. Apply length matching ────────────────────────────────────────
    if (options.lengthMatch && routeDetails.length >= 2) {
        if (!LengthMatcher) {
            logger.warn(`[PCB] Length matching requested but @typecad/typecad-astar is not installed. Skipping length matching.`);
            const autorouteResult = result as IAutorouteResult;
            autorouteResult.success = overallSuccess;
            autorouteResult.routeCount = routeDetails.length;
            autorouteResult.completedCount = successCount;
            autorouteResult.routeDetails = routeDetails;
            return autorouteResult;
        }

        debugLog(options.debug, chalk.blue(`[PCB] Applying length matching to ${routeDetails.length} routes`));

        try {
            const lengthMatchContext = {
                pcb: pcb,
                grid: grid,
                traceWidth: traceWidth,
                clearance: clearance,
                net: netName,
                locked: options.locked || false
            };

            const lengthMatchResult = LengthMatcher.apply(
                lengthMatchContext,
                routeDetails.map(rd => ({ path: rd.path!, success: rd.success })),
                routeTrackBuilders as any,
                options.lengthMatch
            );

            for (const update of lengthMatchResult.updates) {
                if (routeDetails[update.index]) {
                    routeDetails[update.index].length = update.newLength;
                    if (routeDetails[update.index].path) {
                        routeDetails[update.index].path!.length = update.newLength;
                    }
                }
            }

            result.push(...(lengthMatchResult.builders as any));

            debugLog(options.debug, chalk.green(`[PCB] Length matching applied: ${lengthMatchResult.updates.length} routes updated, ${lengthMatchResult.builders.length} new tracks added`));

        } catch (error: any) {
            debugLog(options.debug, chalk.yellow(`[PCB] Length matching failed: ${error.message}`));
            logger.warn(`[PCB] WARNING: Length matching failed, continuing without it: ${error.message}`);
        }
    }

    // ── 24. Return result ────────────────────────────────────────────────
    const autorouteResult = result as IAutorouteResult;
    autorouteResult.success = overallSuccess;
    autorouteResult.routeCount = routeDetails.length;
    autorouteResult.completedCount = successCount;
    autorouteResult.routeDetails = routeDetails;
    return autorouteResult;
}
