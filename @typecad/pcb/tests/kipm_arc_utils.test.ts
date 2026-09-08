import { describe, it, expect } from 'vitest';
import { getMiddleArcPos } from '../src/kipm/arcUtils.js';

describe('getMiddleArcPos', () => {
  it('should calculate midpoint for 0 to 90 degrees', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 10,
      angle_start: 0,
      angle_end: Math.PI / 2,
    });
    expect(result.x).toBeCloseTo(10 * Math.cos(Math.PI / 4));
    expect(result.y).toBeCloseTo(10 * Math.sin(Math.PI / 4));
  });

  it('should return radius point for zero-length arc at angle 0', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 5,
      angle_start: 0,
      angle_end: 0,
    });
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(0);
  });

  it('should handle 180-degree arc', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 10,
      angle_start: 0,
      angle_end: Math.PI,
    });
    expect(result.x).toBeCloseTo(0, 4);
    expect(result.y).toBeCloseTo(10);
  });

  it('should handle full circle', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 10,
      angle_start: 0,
      angle_end: 2 * Math.PI,
    });
    expect(result.x).toBeCloseTo(-10);
    expect(result.y).toBeCloseTo(0, 4);
  });

  it('should offset from center', () => {
    const result = getMiddleArcPos({
      center_x: 5,
      center_y: 10,
      radius: 10,
      angle_start: 0,
      angle_end: 0,
    });
    expect(result.x).toBeCloseTo(15);
    expect(result.y).toBeCloseTo(10);
  });

  it('should handle negative angles', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 10,
      angle_start: -Math.PI / 4,
      angle_end: Math.PI / 4,
    });
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(0, 4);
  });

  it('should handle small radius', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 0.01,
      angle_start: 0,
      angle_end: Math.PI,
    });
    expect(result.x).toBeCloseTo(0, 6);
    expect(result.y).toBeCloseTo(0.01);
  });

  it('should handle large radius', () => {
    const result = getMiddleArcPos({
      center_x: 0,
      center_y: 0,
      radius: 1000,
      angle_start: 0,
      angle_end: Math.PI / 2,
    });
    const expected = 1000 * Math.cos(Math.PI / 4);
    expect(result.x).toBeCloseTo(expected, 2);
  });
});
