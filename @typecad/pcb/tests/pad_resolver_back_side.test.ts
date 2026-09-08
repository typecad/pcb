import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component } from '../src/component.js';
import { PadResolver } from '../src/routing/shared/pad_resolver.js';

/**
 * Regression tests for back-side pad coordinate resolution.
 *
 * Bug: PadResolver.transformToAbsolute previously negated X for back-side
 * components instead of Y.  pcb_footprint.ts (the footprint output code)
 * negates pad Y for B.Cu modules, so PadResolver must do the same to produce
 * the same absolute pad positions that KiCad renders on the board.
 */
describe('PadResolver back-side coordinate transform', () => {
  beforeEach(() => {
    PadResolver.clearParseCache();
  });
  /**
   * Helper: create a minimal Component with a mocked footprint that has one
   * pad at the given relative (x, y) position.
   */
  function makeComponent(opts: {
    side: 'front' | 'back';
    x: number;
    y: number;
    rotation?: number;
    padX: number;
    padY: number;
    padRotation?: number;
    padType?: string;
  }): Component {
    const c = new Component('Test:TestFootprint');
    c.reference = 'UUT';
    c.pcb = { x: opts.x, y: opts.y, rotation: opts.rotation ?? 0, side: opts.side };

    const padRot = opts.padRotation ?? 0;
    const padType = opts.padType ?? 'smd';
    const footprint = `(footprint "Test:TestFootprint" (pad "1" ${padType} rect (at ${opts.padX} ${opts.padY} ${padRot}) (size 1 1) (layers "F.Cu")))`;

    vi.spyOn(c, 'footprint_lib').mockReturnValue(footprint as any);
    return c;
  }

  it('front-side pad with no rotation matches component position plus offset', () => {
    const c = makeComponent({ side: 'front', x: 100, y: 50, padX: 5, padY: 3 });
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom).not.toBeNull();
    expect(geom!.center.x).toBeCloseTo(105, 5);
    expect(geom!.center.y).toBeCloseTo(53, 5);
  });

  it('back-side pad with no rotation must NOT mirror X', () => {
    // This was the original bug: the router negated X instead of Y.
    // A pad at (5, 0) on a back-side component at (100, 50, 0) must
    // resolve to (105, 50) — NOT (95, 50).
    const c = makeComponent({ side: 'back', x: 100, y: 50, padX: 5, padY: 0 });
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom).not.toBeNull();
    expect(geom!.center.x).toBeCloseTo(105, 5);
    expect(geom!.center.y).toBeCloseTo(50, 5);
  });

  it('back-side pad negates Y (matching pcb_footprint.ts)', () => {
    // pcb_footprint.ts negates pad Y for back-side: (padX, -padY).
    // PadResolver must produce the same absolute position.
    const c = makeComponent({ side: 'back', x: 100, y: 50, padX: 5, padY: 3 });
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom).not.toBeNull();
    // After Y-negation: pad at (5, -3), rotate by 0, translate: (105, 47)
    expect(geom!.center.x).toBeCloseTo(105, 5);
    expect(geom!.center.y).toBeCloseTo(47, 5);
  });

  it('back-side pad with rotation 180 still matches KiCad rendering', () => {
    // Back-side component at rotation 180 with pad at (5, 3):
    // pcb_footprint.ts writes (5, -3, adjustedRot).
    // KiCad rotates by 180°: (-5, 3), translates to (compX-5, compY+3).
    const c = makeComponent({ side: 'back', x: 100, y: 50, rotation: 180, padX: 5, padY: 3 });
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom).not.toBeNull();
    // PadResolver: negate Y → (5, -3), rotate by 180° → (-5, 3), translate → (95, 53)
    expect(geom!.center.x).toBeCloseTo(95, 4);
    expect(geom!.center.y).toBeCloseTo(53, 4);
  });

  it('battery holder regression: back-side pad at (9.98, 0) with rotation 0', () => {
    // Exact reproduction of the reported bug: BatteryHolder_Keystone_500
    // with pad 2 at (9.9822, 0) on a back-side component at (142.512, 104, 0).
    // Old bug: router computed (132.53, 104) — wrong.
    // Fixed:   router computes (152.49, 104) — correct.
    const c = makeComponent({ side: 'back', x: 142.512, y: 104, padX: 9.9822, padY: 0 });
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom).not.toBeNull();
    expect(geom!.center.x).toBeCloseTo(152.494, 3);
    expect(geom!.center.y).toBeCloseTo(104, 3);

    // The WRONG answer (the old bug) — explicitly assert we do NOT get this
    expect(geom!.center.x).not.toBeCloseTo(132.53, 1);
  });

  it('back-side through-hole pad reports correct layer', () => {
    const c = makeComponent({ side: 'back', x: 100, y: 50, padX: 0, padY: 0, padType: 'thru_hole' });
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom).not.toBeNull();
    expect(geom!.layer).toBe('B.Cu');
  });

  it('back-side SMD pad maps F.Cu to B.Cu', () => {
    const c = makeComponent({ side: 'back', x: 100, y: 50, padX: 0, padY: 0 });
    const geom = PadResolver.getPadGeometry(c, 1);
    expect(geom).not.toBeNull();
    expect(geom!.layer).toBe('B.Cu');
  });
});
