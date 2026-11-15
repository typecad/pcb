import { describe, it, expect } from 'vitest';
import {
  pointSegDist,
  segmentsIntersect,
  segmentSegDist,
  segmentRectDist,
  segmentOrientedRectDist,
  segmentCircleDist,
} from '../src/pcb/copper_geometry.js';

describe('copper geometry primitives (mm space)', () => {
  it('pointSegDist measures to the nearest point on the segment', () => {
    expect(pointSegDist({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 })).toBe(1);
    expect(pointSegDist({ x: 2, y: 2 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(2);
    // Clamp past the ends
    expect(pointSegDist({ x: 5, y: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(Math.hypot(1, 1), 9);
  });

  it('segmentsIntersect detects crossings and rejects parallels', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 })).toBe(false);
  });

  it('segmentSegDist is 0 across a crossing and positive beside it', () => {
    expect(
      segmentSegDist({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }),
    ).toBe(0);
    expect(segmentSegDist({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 })).toBe(1);
  });

  it('segmentRectDist: inside → 0, crossing → 0, beside → distance', () => {
    // inside
    expect(segmentRectDist({ x: 1.5, y: 1.5 }, { x: 1.6, y: 1.6 }, 1, 1, 2, 2)).toBe(0);
    // crossing straight through
    expect(segmentRectDist({ x: 0, y: 1.5 }, { x: 3, y: 1.5 }, 1, 1, 2, 2)).toBe(0);
    // fully beside (both endpoints on the same outside side)
    expect(segmentRectDist({ x: 0, y: 1.5 }, { x: 0.5, y: 1.5 }, 1, 1, 2, 2)).toBeCloseTo(0.5, 9);
    // endpoint just outside the edge
    expect(segmentRectDist({ x: 0.9, y: 1.5 }, { x: 3, y: 1.5 }, 1, 1, 2, 2)).toBe(0); // crosses
  });

  it('segmentOrientedRectDist rotates into the local frame', () => {
    // A 45° rotated square centered at origin, 1.414 diagonal; a horizontal
    // segment passing y=1.5 clears its top corner (y≈0.707) by ~0.79
    const d = segmentOrientedRectDist({ x: -2, y: 1.5 }, { x: 2, y: 1.5 }, { x: 0, y: 0 }, 1, 1, 45);
    expect(d).toBeCloseTo(1.5 - Math.SQRT1_2, 6);
    // Same segment straight through the center hits it
    expect(segmentOrientedRectDist({ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 0 }, 1, 1, 45)).toBe(0);
  });

  it('segmentCircleDist subtracts the radius', () => {
    expect(segmentCircleDist({ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 0 }, 0.5)).toBe(0); // passes through
    expect(segmentCircleDist({ x: -2, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 0 }, 0.5)).toBe(0.5);
  });
});
