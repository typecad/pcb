/**
 * Post-route geometric validation.
 *
 * The A* search samples occupancy at grid-cell centers, so a segment drawn
 * between two free cells can still sweep across a foreign pad or track —
 * the router would report the route complete while the copper physically
 * shorts two nets. This module re-checks every accepted path with exact
 * geometry before it becomes a TrackBuilder: segments and vias versus every
 * different-net pad/track obstacle, edge-to-edge, with the stricter of the
 * route's and the obstacle's clearance.
 */

import type { IRoutingObstacle } from './routing_grid.js';
import type { IRoutePath } from '../../pcb/pcb_interfaces.js';
import {
  segmentSegDist,
  segmentShapeGap,
  shapeOnLayer,
  type CopperShape,
  type Pt,
} from '../../pcb/copper_geometry.js';

export interface RouteValidationViolation {
  /** Human-readable, position-carrying one-liner for logs and route errors. */
  message: string;
  /** Obstacle label, e.g. "U2.2 [DQ]". */
  obstacle: string;
  /** Obstacle's net (the net the route would short). */
  net?: string;
}

/** Convert pad obstacles to precise copper shapes (oriented rect / circle). */
export function padObstaclesToShapes(obstacles: IRoutingObstacle[]): CopperShape[] {
  const shapes: CopperShape[] = [];
  for (const obs of obstacles) {
    if (obs.type !== 'pad') continue;
    const pad = obs.padShape;
    const label = obs.label ?? 'pad';
    if (!pad) {
      shapes.push({
        kind: 'rect',
        center: { x: (obs.bounds.minX + obs.bounds.maxX) / 2, y: (obs.bounds.minY + obs.bounds.maxY) / 2 },
        width: obs.bounds.maxX - obs.bounds.minX,
        height: obs.bounds.maxY - obs.bounds.minY,
        rotationDeg: 0,
        radius: 0,
        layers: obs.layers,
        net: obs.net,
        label,
        clearance: obs.clearance,
      });
      continue;
    }
    const center = { x: pad.center.x, y: pad.center.y };
    if (pad.shape === 'circle') {
      shapes.push({
        kind: 'circle',
        center,
        width: 0,
        height: 0,
        rotationDeg: 0,
        radius: Math.max(pad.width, pad.height) / 2,
        layers: obs.layers,
        net: obs.net,
        label,
        clearance: obs.clearance,
      });
    } else {
      shapes.push({
        kind: 'rect',
        center,
        width: pad.width,
        height: pad.height,
        rotationDeg: pad.rotation ?? 0,
        radius: 0,
        layers: obs.layers,
        net: obs.net,
        label,
        clearance: obs.clearance,
      });
    }
  }
  return shapes;
}

export interface RouteValidationInput {
  /** All obstacles known when the path was routed (pads + written tracks). */
  obstacles: IRoutingObstacle[];
  /** Trace width of this route (mm). */
  width: number;
  /** Route clearance requirement (mm); obstacles contribute their own. */
  clearance: number;
  /** Via pad diameter used at layer transitions (mm). */
  viaDiameter: number;
  /** Net being routed; same-net obstacles are not violations. */
  net?: string;
  /** Treat zero-net obstacles as blockers (default true — unconnected copper still must not short). */
  blockNetless?: boolean;
}

function fmt(p: Pt): string {
  return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
}

/**
 * Validate a routed path against the obstacle list. Returns one violation
 * per offending segment/via (empty = the path is geometrically clean).
 *
 * Obstacles that already violate the route's TERMINAL pads (a foreign pad
 * stacked on the source/destination pad — a placement error that exists
 * with or without this route) are ignored: the router must not ADD shorts,
 * but rejecting a route cannot fix a pre-existing one, and DRC's
 * shorting/courtyard checks own those.
 */
export function validateRoutePath(path: IRoutePath, input: RouteValidationInput): RouteValidationViolation[] {
  const violations: RouteValidationViolation[] = [];
  const blockNetless = input.blockNetless ?? true;
  const halfWidth = input.width / 2;
  const nodes = path.nodes ?? [];
  if (nodes.length < 2) return violations;

  const shapes = padObstaclesToShapes(input.obstacles);
  const trackObstacles = input.obstacles.filter((o) => o.type === 'track' && o.segment);

  const applicable = (net: string | undefined): boolean => {
    if (input.net && net && net === input.net) return false;
    if (!net) return blockNetless;
    return true;
  };

  // Terminal nodes: the route's own source/destination pad centers.
  const firstNode = { x: nodes[0]!.x, y: nodes[0]!.y };
  const lastNode = { x: nodes[nodes.length - 1]!.x, y: nodes[nodes.length - 1]!.y };

  /** A foreign obstacle that already sits on a terminal pad — pre-existing. */
  const preexistingAtTerminals = (gapAtFirst: number, gapAtLast: number, needed: number): boolean =>
    gapAtFirst < needed - 1e-6 || gapAtLast < needed - 1e-6;

  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = { x: nodes[i]!.x, y: nodes[i]!.y };
    const b = { x: nodes[i + 1]!.x, y: nodes[i + 1]!.y };
    const layer = nodes[i]!.layer;
    if (nodes[i + 1]!.layer !== layer) continue; // via transition handled below

    for (const shape of shapes) {
      if (!applicable(shape.net)) continue;
      if (!shapeOnLayer(shape, layer)) continue;
      const needed = Math.max(input.clearance, shape.clearance);
      // Point probes at the two terminal pad centers (pad copper extends
      // past the trace, so a center hit implies overlap).
      if (
        preexistingAtTerminals(
          segmentShapeGap(firstNode, firstNode, halfWidth, shape),
          segmentShapeGap(lastNode, lastNode, halfWidth, shape),
          needed,
        )
      ) {
        continue;
      }
      const gap = segmentShapeGap(a, b, halfWidth, shape);
      if (gap < needed - 1e-6) {
        violations.push({
          message:
            `segment ${i + 1} (${fmt(a)})->(${fmt(b)}) on ${layer} clears ${shape.label}` +
            `${shape.net ? ` [${shape.net}]` : ''} by ${gap.toFixed(2)}mm < ${needed.toFixed(2)}mm`,
          obstacle: shape.label,
          net: shape.net,
        });
      }
    }

    for (const obs of trackObstacles) {
      if (!applicable(obs.net)) continue;
      if (!obs.layers!.includes(layer)) continue;
      const s = obs.segment!;
      const needed = Math.max(input.clearance, obs.clearance);
      const centerGap = segmentSegDist(a, b, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      const gap = Math.max(0, centerGap - halfWidth - s.width / 2);
      if (gap < needed - 1e-6) {
        const label = `track [${obs.net ?? 'no net'}]`;
        violations.push({
          message:
            `segment ${i + 1} (${fmt(a)})->(${fmt(b)}) on ${layer} clears ${label} by ${gap.toFixed(2)}mm < ${needed.toFixed(2)}mm`,
          obstacle: label,
          net: obs.net,
        });
      }
    }
  }

  // Vias: layer-transition nodes become circular pads spanning both layers.
  if (input.viaDiameter > 0) {
    for (let i = 1; i < nodes.length - 1; i++) {
      const prev = nodes[i - 1]!;
      const node = nodes[i]!;
      const next = nodes[i + 1]!;
      if (prev.layer === node.layer && next.layer === node.layer) continue;
      const center = { x: node.x, y: node.y };
      const spanned = [prev.layer, node.layer, next.layer];
      for (const shape of shapes) {
        if (!applicable(shape.net)) continue;
        if (!spanned.some((l) => shapeOnLayer(shape, l))) continue;
        const needed = Math.max(input.clearance, shape.clearance);
        const gap = segmentShapeGap(center, center, input.viaDiameter / 2, shape);
        if (gap < needed - 1e-6) {
          violations.push({
            message:
              `via (${fmt(center)}) ${prev.layer}->${next.layer} clears ${shape.label}` +
              `${shape.net ? ` [${shape.net}]` : ''} by ${gap.toFixed(2)}mm < ${needed.toFixed(2)}mm`,
            obstacle: shape.label,
            net: shape.net,
          });
        }
      }
      // ...and against foreign tracks on the layers it spans (a via dropped
      // onto another net's track was never checked here)
      for (const obs of trackObstacles) {
        if (!applicable(obs.net)) continue;
        if (!spanned.some((l) => obs.layers!.includes(l))) continue;
        const s = obs.segment!;
        const needed = Math.max(input.clearance, obs.clearance);
        const gap = Math.max(
          0,
          segmentSegDist(center, center, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) - input.viaDiameter / 2 - s.width / 2,
        );
        if (gap < needed - 1e-6) {
          const label = `track [${obs.net ?? 'no net'}]`;
          violations.push({
            message: `via (${fmt(center)}) ${prev.layer}->${next.layer} clears ${label} by ${gap.toFixed(2)}mm < ${needed.toFixed(2)}mm`,
            obstacle: label,
            net: obs.net,
          });
        }
      }
    }
  }

  return violations;
}
