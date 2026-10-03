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

  it('resolves every net reference form — inline, name-only resave, legacy coded', () => {
    // Who last saved the board decides the pad's `(net …)` form; the name
    // must survive all three or the viewer's pad labels drop to pin numbers
    // only (labels render from this manifest, not from the gerbers).
    const contents = board(`
      (net 1 "VCC")
      (net 2 "GND")
      (net 3 "SIG")
      (footprint "T:N" (layer "F.Cu") (at 5 5)
        (property "Reference" "N1" (at 0 0 0) (layer "F.SilkS"))
        (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "VCC"))
        (pad "2" smd rect (at 2 0) (size 1 1) (layers "F.Cu") (net "GND"))
        (pad "3" smd rect (at 4 0) (size 1 1) (layers "F.Cu") (net 3))
        (pad "4" smd rect (at 6 0) (size 1 1) (layers "F.Cu") (net 0 "")))`);
    const { pads } = computePadsManifest(contents, { boardName: 't' } as never);
    const netOf = (pin: string) => pads.find((p) => p.pin === pin)!.net;
    expect(netOf('1')).toBe('VCC'); // inline name (KiCad's own writer)
    expect(netOf('2')).toBe('GND'); // kicad-cli resave: name-only reference
    expect(netOf('3')).toBe('SIG'); // legacy coded: name only in the table
    expect(netOf('4')).toBeNull(); // (net 0 "") stays unconnected
  });
});

describe('pads manifest vs KiCad rotation (the 90°/270° label-and-snap incident)', () => {
  // three-pin footprint: pin 3 sits alone on +x locally; pins 1,2 on -x.
  // The viewer renders labels AND trace-snaps from this manifest, while the
  // ink comes from the gerbers — the two must agree under every rotation
  const fp = (ref: string, x: number, y: number, rot: number) => `
      (footprint "T:${ref}" (layer "F.Cu") (at ${x} ${y} ${rot})
        (property "Reference" "${ref}" (at 0 0 0) (layer "F.SilkS"))
        (pad "1" smd rect (at -0.8875 -0.65 0) (size 0.925 0.45) (layers "F.Cu") (net 1 "A"))
        (pad "2" smd rect (at -0.8875 0.65 0) (size 0.925 0.45) (layers "F.Cu") (net 2 "B"))
        (pad "3" smd rect (at 0.8875 0 0) (size 0.925 0.45) (layers "F.Cu") (net 3 "C")))`;
  const at = (contents: never[], ref: string, pin: string) => {
    const { pads } = computePadsManifest(contents, { boardName: 't' } as never);
    const p = pads.find((e) => e.ref === ref && e.pin === pin)!;
    return { x: p.x, y: p.y };
  };

  it('90°: pin 3 tops the part, pins 1/2 bottom — matching the gerber plot', () => {
    const contents = board(fp('D90', 10, 10, 90));
    const p3 = at(contents, 'D90', '3');
    const p1 = at(contents, 'D90', '1');
    const p2 = at(contents, 'D90', '2');
    // board y-down: above center = smaller y. KiCad plots (verified against
    // exported gerbers): local (lx,ly) -> world (fx + ly, fy - lx) at 90°
    expect(p3.y).toBeLessThan(10); // pin 3 alone on top
    expect(p1.y).toBeGreaterThan(10);
    expect(p2.y).toBeGreaterThan(10);
    expect(p1.x).toBeCloseTo(9.35);
    expect(p2.x).toBeCloseTo(10.65);
    expect(p3.x).toBeCloseTo(10);
  });

  it('270°: pin 3 bottoms the part, pins 1/2 top — the mirror of 90°', () => {
    const contents = board(fp('D270', 20, 10, 270));
    const p3 = at(contents, 'D270', '3');
    const p1 = at(contents, 'D270', '1');
    const p2 = at(contents, 'D270', '2');
    expect(p3.y).toBeGreaterThan(10); // pin 3 alone on the bottom
    expect(p1.y).toBeLessThan(10);
    expect(p2.y).toBeLessThan(10);
    expect(p1.x).toBeCloseTo(20.65);
    expect(p2.x).toBeCloseTo(19.35);
    expect(p3.x).toBeCloseTo(20);
  });

  it('0°: pins 1/2 left of the part, pin 3 right — the authored layout', () => {
    const contents = board(fp('D0', 30, 10, 0));
    const p3 = at(contents, 'D0', '3');
    const p1 = at(contents, 'D0', '1');
    expect(p1.x).toBeLessThan(30);
    expect(p3.x).toBeGreaterThan(30);
    expect(p1.y).toBeCloseTo(9.35);
    expect(p3.y).toBeCloseTo(10);
  });
});
