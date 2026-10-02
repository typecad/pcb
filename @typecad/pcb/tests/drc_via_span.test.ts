import { describe, it, expect } from 'vitest';
import { runDrc } from '../src/pcb/pcb_drc_engine.js';

/**
 * Through vias span EVERY copper layer of the stack. The connectivity
 * union-find once gave a through via only its literal F.Cu/B.Cu tokens, so
 * on a 4-layer board an In1/In2 track ending at the via never shared a
 * layer with it — splitting via-joined nets into phantom
 * `unconnected_items` that kicad-cli (with --refill-zones) does not report.
 */

const board = (trackLayer: string, copperCount: number): string => {
  const inner = Array.from({ length: copperCount - 2 }, (_, i) => `(layer "In${i + 1}.Cu" (type "copper"))`).join('\n');
  return `(kicad_pcb (version 20241229) (generator "typeCAD/pcb")
  (layers (layer "F.Cu" (type "copper")) ${inner} (layer "B.Cu" (type "copper")))
  (net 0 "")
  (net 1 "SIG")
  (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "s1"))
  (via (at 20 10) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1) (uuid "v1"))
  (segment (start 20 10) (end 30 20) (width 0.3) (layer "${trackLayer}") (net 1) (uuid "s2"))
)`;
};

describe('through-via layer span in connectivity', () => {
  for (const copperCount of [2, 4, 6]) {
    const inner = `In${Math.max(1, copperCount - 2)}.Cu`;
    const layer = copperCount === 2 ? 'B.Cu' : inner;

    it(`${copperCount}-layer board: track on ${layer} joined through a via stays connected`, () => {
      const report = runDrc(board(layer, copperCount));
      expect(report.unconnected_items).toEqual([]);
    });
  }

  it('a blind via still only bridges its declared span', () => {
    // F.Cu track + via spanning F.Cu..In1.Cu only, plus an In2 track that
    // genuinely has no connection — that In2 piece MUST be reported.
    const blind = `(kicad_pcb (version 20241229) (generator "typeCAD/pcb")
  (layers (layer "F.Cu" (type "copper")) (layer "In1.Cu" (type "copper")) (layer "In2.Cu" (type "copper")) (layer "B.Cu" (type "copper")))
  (net 0 "")
  (net 1 "SIG")
  (segment (start 10 10) (end 20 10) (width 0.3) (layer "F.Cu") (net 1) (uuid "s1"))
  (via blind (at 20 10) (size 0.6) (drill 0.3) (layers "F.Cu" "In1.Cu") (net 1) (uuid "v1"))
  (segment (start 20 10) (end 30 20) (width 0.3) (layer "In1.Cu") (net 1) (uuid "s2"))
  (segment (start 40 40) (end 45 45) (width 0.3) (layer "In2.Cu") (net 1) (uuid "s3"))
)`;
    const report = runDrc(blind);
    expect(report.unconnected_items.length).toBe(1);
    const desc = report.unconnected_items[0]!.items.map((i) => i.description).join(' | ');
    expect(desc).toContain('In2.Cu');
  });
});
