/**
 * Core routing functions extracted from pcb.ts
 * Contains standalone geometric and utility functions for PCB routing operations
 */

import {
  IGrLine,
  IOutline,
  IAutorouteResult,
  IAutorouteRouteOptions,
  IAutorouteOptions,
  IRoutePath,
} from './pcb_interfaces.js';
import { TrackBuilder } from './pcb_track_builder.js';
import { autoroute } from './pcb_autoroute.js';
import { validatePin } from './pcb_routing_helpers.js';
import { Pin } from '../pin.js';
import chalk from 'chalk';
import logger from '../utils/logging.js';
import { ISchematicNetDefinition } from '../net_manager.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatCallSite } from './pcb_utils.js';
import { RoutingError } from '../utils/errors.js';
import { displayName, formatSourceError } from '../utils/error_reporter.js';
import { calculateMinViaSize as calculateMinimumViaSize } from './pcb_routing_calculations.js';
import { teardropWedge } from './pcb_teardrops.js';
import { debugLog } from './pcb_autoroute_helpers.js';
import type { PCB } from './pcb.js';
import { getPcbState } from './pcb.js';
import type { ISchematicNode } from '../types/schematic_types.js';

type SchematicRuntimeNode = ISchematicNode & {
  owner: { reference?: string; pins: Pin[] } | null;
};

/**
 * Check if a point lies on (or very near) a line segment, within a tolerance
 * derived from the segment width.
 *
 * @param p - The point to check
 * @param line - The line segment to check against
 * @param widthTol - Width-based tolerance for distance calculation
 * @returns True if the point lies on or near the line segment
 */
export function pointOnLineSegment(p: { x: number; y: number }, line: IGrLine, widthTol: number): boolean {
  // Quick bounding box reject with padding
  const pad = widthTol / 2 + 1e-3;
  const minX = Math.min(line.start.x, line.end.x) - pad;
  const maxX = Math.max(line.start.x, line.end.x) + pad;
  const minY = Math.min(line.start.y, line.end.y) - pad;
  const maxY = Math.max(line.start.y, line.end.y) + pad;
  if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;

  // Compute distance from point to segment
  const ax = line.start.x,
    ay = line.start.y;
  const bx = line.end.x,
    by = line.end.y;
  const vx = bx - ax,
    vy = by - ay;
  const wx = p.x - ax,
    wy = p.y - ay;
  const vlen2 = vx * vx + vy * vy;
  if (vlen2 === 0) {
    // Degenerate segment: treat as point
    const dx = p.x - ax,
      dy = p.y - ay;
    return Math.hypot(dx, dy) <= widthTol / 2 + 1e-3;
  }
  let t = (wx * vx + wy * vy) / vlen2;
  t = Math.max(0, Math.min(1, t));
  const projx = ax + t * vx;
  const projy = ay + t * vy;
  const dist = Math.hypot(p.x - projx, p.y - projy);
  return dist <= widthTol / 2 + 1e-3;
}

/**
 * Subtract overlapping portions of a straight segment against existing same-net tracks.
 * Returns a list of non-overlapping subsegments to emit.
 * Only handles collinear overlaps (axis-aligned or 45-degree) which is typical for our paths.
 *
 * @param start - Starting point of the segment
 * @param end - Ending point of the segment
 * @param layer - Layer name to check for overlaps
 * @param net - Net name to filter tracks
 * @param newWidth - Width of the new segment
 * @param existingLines - Array of existing lines on the same layer/net
 * @returns Array of non-overlapping subsegments
 */
export function subtractOverlapsFromSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  layer: string,
  net: string | undefined,
  newWidth: number,
  existingLines: IGrLine[],
): { start: { x: number; y: number }; end: { x: number; y: number } }[] {
  if (!net) {
    return [{ start, end }];
  }

  // Filter existing same-net lines on this layer
  const lines = existingLines.filter((l) => l.layer === layer && l.net === net);

  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const vlen2 = vx * vx + vy * vy;
  if (vlen2 === 0) return [];

  const eps = 1e-9;
  const covers: { a: number; b: number }[] = [];

  // Helper: check if a point lies near the infinite line of (start,end) within width-based tolerance
  const pointCollinear = (p: { x: number; y: number }, widthTol: number) => {
    const wx = p.x - start.x;
    const wy = p.y - start.y;
    const cross = wx * vy - wy * vx; // cross product z for 2D
    const vlen = Math.sqrt(vlen2);
    const dist = Math.abs(cross) / (vlen || 1);
    return dist <= widthTol / 2 + 0.01;
  };

  for (const l of lines) {
    // Quick layer/net matched already; check collinearity to main segment
    const widthTol = Math.max(l.strokeWidth, newWidth);
    if (!pointCollinear(l.start, widthTol) || !pointCollinear(l.end, widthTol)) {
      continue;
    }

    // Project endpoints of l onto [start,end] to get param t in [0,1]
    const projT = (p: { x: number; y: number }) => {
      const wx = p.x - start.x;
      const wy = p.y - start.y;
      return (wx * vx + wy * vy) / vlen2;
    };

    let t1 = projT(l.start);
    let t2 = projT(l.end);
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    // Clip to [0,1]
    t1 = Math.max(0, Math.min(1, t1));
    t2 = Math.max(0, Math.min(1, t2));
    if (t2 - t1 <= eps) continue;
    covers.push({ a: t1, b: t2 });
  }

  if (covers.length === 0) {
    return [{ start, end }];
  }

  // Merge intervals
  covers.sort((p, q) => p.a - q.a);
  const merged: { a: number; b: number }[] = [];
  for (const c of covers) {
    if (merged.length === 0 || c.a > merged[merged.length - 1].b + eps) {
      merged.push({ ...c });
    } else {
      merged[merged.length - 1].b = Math.max(merged[merged.length - 1].b, c.b);
    }
  }

  // Subtract merged coverage from [0,1]
  const result: { start: { x: number; y: number }; end: { x: number; y: number } }[] = [];
  let t = 0;
  const toPoint = (tt: number) => ({ x: start.x + vx * tt, y: start.y + vy * tt });
  for (const m of merged) {
    if (m.a > t + eps) {
      const s = toPoint(t);
      const e = toPoint(m.a);
      if (Math.hypot(e.x - s.x, e.y - s.y) > 1e-6) {
        result.push({ start: s, end: e });
      }
    }
    t = Math.max(t, m.b);
  }
  if (t < 1 - eps) {
    const s = toPoint(t);
    const e = toPoint(1);
    if (Math.hypot(e.x - s.x, e.y - s.y) > 1e-6) {
      result.push({ start: s, end: e });
    }
  }

  return result;
}

/**
 * Check if a straight segment lies entirely on an existing same-net track
 * (either already committed or currently staged).
 * Used to avoid duplicating tracks when connecting into pre-routed trunks.
 *
 * @param start - Starting point of the segment
 * @param end - Ending point of the segment
 * @param layer - Layer name to check
 * @param net - Net name to filter tracks
 * @param newWidth - Width of the new segment
 * @param existingLines - Array of existing lines on the same layer/net
 * @param stagedOutlines - Array of staged outlines containing additional lines
 * @returns True if the segment lies entirely on existing same-net tracks
 */
export function segmentFullyOnExistingSameNetTrack(
  start: { x: number; y: number },
  end: { x: number; y: number },
  layer: string,
  net: string | undefined,
  newWidth: number,
  existingLines: IGrLine[],
  stagedOutlines: IOutline[],
): boolean {
  if (!net) return false;

  const lines: IGrLine[] = [];

  // Committed tracks
  for (const l of existingLines) {
    if (l.layer === layer && l.net === net) lines.push(l);
  }

  // Staged tracks
  for (const outline of stagedOutlines) {
    if (outline.elements) {
      for (const el of outline.elements) {
        if (el.type === 'line') {
          const l = el as IGrLine;
          if (l.layer === layer && l.net === net) lines.push(l);
        }
      }
    }
  }

  // Check if both endpoints lie on the same existing track segment
  for (const l of lines) {
    if (
      pointOnLineSegment(start, l, Math.max(l.strokeWidth, newWidth)) &&
      pointOnLineSegment(end, l, Math.max(l.strokeWidth, newWidth))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate minimum via size based on current carrying requirements.
 * @param current - Current in amps
 * @param thickness - Copper thickness in microns (defaults to 35)
 * @returns Object with size and drill dimensions in millimeters
 */
function calculateMinViaSize(current: number, thickness?: number): { size: number; drill: number } {
  return calculateMinimumViaSize(current, thickness);
}

/**
 * Resolve the via span for a router layer transition under the board's via
 * policy (see `pcb.viaPolicy()`).
 *
 * - `through` (default): always `['F.Cu', 'B.Cu']` — a through via's barrel
 *   touches every copper layer, so it connects any transition pair and is
 *   the cheapest to manufacture.
 * - `blind-buried`: the exact transition pair, unless its span depth (layer
 *   boundaries crossed in the board's stack order) exceeds `maxSpan`
 *   (default 2) or either layer is unknown, in which case fall back to a
 *   through via.
 */
export function resolveViaSpan(pcb: PCB, from: string, to: string): string[] {
  const policy = pcb.viaPolicyConfig;
  if (policy.type === 'through') {
    return ['F.Cu', 'B.Cu'];
  }
  const maxSpan = policy.maxSpan ?? 2;
  const copperLayers = pcb.copperLayers;
  const fromIdx = copperLayers.indexOf(from);
  const toIdx = copperLayers.indexOf(to);
  if (fromIdx !== -1 && toIdx !== -1 && Math.abs(fromIdx - toIdx) <= maxSpan) {
    return [from, to];
  }
  return ['F.Cu', 'B.Cu'];
}

/**
 * Convert a routing path to a TrackBuilder instance.
 * This standalone function converts path nodes into track segments and vias.
 *
 * @param pcb - The PCB instance (provides access to track() method and internal state)
 * @param path - The routing path to convert
 * @param width - Track width for the path
 * @param options - Autorouting options including lock settings and power info
 * @param net - Net name for the tracks
 * @param freeViaLocations - Optional array of XY coordinates where vias should be skipped (through-hole pads)
 * @param deferStaging - Whether to defer staging the tracks
 * @returns TrackBuilder instance or null if path is too short
 */
export function pathToTrackBuilder(
  pcb: PCB,
  path: IRoutePath,
  width: number,
  options: IAutorouteOptions,
  net?: string,
  freeViaLocations?: { x: number; y: number }[],
  deferStaging?: boolean,
): TrackBuilder | null {
  const state = getPcbState(pcb);
  if (path.nodes.length < 2) {
    return null;
  }

  const track = pcb.track({ locked: options.locked, net, deferStaging, debug: options.debug });

  // Start at first node
  const firstNode = path.nodes[0];
  track.from(firstNode, firstNode.layer, width);

  // Add power info if provided
  if (options.powerInfo) {
    track.powerInfo(options.powerInfo);
  }

  // Simplify path by merging collinear segments on the same layer
  // Use gridNodes if available for more accurate direction detection
  const useGridNodes = path.gridNodes && path.gridNodes.length === path.nodes.length;
  const eps = 1e-6;
  let segmentStart = { ...firstNode };
  let lastDir: { dx: number; dy: number } | null = null;
  const placedViaKeys = new Set<string>();
  const viaJunctions: Array<{
    at: { x: number; y: number };
    inLayer: string;
    inFrom: { x: number; y: number } | null;
    outLayer: string;
    outTo: { x: number; y: number } | null;
    viaSize: number;
  }> = [];

  // Helper function to collect existing lines for overlap detection
  const getExistingLines = (grLines: IGrLine[], stagedOutlines: IOutline[]): IGrLine[] => {
    const existingLines: IGrLine[] = [];

    // Add lines from grLines
    existingLines.push(...grLines);

    // Add lines from stagedOutlines
    for (const outline of stagedOutlines) {
      if (outline.elements) {
        for (const el of outline.elements) {
          if (el.type === 'line') {
            existingLines.push(el as IGrLine);
          }
        }
      }
    }

    return existingLines;
  };

  const coordKey = (x: number, y: number) => `${Math.round(x * 100)}:${Math.round(y * 100)}`; // 0.01mm buckets
  const freeViaKeySet = new Set((freeViaLocations ?? []).map((loc) => coordKey(loc.x, loc.y)));

  for (let i = 1; i < path.nodes.length; i++) {
    const prevNode = path.nodes[i - 1];
    const node = path.nodes[i];

    // Handle via (layer change at the same XY)
    if (node.layer !== prevNode.layer) {
      // Commit current segment up to prevNode if we have movement
      if (Math.abs(prevNode.x - segmentStart.x) > eps || Math.abs(prevNode.y - segmentStart.y) > eps) {
        // When manual routes are present, trim away any portions of this segment
        // that overlap existing same-net copper, and only emit the non-overlapping parts.
        if (options.routes && options.routes.length > 0) {
          const existingLines = getExistingLines(state.grLines, state.stagedOutlines);
          const subSegments = subtractOverlapsFromSegment(
            { x: segmentStart.x, y: segmentStart.y },
            { x: prevNode.x, y: prevNode.y },
            prevNode.layer,
            net,
            width,
            existingLines,
          );
          for (const seg of subSegments) {
            // Start new segment at seg.start to avoid drawing overlapped portion
            track
              .from({ x: seg.start.x, y: seg.start.y }, prevNode.layer, width)
              .to({ x: seg.end.x, y: seg.end.y, layer: prevNode.layer, width });
          }
        } else {
          // Avoid duplicating existing same-net tracks: if the entire segment
          // lies on an existing track on the same layer/net, skip emitting it.
          const onExisting = segmentFullyOnExistingSameNetTrack(
            { x: segmentStart.x, y: segmentStart.y },
            { x: prevNode.x, y: prevNode.y },
            prevNode.layer,
            net,
            width,
            state.grLines,
            state.stagedOutlines,
          );
          if (!onExisting) {
            track.to({ x: prevNode.x, y: prevNode.y, layer: prevNode.layer, width });
          }
        }
      }

      // Check if this layer change occurs at a free via location (through-hole pad)
      const viaMatchTolerance = Math.max(0.02, width * 0.5);
      let isFreeVia = false;
      if (freeViaKeySet.size > 0) {
        isFreeVia = freeViaKeySet.has(coordKey(prevNode.x, prevNode.y)) || freeViaKeySet.has(coordKey(node.x, node.y));
      }
      if (!isFreeVia && freeViaLocations && freeViaLocations.length > 0) {
        isFreeVia = freeViaLocations.some((loc) => {
          const distPrev = Math.hypot(loc.x - prevNode.x, loc.y - prevNode.y);
          const distNext = Math.hypot(loc.x - node.x, loc.y - node.y);
          return distPrev <= viaMatchTolerance && distNext <= viaMatchTolerance;
        });
      }

      if (!isFreeVia) {
        const viaKey = `${prevNode.x.toFixed(4)}:${prevNode.y.toFixed(4)}:${[prevNode.layer, node.layer].sort().join('>')}`;
        if (placedViaKeys.has(viaKey)) {
        } else {
          // Via dimensions default to the net class / board rules
          // (threaded in via options); power info may grow them.
          let viaSize = options.viaSize ?? 0.6;
          let viaDrill = options.viaDrill ?? 0.3;

          if (options.powerInfo) {
            const minViaSize = calculateMinViaSize(options.powerInfo.current, options.powerInfo.thickness ?? 35);

            // Round to nearest 0.05mm and use calculated values if they're larger
            const calculatedSize = Math.round(minViaSize.size * 20) / 20; // Round to 0.05mm
            const calculatedDrill = Math.round(minViaSize.drill * 20) / 20; // Round to 0.05mm
            viaSize = Math.max(viaSize, calculatedSize);
            viaDrill = Math.max(viaDrill, calculatedDrill);

            if (options.debug) {
              logger.debug(
                `[pathToTrackBuilder] Power-aware via: ${viaSize.toFixed(2)}mm/${viaDrill.toFixed(2)}mm (${options.powerInfo.current}A)`,
              );
            }
          }

          // Via span follows the board's via policy: through vias
          // by default; blind/buried spans only when opted in and
          // within the span limit.
          track.via({
            size: viaSize,
            drill: viaDrill,
            layers: resolveViaSpan(pcb, prevNode.layer, node.layer),
            net: net,
          });
          placedViaKeys.add(viaKey);
          // Junction recorded for teardrop geometry (emitted after the
          // main path so the wedge builder never disturbs track state).
          // prevNode shares the via XY; incoming track comes from i-2 on
          // prevNode.layer, outgoing continues to i+1 on node.layer.
          const before = i >= 2 ? path.nodes[i - 2] : null;
          const after = i + 1 < path.nodes.length ? path.nodes[i + 1] : null;
          viaJunctions.push({
            at: { x: node.x, y: node.y },
            inLayer: prevNode.layer,
            inFrom: before ? { x: before.x, y: before.y } : null,
            outLayer: node.layer,
            outTo: after ? { x: after.x, y: after.y } : null,
            viaSize,
          });
        }
      }

      // Start new segment on the new layer from current node
      segmentStart = { ...node };
      lastDir = null;
      continue;
    }

    // Same layer: compute direction
    let dir: { dx: number; dy: number };

    if (useGridNodes) {
      // Use grid coordinates for precise direction detection (avoids floating point issues)
      const prevGridNode = path.gridNodes![i - 1];
      const gridNode = path.gridNodes![i];
      const gdx = gridNode.gridX - prevGridNode.gridX;
      const gdy = gridNode.gridY - prevGridNode.gridY;
      dir = {
        dx: gdx === 0 ? 0 : gdx > 0 ? 1 : -1,
        dy: gdy === 0 ? 0 : gdy > 0 ? 1 : -1,
      };
    } else {
      // Fall back to world coordinates if grid nodes not available
      const dx = node.x - prevNode.x;
      const dy = node.y - prevNode.y;
      dir = {
        dx: Math.abs(dx) <= eps ? 0 : dx > 0 ? 1 : -1,
        dy: Math.abs(dy) <= eps ? 0 : dy > 0 ? 1 : -1,
      };
    }

    if (!lastDir) {
      lastDir = dir;
      continue;
    }

    // If direction changes, commit a single segment to prevNode and start a new merged segment
    if (dir.dx !== lastDir.dx || dir.dy !== lastDir.dy) {
      // Commit merged segment up to prevNode (trim partial overlaps when manual routes exist)
      if (options.routes && options.routes.length > 0) {
        const existingLines = getExistingLines(state.grLines, state.stagedOutlines);
        const subSegments = subtractOverlapsFromSegment(
          { x: segmentStart.x, y: segmentStart.y },
          { x: prevNode.x, y: prevNode.y },
          prevNode.layer,
          net,
          width,
          existingLines,
        );
        for (const seg of subSegments) {
          track
            .from({ x: seg.start.x, y: seg.start.y }, prevNode.layer, width)
            .to({ x: seg.end.x, y: seg.end.y, layer: prevNode.layer, width });
        }
      } else {
        // Avoid duplicating existing same-net tracks by skipping segments fully covered
        const onExisting = segmentFullyOnExistingSameNetTrack(
          { x: segmentStart.x, y: segmentStart.y },
          { x: prevNode.x, y: prevNode.y },
          prevNode.layer,
          net,
          width,
          state.grLines,
          state.stagedOutlines,
        );
        if (!onExisting) {
          track.to({ x: prevNode.x, y: prevNode.y, layer: prevNode.layer, width });
        }
      }
      // Start new segment
      segmentStart = { ...prevNode };
      lastDir = dir;
    }
  }

  // Commit the final segment to the last node
  const lastNode = path.nodes[path.nodes.length - 1];
  if (Math.abs(lastNode.x - segmentStart.x) > eps || Math.abs(lastNode.y - segmentStart.y) > eps) {
    if (options.routes && options.routes.length > 0) {
      const existingLines = getExistingLines(state.grLines, state.stagedOutlines);
      const subSegments = subtractOverlapsFromSegment(
        { x: segmentStart.x, y: segmentStart.y },
        { x: lastNode.x, y: lastNode.y },
        lastNode.layer,
        net,
        width,
        existingLines,
      );
      for (const seg of subSegments) {
        track
          .from({ x: seg.start.x, y: seg.start.y }, lastNode.layer, width)
          .to({ x: seg.end.x, y: seg.end.y, layer: lastNode.layer, width });
      }
    } else {
      // Avoid duplicating existing same-net tracks by skipping segments fully covered
      const onExisting = segmentFullyOnExistingSameNetTrack(
        { x: segmentStart.x, y: segmentStart.y },
        { x: lastNode.x, y: lastNode.y },
        lastNode.layer,
        net,
        width,
        state.grLines,
        state.stagedOutlines,
      );
      if (!onExisting) {
        track.to({ x: lastNode.x, y: lastNode.y, layer: lastNode.layer, width });
      }
    }
  }

  // Teardrops: when the board opted in, reinforce each via junction with
  // tapered wedge segments on the layers the via's tracks arrive and leave.
  // Emitted through the main builder after the path loop — nothing follows,
  // so repositioning the builder is harmless, and the wedge elements share
  // the track's staging (deferred or immediate) instead of being lost.
  const teardrops = pcb.teardropConfig;
  if (teardrops.enabled && teardrops.vias && viaJunctions.length > 0) {
    const emitWedge = (
      junction: (typeof viaJunctions)[number],
      from: { x: number; y: number },
      layer: string,
      toward: { x: number; y: number },
    ) => {
      const dx = toward.x - from.x;
      const dy = toward.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < eps) return;
      const segments = teardropWedge(
        junction.at,
        { x: dx / len, y: dy / len },
        {
          padRadiusMm: junction.viaSize / 2,
          trackWidthMm: width,
          lengthMm: teardrops.maxLength,
          shape: teardrops.shape,
        },
      );
      for (const seg of segments) {
        track.from(seg.start, layer, seg.width).to({ x: seg.end.x, y: seg.end.y, layer, width: seg.width });
      }
    };
    for (const j of viaJunctions) {
      if (j.inFrom) emitWedge(j, j.inFrom, j.inLayer, j.at);
      if (j.outTo) emitWedge(j, j.at, j.outLayer, j.outTo);
    }
  }

  return track;
}

/**
 * Routes a named net by resolving its pins and delegating to autoroute().
 */
export function routeNet(
  pcb: PCB,
  netRef: string | ISchematicNetDefinition,
  options?: IAutorouteRouteOptions,
): IAutorouteResult {
  const netName = typeof netRef === 'string' ? netRef : netRef.name;
  logger.info(`⏳ Routing net '${netName}'...`);
  debugLog(options?.debug, chalk.blue(`[PCB] route() called for net: ${netName}`));

  if (!pcb.schematic || !pcb.schematic.nodes) {
    const err = new RoutingError(formatSourceError(`route() requires a schematic with defined nets`, getCallSite()));
    err.stack = err.message;
    throw err;
  }

  const providedPins: Pin[] =
    typeof netRef === 'string' ? [] : (netRef.pins ?? []).filter((pin: Pin): pin is Pin => Boolean(pin));

  let schematicNode: SchematicRuntimeNode | undefined = (pcb.schematic.nodes as SchematicRuntimeNode[]).find(
    (node) => node.name === netName,
  );

  if (!schematicNode) {
    if (typeof netRef === 'string') {
      const availableNets = (pcb.schematic.nodes as SchematicRuntimeNode[]).map((n) => n.name).join(', ');
      const err = new RoutingError(
        formatSourceError(`Net '${netName}' not found in schematic. Available nets: ${availableNets}`, getCallSite()),
      );
      err.stack = err.message;
      throw err;
    }

    schematicNode = {
      name: netName,
      nodes: providedPins,
      code: netRef.code,
      owner: null,
    };
  } else if ((!schematicNode.nodes || schematicNode.nodes.length === 0) && providedPins.length > 0) {
    schematicNode = {
      ...schematicNode,
      nodes: providedPins,
    };
  }

  if (!schematicNode.nodes || schematicNode.nodes.length === 0) {
    const err = new RoutingError(formatSourceError(`Net '${netName}' has no pins connected`, getCallSite()));
    err.stack = err.message;
    throw err;
  }

  if (schematicNode.nodes.length < 2) {
    logger.warn(
      `[PCB] WARN: Net '${netName}' has only ${schematicNode.nodes.length} pin(s). At least 2 pins are needed for routing.${formatCallSite(getCallSite())}`,
    );
    const emptyResult = Object.assign([], {
      success: false,
      routeCount: 0,
      completedCount: 0,
      routeDetails: [],
    }) as IAutorouteResult;
    return emptyResult;
  }

  debugLog(options?.debug, chalk.blue(`[PCB] Found net '${netName}' with ${schematicNode.nodes.length} pins`));

  const pinsToRoute: Pin[] = [];
  const unresolvedPins: string[] = [];

  for (const schematicPin of schematicNode.nodes) {
    if (!schematicPin.owner) {
      unresolvedPins.push(`${schematicPin.reference || 'unknown'}.${schematicPin.number || 'unknown'} (no owner)`);
      continue;
    }

    const pin = schematicPin.owner.pins.find((p) => String(p.number) === String(schematicPin.number));

    if (pin) {
      try {
        validatePin(pin, `Net '${netName}' pin ${displayName(schematicPin.owner)}.${schematicPin.number}`);
        pinsToRoute.push(pin);
      } catch (error: unknown) {
        unresolvedPins.push(
          `${displayName(schematicPin.owner)}.${schematicPin.number} (invalid: ${error instanceof Error ? error.message : String(error)})`,
        );
      }
    } else {
      unresolvedPins.push(`${displayName(schematicPin.owner)}.${schematicPin.number} (not found on component)`);
    }
  }

  if (unresolvedPins.length > 0) {
    logger.warn(
      `[PCB] WARNING: Could not resolve ${unresolvedPins.length}/${schematicNode.nodes.length} pin(s) for net '${netName}': ${unresolvedPins.join(', ')}${formatCallSite(getCallSite())}`,
    );
  }

  if (pinsToRoute.length < 2) {
    const err = new RoutingError(
      formatSourceError(
        `Could not resolve enough pins for net '${netName}'. Found ${pinsToRoute.length}, need at least 2. Check component placements and pin definitions`,
        getCallSite(),
      ),
    );
    err.stack = err.message;
    throw err;
  }

  const fromPins = [pinsToRoute[0]];
  const toPins = pinsToRoute.slice(1);

  const result = autoroute(pcb, {
    from: fromPins,
    to: toPins,
    net: netName,
    ...options,
  });

  if (result.success) {
    logger.info(`✔ Routing net '${netName}' complete (${result.completedCount}/${result.routeCount} routes)`);
  } else {
    logger.warn(`⚠ Routing net '${netName}' incomplete (${result.completedCount}/${result.routeCount} routes)`);
  }

  return result;
}
