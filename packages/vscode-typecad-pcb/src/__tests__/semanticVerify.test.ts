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

  it('segments match in either orientation and within rounding tolerance', () => {
    const flipped = board()
      .replace('(start 7 7) (end 9 9)', '(start 9.001 9.001) (end 7 7)')
      .replace('  (segment (start 1 1) (end 4 1) (width 0.3) (layer "F.Cu") (net 3) (uuid "x2"))\n', '');
    expect(verifyBoardSemantics(flipped, base).ok).toBe(true);
  });
});
