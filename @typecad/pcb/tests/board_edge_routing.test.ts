import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { boardRegionFromElements, pointOnBoard, flattenArc } from '../src/routing/shared/board_region.js';
import { RoutingGrid } from '../src/routing/shared/routing_grid.js';
import { ObstacleBuilder } from '../src/routing/shared/obstacle_builder.js';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import type { OutlineElement } from '../src/pcb/pcb_interfaces.js';

const edge = { layer: 'Edge.Cuts', strokeWidth: 0.05 } as const;

describe('board region from Edge.Cuts', () => {
  it('takes the largest contour as the board and the rest as cutouts', () => {
    const els: OutlineElement[] = [
      { ...edge, type: 'rect', uuid: 'r', start: { x: 0, y: 0 }, end: { x: 40, y: 20 } },
      { ...edge, type: 'circle', uuid: 'c', center: { x: 20, y: 10 }, end: { x: 23, y: 10 } },
    ];
    const r = boardRegionFromElements(els)!;
    expect(r.holes).toHaveLength(1);
    expect(pointOnBoard(5, 5, r)).toBe(true);
    expect(pointOnBoard(20, 10, r)).toBe(false); // inside the cutout
    expect(pointOnBoard(41, 5, r)).toBe(false); // off the board
  });

  it('chains lines and arcs (a filleted rectangle) into one closed contour', () => {
    const arc = flattenArc({ x: 0, y: 2 }, { x: 0.586, y: 0.586 }, { x: 2, y: 0 });
    expect(arc.length).toBeGreaterThan(2);
    const els: OutlineElement[] = [
      { ...edge, type: 'arc', uuid: 'a', start: { x: 0, y: 2 }, mid: { x: 0.586, y: 0.586 }, end: { x: 2, y: 0 } },
      { ...edge, type: 'line', uuid: 'l1', start: { x: 2, y: 0 }, end: { x: 10, y: 0 } },
      { ...edge, type: 'line', uuid: 'l2', start: { x: 10, y: 0 }, end: { x: 10, y: 10 } },
      { ...edge, type: 'line', uuid: 'l3', start: { x: 0, y: 10 }, end: { x: 10, y: 10 } }, // reversed on purpose
      { ...edge, type: 'line', uuid: 'l4', start: { x: 0, y: 10 }, end: { x: 0, y: 2 } },
    ];
    const r = boardRegionFromElements(els)!;
    expect(r.holes).toHaveLength(0);
    expect(pointOnBoard(5, 5, r)).toBe(true);
    expect(pointOnBoard(0.1, 0.1, r)).toBe(false); // cut off by the fillet
  });

  it('ignores copper elements and returns null for an open contour', () => {
    expect(
      boardRegionFromElements([
        { type: 'line', uuid: 't', layer: 'F.Cu', strokeWidth: 0.2, start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
        { ...edge, type: 'line', uuid: 'e', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
      ]),
    ).toBeNull();
  });
});

describe('board edge on the routing grid', () => {
  it('blocks off-board cells and keeps copper the edge clearance away', () => {
    const els: OutlineElement[] = [{ ...edge, type: 'rect', uuid: 'r', start: { x: 0, y: 0 }, end: { x: 10, y: 10 } }];
    const grid = new RoutingGrid({ minX: -2, maxX: 12, minY: -2, maxY: 12 }, 0.1, ['F.Cu']);
    grid.addObstacle(ObstacleBuilder.buildBoardEdge(els, 0.5, ['F.Cu'])!);
    const at = (x: number, y: number) => {
      const g = grid.worldToGrid(x, y);
      return grid.isOccupied(g.x, g.y, 'F.Cu', 0.1, 'N', true, false);
    };
    expect(at(5, 5)).toBe(false); // board centre
    expect(at(-1, 5)).toBe(true); // off board
    expect(at(0.3, 5)).toBe(true); // on board but inside the 0.5mm keepout
    expect(at(0.75, 5)).toBe(false); // clear of keepout + rasterization margin
  });
});

describe('autoroute respects the board edge', () => {
  const footprint = '(footprint (pad "1" smd rect (at 0 0) (size 0.6 0.6) (layers "F.Cu")))';

  beforeEach(() => {
    fs.mkdirSync('./build', { recursive: true });
  });

  function board(name: string) {
    const pcb = new PCB(name, { rules: { min_copper_edge_clearance: 0.5 } });
    // one footprint name for every geometry on purpose: pad geometry must
    // follow the footprint's content, not its name
    const mk = (ref: string, x: number, y: number, fp = footprint) => {
      const c = new Component('test:pad');
      c.reference = ref;
      c.pins = [c.pin(1)];
      c.pcb = { x, y } as never;
      vi.spyOn(c, 'footprint_lib').mockReturnValue(fp as never);
      return c;
    };
    return { pcb, mk };
  }

  /** Points every 0.05mm along the routed centrelines (corners alone miss straight crossings). */
  const segmentsOf = (r: { routeDetails: Array<{ error?: string; path?: { nodes: Array<{ x: number; y: number }> } }> }) =>
    r.routeDetails.flatMap((d) => {
      const nodes = d.path?.nodes ?? [];
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nodes.length; i++) {
        const a = nodes[i]!;
        const b = nodes[i + 1]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
        for (let k = 0; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      }
      return pts;
    });

  it('detours away from the edge rather than squeezing past an obstacle along it', () => {
    const { pcb, mk } = board('edge_hug');
    pcb.outline(0, 0, 30, 10);
    const a = mk('U1', 3, 1.5);
    const b = mk('U2', 27, 1.5);
    // a tall pad of another net (y 0.8 .. 6.8) sits across the straight line;
    // the short way over its top would run at y ~0.45, inside the 0.5mm edge
    // keepout (+0.1 half-width), so the route must take the long way under
    const block = mk('X1', 15, 3.8, '(footprint (pad "1" smd rect (at 0 0) (size 2 6) (layers "F.Cu")))');
    const other = mk('X2', 15, 9);
    pcb.add(a, b, block, other);
    pcb.stage(a, b, block, other);
    pcb.named('EDGE_BLOCK').net(block.pins[0]!, other.pins[0]!); // declared, not routed: X1 is foreign copper
    const r = pcb.route(pcb.named('EDGE_HUG').net(a.pins[0]!, b.pins[0]!), { width: 0.2, clearance: 0.2, layers: ['F.Cu'], gridResolution: 0.1 });
    expect(r.success).toBe(true);
    const pts = segmentsOf(r);
    // it really went around X1 (pad 14..16 x 0.8..6.8): clearance + half-width away...
    for (const p of pts) {
      const d = Math.hypot(Math.max(14 - p.x, 0, p.x - 16), Math.max(0.8 - p.y, 0, p.y - 6.8));
      expect(d, `(${p.x}, ${p.y}) through X1`).toBeGreaterThanOrEqual(0.3 - 1e-6);
    }
    // ...and never inside the edge keepout
    for (const n of pts) expect(n.y).toBeGreaterThanOrEqual(0.5 + 0.1 - 1e-6);
  });

  it('routes around a milled cutout instead of across it', () => {
    const { pcb, mk } = board('edge_cutout');
    pcb.outline(0, 0, 30, 30);
    pcb.cutout([
      { x: 5, y: 12 },
      { x: 25, y: 12 },
      { x: 25, y: 18 },
      { x: 5, y: 18 },
    ]);
    // x = 15 is where the previous test's X1 sits on ITS board — parts of
    // other boards in the process must not obstruct this one
    const a = mk('V1', 15, 5);
    const b = mk('V2', 15, 25);
    pcb.add(a, b);
    pcb.stage(a, b);
    const r = pcb.route(pcb.named('EDGE_CUT').net(a.pins[0]!, b.pins[0]!), { width: 0.2, clearance: 0.2, layers: ['F.Cu'], gridResolution: 0.2 });
    expect(r.success, r.routeDetails.find((d) => !d.success)?.error).toBe(true);
    const keep = 0.5 + 0.1; // edge rule + half trace width
    for (const n of segmentsOf(r)) {
      // Euclidean distance from the centreline point to the slot rectangle
      const dx = Math.max(5 - n.x, 0, n.x - 25);
      const dy = Math.max(12 - n.y, 0, n.y - 18);
      expect(Math.hypot(dx, dy), `point (${n.x}, ${n.y}) too close to the cutout`).toBeGreaterThanOrEqual(keep - 1e-6);
    }
  });
});
