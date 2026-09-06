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
  IOutline,
} from './pcb_interfaces.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';
import logger from '../utils/logging.js';
import type { BoardBounds } from './pcb_routing_calculations.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { RoutingGrid } from '../routing/shared/routing_grid.js';
import type { IRoutingOptions } from '../routing/router/types.js';
import { PcbInternalState } from './pcb_state.js';
import { PCB, getPcbState } from './pcb.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Shared context for routing sub-modules. */
export interface AutorouteContext {
  pcb: PCB;
  options: IAutorouteOptions;
  fromPins: Pin[];
  toPins: Pin[];
  validStartPositions: { x: number; y: number; layer: string }[];
  validEndPositions: { x: number; y: number; layer: string }[];
  allPins: Pin[];
  netName: string | undefined;
  /** Schematic pin (`reference:number`) → net name, built once per call. */
  pinNetMap: Map<string, string>;
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
    allPaths: [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a `reference:pinNumber` → net-name map from the schematic in one
 * pass. Replaces the nested per-pin scans that used to run in autoroute()
 * net inference, MST single-net detection, and per-pair net resolution.
 */
export function buildPinNetMap(pcb: PCB): Map<string, string> {
  const map = new Map<string, string>();
  const schematic = pcb.schematic;
  if (!schematic || !Array.isArray(schematic.nodes)) {
    return map;
  }
  for (const schematicNode of schematic.nodes) {
    const netName = schematicNode?.name;
    const pins = schematicNode?.nodes as Array<{ reference: string; number: string | number }> | undefined;
    if (!netName || !Array.isArray(pins)) continue;
    for (const p of pins) {
      const key = `${p.reference}:${String(p.number)}`;
      if (!map.has(key)) {
        map.set(key, netName);
      }
    }
  }
  return map;
}

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

export function collectComponentsForBounds(
  pcb: PCB,
  netComponents: Component[],
): {
  components: Component[];
  stagedComponents: Component[];
} {
  const state = getPcbState(pcb);
  const componentSet = new Set<Component>(netComponents);
  state.components.forEach((comp) => componentSet.add(comp));

  return {
    components: Array.from(componentSet),
    stagedComponents: [...state.stagedComponents],
  };
}

/** Expand board bounds to include existing tracks and staged outlines. */
export function expandBoundsToIncludeTracks(
  bounds: BoardBounds,
  tracks: IGrLine[] | undefined,
  stagedOutlines: IOutline[] | undefined,
  margin: number,
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

  (tracks ?? []).forEach((line) => considerLine(line));

  (stagedOutlines ?? []).forEach((outline) => {
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
export function collectPadSummariesForRouting(
  components: Component[],
  boardCopperLayers?: readonly string[],
): {
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
    const padGeometries = PadResolver.getAllPadGeometries(comp, boardCopperLayers);
    for (const pad of padGeometries) {
      pads.push({
        componentRef: pad.componentRef ?? comp.reference,
        size: { width: pad.size.width, height: pad.size.height },
        type: pad.type,
        layers: pad.layers,
      });
    }
  }

  return pads;
}
