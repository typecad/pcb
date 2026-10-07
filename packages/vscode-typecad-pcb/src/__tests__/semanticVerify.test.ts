// Semantic verification: the layer that sees "parses but wrong" — a route
// the board model dropped, a delete that missed, a move that didn't land.
import { describe, expect, it } from 'vitest';
import { verifyBoardSemantics, type SemanticCheckInput } from '../semanticVerify.js';

const board = (extra = '') => `
(kicad_pcb (version 20221018)
  (net 0 "")
  (net 3 "GND")
  (segment (start 7 7) (end 9 9) (width 0.4) (layer "F.Cu") (net 3) (uuid "x1"))
  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))
  (segment (start 4 1) (end 4 4) (width 0.3) (layer "F.Cu") (net 3) (uuid "x3"))
  (via (at 1.5 -2.5) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 3) (uuid "x4"))
  (gr_text "world" (at 6 6 0) (layer "F.SilkS") (uuid "x5"))
  (footprint "Resistor:R" (layer "F.Cu") (uuid "f1") (at 17.5 -5.5 90)
    (property "Reference" "D1" (at 0 0 0) (layer "F.SilkS") (uuid "p1")))
  ${extra}
)
`;

const base: SemanticCheckInput = {
  routes: [
    {
      net: 'GND',
      pieces: [{ layer: 'F.Cu', pts: [{ x: 7, y: 7 }, { x: 9, y: 9 }] }],
      vias: [{ x: 1.5, y: -2.5 }],
    },
  ],
  deletes: [{ net: 'GND', x1: 1, y1: 1, x2: 4, y2: 1, layer: 'F.Cu' }],
  placements: [{ ref: 'D1', x: 17.5, y: -5.5 }],
  texts: [{ text: 'world', x: 6, y: 6 }],
};

describe('verifyBoardSemantics — the happy board', () => {
  it('every intended edit present, every delete gone', () => {
    const report = verifyBoardSemantics(
      board()
        // base board still carries the to-be-deleted segment — remove it
        .replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', ''),
      base,
    );
    expect(report.ok).toBe(true);
    expect(report.misses).toEqual([]);
    expect(report.checked).toBe(5);
  });

  it('an empty check is not "ok" — it verified nothing', () => {
    expect(verifyBoardSemantics(board(), { routes: [], deletes: [], placements: [], texts: [] }).ok).toBe(false);
  });
});

describe('verifyBoardSemantics — catches the silent failures', () => {
  it('a route the board model dropped', () => {
    const report = verifyBoardSemantics(
      board().replace('  (segment (start 7 7) (end 9 9) (width 0.4) (layer "F.Cu") (net 3) (uuid "x1"))\n', '').replace(
        '  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n',
        '',
      ),
      base,
    );
    expect(report.ok).toBe(false);
    expect(report.misses.join(' ')).toContain('route segment 7.00,7.00');
    expect(report.misses.join(' ')).toContain('missing from the rebuilt board');
  });

  it('a via that never materialized', () => {
    const report = verifyBoardSemantics(
      board()
        .replace('  (via (at 1.5 -2.5) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 3) (uuid "x4"))\n', '')
        .replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', ''),
      base,
    );
    expect(report.misses.join(' ')).toContain('via at 1.50,-2.50');
  });

  it('a delete that missed (segment still on the board)', () => {
    const report = verifyBoardSemantics(board(), base);
    expect(report.ok).toBe(false);
    expect(report.misses.join(' ')).toContain('STILL on the rebuilt board');
  });

  it('a move that did not land', () => {
    const report = verifyBoardSemantics(
      board().replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', ''),
      { ...base, placements: [{ ref: 'D1', x: 20, y: 0 }] },
    );
    expect(report.misses.join(' ')).toContain('component D1 sits at 17.50,-5.50');
    expect(report.misses.join(' ')).toContain('moved it to 20.00,0.00');
  });

  it('a component that vanished', () => {
    const report = verifyBoardSemantics(
      board()
        .slice(0, board().indexOf('(footprint')) + ')\n',
      { ...base, deletes: [] },
    );
    expect(report.misses.join(' ')).toContain('component D1 has no footprint');
  });

  it('a text that never landed', () => {
    const report = verifyBoardSemantics(
      board().replace('  (gr_text "world" (at 6 6 0) (layer "F.SilkS") (uuid "x5"))\n', '').replace(
        '  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n',
        '',
      ),
      base,
    );
    expect(report.misses.join(' ')).toContain('text "world"');
  });

  it('a flip that did not land (part still on the front)', () => {
    const report = verifyBoardSemantics(board(), { ...base, placements: [{ ref: 'D1', x: 17.5, y: -5.5, side: 'back' }] });
    expect(report.ok).toBe(false);
    expect(report.misses.join(' ')).toContain('component D1 sits on the front side');
    expect(report.misses.join(' ')).toContain('flipped it to the back');
  });

  it('a flip that landed (footprint layer B.Cu) verifies clean', () => {
    const flipped = board().replace('(footprint "Resistor:R" (layer "F.Cu")', '(footprint "Resistor:R" (layer "B.Cu")');
    const report = verifyBoardSemantics(flipped, { ...base, placements: [{ ref: 'D1', x: 17.5, y: -5.5, side: 'back' }] });
    expect(report.misses.filter((m) => m.includes('D1'))).toEqual([]);
  });

  it('a back-side part the apply did NOT touch stays unchecked for side', () => {
    // side rides only when the move carries it — a front-side check passes
    // on a front-side board
    const report = verifyBoardSemantics(board(), { ...base, placements: [{ ref: 'D1', x: 17.5, y: -5.5, side: 'front' }] });
    expect(report.misses.filter((m) => m.includes('D1'))).toEqual([]);
  });

  it('a zone the apply inserted verifies by corners, layer, and net', () => {
    const withZone = board(
      `
    (zone (net 3) (net_name "GND") (layers "F.Cu") (uuid "z1")
      (polygon (pts (xy 1 2) (xy 11 2) (xy 11 7) (xy 1 7))))
`,
    ).replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', '');
    const report = verifyBoardSemantics(withZone, {
      ...base,
      zones: [{ kind: 'pour', layer: 'F.Cu', net: 'GND', x: 1, y: 2, w: 10, h: 5 }],
    });
    expect(report.misses.filter((m) => m.includes('zone'))).toEqual([]);

    // a keepout zone with no net verifies the same way
    const withKeepout = board(
      `
    (zone (net 0) (net_name "") (layers "F.Cu") (uuid "z2") (keepout (tracks not_allowed))
      (polygon (pts (xy 3 3) (xy 5 3) (xy 5 5) (xy 3 5))))
`,
    ).replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', '');
    const report2 = verifyBoardSemantics(withKeepout, {
      ...base,
      zones: [{ kind: 'keepout', layer: 'F.Cu', x: 3, y: 3, w: 2, h: 2 }],
    });
    expect(report2.misses.filter((m) => m.includes('zone'))).toEqual([]);
  });

  it('a zone that never materialized is a miss', () => {
    const report = verifyBoardSemantics(board(), {
      ...base,
      zones: [{ kind: 'pour', layer: 'F.Cu', net: 'GND', x: 1, y: 2, w: 10, h: 5 }],
    });
    expect(report.ok).toBe(false);
    expect(report.misses.join(' ')).toContain('zone on F.Cu at 1.00,2.00');
  });

  it('a PRETTY-PRINTED zone block (the writer\'s own form) still verifies', () => {
    // verbatim shape from a rebuilt mod-ec board: every token on its own
    // line, the polygon/pts sub-lists wrapped in their own parens — the
    // inline regexes used to see zero zones here and reported every zone
    // apply as MISSING while the pour rendered fine
    const pretty = board(
      `
    (
      zone
      (net 1)
      (net_name "VCC")
      (layers "F.Cu")
      (uuid "2d50")
      (hatch edge 0.508)
      (connect_pads (clearance 0.2))
      (min_thickness 0.1778)
      (fill yes (arc_segments 16) (thermal_gap 0.254) (thermal_bridge_width 0.4064) (island_removal_mode 2))
      (
        polygon
        (
          pts
          (xy 144.6 78.5)
          (xy 150.2 78.5)
          (xy 150.2 80.2)
          (xy 144.6 80.2)
        )
      )
    )
`,
    ).replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', '');
    const report = verifyBoardSemantics(pretty, {
      ...base,
      zones: [{ kind: 'pour', layer: 'F.Cu', net: 'VCC', x: 144.6, y: 78.5, w: 5.6, h: 1.7 }],
    });
    expect(report.misses.filter((m) => m.includes('zone'))).toEqual([]);
    // and a genuinely different rect still reports
    const moved = verifyBoardSemantics(pretty, {
      ...base,
      zones: [{ kind: 'pour', layer: 'F.Cu', net: 'VCC', x: 144.6, y: 78.5, w: 9, h: 1.7 }],
    });
    expect(moved.misses.some((m) => m.includes('zone'))).toBe(true);
  });

  it('the outline edit verifies against the Edge.Cuts gr_line extent', () => {
    // four Edge.Cuts lines forming a rect from (5,10) to (55,50)
    const edge = (x1: number, y1: number, x2: number, y2: number) =>
      `  (gr_line (start ${x1} ${y1}) (end ${x2} ${y2}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts") (uuid "e"))\n`;
    const withEdge = board(
      edge(5, 10, 55, 10) + edge(55, 10, 55, 50) + edge(55, 50, 5, 50) + edge(5, 50, 5, 10),
    );
    const report = verifyBoardSemantics(withEdge, { ...base, outline: { rect: { x: 5, y: 10, w: 50, h: 40 } } });
    expect(report.misses.filter((m) => m.includes('outline'))).toEqual([]);

    const moved = verifyBoardSemantics(withEdge, { ...base, outline: { rect: { x: 0, y: 0, w: 50, h: 40 } } });
    expect(moved.ok).toBe(false);
    expect(moved.misses.join(' ')).toContain('the rebuilt board outline sits at 5.00,10.00');
  });

  it('segments match in either orientation and within rounding tolerance', () => {
    const flipped = board()
      .replace('(start 7 7) (end 9 9)', '(start 9.001 9.001) (end 7 7)')
      .replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', '');
    expect(verifyBoardSemantics(flipped, base).ok).toBe(true);
  });
});

describe('board artwork (image ink)', () => {
  // a placed image emits filled gr_polys on the side's layers; the check
  // asks whether ANY filled poly on the side intersects the placed rect
  const poly = (layer: string, x0: number, y0: number, x1: number, y1: number) =>
    `(gr_poly\n    (pts (xy ${x0} ${y0}) (xy ${x1} ${y0}) (xy ${x1} ${y1}) (xy ${x0} ${y1}))\n    (stroke (width 0) (type default))\n    (layer "${layer}")\n    (fill solid)\n    (uuid "44444444-4444-4444-4444-444444444444"))`;

  it('passes when filled ink on the side intersects the placed rect', () => {
    const board = `(kicad_pcb ${poly('F.Cu', 12, 12, 28, 28)} ${poly('F.Mask', 11.95, 11.95, 28.05, 28.05)})`;
    const report = verifyBoardSemantics(board, {
      routes: [],
      deletes: [],
      placements: [],
      texts: [],
      images: [{ side: 'front', x: 20, y: 20, w: 16, h: 16 }],
    });
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(1);
  });

  it('passes on mask-only art and on B-layer art with side: back', () => {
    const board = `(kicad_pcb ${poly('B.Mask', 5, 5, 9, 9)})`;
    const report = verifyBoardSemantics(board, {
      routes: [],
      deletes: [],
      placements: [],
      texts: [],
      images: [{ side: 'back', x: 7, y: 7, w: 4, h: 4 }],
    });
    expect(report.ok).toBe(true);
  });

  it('misses when the art is absent or landed on the wrong side', () => {
    const frontOnly = `(kicad_pcb ${poly('F.SilkS', 12, 12, 28, 28)})`;
    const missing = verifyBoardSemantics(frontOnly, {
      routes: [],
      deletes: [],
      placements: [],
      texts: [],
      images: [{ side: 'back', x: 20, y: 20, w: 16, h: 16 }],
    });
    expect(missing.ok).toBe(false);
    expect(missing.misses[0]).toMatch(/artwork .* is missing from the rebuilt board/);

    const elsewhere = verifyBoardSemantics(`(kicad_pcb ${poly('F.Cu', 40, 40, 50, 50)})`, {
      routes: [],
      deletes: [],
      placements: [],
      texts: [],
      images: [{ side: 'front', x: 20, y: 20, w: 16, h: 16 }],
    });
    expect(elsewhere.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Live-report regressions from rd_skeleton: the board mixes serializations
// (split-style footprints, single-line segments) and rip-up-and-redraw
// gestures delete a leg and re-add the same path at a new width in one
// apply.
// ---------------------------------------------------------------------------
describe('verifyBoardSemantics serialization + redraw regressions', () => {
  it('parses split-style (pcbnew-10) footprint blocks for placements', () => {
    const board = [
      '(kicad_pcb (version 20260206)',
      '  (',
      '    footprint',
      '    (layer "F.Cu")',
      '    (at 133.614 80.708 180)',
      '    (property "Reference" "R5" (at 0 0 0))',
      '  )',
      ')',
    ].join('\n');
    const report = verifyBoardSemantics(board, {
      routes: [], deletes: [],
      placements: [{ ref: 'R5', x: 133.614, y: 80.708 }],
      texts: [],
    });
    expect(report.misses).toEqual([]);
  });

  it('a rip-up-and-redraw over the same path is not a failed delete', () => {
    // the deleted leg (width 0.2) and the gesture's own new route leg
    // (width 0.15) share the path — the "still present" copper IS the
    // redraw, not the old trace surviving
    const board = '(kicad_pcb (segment (start 131.24 81.7) (end 131.797 81.7) (width 0.15) (layer "F.Cu") (net 3 "DRIVE")))';
    const report = verifyBoardSemantics(board, {
      routes: [{ net: 'DRIVE', pieces: [{ layer: 'F.Cu', pts: [{ x: 131.24, y: 81.7 }, { x: 131.797, y: 81.7 }] }], vias: [] }],
      deletes: [{ net: 'DRIVE', x1: 131.24, y1: 81.7, x2: 131.8, y2: 81.7, layer: 'F.Cu' }],
      placements: [], texts: [],
    });
    expect(report.misses).toEqual([]);
  });

  it('a genuinely surviving delete still flags', () => {
    const board = '(kicad_pcb (segment (start 1 2) (end 3 4) (width 0.2) (layer "F.Cu") (net 1 "VCC")))';
    const report = verifyBoardSemantics(board, {
      routes: [],
      deletes: [{ net: 'VCC', x1: 1, y1: 2, x2: 3, y2: 4, layer: 'F.Cu' }],
      placements: [], texts: [],
    });
    expect(report.misses.join(' ')).toContain('STILL on the rebuilt board');
  });
});

describe('verifyBoardSemantics placement parsing with provenance properties', () => {
  it('the placement (at) is not the Code property\'s (at 0 0)', () => {
    // live defect: typeCAD\'s provenance property — (property "Code"
    // "typecad:v1:…" (at 0 0 0) …) — precedes the footprint\'s own
    // placement, so the first-(at) heuristic read 0,0 and every move
    // verified as "sits at 0.00,0.00" while the move had landed perfectly
    const board = [
      '(kicad_pcb (version 20260206)',
      '  (',
      '    footprint',
      '    "Resistor_SMD:R_0603_1608Metric"',
      '    (property "Code" "typecad:v1:eyJ2Ijox" (at 0 0 0) (layer "F.Fab") (hide yes))',
      '    (at 133.614 81.72 180)',
      '    (layer "F.Cu")',
      '    (property "Reference" "R5" (at 0 -1.43 0) (layer "F.SilkS"))',
      '  )',
      ')',
    ].join('\n');
    const report = verifyBoardSemantics(board, {
      routes: [], deletes: [],
      placements: [{ ref: 'R5', x: 133.614, y: 81.72 }],
      texts: [],
    });
    expect(report.misses).toEqual([]);
    // and a genuinely wrong expected position still flags with the REAL position named
    const wrong = verifyBoardSemantics(board, {
      routes: [], deletes: [],
      placements: [{ ref: 'R5', x: 130, y: 80 }],
      texts: [],
    });
    expect(wrong.misses.join(' ')).toContain('sits at 133.61,81.72');
  });
});
