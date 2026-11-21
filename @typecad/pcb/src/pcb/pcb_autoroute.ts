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
import { Component, getPlacedComponents } from '../component.js';
import { RoutingError } from '../utils/errors.js';
import {
  IAutorouteOptions,
  IAutorouteResult,
  IGrLine,
  IRoutePath,
  IOutline,
  ITrackDetails,
  OutlineElement,
} from './pcb_interfaces.js';
import type { ITrackBuilder } from '../routing/types/length_match.js';
import type { Pin } from '../pin.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { PCB_CONSTANTS } from './pcb_routing_calculations.js';
import { PCB, getPcbState, pcbTrackSegment } from './pcb.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import { IRoutingObstacle, RoutingGrid } from '../routing/shared/routing_grid.js';
import { PadResolver, type IPadGeometry } from '../routing/shared/pad_resolver.js';
import { ObstacleBuilder } from '../routing/shared/obstacle_builder.js';
import { segmentOrientedRectDist } from './copper_geometry.js';
import { DebugVisualizer } from '../routing/utils/debug_visualizer.js';
import logger from '../utils/logging.js';
import { LengthMatcher } from '../routing/length_matching/length_matcher.js';
import { configureGridResolution } from '../routing/grid_resolution_policy.js';
import { formatPinResolutionError, formatSourceError } from '../utils/error_reporter.js';
import type { IPinFailureDetail } from '../utils/error_reporter.js';

import { calculateBoardBounds, calculateMinTraceWidth } from './pcb_routing_calculations.js';
import { pinToIdentifier, pinsMatch, validatePin } from './pcb_routing_helpers.js';
import { pathToTrackBuilder } from './pcb_routing_core.js';
import { collectManualViaFreeLocations } from './manual_via_helpers.js';
import { formatCallSite, getErrorMessage } from './pcb_utils.js';
import { getCallSite } from '../utils/stack_trace.js';

// Extracted sub-modules
import {
  debugLog,
  isAutorouteResultRouteItem,
  collectComponentsForBounds,
  expandBoundsToIncludeTracks,
  collectPadSummariesForRouting,
  buildPinNetMap,
  AutorouteContext,
  RoutingOutput,
  createEmptyRoutingOutput,
  validatePathGeometrically,
  formatRejection,
} from './pcb_autoroute_helpers.js';
import { processManualRoutes } from './pcb_autoroute_manual_routes.js';
import { routeMstNet } from './pcb_autoroute_mst.js';
import { routePairwise } from './pcb_autoroute_pairwise.js';
import { impedanceOfWidth, stackupImpedanceGeometry } from './pcb_impedance.js';

/** World-axis-aligned half extents of a pad (its footprint-local size
 *  rotated by the pad's absolute rotation; magnitudes only, so rotation
 *  sign conventions cannot flip the answer). */
function padWorldHalfExtents(pad: IPadGeometry): { ex: number; ey: number } {
  const rot = ((pad.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rot));
  const sin = Math.abs(Math.sin(rot));
  const w = pad.size.width / 2;
  const h = pad.size.height / 2;
  return { ex: w * cos + h * sin, ey: w * sin + h * cos };
}

/**
 * Warn when a routed pin cannot physically escape its neighbourhood with the
 * requested trace. Escape runs out along the pad's longer world axis; a
 * straight fat ray (trace width + clearance halo) is tested in BOTH escape
 * directions against every nearby foreign pad. That one test covers both
 * corridor shapes a pad can sit in: lateral flanks beside the ray (a
 * QFP/SOIC row middle pin squeezed between neighbours) and occluders ahead
 * on the ray (a USB shell tab squarely in front of the pad's only way out).
 * When neither direction fits, the route is doomed whatever the router
 * does — this turns a silent failure (or a wall of DRC violations) into one
 * actionable line with the numbers. The route is still attempted.
 */
function warnNarrowEscapeChannels(pins: Pin[], width: number, clearance: number, pinNetMap: Map<string, string>): void {
  const ESCAPE_REACH_MM = 3;
  const warned = new Set<string>();
  for (const pin of pins) {
    const owner = pin.owner;
    if (!owner) continue;
    const pad = PadResolver.getPadGeometry(owner, pin.number);
    if (!pad || pad.type !== 'smd') continue;
    const key = `${owner.reference}:${pin.number}`;
    if (warned.has(key)) continue;

    const { ex, ey } = padWorldHalfExtents(pad);
    // Escape runs along the pad's longer world axis.
    const escapeX = ex >= ey;

    const myNet = pinNetMap.get(key);
    const siblings = PadResolver.getAllPadGeometries(owner).filter((sib) => {
      if (String(sib.number) === String(pad.number)) return false;
      const sibNet = pinNetMap.get(`${owner.reference}:${String(sib.number)}`);
      if (myNet && sibNet && myNet === sibNet) return false; // own net: route-over is fine
      const dx = sib.center.x - pad.center.x;
      const dy = sib.center.y - pad.center.y;
      return Math.hypot(dx, dy) <= ESCAPE_REACH_MM + Math.max(ex, ey) + Math.max(sib.size.width, sib.size.height);
    });

    /** The fat escape ray for one direction: from the pad's end face,
     *  straight out along the escape axis, carrying the trace half-width. */
    const escapeRay = (sign: 1 | -1) => {
      const start = {
        x: pad.center.x + (escapeX ? sign * ex : 0),
        y: pad.center.y + (escapeX ? 0 : sign * ey),
      };
      const end = {
        x: escapeX ? start.x + sign * ESCAPE_REACH_MM : start.x,
        y: escapeX ? start.y : start.y + sign * ESCAPE_REACH_MM,
      };
      return { start, end };
    };

    /** Fat-ray clearance in one escape direction: min edge-to-edge gap to
     *  every foreign sibling pad (and the pad that sets it), or +Infinity
     *  when the direction is free. */
    const directionGap = (sign: 1 | -1): { gap: number; pad: string } => {
      const { start, end } = escapeRay(sign);
      let worst = Infinity;
      let worstPad = '';
      for (const sib of siblings) {
        const gap =
          segmentOrientedRectDist(start, end, sib.center, sib.size.width, sib.size.height, sib.rotation) - width / 2;
        if (gap < worst) {
          worst = gap;
          worstPad = `${owner.reference}.${String(sib.number)}`;
        }
      }
      return { gap: worst, pad: worstPad };
    };

    const plus = directionGap(1);
    const minus = directionGap(-1);
    const best = plus.gap >= minus.gap ? plus : minus;
    if (best.gap >= clearance) continue;
    warned.add(key);

    logger.warn(
      `[PCB] Escape channel warning: ${owner.reference}.${pin.number} has no escape direction that fits a ` +
        `${width}mm trace at ${clearance}mm clearance — the best direction offers ${Math.max(0, best.gap).toFixed(2)}mm ` +
        `free but ${clearance.toFixed(2)}mm is required${best.pad ? ` (tightest at ${best.pad})` : ''}. Routes from ` +
        `this pad will violate clearance or fail. Use a narrower net class for this net ` +
        `(netClass track_width/clearance) or neck the trace down near the part.`,
    );
  }
}

// pcb parameter is typed as PCB.
export function autoroute(pcb: PCB, callerOptions: IAutorouteOptions): IAutorouteResult {
  // Work on a shallow copy: below we fill in derived defaults (viaSize,
  // powerInfo) and must not mutate the caller's options object.
  const options: IAutorouteOptions = { ...callerOptions };

  // ── 1. Validate required parameters ──────────────────────────────────
  if (!options.from || !options.to) {
    const err = new RoutingError(
      formatSourceError(`autoroute() requires both 'from' and 'to' parameters`, getCallSite()),
    );
    err.stack = err.message;
    throw err;
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
      let path: IRoutePath;
      if (isAutorouteResultRouteItem(routeItem)) {
        const rd = routeItem.routeDetails;
        if (rd.length === 0 || !rd[0].path) {
          const err = new RoutingError(
            formatSourceError(`${context}: IAutorouteResult has no path data`, getCallSite()),
          );
          err.stack = err.message;
          throw err;
        }
        path = rd[0].path;
      } else {
        path = routeItem;
      }
      if (!path || !path.nodes || path.nodes.length < 2) {
        const err = new RoutingError(formatSourceError(`${context}: Path must have at least 2 nodes`, getCallSite()));
        err.stack = err.message;
        throw err;
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
        const err = new RoutingError(
          formatSourceError(
            `${context}: 'from' and 'to' pins are the same (${pinToIdentifier(exclude.from)})`,
            getCallSite(),
          ),
        );
        err.stack = err.message;
        throw err;
      }
    }
  }

  const boardCopperLayers = pcb.copperLayers;

  // Requested routing layers must be declared copper layers; routing on an
  // undeclared layer would produce a board file KiCad cannot load.
  if (options.layers && options.layers.length > 0) {
    const undeclared = options.layers.filter((l) => !boardCopperLayers.includes(l));
    if (undeclared.length > 0) {
      const err = new RoutingError(
        formatSourceError(
          `route() requested routing layer${undeclared.length === 1 ? '' : 's'} ` +
            `${undeclared.map((l) => `"${l}"`).join(', ')} which ${undeclared.length === 1 ? 'is' : 'are'} not declared ` +
            `on this board (declared copper layers: ${boardCopperLayers.join(', ')}). ` +
            `Call pcb.stackup(N) or pass { layers: N } to the PCB constructor to add inner copper layers.`,
          getCallSite(),
        ),
      );
      err.stack = err.message;
      throw err;
    }
  }

  // ── 4. Infer net and resolve its class ──────────────────────────────
  // Resolved before pad positioning so the class's preferred layers can
  // anchor through-hole endpoints on the class's layer.
  const pinNetMap = buildPinNetMap(pcb);
  let netName = options.net;
  if (!netName) {
    const firstPin = fromPins[0];
    debugLog(
      options.debug,
      chalk.blue(`[PCB] Attempting to infer net from pin ${firstPin.reference}.${firstPin.number}`),
    );
    if (firstPin.owner) {
      netName = pinNetMap.get(`${firstPin.owner.reference}:${String(firstPin.number)}`);
      if (netName) {
        debugLog(options.debug, chalk.green(`[PCB] ✓ Inferred net from pins: ${netName}`));
      } else {
        debugLog(options.debug, chalk.yellow(`[PCB] Could not find net for pin in schematic`));
      }
    }
  }

  // Resolve the net class (if any) for per-net dimensions. Falls back to
  // board rules when no class is assigned.
  const netClass = netName ? pcb.netClasses.netClassFor(netName) : undefined;
  if (netClass) {
    debugLog(
      options.debug,
      chalk.blue(
        `[PCB] Net '${netName}' resolved to net class: width=${netClass.track_width}mm clearance=${netClass.clearance}mm via=${netClass.via_diameter}/${netClass.via_drill}mm`,
      ),
    );
  }

  // ── 5. Resolve pin positions with layer preference ───────────────────
  // Explicit route() layers take precedence; otherwise a net-class preferred
  // layer anchors through-hole endpoints (which exist on every copper layer).
  const netClassPreferredLayer = netClass?.layers.find((l) => boardCopperLayers.includes(l) && !pcb.planeLayers.has(l));
  const preferredLayer = options.layers?.[0] ?? netClassPreferredLayer;

  const startResults = fromPins.map((pin) => {
    const result = PadResolver.getPadCenterWithFailure(pin, boardCopperLayers);
    if ('failure' in result) return { pos: null, failure: { pin, failure: result.failure } };
    let pos: { x: number; y: number; layer: string } | null = result;
    if (pos && preferredLayer && pin.owner) {
      const geometry = PadResolver.getPadGeometry(pin.owner, pin.number, boardCopperLayers);
      if (geometry && (geometry.type === 'thru_hole' || geometry.type === 'np_thru_hole')) {
        if (geometry.layers.includes(preferredLayer)) {
          pos = { ...pos, layer: preferredLayer };
        }
      }
    }
    return { pos, failure: null };
  });

  const endResults = toPins.map((pin) => {
    const result = PadResolver.getPadCenterWithFailure(pin, boardCopperLayers);
    if ('failure' in result) return { pos: null, failure: { pin, failure: result.failure } };
    let pos: { x: number; y: number; layer: string } | null = result;
    if (pos && preferredLayer && pin.owner) {
      const geometry = PadResolver.getPadGeometry(pin.owner, pin.number, boardCopperLayers);
      if (geometry && (geometry.type === 'thru_hole' || geometry.type === 'np_thru_hole')) {
        if (geometry.layers.includes(preferredLayer)) {
          pos = { ...pos, layer: preferredLayer };
        }
      }
    }
    return { pos, failure: null };
  });

  const startPositions = startResults.map((r) => r.pos);
  const endPositions = endResults.map((r) => r.pos);
  const fromFailures: IPinFailureDetail[] = startResults
    .filter((r): r is { pos: null; failure: IPinFailureDetail } => r.failure !== null)
    .map((r) => r.failure);
  const toFailures: IPinFailureDetail[] = endResults
    .filter((r): r is { pos: null; failure: IPinFailureDetail } => r.failure !== null)
    .map((r) => r.failure);

  if (fromFailures.length > 0 || toFailures.length > 0) {
    const err = new RoutingError(formatPinResolutionError(fromFailures, toFailures));
    err.stack = err.message;
    throw err;
  }

  const validStartPositions = startPositions.filter((p): p is { x: number; y: number; layer: string } => p !== null);
  const validEndPositions = endPositions.filter((p): p is { x: number; y: number; layer: string } => p !== null);

  // ── 5. Determine routing layers ──────────────────────────────────────
  const padLayers = new Set<string>();
  for (const pos of [...validStartPositions, ...validEndPositions]) {
    padLayers.add(pos.layer);
  }

  // Default to the board's declared copper layers, minus layers declared as
  // planes (pcb.plane()) — signal routing stays off plane layers unless the
  // caller explicitly asks for them.
  const planeLayers = pcb.planeLayers;
  const defaultSignalLayers = boardCopperLayers.filter((l) => !planeLayers.has(l));
  let routingLayers =
    options.layers || (defaultSignalLayers.length > 0 ? [...defaultSignalLayers] : [...boardCopperLayers]);

  if (options.layers && options.layers.length > 0) {
    const missingLayers = Array.from(padLayers).filter((l) => !options.layers!.includes(l));
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

  if (pcb.schematic && pcb.schematic.nodes) {
    for (const node of pcb.schematic.nodes) {
      if (node.nodes) {
        for (const schematicPin of node.nodes) {
          if (schematicPin.owner && !componentsFromPins.includes(schematicPin.owner)) {
            componentsFromPins.push(schematicPin.owner);
          }
        }
      }
    }
  }

  if (pcb.schematic && Array.isArray(pcb.schematic.components)) {
    for (const comp of pcb.schematic.components) {
      if (comp && !componentsFromPins.includes(comp)) {
        componentsFromPins.push(comp);
      }
    }
  }

  // Netless placed components: nothing else surfaces them before create()
  // stages the board, and a mid-corridor part the router cannot see gets
  // routed straight through (shorting its pads). The .pcb placement registry
  // covers every assigned component regardless of net membership.
  for (const comp of getPlacedComponents(pcb)) {
    if (!componentsFromPins.includes(comp) && !comp.dnp) {
      componentsFromPins.push(comp);
    }
  }

  debugLog(
    options.debug,
    chalk.blue(`[PCB] Found ${componentsFromPins.length} components from pins and schematic nets`),
  );

  // ── 6b. Placement-order sanity check ─────────────────────────────────
  // route() computes the path from the pads' CURRENT positions; tracks never
  // re-anchor when a late placement expression resolves at create(). Routing
  // before anything is placed captures the default (0, 0) position — the
  // trace lands at the origin, far from the component, and its staged
  // segments pollute the board bounds (everything keyed off typecad.board,
  // like zone bounds, shifts with them). Catch that and say the order.
  const state = getPcbState(pcb);
  {
    const netComponents: Component[] = [];
    for (const pin of [...fromPins, ...toPins]) {
      if (pin.owner && !netComponents.includes(pin.owner)) netComponents.push(pin.owner);
    }
    const atDefault = (c: Component) => {
      const pos = c.pcb;
      return typeof pos.x === 'number' && typeof pos.y === 'number' && pos.x === 0 && pos.y === 0 && pos.rotation === 0;
    };
    const unplaced = netComponents.filter(atDefault);
    const outlineBounds = state.getOutlineBounds();
    const originOutsideOutline =
      outlineBounds !== null &&
      !(0 >= outlineBounds.minX && 0 <= outlineBounds.maxX && 0 >= outlineBounds.minY && 0 <= outlineBounds.maxY);
    // Fire when every net component sits at the untouched default (routed
    // before any placement — even before an outline exists), or when an
    // outline provably excludes the origin a component still sits on.
    if (unplaced.length > 0 && (unplaced.length === netComponents.length || originOutsideOutline)) {
      const refs = unplaced.map((c) => c.reference || c.constructor.name).join(', ');
      logger.error(
        `[PCB] route() called out of order for net '${netName}': ${refs} ${unplaced.length === 1 ? 'sits' : 'sit'} at the default (0, 0) position — routing now captures that position and the trace will not follow the component when it is placed later.\n` +
          `       Required order: outline() → place components (.pcb = {...}) → route() → zone()/stitch() → create().`,
      );
    }
  }

  // Net-class layer affinity: prefer the class's declared layers for this
  // net. Explicit route() layers win; plane layers and layers not open for
  // routing are ignored (they're not in routingLayers).
  const netClassLayers = (netClass?.layers ?? []).filter((l) => routingLayers.includes(l));
  if (netClassLayers.length > 0) {
    debugLog(options.debug, chalk.blue(`[PCB] Net '${netName}' class prefers layers: ${netClassLayers.join(', ')}`));
  }

  // ── 8. Determine trace width ─────────────────────────────────────────
  let traceWidth = options.width;
  let powerInfo = options.powerInfo;
  let powerInfoSource = 'options';

  if (!traceWidth && !powerInfo) {
    const allPinsForPower = [...fromPins, ...toPins];
    for (const pin of allPinsForPower) {
      if (pin && pin.powerInfo && pin.powerInfo.current !== undefined) {
        powerInfo = { current: pin.powerInfo.current };
        powerInfoSource = 'pin';
        debugLog(
          options.debug,
          chalk.blue(
            `[PCB] Found power info on pin ${pin.owner?.reference || 'unknown'}.${pin.number}: ${powerInfo?.current}A`,
          ),
        );
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
      powerInfo.thickness || pcb.copper_thickness,
    );
    debugLog(
      options.debug,
      chalk.blue(
        `[PCB] Calculated trace width from power info: ${traceWidth.toFixed(3)}mm for ${powerInfo.current}A (source: ${powerInfoSource})`,
      ),
    );
  }

  if (powerInfo && !options.powerInfo) {
    options.powerInfo = powerInfo;
  }

  traceWidth = traceWidth ?? netClass?.track_width ?? pcb.rules.min_track_width;

  // ── 8b. Controlled impedance: widen the trace to hit the target ──────
  // Uses the board's resolved stackup geometry (JLCPCB preset or per-layer
  // overrides from pcb.stackup()); microstrip on outer layers, stripline on
  // inner ones. Only ever grows the width — never below the rules floor.
  // With a tolerance, the width snaps to a 0.01mm fabrication grid inside
  // the target band; if the rules floor then forces the trace outside the
  // band, warn with the achieved impedance.
  if (options.impedance) {
    const impedanceLayer = options.layers?.[0] ?? netClassLayers[0] ?? routingLayers[0];
    try {
      const zWidth = pcb.impedanceWidth(impedanceLayer, options.impedance.target, options.impedance.tolerance);
      if (zWidth > traceWidth) {
        traceWidth = zWidth;
      }
      if (options.impedance.tolerance !== undefined) {
        const geom = stackupImpedanceGeometry(pcb.stackupGeometry, impedanceLayer);
        if (geom) {
          const achievedZ = impedanceOfWidth(traceWidth, geom);
          const deviation = Math.abs(achievedZ - options.impedance.target);
          if (deviation > options.impedance.tolerance) {
            logger.warn(
              `[PCB] Impedance control: final width ${traceWidth.toFixed(3)}mm on ${impedanceLayer} yields ` +
                `${achievedZ.toFixed(1)}Ω — outside the requested ${options.impedance.target}±${options.impedance.tolerance}Ω band ` +
                `(the design-rule floor or a wider explicit width forced it)`,
            );
          }
          debugLog(
            options.debug,
            chalk.blue(
              `[PCB] Impedance control: ${options.impedance.target}±${options.impedance.tolerance}Ω on ${impedanceLayer} → ` +
                `${traceWidth.toFixed(3)}mm (${achievedZ.toFixed(1)}Ω achieved)`,
            ),
          );
        }
      } else {
        debugLog(
          options.debug,
          chalk.blue(
            `[PCB] Impedance control: ${options.impedance.target}Ω on ${impedanceLayer} → ${traceWidth.toFixed(3)}mm trace width`,
          ),
        );
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      logger.warn(`[PCB] Impedance target ${options.impedance.target}Ω on ${impedanceLayer} not applied: ${reason}`);
      debugLog(options.debug, chalk.yellow(`[PCB] ${reason}`));
    }
  }

  // ── 9. Determine clearance ───────────────────────────────────────────
  const baseClearance = options.clearance ?? netClass?.clearance ?? pcb.rules.min_clearance;
  const clearanceBuffer = Math.min(0.05, baseClearance * 0.25);
  const clearance = baseClearance + clearanceBuffer;

  // Via dimensions default to the net class (or board rules) so the same
  // per-net physical model governs vias. Power info may grow these later.
  options.viaSize = options.viaSize ?? netClass?.via_diameter ?? pcb.rules.min_via_diameter;
  options.viaDrill = options.viaDrill ?? netClass?.via_drill ?? pcb.rules.min_through_hole_diameter;

  // ── 10. Calculate board bounds ───────────────────────────────────────
  const { components: componentsForBounds, stagedComponents: stagedComponentsForBounds } = collectComponentsForBounds(
    pcb,
    componentsFromPins,
  );
  let bounds = calculateBoardBounds(componentsForBounds, pcb.outlines as IOutline[], stagedComponentsForBounds);

  const stagedOutlines = state.stagedOutlines;

  // The board edge. Outlines are staged until create(), so read Edge.Cuts
  // from both lists. When it closes, it bounds the grid (component-padded
  // bounds can stop short of the board or run far past it) and becomes an
  // absolute keepout below.
  const edgeElements = [...state.outlines, ...stagedOutlines].flatMap((o) => o.elements ?? []);
  const boardEdgeProbe = ObstacleBuilder.buildBoardEdge(edgeElements, 0, boardCopperLayers);
  if (boardEdgeProbe) {
    const pad = Math.max(1, (options.gridResolution ?? 0.1) * 4);
    bounds = {
      minX: boardEdgeProbe.bounds.minX - pad,
      maxX: boardEdgeProbe.bounds.maxX + pad,
      minY: boardEdgeProbe.bounds.minY - pad,
      maxY: boardEdgeProbe.bounds.maxY + pad,
    };
  }
  const requestedGridResolution = options.gridResolution ?? 0.1;
  const boundsExpansionMargin = Math.max(5, traceWidth * 8, clearance * 4, requestedGridResolution * 80);

  const expandedBounds = expandBoundsToIncludeTracks(
    bounds,
    Array.isArray(state.grLines) ? (state.grLines as IGrLine[]) : [],
    stagedOutlines,
    boundsExpansionMargin,
  );

  const pinExpansionMargin = requestedGridResolution * 2;
  for (const pos of [...validStartPositions, ...validEndPositions]) {
    if (pos.x - pinExpansionMargin < expandedBounds.minX) expandedBounds.minX = pos.x - pinExpansionMargin;
    if (pos.x + pinExpansionMargin > expandedBounds.maxX) expandedBounds.maxX = pos.x + pinExpansionMargin;
    if (pos.y - pinExpansionMargin < expandedBounds.minY) expandedBounds.minY = pos.y - pinExpansionMargin;
    if (pos.y + pinExpansionMargin > expandedBounds.maxY) expandedBounds.maxY = pos.y + pinExpansionMargin;
  }
  const boundsChanged =
    expandedBounds.minX !== bounds.minX ||
    expandedBounds.maxX !== bounds.maxX ||
    expandedBounds.minY !== bounds.minY ||
    expandedBounds.maxY !== bounds.maxY;
  bounds = expandedBounds;

  if (boundsChanged) {
    debugLog(
      options.debug,
      chalk.blue(
        `[PCB] Expanded routing bounds to (${bounds.minX}, ${bounds.minY}) - (${bounds.maxX}, ${bounds.maxY}) to include existing tracks`,
      ),
    );
  }
  debugLog(
    options.debug,
    chalk.blue(`[PCB] Board bounds: (${bounds.minX}, ${bounds.minY}) to (${bounds.maxX}, ${bounds.maxY})`),
  );

  // Physical feasibility screen before any search work: pads whose escape
  // channel cannot fit the trace tell the user NOW, with numbers, instead
  // of surfacing as a wall of DRC clearance violations after the build.
  warnNarrowEscapeChannels([...fromPins, ...toPins], traceWidth, clearance, pinNetMap);

  // ── 11. Build routing grid ───────────────────────────────────────────
  let gridResolution = requestedGridResolution;

  try {
    const padSummaries = collectPadSummariesForRouting(componentsFromPins, boardCopperLayers);
    const gridConfig = configureGridResolution({
      requestedResolution: requestedGridResolution,
      defaultResolution: 0.1,
      pads: padSummaries,
    });

    if (gridConfig && typeof gridConfig.gridResolution === 'number' && gridConfig.gridResolution > 0) {
      const reasonText = gridConfig.reason ? ` (${gridConfig.reason})` : '';
      debugLog(
        options.debug,
        chalk.yellow(`[PCB] Router selected grid resolution ${gridConfig.gridResolution}mm${reasonText}`),
      );
      gridResolution = gridConfig.gridResolution;
    }
  } catch (error: unknown) {
    debugLog(options.debug, chalk.yellow(`[PCB] Grid configurator threw: ${getErrorMessage(error)}`));
  }

  const grid = new RoutingGrid(bounds, gridResolution, routingLayers, options.debug);

  // ── 12. Add obstacles ────────────────────────────────────────────────
  const obstacles = ObstacleBuilder.buildFromPCB(pcb, clearance, componentsFromPins, options.debug, pinNetMap);
  const allObstacles: IRoutingObstacle[] = [];
  // Coarse grids handed to the router for resume-grid rerouting. They must
  // see every obstacle added after they were built (manual routes, tracks
  // staged by earlier pairwise connections) — otherwise a coarse reroute can
  // overlap copper that only the fine grid knows about.
  const coarseGridCache = new Map<number, RoutingGrid>();
  const addObstacleToState = (obs: IRoutingObstacle) => {
    allObstacles.push(obs);
    grid.addObstacle(obs);
    coarseGridCache.forEach((coarseGrid) => coarseGrid.addObstacle(obs));
  };

  obstacles.forEach(addObstacleToState);

  // Copper-to-edge rule: grid clearance is centre-to-copper, so the keepout
  // is the rule plus the widest copper radius this route can place.
  if (boardEdgeProbe) {
    const copperRadius = Math.max(traceWidth / 2, options.allowVias === false ? 0 : (options.viaSize ?? 0) / 2);
    addObstacleToState({ ...boardEdgeProbe, clearance: pcb.rules.min_copper_edge_clearance + copperRadius });
  }

  const stats = grid.getStats();
  debugLog(
    options.debug,
    chalk.blue(`[PCB] Grid stats: ${stats.occupiedCells} occupied cells (${stats.occupancyPercent.toFixed(1)}%)`),
  );

  // ── 13. Collect free via locations ───────────────────────────────────
  const freeViaLocations: { x: number; y: number }[] = [];

  if (netName && pcb.schematic && pcb.schematic.nodes) {
    const schematicNode = pcb.schematic.nodes.find((node: ISchematicNode) => node.name === netName);
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
  debugLog(
    options.debug,
    chalk.blue(
      `[PCB] Identified ${freeViaLocations.length} through-hole pad locations as free via points for net ${netName || 'unknown'}`,
    ),
  );

  if (netName) {
    const manualViaLocations = collectManualViaFreeLocations(pcb, netName);
    if (manualViaLocations.length > 0) {
      let addedManual = 0;
      manualViaLocations.forEach((loc) => {
        const alreadyPresent = freeViaLocations.some(
          (existing) => Math.abs(existing.x - loc.x) < 1e-6 && Math.abs(existing.y - loc.y) < 1e-6,
        );
        if (!alreadyPresent) {
          freeViaLocations.push(loc);
          addedManual++;
        }
      });
      if (addedManual > 0) {
        debugLog(
          options.debug,
          chalk.blue(`[PCB] Added ${addedManual} manual via location(s) as free via points for net ${netName}`),
        );
      }
    }
  }

  // ── 14. Build coarse grid factory and base router options ────────────
  const buildCoarseGrid = (resolution: number) => {
    const cached = coarseGridCache.get(resolution);
    if (cached) return cached;
    const coarseGrid = new RoutingGrid(bounds, resolution, routingLayers, options.debug);
    allObstacles.forEach((obs) => coarseGrid.addObstacle(obs));
    coarseGridCache.set(resolution, coarseGrid);
    return coarseGrid;
  };

  // Every via already staged on the board (any net): via placement keeps
  // hole-to-hole spacing against all of them — drill edges need clearance
  // even between same-net vias. Snapshotted per call, so rip-up rollbacks
  // (which un-stage vias) are reflected on the next call.
  const existingVias: Array<{ x: number; y: number; drill: number }> = [];
  for (const comp of getPcbState(pcb).stagedComponents) {
    if (comp.via === true && comp.viaData?.at && typeof comp.viaData.at.x === 'number') {
      existingVias.push({
        x: comp.viaData.at.x,
        y: comp.viaData.at.y,
        drill: comp.viaData.drill ?? 0.3,
      });
    }
  }

  const baseRouterOptions = {
    traceWidth,
    clearance,
    viaClearance: options.viaClearance,
    viaSize: options.viaSize,
    existingVias,
    allowedLayers: routingLayers,
    preferredLayers: options.layers ?? (netClassLayers.length > 0 ? netClassLayers : undefined),
    viaCost: options.viaCost,
    // Under blind/buried vias the manufactured span depth is the real via
    // cost, so the router weighs transitions by layer boundaries crossed.
    ...(pcb.viaPolicyConfig.type === 'blind-buried' ? { layerOrder: [...boardCopperLayers] } : {}),
    bendCost: options.bendCost,
    maxIterations: options.maxIterations,
    timeBudgetMs: options.timeBudgetMs,
    netTimeBudgetMs: options.netTimeBudgetMs,
    allowVias: options.allowVias,
    impedance: options.impedance,
    freeViaLocations,
    heuristicWeight: options.heuristicWeight,
    requestedGridResolution: gridResolution,
    resumeGridResolution: gridResolution,
    coarseGridFactory: buildCoarseGrid,
    gridObstacles: allObstacles,
    gridBounds: bounds,
    debug: options.debug,
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
    pinNetMap,
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
  // Manual-route obstacles flow through addObstacleToState, which also
  // syncs them into any cached coarse grids — no cache reset needed.
  const { manuallyRoutedPinPairs, manualRouteDataMap } = processManualRoutes(
    pcb,
    options,
    allPins,
    traceWidth,
    clearance,
    netName,
    addObstacleToState,
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
  debugLog(
    options.debug,
    chalk.blue(
      `[PCB] Staging ${result.length} TrackBuilder(s) with ${result.reduce((sum, builder) => sum + builder.getElements().length, 0)} total elements`,
    ),
  );
  for (let i = 0; i < result.length; i++) {
    const builder = result[i];
    const elements = builder.getElements();
    if (builder.deferStaging && elements.length > 0) {
      debugLog(
        options.debug,
        chalk.gray(`[PCB] Staging builder ${i} with ${elements.length} elements (deferStaging=true)`),
      );
      for (const el of elements) {
        if (el.type === 'track' && el.details) {
          const trackDetails = el.details as ITrackDetails;
          debugLog(
            options.debug,
            chalk.gray(
              `[PCB] Staging track: (${trackDetails.start.x.toFixed(3)}, ${trackDetails.start.y.toFixed(3)}) -> (${trackDetails.end.x.toFixed(3)}, ${trackDetails.end.y.toFixed(3)})`,
            ),
          );
          pcbTrackSegment(
            pcb,
            trackDetails.start,
            trackDetails.end,
            trackDetails.width,
            trackDetails.layer,
            trackDetails.locked || false,
            el.uuid,
            builder.net,
          );
        }
      }
    } else if (builder.deferStaging) {
      debugLog(options.debug, chalk.gray(`[PCB] Skipping builder ${i} (deferStaging=true but no elements)`));
    } else {
      debugLog(options.debug, chalk.gray(`[PCB] Skipping builder ${i} (deferStaging=false)`));
    }
  }

  // ── 20. Report results ───────────────────────────────────────────────
  debugLog(
    options.debug,
    chalk.gray(
      `[PCB][DEBUG] After processing track builders: stagedOutlines=${state.stagedOutlines.length}, tracks=${pcb.tracks.length}, outlines_public=${state.outlines.length}`,
    ),
  );
  if (options.debug && state.stagedOutlines.length > 0) {
    try {
      const sample = state.stagedOutlines.slice(0, 5).map((o: IOutline) => ({
        uuid: o.uuid,
        elements: o.elements.map((el) => {
          const typedEl = el as unknown as OutlineElement & {
            details?: { layer?: string; start?: { x: number; y: number }; end?: { x: number; y: number } };
          };
          return {
            type: typedEl.type,
            layer: typedEl.layer ?? typedEl.details?.layer,
            start: typedEl.details?.start,
            end: typedEl.details?.end,
          };
        }),
      }));
      logger.debug('[PCB][DEBUG] stagedOutlines sample:', JSON.stringify(sample, null, 2));
    } catch (e) {
      logger.debug('[PCB][DEBUG] failed to stage debug visualization', e);
    }
  }

  const successCount = routeDetails.filter((d) => d.success).length;
  const failureCount = routeDetails.length - successCount;
  const overallSuccess = successCount === routeDetails.length;

  debugLog(
    options.debug,
    chalk[overallSuccess ? 'green' : 'yellow'](
      `[PCB] Autoroute complete: ${successCount}/${routeDetails.length} routes successful`,
    ),
  );

  if (failureCount > 0) {
    // Every failed route is named at the default log level: which pin pair,
    // why it failed, and which nets' copper was in the way (when known).
    // "Some routes failed" alone leaves the user bisecting widths blind.
    for (const detail of routeDetails) {
      if (detail.success) continue;
      const pair =
        detail.fromLabel && detail.toLabel
          ? `Route ${detail.fromLabel} -> ${detail.toLabel}`
          : `Route on net '${netName ?? 'unknown'}'`;
      const errorMsg = detail.error || 'no path found';
      const blockedBy = detail.path?.blockedBy?.length ? ` (blocked by: ${[...new Set(detail.path.blockedBy)].join(', ')})` : '';
      logger.warn(chalk.red(`[PCB] ${pair} failed: ${errorMsg}${blockedBy}`));
    }

    logger.warn(
      `[PCB] WARNING: Some routes failed. Check routing constraints and available space${formatCallSite(getCallSite())}`,
    );
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
        options.debug,
      );
    } catch (error: unknown) {
      logger.warn(`[PCB] Failed to generate debug visualization: ${getErrorMessage(error)}`);
    }
  }

  // ── 22. Add provided routes not yet added ────────────────────────────
  if (providedRoutes.length > 0) {
    debugLog(options.debug, chalk.blue(`[PCB] Checking ${providedRoutes.length} provided route(s)...`));
    for (const routeItem of providedRoutes) {
      let path: IRoutePath;
      if (isAutorouteResultRouteItem(routeItem)) {
        path = routeItem.routeDetails[0].path!;
      } else {
        path = routeItem;
      }

      const alreadyAdded = routeDetails.some((detail) => detail.path === path);

      if (!alreadyAdded) {
        debugLog(options.debug, chalk.blue(`[PCB] Provided route was not used during routing, adding it now`));

        if (isAutorouteResultRouteItem(routeItem)) {
          for (const tb of routeItem) {
            result.push(tb);
            const elements = tb.getElements();
            for (const el of elements) {
              if (el.type === 'track' && el.details && 'start' in el.details) {
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
          debugLog(
            options.debug,
            chalk.blue(`[PCB] Reused ${routeItem.length} existing TrackBuilder(s) from provided route`),
          );
        } else {
          // Provided routes pass the same geometric gate — user-supplied or
          // not, copper that shorts two nets never reaches the board.
          if (path.success) {
            const violations = validatePathGeometrically(
              path,
              { allObstacles, options, traceWidth, clearance },
              netName,
            );
            if (violations.length > 0) {
              logger.warn(`[PCB] Provided route: ${formatRejection(violations)}`);
              path = { ...path, success: false, error: formatRejection(violations) };
            }
          }
          const track = path.success
            ? pathToTrackBuilder(pcb, path, traceWidth, options, netName, freeViaLocations)
            : undefined;
          if (track) {
            result.push(track);
          }
        }

        const metadata: import('./pcb_interfaces.js').IRouteMetadata = {
          length: path.length,
          viaCount: path.viaCount,
          layers: [...new Set<string>(path.nodes.map((n) => n.layer))],
          success: path.success,
          error: path.error,
          path: path,
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
      logger.warn(`[PCB] Length matching requested but @typecad/pcb-astar is not installed. Skipping length matching.`);
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
        locked: options.locked || false,
      };

      const lengthMatchResult = LengthMatcher.apply(
        lengthMatchContext,
        routeDetails.map((rd) => ({ path: rd.path!, success: rd.success })),
        routeTrackBuilders as (ITrackBuilder[] | undefined)[],
        options.lengthMatch,
      );

      for (const update of lengthMatchResult.updates) {
        if (routeDetails[update.index]) {
          routeDetails[update.index].length = update.newLength;
          if (routeDetails[update.index].path) {
            routeDetails[update.index].path!.length = update.newLength;
          }
        }
      }

      result.push(...(lengthMatchResult.builders as TrackBuilder[]));

      debugLog(
        options.debug,
        chalk.green(
          `[PCB] Length matching applied: ${lengthMatchResult.updates.length} routes updated, ${lengthMatchResult.builders.length} new tracks added`,
        ),
      );
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      debugLog(options.debug, chalk.yellow(`[PCB] Length matching failed: ${msg}`));
      logger.warn(`[PCB] WARNING: Length matching failed, continuing without it: ${msg}`);
    }
  }

  // ── 24. Return result ────────────────────────────────────────────────
  const autorouteResult = result as IAutorouteResult;
  autorouteResult.success = overallSuccess;
  autorouteResult.routeCount = routeDetails.length;
  autorouteResult.completedCount = successCount;
  autorouteResult.routeDetails = routeDetails;
  PadResolver.clearParseCache();
  return autorouteResult;
}
