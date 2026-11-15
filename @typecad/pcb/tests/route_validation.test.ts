import { describe, it, expect } from 'vitest';
import type { IRoutingObstacle } from '../src/routing/shared/routing_grid.js';
import type { IRoutePath } from '../src/pcb/pcb_interfaces.js';
import { validateRoutePath } from '../src/routing/shared/route_validation.js';

function padObstacle(opts: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  net?: string;
  label?: string;
  layers?: string[];
  clearance?: number;
}): IRoutingObstacle {
  const w = opts.w ?? 1;
  const h = opts.h ?? 1;
  return {
    type: 'pad',
    bounds: { minX: opts.x - w / 2, maxX: opts.x + w / 2, minY: opts.y - h / 2, maxY: opts.y + h / 2 },
    layers: opts.layers ?? ['F.Cu'],
    clearance: opts.clearance ?? 0.2,
    net: opts.net,
    label: opts.label ?? `X.1`,
    padShape: { shape: 'rect', center: { x: opts.x, y: opts.y }, width: w, height: h, rotation: 0 },
  };
}

function trackObstacle(x1: number, y1: number, x2: number, y2: number, net: string): IRoutingObstacle {
  return {
    type: 'track',
    bounds: { minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minY: Math.min(y1, y2), maxY: Math.max(y1, y2) },
    layers: ['F.Cu'],
    clearance: 0.2,
    net,
    segment: { x1, y1, x2, y2, width: 0.2 },
  };
}

function path(points: Array<[number, number, string]>): IRoutePath {
  return {
    nodes: points.map(([x, y, layer]) => ({ x, y, layer })),
    length: 0,
    viaCount: 0,
    success: true,
  } as IRoutePath;
}

describe('validateRoutePath (post-route geometric gate)', () => {
  const base = { width: 0.2, clearance: 0.2, viaDiameter: 0.6, net: 'A' };

  it('accepts a clean path', () => {
    const p = path([
      [0, 0, 'F.Cu'],
      [5, 0, 'F.Cu'],
    ]);
    const obstacles = [padObstacle({ x: 10, y: 0, net: 'B' })];
    expect(validateRoutePath(p, { ...base, obstacles })).toEqual([]);
  });

  it('rejects a segment that runs through a foreign pad, naming it and the net', () => {
    // The TO-92 short from the field trial: a track swept straight over a
    // 1.05x1.5 foreign pad at (34.77, 15).
    const p = path([
      [34.19, 13.79, 'F.Cu'],
      [34.9, 14.5, 'F.Cu'],
      [36.04, 15.0, 'F.Cu'],
    ]);
    const obstacles = [
      padObstacle({ x: 34.77, y: 15, w: 1.05, h: 1.5, net: 'DQ', label: 'U2.2' }),
      padObstacle({ x: 36.04, y: 15, w: 1.05, h: 1.5, net: 'A', label: 'U2.3' }),
    ];
    const violations = validateRoutePath(p, { ...base, obstacles });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.obstacle).toBe('U2.2');
    expect(violations[0]!.net).toBe('DQ');
    expect(violations[0]!.message).toContain('U2.2 [DQ]');
  });

  it('exempts same-net pads', () => {
    const p = path([
      [0, 0, 'F.Cu'],
      [4, 0, 'F.Cu'],
    ]);
    const obstacles = [padObstacle({ x: 2, y: 0, net: 'A' })];
    expect(validateRoutePath(p, { ...base, obstacles })).toEqual([]);
  });

  it('ignores obstacles that already overlap the terminal pads (pre-existing placement errors)', () => {
    // Two parts stacked at the same coordinates: the foreign netless pad
    // covers the source pad. Rejecting the route cannot fix that — DRC owns
    // it — so the escape is validated without it.
    const p = path([
      [0, 0, 'F.Cu'],
      [5, 5, 'F.Cu'],
    ]);
    const obstacles = [
      padObstacle({ x: 0, y: 0, w: 1, h: 1, net: undefined, label: 'R1.1' }),
      padObstacle({ x: 5, y: 5, w: 1, h: 1, net: 'A', label: 'U1.1' }),
    ];
    expect(validateRoutePath(p, { ...base, obstacles })).toEqual([]);
  });

  it('rejects a segment crowding a foreign track below clearance', () => {
    // Parallel centerlines 0.3mm apart, widths 0.2 → edge-to-edge 0.1 < 0.2
    const p = path([
      [0, 0.3, 'F.Cu'],
      [5, 0.3, 'F.Cu'],
    ]);
    const obstacles = [trackObstacle(0, 0, 5, 0, 'B')];
    const violations = validateRoutePath(p, { ...base, obstacles });
    expect(violations.length).toBe(1);
    expect(violations[0]!.message).toContain('track [B]');
  });

  it('flags a via landing on a foreign pad', () => {
    const p = path([
      [0, 0, 'F.Cu'],
      [2, 0, 'F.Cu'],
      [2, 0, 'B.Cu'],
      [4, 0, 'B.Cu'],
    ]);
    const obstacles = [padObstacle({ x: 2, y: 0, w: 1.2, h: 1.2, net: 'B', label: 'U9.1', layers: ['F.Cu', 'B.Cu'] })];
    const violations = validateRoutePath(p, { ...base, obstacles });
    expect(violations.some((v) => v.message.startsWith('via'))).toBe(true);
  });
});
