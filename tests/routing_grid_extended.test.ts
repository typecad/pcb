import { describe, it, expect } from 'vitest';
import { pointToSegmentDistance } from '../src/routing/shared/routing_grid.js';

describe('pointToSegmentDistance', () => {
  it('should return 0 for point on segment', () => {
    expect(pointToSegmentDistance(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it('should return perpendicular distance', () => {
    const dist = pointToSegmentDistance(5, 3, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(3);
  });

  it('should handle horizontal segment', () => {
    expect(pointToSegmentDistance(5, 5, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('should handle vertical segment', () => {
    expect(pointToSegmentDistance(5, 5, 5, 0, 5, 10)).toBeCloseTo(0);
  });

  it('should return distance to nearest endpoint', () => {
    const dist = pointToSegmentDistance(15, 0, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(5);
  });

  it('should handle zero-length segment (point)', () => {
    const dist = pointToSegmentDistance(3, 4, 0, 0, 0, 0);
    expect(dist).toBeCloseTo(5);
  });

  it('should handle diagonal segment', () => {
    const dist = pointToSegmentDistance(0, 10, 0, 0, 10, 10);
    expect(dist).toBeCloseTo(Math.SQRT2 * 5, 1);
  });

  it('should return 0 for point at start endpoint', () => {
    expect(pointToSegmentDistance(0, 0, 0, 0, 10, 10)).toBeCloseTo(0);
  });

  it('should return 0 for point at end endpoint', () => {
    expect(pointToSegmentDistance(10, 10, 0, 0, 10, 10)).toBeCloseTo(0);
  });

  it('should handle negative coordinates', () => {
    expect(pointToSegmentDistance(-5, 0, -10, 0, 0, 0)).toBeCloseTo(0);
  });
});
