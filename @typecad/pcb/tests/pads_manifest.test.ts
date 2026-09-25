// Pad manifest: the PCB model's own pin/net/geometry per pad, extracted
// from the final board contents the build just produced.
import { describe, expect, it } from 'vitest';
import { computePadsManifest } from '../src/pcb/pcb_pads_writer.js';
import { parseAsList } from '../src/sexpr/index.js';

// contents = the board's CHILDREN (no kicad_pcb head) — what createBoard's
// finalBoardContents holds
const board = (body: string) => parseAsList(`(kicad_pcb ${body})`).slice(1) as never;

describe('pads manifest', () => {
  it('extracts pin, net, world position, and rotated extent per copper pad', () => {
    const contents = board(`
      (footprint "T:A" (layer "F.Cu") (at 10 20 90)
        (property "Reference" "A1" (at 0 0 0) (layer "F.SilkS"))
        (pad "1" smd rect (at 1 0 0) (size 0.8 1.2) (layers "F.Cu" "F.Mask") (net 3 "VCC"))
        (pad "2" thru_hole circle (at -1 0 0) (size 1.0 1.0) (layers "*.Cu" "*.Mask") (drill 0.5) (net 0 "")))
      (footprint "T:B" (layer "F.Cu") (at 30 40)
        (property "Reference" "B1" (at 0 0 0) (layer "F.SilkS"))
        (pad "5" smd rect (at 0 0 45) (size 1.0 0.2) (layers "B.Cu") (net 1 "net5")))`);
    const { pads } = computePadsManifest(contents, { boardName: 't' } as never);

    expect(pads).toHaveLength(3);
    const a1 = pads.find((p) => p.ref === 'A1' && p.pin === '1')!;
    // footprint (10,20,90): local (1,0) -> world (10, 20-1) = (10,19)
    expect(a1.x).toBeCloseTo(10);
    expect(a1.y).toBeCloseTo(19);
    expect(a1.net).toBe('VCC');
    expect(a1.layers).toEqual(['F.Cu']);
    // pad rot 0 + footprint rot 90: 0.8x1.2 box rotated -> AABB 1.2 x 0.8
    expect(a1.w).toBeCloseTo(1.2);
    expect(a1.h).toBeCloseTo(0.8);

    const a2 = pads.find((p) => p.ref === 'A1' && p.pin === '2')!;
    expect(a2.net).toBeNull(); // (net 0 "") reads as unconnected
    expect(a2.layers).toEqual(['*.Cu']);

    const b5 = pads.find((p) => p.ref === 'B1' && p.pin === '5')!;
    expect(b5.net).toBe('net5'); // auto nets carry their generated name
    // 45° rotation: 1.0 x 0.2 -> AABB ≈ 0.849 x 0.849
    expect(b5.w).toBeCloseTo((1.0 + 0.2) / Math.SQRT2, 2);
    expect(b5.h).toBeCloseTo((1.0 + 0.2) / Math.SQRT2, 2);
  });

  it('skips pads that touch no copper layer', () => {
    const contents = board(`
      (footprint "T:C" (layer "F.Cu") (at 0 0)
        (property "Reference" "C1" (at 0 0 0) (layer "F.SilkS"))
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Mask")))`);
    const { pads } = computePadsManifest(contents, { boardName: 't' } as never);
    expect(pads).toHaveLength(0);
  });
});
