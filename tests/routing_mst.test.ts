import { describe, it, expect } from 'vitest';
import { buildMST } from '../src/routing/shared/mst.js';

describe('buildMST', () => {
  function euclideanCost(nodes: { x: number; y: number }[], i: number, j: number): number {
    const dx = nodes[i].x - nodes[j].x;
    const dy = nodes[i].y - nodes[j].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  it('should return empty for 0 nodes', () => {
    expect(buildMST([], euclideanCost)).toEqual([]);
  });

  it('should return empty for 1 node', () => {
    expect(buildMST([{ x: 0, y: 0 }], euclideanCost)).toEqual([]);
  });

  it('should return 1 edge for 2 nodes', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ];
    const edges = buildMST(nodes, (i, j) => euclideanCost(nodes, i, j));
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe(0);
    expect(edges[0].to).toBe(1);
    expect(edges[0].cost).toBeCloseTo(5);
  });

  it('should return n-1 edges for n connected nodes', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    const edges = buildMST(nodes, (i, j) => euclideanCost(nodes, i, j));
    expect(edges).toHaveLength(3);
  });

  it('should produce valid spanning tree (all nodes connected)', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: 5, y: 5 },
    ];
    const edges = buildMST(nodes, (i, j) => euclideanCost(nodes, i, j));
    const connected = new Set<number>();
    connected.add(0);
    for (const edge of edges) {
      connected.add(edge.from);
      connected.add(edge.to);
    }
    expect(connected.size).toBe(4);
  });

  it('should minimize total cost', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 10, y: 0 },
    ];
    const edges = buildMST(nodes, (i, j) => euclideanCost(nodes, i, j));
    const totalCost = edges.reduce((sum, e) => sum + e.cost, 0);
    expect(totalCost).toBeCloseTo(1 + 9);
  });

  it('should handle equal costs', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const edges = buildMST(nodes, (i, j) => euclideanCost(nodes, i, j));
    expect(edges).toHaveLength(2);
  });

  it('should handle disconnected graph', () => {
    const costFn = (_i: number, _j: number) => Infinity;
    const nodes = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    const edges = buildMST(nodes, costFn);
    expect(edges.length).toBeLessThan(nodes.length - 1);
  });

  it('should respect custom start index', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const edges = buildMST(nodes, (i, j) => euclideanCost(nodes, i, j), 2);
    expect(edges).toHaveLength(2);
    const connected = new Set<number>();
    connected.add(2);
    for (const e of edges) {
      connected.add(e.from);
      connected.add(e.to);
    }
    expect(connected.size).toBe(3);
  });

  it('should handle star topology', () => {
    const center = { x: 5, y: 5 };
    const nodes = [center, { x: 5, y: 10 }, { x: 10, y: 5 }, { x: 5, y: 0 }, { x: 0, y: 5 }];
    const edges = buildMST(nodes, (i, j) => euclideanCost(nodes, i, j));
    expect(edges).toHaveLength(4);
  });
});
