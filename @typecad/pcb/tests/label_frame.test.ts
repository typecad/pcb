import { describe, it, expect } from 'vitest';
import { toAuthoredLayout } from '../src/kicad2typecad/label_frame';

describe('toAuthoredLayout', () => {
  it('passes front-side layouts through untouched', () => {
    const l = { x: 1, y: 2, rotation: 90 };
    expect(toAuthoredLayout(l as any, 'front')).toBe(l);
  });
  it('returns undefined for a missing layout', () => {
    expect(toAuthoredLayout(undefined, 'back')).toBeUndefined();
  });
  it('inverts the build back-side transform (y negate, rotation +180, mirror)', () => {
    const out: any = toAuthoredLayout({ x: 1, y: -2, rotation: 0, justify: { mirror: true, left: true } } as any, 'back');
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.rotation).toBe(180);
    expect(out.justify).toEqual({ left: true });
  });
  it('normalizes rotation into [0,360) and avoids -0', () => {
    const out: any = toAuthoredLayout({ x: 0, y: 0, rotation: 90, justify: { mirror: true } } as any, 'back');
    expect(out.rotation).toBe(270);
    expect(Object.is(out.y, -0)).toBe(false);
    expect(out.justify).toBeUndefined();
  });
  it('does not mutate its input', () => {
    const l: any = { x: 0, y: 1, rotation: 0, justify: { mirror: true } };
    toAuthoredLayout(l, 'back');
    expect(l).toEqual({ x: 0, y: 1, rotation: 0, justify: { mirror: true } });
  });
});
