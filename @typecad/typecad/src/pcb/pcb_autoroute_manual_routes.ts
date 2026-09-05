/**
 * Manual route pre-processing for the autorouter.
 *
 * Handles provided routes: validates them, infers from/to pins, marks pin
 * pairs as manually routed, and adds manual route segments as obstacles.
 */

import chalk from 'chalk';
import { Pin } from '../pin.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { IAutorouteOptions, IAutorouteResult, IManualRoute, IRoutePath } from './pcb_interfaces.js';
import { ObstacleBuilder } from '../routing/shared/obstacle_builder.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';
import { pinToIdentifier } from './pcb_routing_helpers.js';
import logger from '../utils/logging.js';
import { debugLog, isAutorouteResultRouteItem } from './pcb_autoroute_helpers.js';
import type { PCB } from './pcb.js';
import { getPcbState } from './pcb.js';

/** Data tracked for each manually-routed pin pair. */
export interface ManualRouteData {
  path: IRoutePath;
  manual: IManualRoute;
  trackBuilders?: TrackBuilder[];
}

/** Result of processing all provided routes. */
export interface ManualRouteProcessingResult {
  manuallyRoutedPinPairs: Set<string>;
  manualRouteDataMap: Map<string, ManualRouteData>;
}

/**
 * Process provided (manual) routes:
 *  - Validate each route has valid path data
 *  - Infer from/to pins from path endpoints
 *  - Register pin pairs as manually routed
 *  - Add manual route segments as obstacles to the grid
 */
export function processManualRoutes(
  pcb: PCB,
  options: IAutorouteOptions,
  allPins: Pin[],
  traceWidth: number,
  clearance: number,
  netName: string | undefined,
  addObstacleToState: (obs: import('../routing/shared/routing_grid.js').IRoutingObstacle) => void,
): ManualRouteProcessingResult {
  const providedRoutes = options.routes ?? [];
  const manuallyRoutedPinPairs = new Set<string>();
  const manualRouteDataMap = new Map<string, ManualRouteData>();

  if (providedRoutes.length === 0) {
    return { manuallyRoutedPinPairs, manualRouteDataMap };
  }

  debugLog(options.debug, chalk.blue(`[PCB] Processing ${providedRoutes.length} provided route(s)`));

  for (const routeItem of providedRoutes) {
    // Extract path from provided route
    let path: IRoutePath;
    let trackBuilders: TrackBuilder[] | undefined;

    if (isAutorouteResultRouteItem(routeItem)) {
      path = routeItem.routeDetails[0].path!;
      // It's an IAutorouteResult - store the TrackBuilders to reuse them
      trackBuilders = Array.from(routeItem);

      // Extract UUIDs from the TrackBuilders and remove their staged outlines
      // This prevents duplicates when the manual route is reused
      const uuidsToRemove: string[] = [];
      for (const tb of trackBuilders || []) {
        const elements = tb.getElements();
        for (const el of elements) {
          if (el.uuid) {
            uuidsToRemove.push(el.uuid);
          }
        }
      }
      if (uuidsToRemove.length > 0) {
        debugLog(
          options.debug,
          chalk.blue(`[PCB] Removing ${uuidsToRemove.length} staged tracks from manual route to prevent duplicates`),
        );
        const uuidSet = new Set(uuidsToRemove);
        const state = getPcbState(pcb);
        state.stagedOutlines = state.stagedOutlines.filter((outline) => {
          const hasMatchingUuid = outline.elements.some((el) => 'uuid' in el && uuidSet.has(el.uuid));
          return !hasMatchingUuid;
        });
      }
    } else {
      path = routeItem;
    }

    // Infer from/to pins if not provided
    let fromPin: Pin | undefined;
    let toPin: Pin | undefined;

    if (!fromPin || !toPin) {
      // Get path endpoints
      const pathStart = path.nodes[0];
      const pathEnd = path.nodes[path.nodes.length - 1];

      // Try to match endpoints to pins in the current routing set
      const tolerance = 0.01; // 10 microns tolerance for matching

      for (const pin of allPins) {
        // Get pin position using PadResolver
        const pinCenter = PadResolver.getPadCenter(pin);
        if (!pinCenter) continue;

        // Check if this pin matches the path start
        if (
          !fromPin &&
          Math.abs(pinCenter.x - pathStart.x) < tolerance &&
          Math.abs(pinCenter.y - pathStart.y) < tolerance
        ) {
          fromPin = pin;
        }

        // Check if this pin matches the path end
        if (!toPin && Math.abs(pinCenter.x - pathEnd.x) < tolerance && Math.abs(pinCenter.y - pathEnd.y) < tolerance) {
          toPin = pin;
        }

        if (fromPin && toPin) break;
      }

      if (!fromPin || !toPin) {
        logger.warn(
          `[PCB] WARNING: Could not infer from/to pins for manual route. Path: (${pathStart.x.toFixed(3)}, ${pathStart.y.toFixed(3)}) -> (${pathEnd.x.toFixed(3)}, ${pathEnd.y.toFixed(3)})`,
        );
        continue; // Skip this manual route
      }

      debugLog(
        options.debug,
        chalk.blue(`[PCB] Inferred manual route: ${pinToIdentifier(fromPin)} <-> ${pinToIdentifier(toPin)}`),
      );
    }

    // Create a key for this pin pair
    const fromId = pinToIdentifier(fromPin);
    const toId = pinToIdentifier(toPin);
    const pairKey1 = `${fromId}::${toId}`;
    const pairKey2 = `${toId}::${fromId}`;
    manuallyRoutedPinPairs.add(pairKey1);
    manuallyRoutedPinPairs.add(pairKey2);
    manualRouteDataMap.set(pairKey1, {
      path,
      manual: { from: fromPin, to: toPin, route: routeItem },
      trackBuilders,
    });
    manualRouteDataMap.set(pairKey2, {
      path,
      manual: { from: fromPin, to: toPin, route: routeItem },
      trackBuilders,
    });

    debugLog(options.debug, chalk.blue(`[PCB] Marked manual route: ${fromId} <-> ${toId}`));

    // Get endpoint positions for checking proximity
    const startPos = path.nodes[0];
    const endPos = path.nodes[path.nodes.length - 1];
    const endpointProximity = (options.gridResolution ?? 0.1) * 2; // Allow routing near endpoints

    // Add manual route segments as obstacles
    let manualSegmentCount = 0;
    for (let j = 1; j < path.nodes.length; j++) {
      const prevNode = path.nodes[j - 1];
      const currNode = path.nodes[j];

      // Skip vias (same position, different layer)
      if (prevNode.x === currNode.x && prevNode.y === currNode.y) {
        continue;
      }

      // Check if this segment is near either endpoint
      const nearStart =
        Math.abs(prevNode.x - startPos.x) < endpointProximity && Math.abs(prevNode.y - startPos.y) < endpointProximity;
      const nearEnd =
        Math.abs(currNode.x - endPos.x) < endpointProximity && Math.abs(currNode.y - endPos.y) < endpointProximity;
      const isEndpointSegment = nearStart || nearEnd;

      // Create track obstacle for this segment
      const trackObstacle = ObstacleBuilder.buildFromTrack(
        {
          type: 'line',
          uuid: 'manual-route-' + fromId + '-' + toId + '-' + j,
          layer: prevNode.layer,
          strokeWidth: traceWidth,
          start: { x: prevNode.x, y: prevNode.y },
          end: { x: currNode.x, y: currNode.y },
        },
        traceWidth,
        clearance,
        netName,
        !isEndpointSegment, // Only block if NOT near endpoint
      );

      addObstacleToState(trackObstacle);
      if (!isEndpointSegment) manualSegmentCount++;
    }

    debugLog(
      options.debug,
      chalk.blue(
        `[PCB] Added manual route with ${manualSegmentCount} blocking segments (${path.nodes.length - 1 - manualSegmentCount} near endpoints allow same-net routing)`,
      ),
    );
  }

  return { manuallyRoutedPinPairs, manualRouteDataMap };
}
