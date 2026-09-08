import { describe, it, expect } from 'vitest';
import { computeArc } from '../../src/kipm/kicad/exportKicadFootprint.js';

describe('computeArc', () => {
  it('computes center and angle for a simple arc', () => {
    const [cx, cy, angle] = computeArc(0, 0, 5, 5, 0, false, true, 10, 0);
    expect(typeof cx).toBe('number');
    expect(typeof cy).toBe('number');
    expect(typeof angle).toBe('number');
    expect(isFinite(cx)).toBe(true);
    expect(isFinite(cy)).toBe(true);
  });

  it('returns finite values for a semicircle', () => {
    const [cx, cy, angle] = computeArc(0, 0, 5, 5, 0, false, true, 10, 0);
    expect(Math.abs(angle)).toBeGreaterThan(0);
  });

  it('handles large arc flag', () => {
    const [cx1, , angle1] = computeArc(0, 0, 5, 5, 0, true, true, 8, 6);
    const [cx2, , angle2] = computeArc(0, 0, 5, 5, 0, false, true, 8, 6);
    expect(isFinite(cx1)).toBe(true);
    expect(isFinite(angle1)).toBe(true);
    expect(isFinite(cx2)).toBe(true);
    expect(isFinite(angle2)).toBe(true);
  });

  it('handles sweep flag', () => {
    const [cx1, , angle1] = computeArc(0, 0, 5, 5, 0, false, true, 8, 6);
    const [cx2, , angle2] = computeArc(0, 0, 5, 5, 0, false, false, 8, 6);
    expect(isFinite(cx1)).toBe(true);
    expect(isFinite(angle1)).toBe(true);
    expect(isFinite(cx2)).toBe(true);
    expect(isFinite(angle2)).toBe(true);
  });

  it('handles non-zero rotation', () => {
    const [cx, cy, angle] = computeArc(0, 0, 5, 5, 45, false, true, 10, 0);
    expect(isFinite(cx)).toBe(true);
    expect(isFinite(angle)).toBe(true);
  });

  it('handles same start and end point', () => {
    const [cx, cy, angle] = computeArc(5, 5, 3, 3, 0, false, true, 5, 5);
    expect(isFinite(cx)).toBe(true);
    expect(isFinite(cy)).toBe(true);
  });

  it('handles different rx and ry', () => {
    const [cx, cy, angle] = computeArc(0, 0, 10, 5, 0, false, true, 10, 0);
    expect(isFinite(cx)).toBe(true);
    expect(isFinite(angle)).toBe(true);
  });
});
