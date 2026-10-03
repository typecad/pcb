import { describe, expect, it } from 'vitest';

import { evaluateMacro } from '../apertures.js';

// The outline primitive (code 4) ends with a rotation parameter, and macro
// authors disagree about the declared vertex count around the closing
// repeat: KiCad writes 4,1,N+1,walk…,first,first,rot (counting one repeat,
// listing two), our own writer has historically written
// 4,1,N,walk…,first,rot. The rotation must be read as the LAST parameter —
// index arithmetic off the declared count grabs a coordinate instead (a
// −0.6 X value read as degrees silently unrotates mirrored pads and warps
// the polygon by a fraction of a degree).
describe('macro outline (primitive 4) parsing across closing-repeat conventions', () => {
  const KICAD_STYLE = [
    // KiCad chamfered pad: 6-point walk + closing vertex counted AND listed twice
    '4,1,7,-0.600000,0.600000,0.360000,0.600000,0.600000,0.360000,0.600000,-0.360000,0.360000,-0.600000,-0.600000,-0.600000,-0.600000,0.600000,-0.600000,0.600000,$1',
  ];
  const LEGACY_STYLE = [
    // typeCAD's own older emission: count = walk, one closing pair
    '4,1,6,-0.600000,0.600000,0.360000,0.600000,0.600000,0.360000,0.600000,-0.360000,0.360000,-0.600000,-0.600000,-0.600000,-0.600000,0.600000,$1',
  ];

  function outline(body: string[]) {
    const { primitives, warnings } = evaluateMacro({ name: 'T', body }, [180]);
    expect(warnings).toEqual([]);
    const p = primitives.find((x) => x.kind === 'outline');
    expect(p).toBeDefined();
    return p as Extract<(typeof primitives)[number], { kind: 'outline' }>;
  }

  it('reads the rotation from the last parameter (KiCad double-repeat body)', () => {
    const p = outline(KICAD_STYLE);
    expect(p.rotation).toBe(180);
  });

  it('reads the rotation from the last parameter (legacy single-repeat body)', () => {
    const p = outline(LEGACY_STYLE);
    expect(p.rotation).toBe(180);
  });

  it('drops the explicit closing repeat from the point list', () => {
    const p = outline(KICAD_STYLE);
    expect(p.points).toHaveLength(6);
    expect(p.points[0]).toEqual({ x: -0.6, y: 0.6 });
    expect(p.points[5]).toEqual({ x: -0.6, y: -0.6 });
  });

  it('keeps a repeated last vertex that does not close the polygon', () => {
    // (1,0) repeated mid-list is geometry, not a closing repeat of (0,0)
    const { primitives, warnings } = evaluateMacro(
      { name: 'T', body: ['4,1,2,0,0,1,0,1,0,45'] },
      [],
    );
    expect(warnings).toEqual([]);
    const p = primitives[0] as Extract<(typeof primitives)[number], { kind: 'outline' }>;
    expect(p.points).toHaveLength(3);
    expect(p.rotation).toBe(45);
  });
});
