import type { Point } from './types.js';

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Signed sweep angle from `a` to `b` around center. CCW sweeps are in (0, 2*pi],
 * CW sweeps in [-2*pi, 0). Zero-length travel becomes a full circle for CCW.
 */
export function signedSweep(a: Point, b: Point, center: Point, ccw: boolean): number {
  const a0 = Math.atan2(a.y - center.y, a.x - center.x);
  const a1 = Math.atan2(b.y - center.y, b.x - center.x);
  let d = a1 - a0;
  const twoPi = 2 * Math.PI;
  if (ccw) {
    while (d <= 1e-12) d += twoPi;
  } else {
    while (d >= -1e-12) d -= twoPi;
  }
  return d;
}

/** Rotate `p` by `deg` degrees CCW around `center` (Gerber frame, y up). */
export function rotatePoint(p: Point, deg: number, center: Point = { x: 0, y: 0 }): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Format a coordinate compactly (max 6 decimals, no trailing zeros, no -0). */
export function fmt(n: number): string {
  const v = Number(n.toFixed(6));
  return Object.is(v, -0) ? '0' : String(v);
}
