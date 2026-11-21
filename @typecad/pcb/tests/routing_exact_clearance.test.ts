import { describe, it, expect } from 'vitest';
import { RoutingGrid } from '../src/routing/shared/routing_grid.js';
import { ObstacleBuilder } from '../src/routing/shared/obstacle_builder.js';
import type { OutlineElement } from '../src/pcb/pcb_interfaces.js';

// Clearance is measured against exact pad/track geometry, so designs laid
// out exactly at the rule limit route, while moves that would clip copper
// between cell centres are still refused.

const pad = (x: number, y: number, size: number, net: string) => ({
  type: 'pad' as const,
  bounds: { minX: x - size / 2, maxX: x + size / 2, minY: y - size / 2, maxY: y + size / 2 },
  layers: ['F.Cu'],
  net,
  clearance: 0,
  padShape: { shape: 'rect' as const, center: { x, y }, width: size, height: size, rotation: 0 },
});

describe('exact clearance in the routing grid', () => {
  it('accepts a centreline exactly at clearance + half-width from a pad', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 40, minY: 0, maxY: 40 }, 1, ['F.Cu']);
    grid.addObstacle(pad(15.5, 20.5, 5, 'A')); // copper edge at x = 18
    const at = (x: number, y: number) => {
      const g = grid.worldToGrid(x, y);
      return grid.isOccupied(g.x, g.y, 'F.Cu', 7.5, 'B', true, false); // 5 clearance + 2.5 half-width
    };
    expect(at(25.5, 20.5)).toBe(false); // 7.5 from the edge: legal, not padded away
    expect(at(24.5, 20.5)).toBe(true); // 6.5: too close
  });

  it('rejects a move that clips a pad corner although both ends are clear', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 0.1, ['F.Cu']);
    grid.addObstacle(pad(5, 5, 0.6, 'A')); // corner at (5.3, 5.3)
    const clr = 0.1;
    // two cell centres either side of the corner, each >= clr from the pad
    const a = grid.worldToGrid(5.45, 5.25); // 0.15 right of the pad edge
    const b = grid.worldToGrid(5.25, 5.45); // 0.15 below it; the step passes 0.07 from the corner
    const aw = grid.gridToWorld(a.x, a.y);
    expect(grid.isOccupied(a.x, a.y, 'F.Cu', clr, 'B', true, false)).toBe(false);
    expect(grid.isOccupied(b.x, b.y, 'F.Cu', clr, 'B', true, false)).toBe(false);
    // ...but the diagonal step between them passes closer than clr
    expect(grid.isOccupied(b.x, b.y, 'F.Cu', clr, 'B', true, false, undefined, undefined, aw)).toBe(true);
  });

  it('holds a convex board edge to exactly edge rule + copper radius', () => {
    const els: OutlineElement[] = [
      { type: 'rect', uuid: 'r', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 0, y: 0 }, end: { x: 105, y: 105 } },
    ];
    const grid = new RoutingGrid({ minX: -1, maxX: 106, minY: -1, maxY: 106 }, 1, ['F.Cu']);
    grid.addObstacle(ObstacleBuilder.buildBoardEdge(els, 7.5, ['F.Cu'])!); // 5 edge + 2.5 half-width
    const at = (x: number, y: number) => {
      const g = grid.worldToGrid(x, y);
      return grid.isEdgeKeepout(g.x, g.y, 'F.Cu');
    };
    expect(at(7.5, 50.5)).toBe(false); // exactly at the limit (a pad 7.5 from the edge)
    expect(at(6.5, 50.5)).toBe(true);
    expect(at(-0.5, 50.5)).toBe(true); // off board
  });

  it('keeps vias farther from the edge than tracks without walling off edge pads', () => {
    const els: OutlineElement[] = [
      { type: 'rect', uuid: 'r', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
    ];
    const grid = new RoutingGrid({ minX: 0, maxX: 100, minY: 0, maxY: 100 }, 0.1, ['F.Cu', 'B.Cu']);
    const edge = ObstacleBuilder.buildBoardEdge(els, 0.15, ['*.Cu'])!; // 0.1 rule + 0.05 track half-width
    grid.addObstacle({ ...edge, viaClearance: 0.4 }); // 0.1 rule + 0.3 via radius
    const g = grid.worldToGrid(50.05, 0.25); // 0.25 from the edge
    expect(grid.isEdgeKeepout(g.x, g.y, 'F.Cu')).toBe(false); // a track may run here
    expect(grid.isEdgeKeepout(g.x, g.y, 'F.Cu', true)).toBe(true); // a via may not
    const v = grid.worldToGrid(50.05, 0.45);
    expect(grid.isEdgeKeepout(v.x, v.y, 'B.Cu', true)).toBe(false);
  });
});
