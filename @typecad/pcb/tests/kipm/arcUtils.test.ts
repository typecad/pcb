import { describe, it, expect } from 'vitest';
import { getMiddleArcPos } from '../../src/kipm/arcUtils.js';

describe('getMiddleArcPos', () => {
  it('computes midpoint at angle 0 (right)', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 10,
      angle_start: -Math.PI / 4,
      angle_end: Math.PI / 4,
    });
    expect(result.x).toBeCloseTo(10, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('computes midpoint at angle PI/2 (top)', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 5,
      angle_start: 0,
      angle_end: Math.PI,
    });
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(5, 5);
  });

  it('computes midpoint with offset center', () => {
    const result = getMiddleArcPos({
      center_x: 3,
      center_y: 4,
      radius: 2,
      angle_start: 0,
      angle_end: 0,
    });
    expect(result.x).toBeCloseTo(5, 5);
    expect(result.y).toBeCloseTo(4, 5);
  });

  it('computes midpoint for negative angles', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 1,
      angle_start: -Math.PI,
      angle_end: 0,
    });
    expect(result.x).toBeCloseTo(0, 4);
    expect(result.y).toBeCloseTo(-1, 5);
  });

  it('computes midpoint for full rotation range', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 3,
      angle_start: 0,
      angle_end: Math.PI * 2,
    });
    expect(result.x).toBeCloseTo(-3, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });
});
