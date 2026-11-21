/**
 * Pairwise routing for the autorouter.
 *
 * Handles the fallback case where pins are not all on the same net,
 * routing each from→to pair individually with support for manual routes,
 * excluded connections, and fast-fallback optimization.
 */

import chalk from 'chalk';
import logger from '../utils/logging.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { AStarRouter } from '../routing/router/astar_router.js';
import { ObstacleBuilder } from '../routing/shared/obstacle_builder.js';
import { RoutingGrid } from '../routing/shared/routing_grid.js';
import { connectionMatches, pinToIdentifier } from './pcb_routing_helpers.js';
import { pathToTrackBuilder } from './pcb_routing_core.js';
import { IAutorouteOptions, IRoutePath, IAutorouteWaypoint } from './pcb_interfaces.js';
import { IRouteDirectives } from '../routing/router/types.js';
import {
  debugLog,
  AutorouteContext,
  RoutingOutput,
  validatePathGeometrically,
  formatRejection,
} from './pcb_autoroute_helpers.js';
import { ManualRouteData } from './pcb_autoroute_manual_routes.js';
import { pcbTrackSegment, getPcbState } from './pcb.js';

/**
 * Route connections pairwise (from[i] → to[i]).
 *
 * This is the fallback when MST single-net routing does not apply.
 */
export function routePairwise(
  ctx: AutorouteContext,
  out: RoutingOutput,
  manuallyRoutedPinPairs: Set<string>,
  manualRouteDataMap: Map<string, ManualRouteData>,
): void {
  const {
    pcb,
    options,
    fromPins,
    toPins,
    validStartPositions,
    validEndPositions,
    allPins,
    netName,
    pinNetMap,
    traceWidth,
    clearance,
    freeViaLocations,
    baseRouterOptions,
    grid,
    addObstacleToState,
  } = ctx;

  const excludeConnections = options.excludeConnections || [];

  // If fromPins has only 1 element (net routing), route from that pin to all toPins
  // Otherwise, route pairwise (bus routing)
  const isNetRouting = fromPins.length === 1 && toPins.length > 1;
  const pairCount = isNetRouting ? toPins.length : Math.min(validStartPositions.length, validEndPositions.length);

  debugLog(options.debug, chalk.blue(`[PCB] Using pairwise routing for ${pairCount} connection(s)`));

  for (let i = 0; i < pairCount; i++) {
    debugLog(options.debug, chalk.blue(`[PCB] Routing pair ${i + 1}/${pairCount}`));

    // Get pins for this connection
    const fromPin = isNetRouting ? fromPins[0] : fromPins[i];
    const toPin = toPins[i];
    const fromId = pinToIdentifier(fromPin);
    const toId = pinToIdentifier(toPin);

    // Check if this connection should be excluded
    let shouldSkip = false;
    for (const exclude of excludeConnections) {
      if (connectionMatches(fromPin, toPin, exclude.from, exclude.to)) {
        debugLog(options.debug, chalk.yellow(`[PCB] Skipping excluded connection: ${fromId} <-> ${toId}`));
        shouldSkip = true;
        break;
      }
    }

    if (shouldSkip) {
      continue;
    }

    const startPos = isNetRouting ? validStartPositions[0] : validStartPositions[i];
    const endPos = validEndPositions[i];

    // Check if this connection has a manual route
    const pairKey1 = `${fromId}::${toId}`;
    const pairKey2 = `${toId}::${fromId}`;
    let path: IRoutePath | null = null;
    let manualTrackBuilders: TrackBuilder[] | undefined;

    if (manuallyRoutedPinPairs.has(pairKey1)) {
      // Use the manual route path
      const manualData = manualRouteDataMap.get(pairKey1);
      if (manualData) {
        path = manualData.path;
        manualTrackBuilders = manualData.trackBuilders;
        debugLog(options.debug, chalk.blue(`[PCB] Using manual route: ${fromId} <-> ${toId}`));
      }
    } else if (manuallyRoutedPinPairs.has(pairKey2)) {
      // Use the manual route path (reverse direction)
      const manualData = manualRouteDataMap.get(pairKey2);
      if (manualData) {
        path = manualData.path;
        manualTrackBuilders = manualData.trackBuilders;
        debugLog(options.debug, chalk.blue(`[PCB] Using manual route: ${fromId} <-> ${toId}`));
      }
    }

    // Determine net for this pair (may differ across pairs)
    const pairNetName = fromPin?.owner
      ? pinNetMap.get(`${fromPin.owner.reference}:${String(fromPin.number)}`)
      : undefined;

    // If no manual route, use autorouter
    if (!path) {
      const directives: IAutorouteWaypoint[] | IRouteDirectives | undefined =
        options.vias && options.vias.length > 0
          ? { waypoints: options.waypoints, vias: options.vias }
          : options.waypoints;

      // Create a fast-try router with more aggressive heuristic and lower iterations
      const tryFastFirst =
        (options as IAutorouteOptions & { fastFallback?: boolean }).fastFallback === true ||
        process.env.MAST_FAST === '1';
      if (tryFastFirst && !directives) {
        try {
          const fastRouter = new AStarRouter(grid, {
            ...baseRouterOptions,
            net: pairNetName ?? netName,
            heuristicWeight: 8,
            maxIterations: 20000,
            useAdaptiveStride: true,
            maxStrideCells: Math.max(32, baseRouterOptions.maxStrideCells ?? 32),
          });

          if (fastRouter) {
            const fastPath = fastRouter.route(startPos, endPos);
            if (fastPath && fastPath.success) {
              path = fastPath;
              debugLog(options.debug, chalk.green(`[PCB] fastFallback succeeded for ${fromId} <-> ${toId}`));
            }
          }
        } catch (e) {
          logger.debug('[PCB] fast fallback attempt failed, proceeding to full routing', e);
        }
      }

      // Full routing fallback
      if (!path) {
        const routerForPair = new AStarRouter(grid, {
          ...baseRouterOptions,
          net: pairNetName ?? netName,
        });

        path = routerForPair.route(startPos, endPos, directives);
      }
    }

    out.allPaths.push(path); // Store for visualization

    // Geometric gate: the grid samples cell centers, so a found path can
    // still sweep a segment across foreign copper. Validate router-produced
    // paths (manual routes carry the user's intent verbatim) and retry once
    // on a finer grid before failing the route — shorting copper never
    // reaches the board.
    if (path.success && !manualTrackBuilders) {
      const routeNet = typeof pairNetName === 'string' ? pairNetName : netName;
      let violations = validatePathGeometrically(path, ctx, routeNet);
      if (violations.length > 0) {
        debugLog(
          options.debug,
          chalk.yellow(`[PCB] ${fromId} <-> ${toId}: ${formatRejection(violations)} — retrying at finer grid`),
        );
        try {
          const fineGrid = new RoutingGrid(ctx.bounds, Math.max(0.05, ctx.grid.gridResolution / 2), ctx.routingLayers, options.debug);
          for (const obs of ctx.allObstacles) fineGrid.addObstacle(obs);
          const fineRouter = new AStarRouter(fineGrid, { ...baseRouterOptions, net: routeNet });
          const retried = fineRouter.route(startPos, endPos);
          if (retried && retried.success) {
            const retryViolations = validatePathGeometrically(retried, ctx, routeNet);
            if (retryViolations.length === 0) {
              path = retried;
              violations = [];
            }
          }
        } catch {
          // finer-grid retry is best effort; fall through to rejection
        }
      }
      if (violations.length > 0) {
        logger.warn(`[PCB] Route ${fromId} <-> ${toId}: ${formatRejection(violations)}`);
        path = { ...path, success: false, error: formatRejection(violations) };
      }
    }

    if (path.success) {
      // If we have manual TrackBuilders, reuse them to avoid creating duplicates.
      // They are registered ONLY in routeTrackBuilders — autoroute()'s merge
      // step moves them into the result exactly once.
      if (manualTrackBuilders) {
        debugLog(
          options.debug,
          chalk.blue(`[PCB] Reusing ${manualTrackBuilders.length} existing TrackBuilder(s) from manual route`),
        );
        for (const tb of manualTrackBuilders) {
          // Re-stage the tracks from this TrackBuilder since we removed them earlier.
          // Deferred builders are staged by autoroute()'s staging loop instead,
          // so guard here to avoid staging their elements twice.
          if (!tb.deferStaging) {
            const elements = tb.getElements();
            for (const el of elements) {
              if (el.type === 'track' && el.details && 'start' in el.details) {
                // It's a track (not a via)
                const trackDetails = el.details as import('./pcb_interfaces.js').ITrackDetails;
                pcbTrackSegment(
                  pcb,
                  trackDetails.start,
                  trackDetails.end,
                  trackDetails.width,
                  trackDetails.layer,
                  trackDetails.locked ?? false,
                  el.uuid,
                  undefined,
                );
              }
            }
          }
        }
        // Map builders to this route index
        out.routeTrackBuilders[i] = manualTrackBuilders;
      } else {
        // Convert path to TrackBuilder with net info
        const shouldDeferStaging = options.deferStaging;
        // stage under THIS pair's net — bus pairs each carry their own net,
        // and tracks labelled with pair 0's net read as a short in KiCad and
        // let pair 0 route straight over them later
        const pairNet = typeof pairNetName === 'string' ? pairNetName : netName;
        const track = pathToTrackBuilder(pcb, path, traceWidth, options, pairNet, freeViaLocations, shouldDeferStaging);
        // Map the created builder to this route index
        out.routeTrackBuilders[i] = track ? [track] : [];
      }

      // Register the net for rip-up eligibility: these tracks are the
      // router's own staging, safe to rip and re-route later.
      const routedNet = typeof pairNetName === 'string' ? pairNetName : netName;
      if (routedNet) {
        getPcbState(pcb).routerRoutedNets.add(routedNet);
      }
      // Only add tracks as obstacles if we created new ones (not manual)
      if (!manualTrackBuilders) {
        // Add newly created tracks as obstacles for subsequent routes
        for (let j = 1; j < path.nodes.length; j++) {
          const prevNode = path.nodes[j - 1];
          const currNode = path.nodes[j];

          // A via (same position, different layer) must block later pairs
          // too: the grid was built before this call, so without this a
          // later pair could run a track straight through it
          if (prevNode.x === currNode.x && prevNode.y === currNode.y) {
            const viaSize = options.viaSize ?? 0.6;
            addObstacleToState({
              type: 'pad',
              bounds: {
                minX: currNode.x - viaSize / 2,
                maxX: currNode.x + viaSize / 2,
                minY: currNode.y - viaSize / 2,
                maxY: currNode.y + viaSize / 2,
              },
              layers: ['*.Cu'], // a through via's barrel occupies every copper layer
              net: typeof pairNetName === 'string' ? pairNetName : netName,
              clearance,
              label: 'via',
              padShape: { shape: 'circle', center: { x: currNode.x, y: currNode.y }, width: viaSize, height: viaSize, rotation: 0 },
            });
            continue;
          }

          // Create track obstacle for this segment with net info
          const trackObstacle = ObstacleBuilder.buildFromTrack(
            {
              type: 'line',
              uuid: 'temp-route-' + i + '-' + j,
              layer: prevNode.layer,
              strokeWidth: traceWidth,
              start: { x: prevNode.x, y: prevNode.y },
              end: { x: currNode.x, y: currNode.y },
            },
            traceWidth,
            clearance,
            // Use this pair's net (fallback to inferred netName)
            typeof pairNetName === 'string' ? pairNetName : netName,
          );

          // Add obstacle to grid
          addObstacleToState(trackObstacle);
        }

        debugLog(
          options.debug,
          chalk.blue(`[PCB] Added ${path.nodes.length - 1} track segments as obstacles for subsequent routes`),
        );

        // DEBUG: Report staged outlines and tracks counts after adding segments
        const pState = getPcbState(pcb);
        debugLog(
          options.debug,
          chalk.gray(
            `[PCB][DEBUG] stagedOutlines=${pState.stagedOutlines.length}, tracks=${pcb.tracks.length}, outlines_public=${pState.outlines.length}`,
          ),
        );
      } // end if (!manualTrackBuilders)
    } // end if (path.success)

    const metadata: import('./pcb_interfaces.js').IRouteMetadata = {
      length: path.length,
      viaCount: path.viaCount,
      layers: [...new Set(path.nodes.map((n) => n.layer))],
      success: path.success,
      error: path.error,
      fromLabel: fromId,
      toLabel: toId,
      path: path, // Store the actual path for reuse
    };
    out.routeDetails.push(metadata);
  }
}
