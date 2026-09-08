import { describe, it, expect } from 'vitest';
import { RoutingGrid } from '../src/routing/shared/routing_grid.js';
import { AStarRouter } from '../src/routing/router/astar_router.js';

const LAYERS = ['F.Cu', 'B.Cu'];
const BOUNDS = { minX: 0, maxX: 20, minY: 0, maxY: 20 };

function makeRouter(overrides: Record<string, unknown> = {}) {
  const grid = new RoutingGrid(BOUNDS, 0.5, LAYERS);
  const router = new AStarRouter(grid, {
    traceWidth: 0.2,
    clearance: 0.2,
    allowedLayers: LAYERS,
    ...overrides,
  });
  return { grid, router };
}

describe('AStarRouter.route', () => {
  it('routes a straight segment on an empty grid', () => {
    const { router } = makeRouter();
    const result = router.route({ x: 2, y: 2, layer: 'F.Cu' }, { x: 12, y: 2, layer: 'F.Cu' });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.viaCount).toBe(0);
    // Endpoints land on grid cell centers, so allow a resolution-sized tolerance
    const first = result.nodes[0];
    const last = result.nodes[result.nodes.length - 1];
    expect(Math.abs(first.x - 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(first.y - 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(last.x - 12)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(last.y - 2)).toBeLessThanOrEqual(0.5);
    expect(result.length).toBeGreaterThanOrEqual(9.5);
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it('detours around a keepout that blocks the direct path', () => {
    const { grid, router } = makeRouter({ allowedLayers: ['F.Cu'], allowVias: false });
    // Vertical wall between start and end, open only above y=13
    grid.addObstacle({
      type: 'keepout',
      bounds: { minX: 9, maxX: 10, minY: 0, maxY: 13 },
      layers: ['F.Cu'],
      clearance: 0.2,
    });

    const result = router.route({ x: 2, y: 10, layer: 'F.Cu' }, { x: 18, y: 10, layer: 'F.Cu' });

    expect(result.success).toBe(true);
    // Path must be longer than the straight-line distance of 16mm
    expect(result.length).toBeGreaterThan(16);
    // No path node may sit inside the keepout (with clearance)
    for (const node of result.nodes) {
      const inKeepout = node.x > 9 - 0.4 && node.x < 10 + 0.4 && node.y < 13 + 0.4;
      expect(inKeepout).toBe(false);
    }
  });

  it('fails with an error when the target is fully enclosed', () => {
    const { grid, router } = makeRouter({ allowedLayers: ['F.Cu'], allowVias: false });
    // Solid block around the endpoint
    grid.addObstacle({
      type: 'keepout',
      bounds: { minX: 14, maxX: 18, minY: 8, maxY: 12 },
      layers: ['F.Cu'],
      clearance: 0.2,
    });

    const result = router.route({ x: 2, y: 10, layer: 'F.Cu' }, { x: 16, y: 10, layer: 'F.Cu' });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('uses a via when start and end are on different layers', () => {
    const { router } = makeRouter();
    const result = router.route({ x: 5, y: 5, layer: 'F.Cu' }, { x: 15, y: 15, layer: 'B.Cu' });

    expect(result.success).toBe(true);
    expect(result.viaCount).toBeGreaterThanOrEqual(1);
    expect(result.nodes.some((n) => n.layer === 'F.Cu')).toBe(true);
    expect(result.nodes.some((n) => n.layer === 'B.Cu')).toBe(true);
  });

  it('routes through same-net obstacles but not foreign-net ones', () => {
    const { grid, router } = makeRouter({ allowedLayers: ['F.Cu'], allowVias: false, net: 'GND' });
    grid.addObstacle({
      type: 'pad',
      bounds: { minX: 9, maxX: 10, minY: 0, maxY: 13 },
      layers: ['F.Cu'],
      clearance: 0.2,
      net: 'GND',
    });

    const result = router.route({ x: 2, y: 10, layer: 'F.Cu' }, { x: 18, y: 10, layer: 'F.Cu' });

    // Same-net pad does not block, so the route stays near the direct 16mm line
    expect(result.success).toBe(true);
    expect(result.length).toBeLessThanOrEqual(17);

    // A foreign-net pad in the same spot forces a detour
    const { grid: grid2, router: router2 } = makeRouter({
      allowedLayers: ['F.Cu'],
      allowVias: false,
      net: 'GND',
    });
    grid2.addObstacle({
      type: 'pad',
      bounds: { minX: 9, maxX: 10, minY: 0, maxY: 13 },
      layers: ['F.Cu'],
      clearance: 0.2,
      net: 'VCC',
    });
    const result2 = router2.route({ x: 2, y: 10, layer: 'F.Cu' }, { x: 18, y: 10, layer: 'F.Cu' });
    expect(result2.success).toBe(true);
    expect(result2.length).toBeGreaterThan(16);
  });
});

describe('AStarRouter.routeNet', () => {
  it('connects multiple terminals into one net route', () => {
    const { router } = makeRouter();
    const result = router.routeNet([
      { x: 2, y: 2, layer: 'F.Cu' },
      { x: 18, y: 2, layer: 'F.Cu' },
      { x: 10, y: 18, layer: 'F.Cu' },
    ]);

    expect(result.success).toBe(true);
    expect(result.nodes.length).toBeGreaterThan(2);
    // Every terminal should have a path node within one grid cell (0.5mm)
    for (const terminal of [
      { x: 2, y: 2 },
      { x: 18, y: 2 },
      { x: 10, y: 18 },
    ]) {
      const near = result.nodes.some((n) => Math.abs(n.x - terminal.x) <= 0.5 && Math.abs(n.y - terminal.y) <= 0.5);
      expect(near).toBe(true);
    }
  });
});
