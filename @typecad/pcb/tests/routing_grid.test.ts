import { describe, it, expect } from 'vitest';
import { RoutingGrid } from '../src/routing/shared/routing_grid.js';

describe('RoutingGrid', () => {
  it('should create a grid with correct dimensions', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 0.5, ['F.Cu', 'B.Cu']);

    const dims = grid.getDimensions();
    expect(dims.layers).toBe(2);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  it('should return configured resolution and bounds', () => {
    const bounds = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const grid = new RoutingGrid(bounds, 0.5, ['F.Cu']);

    expect(grid.getResolution()).toBe(0.5);
    expect(grid.getBounds()).toEqual(bounds);
    expect(grid.getLayers()).toEqual(['F.Cu']);
  });

  it('should convert world coordinates to grid coordinates', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 100, minY: 0, maxY: 100 }, 1.0, ['F.Cu']);

    const gridCoord = grid.worldToGrid(5.0, 10.0);
    expect(gridCoord.x).toBe(5);
    expect(gridCoord.y).toBe(10);
  });

  it('should convert grid coordinates to world coordinates (cell center)', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 100, minY: 0, maxY: 100 }, 1.0, ['F.Cu']);

    // gridToWorld returns cell center: bounds.min + (gridIdx + 0.5) * resolution
    const worldCoord = grid.gridToWorld(5, 10);
    expect(worldCoord.x).toBeCloseTo(5.5, 10);
    expect(worldCoord.y).toBeCloseTo(10.5, 10);
  });

  it('should detect out-of-bounds coordinates', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 0.5, ['F.Cu']);

    expect(grid.isInBounds(5, 5)).toBe(true);
    expect(grid.isInBounds(-1, 5)).toBe(false);
    expect(grid.isInBounds(5, -1)).toBe(false);
  });

  it('should start with all cells free', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 1.0, ['F.Cu']);

    const stats = grid.getStats();
    expect(stats.totalCells).toBeGreaterThan(0);
    expect(stats.occupiedCells).toBe(0);
    expect(stats.freeCells).toBe(stats.totalCells);
    expect(stats.occupancyPercent).toBe(0);
  });

  it('should report default cell cost of 1.0', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 1.0, ['F.Cu']);

    const g = grid.worldToGrid(5, 5);
    expect(grid.getCellCost(g.x, g.y, 'F.Cu')).toBe(1.0);
  });

  it('should set and get cell costs', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 1.0, ['F.Cu']);

    const g = grid.worldToGrid(5, 5);
    grid.setCellCost(g.x, g.y, 'F.Cu', 42);
    expect(grid.getCellCost(g.x, g.y, 'F.Cu')).toBe(42);
  });

  it('should clear the grid', () => {
    const grid = new RoutingGrid({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, 1.0, ['F.Cu']);

    const g = grid.worldToGrid(5, 5);
    grid.setCellCost(g.x, g.y, 'F.Cu', 99);

    grid.clear();

    // After clear, stats should reflect no occupied cells
    const stats = grid.getStats();
    expect(stats.occupiedCells).toBe(0);
  });
});
