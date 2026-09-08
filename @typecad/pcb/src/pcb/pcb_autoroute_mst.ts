/**
 * MST (Minimum Spanning Tree) single-net routing for the autorouter.
 *
 * When all pins belong to the same net and there are more than 2 pins,
 * this module uses MST-based routing for optimal connection order.
 */

import chalk from 'chalk';
import { Pin } from '../pin.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { AStarRouter } from '../routing/router/astar_router.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';
import { pinToIdentifier } from './pcb_routing_helpers.js';
import { pathToTrackBuilder } from './pcb_routing_core.js';
import { IAutorouteOptions, IRoutePath, IRouteMetadata } from './pcb_interfaces.js';
import logger from '../utils/logging.js';
import { debugLog, AutorouteContext, RoutingOutput } from './pcb_autoroute_helpers.js';
import { ManualRouteData } from './pcb_autoroute_manual_routes.js';
import { pcbTrackSegment, getPcbState } from './pcb.js';

/**
 * Attempt MST-based single-net routing.
 *
 * @returns `true` if MST routing was performed, `false` if skipped
 *          (caller should fall back to pairwise routing).
 */
export function routeMstNet(
  ctx: AutorouteContext,
  out: RoutingOutput,
  manuallyRoutedPinPairs: Set<string>,
  manualRouteDataMap: Map<string, ManualRouteData>,
): boolean {
  const { pcb, options, allPins, netName, pinNetMap, traceWidth, freeViaLocations, baseRouterOptions, grid } = ctx;

  // Detect if we're routing a net (all pins on same net)
  const uniqueNets = new Set<string>();
  for (const pin of allPins) {
    if (!pin.owner) continue;
    const net = pinNetMap.get(`${pin.owner.reference}:${String(pin.number)}`);
    if (net) uniqueNets.add(net);
  }

  // Check if this is a single-net routing scenario with multiple pins
  const isSingleNet = uniqueNets.size === 1 && allPins.length > 2;
  const allConnectionPoints = [...ctx.validStartPositions, ...ctx.validEndPositions];

  if (!isSingleNet) {
    return false;
  }

  const routerForNet = new AStarRouter(grid, {
    ...baseRouterOptions,
    net: netName,
  });

  if (typeof routerForNet.routeNet !== 'function') {
    return false;
  }

  const mstRouter = routerForNet;

  // Use MST-based net routing for optimal connection order
  debugLog(
    options.debug,
    chalk.blue(`[PCB] Detected single-net routing with ${allConnectionPoints.length} pins - using MST algorithm`),
  );

  // Pass Steiner optimization flag to routeNet (default enabled)
  const useSteiner = options.useSteinerOptimization ?? true;
  if (useSteiner) {
    debugLog(options.debug, chalk.blue(`[PCB] Steiner tree optimization enabled`));
  }

  // If provided routes exist, treat those endpoints as already connected by
  // removing one endpoint per manual pair from the set of terminals to route.
  let pointsForMST = allConnectionPoints;
  const providedRoutes = options.routes ?? [];
  if (providedRoutes.length > 0) {
    const toRemove: { x: number; y: number }[] = [];
    const seenPairs = new Set<string>();

    // Compute centroid of all current points to choose better trunk endpoint
    const centroid = allConnectionPoints.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    centroid.x /= allConnectionPoints.length;
    centroid.y /= allConnectionPoints.length;

    for (const [key, data] of manualRouteDataMap) {
      // Deduplicate unordered pairs
      const fromId = pinToIdentifier(data.manual.from!);
      const toId = pinToIdentifier(data.manual.to!);
      const ordered = [fromId, toId].sort().join('::');
      if (seenPairs.has(ordered)) continue;
      seenPairs.add(ordered);

      const fromCenter = PadResolver.getPadCenter(data.manual.from!);
      const toCenter = PadResolver.getPadCenter(data.manual.to!);
      if (!fromCenter || !toCenter) continue;

      const dFrom = Math.hypot(fromCenter.x - centroid.x, fromCenter.y - centroid.y);
      const dTo = Math.hypot(toCenter.x - centroid.x, toCenter.y - centroid.y);

      // Keep the endpoint closer to the centroid (more central trunk), remove the farther one
      const removePoint = dFrom > dTo ? fromCenter : toCenter;
      toRemove.push({ x: removePoint.x, y: removePoint.y });
    }

    if (toRemove.length > 0) {
      const tol = 0.01;
      pointsForMST = allConnectionPoints.filter(
        (p) => !toRemove.some((r) => Math.abs(p.x - r.x) < tol && Math.abs(p.y - r.y) < tol),
      );
      debugLog(
        options.debug,
        chalk.blue(
          `[PCB] Reduced MST terminals by ${toRemove.length} due to provided routes (now ${pointsForMST.length})`,
        ),
      );
    }
  }

  const path = mstRouter.routeNet(pointsForMST, useSteiner) as IRoutePath;
  out.allPaths.push(path);

  // DEBUG: dump returned path summary for diagnosis
  debugLog(
    options.debug,
    chalk.gray(
      `[PCB][DEBUG] MST path result: success=${path.success}, length=${path.length}, nodes=${path.nodes?.length ?? 0}, segments=${path.segments?.length ?? 0}, viaCount=${path.viaCount}`,
    ),
  );
  if (options.debug) {
    try {
      const dbg = {
        success: path.success,
        length: path.length,
        viaCount: path.viaCount,
        segments: path.segments?.map((s: IRoutePath) => ({ nodes: s.nodes.length, viaCount: s.viaCount })),
      };
      logger.debug('[PCB][DEBUG] MST path full summary:', JSON.stringify(dbg, null, 2));
    } catch (e) {
      logger.debug('[PCB][DEBUG] MST path summary logging failed', e);
    }
  }

  if (path.success || (path.nodes?.length ?? 0) > 0) {
    if (path.success && netName) {
      getPcbState(pcb).routerRoutedNets.add(netName);
    }
    // For MST routing, create separate tracks for each segment
    if (path.segments && path.segments.length > 0) {
      debugLog(options.debug, chalk.blue(`[PCB] Creating ${path.segments.length} separate tracks for MST segments`));

      // Two-pass: stage manual segments first so overlap trimming sees them
      const otherSegments: IRoutePath[] = [];

      for (const segment of path.segments) {
        const candidateSegment = segment;
        const segStart = candidateSegment.nodes[0];
        const segEnd = candidateSegment.nodes[candidateSegment.nodes.length - 1];
        // Try to map segment endpoints to pins to detect manual reuse
        const tol = 0.01;
        let sPin: Pin | undefined;
        let ePin: Pin | undefined;
        for (const pin of allPins) {
          const pc = PadResolver.getPadCenter(pin);
          if (!pc) continue;
          if (!sPin && Math.abs(pc.x - segStart.x) < tol && Math.abs(pc.y - segStart.y) < tol) sPin = pin;
          if (!ePin && Math.abs(pc.x - segEnd.x) < tol && Math.abs(pc.y - segEnd.y) < tol) ePin = pin;
          if (sPin && ePin) break;
        }

        let reused = false;
        if (sPin && ePin) {
          const a = pinToIdentifier(sPin);
          const b = pinToIdentifier(ePin);
          const k1 = `${a}::${b}`;
          const k2 = `${b}::${a}`;
          if (manuallyRoutedPinPairs.has(k1) || manuallyRoutedPinPairs.has(k2)) {
            const md = manualRouteDataMap.get(manuallyRoutedPinPairs.has(k1) ? k1 : k2);
            if (md && md.trackBuilders) {
              debugLog(options.debug, chalk.blue(`[PCB] Reusing manual route for MST segment: ${a} <-> ${b}`));
              for (const tb of md.trackBuilders) {
                out.result.push(tb);
                // Re-stage existing track elements so they persist. Deferred
                // builders are staged by autoroute()'s staging loop (which sees
                // this builder in the result) — guard to avoid double staging.
                if (!tb.deferStaging) {
                  const elements = tb.getElements();
                  for (const el of elements) {
                    if (el.type === 'track' && el.details && 'start' in el.details) {
                      const td = el.details as import('./pcb_interfaces.js').ITrackDetails;
                      pcbTrackSegment(
                        pcb,
                        td.start,
                        td.end,
                        td.width,
                        td.layer,
                        td.locked ?? false,
                        el.uuid,
                        undefined,
                      );
                    }
                  }
                }
              }
              // Add metadata so later duplicate-add is skipped
              out.routeDetails.push({
                length: md.path.length,
                viaCount: md.path.viaCount,
                layers: [...new Set(md.path.nodes.map((n) => n.layer))],
                success: md.path.success,
                error: md.path.error,
                path: md.path,
              });
              reused = true;
            }
          }
        }

        if (!reused) {
          otherSegments.push(candidateSegment);
        }
      }

      // Second pass: create tracks for remaining segments (trimming will see staged manual routes)
      for (const segment of otherSegments) {
        const track = pathToTrackBuilder(
          pcb,
          segment,
          traceWidth,
          options,
          netName,
          freeViaLocations,
          options.deferStaging,
        );
        if (track) {
          out.result.push(track);
        }
        // Add metadata for this segment
        out.routeDetails.push({
          length: segment.length,
          viaCount: segment.viaCount,
          layers: [...new Set(segment.nodes.map((n) => n.layer))],
          success: segment.success,
          error: segment.error,
          path: segment,
        });
      }
    } else {
      // Fallback: convert the merged path (old behavior, will have issues)
      debugLog(
        options.debug,
        chalk.yellow(`[PCB] WARNING: No segments array, using merged path (may create incorrect tracks)`),
      );
      const track = pathToTrackBuilder(pcb, path, traceWidth, options, netName, freeViaLocations, options.deferStaging);
      if (track) {
        out.result.push(track);
      }
      // Add metadata for merged path
      out.routeDetails.push({
        length: path.length,
        viaCount: path.viaCount,
        layers: [...new Set(path.nodes.map((n) => n.layer))],
        success: path.success,
        error: path.error,
        path,
      });
    }
  } else {
    // Record failure of MST routing attempt
    out.routeDetails.push({
      length: path.length,
      viaCount: path.viaCount,
      layers: [],
      success: false,
      error: path.error || 'Failed to route any connections in the net',
      path,
    });
  }

  return true;
}
