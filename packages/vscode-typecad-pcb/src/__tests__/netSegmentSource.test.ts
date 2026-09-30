// Net-segment source resolution: the selected-segment → TrackBuilder .to()
// mapping behind Enter-on-a-selected-trace, plus the named() fallback for
// a highlighted-but-unselected net.
import { describe, expect, it } from 'vitest';
import { collectChainPoints, resolveNetDeclaration, resolveSegmentSource } from '../netSegmentSource.js';

const src = (eol = '\n') =>
  [
    "import { PCB, LED, TrackBuilder } from '@typecad/pcb';",
    "const typecad = new PCB('demo', {});",
    "const led = new LED({ value: 'red' });",
    "typecad.named('led_a').net(r1.pin(2), led.pin(2));",
    'const route18 = new TrackBuilder(typecad, { net: ',
    "  'led_a',  })",
    "  .from({ x: 18.288, y: -5.5 }, 'F.Cu', 0.3)",
    "  .to({ x: 18.288, y: -2.87, layer: 'F.Cu', width: 0.3 })",
    "  .to({ x: 15.23, y: 0.188, layer: 'F.Cu', width: 0.3 });",
    "const route19 = new TrackBuilder(typecad, { net: 'other' })",
    "  .from({ x: 1, y: 1 }, 'F.Cu', 0.3)",
    "  .to({ x: 2, y: 2, layer: 'F.Cu', width: 0.3 });",
    'typecad.create(led, route18, route19);',
  ].join(eol);

const files = (eol = '\n') => [{ uri: 'C:/p/hw/src/board.ts', text: src(eol) }];

describe('collectChainPoints', () => {
  it('collects points in chain order with the header net, across CRLF too', () => {
    for (const eol of ['\n', '\r\n']) {
      const pts = collectChainPoints(files(eol));
      const led = pts.filter((p) => p.net === 'led_a');
      expect(led).toHaveLength(3);
      expect(led[0]).toMatchObject({ x: 18.288, y: -5.5 });
      expect(led[2]).toMatchObject({ x: 15.23, y: 0.188 });
      expect(led.every((p) => p.uri.endsWith('board.ts'))).toBe(true);
    }
  });
});

describe('resolveSegmentSource', () => {
  const filesLF = files();

  it('the FIRST segment resolves to the line of its .to() — the chain edge that drew it', () => {
    const hit = resolveSegmentSource({ x1: 18.288, y1: -5.5, x2: 18.288, y2: -2.87, net: 'led_a' }, filesLF);
    expect(hit).not.toBeNull();
    expect(hit!.line).toBe(8); // the `.to({ x: 18.288, y: -2.87 ... })` line
    expect(hit!.detail).toContain('chain edge');
  });

  it('the SECOND segment resolves to its own .to() line', () => {
    const hit = resolveSegmentSource({ x1: 18.288, y1: -2.87, x2: 15.23, y2: 0.188, net: 'led_a' }, filesLF);
    expect(hit!.line).toBe(9); // the `.to({ x: 15.23 ... })` line
  });

  it('reversed endpoints resolve the same edge', () => {
    const hit = resolveSegmentSource({ x1: 15.23, y1: 0.188, x2: 18.288, y2: -2.87, net: 'led_a' }, filesLF);
    expect(hit!.line).toBe(9);
  });

  it('segments from a different chain resolve to that chain', () => {
    const hit = resolveSegmentSource({ x1: 1, y1: 1, x2: 2, y2: 2, net: 'other' }, filesLF);
    expect(hit!.line).toBe(12);
  });

  it('autorouter output (no matching chain edge) resolves to nothing', () => {
    expect(resolveSegmentSource({ x1: 100, y1: 100, x2: 101, y2: 101, net: 'led_a' }, filesLF)).toBeNull();
  });

  it('a mismatched net label does not steal another chain’s edge', () => {
    // same geometry as route18's first edge but tagged 'other' — must not
    // match route18's points
    expect(resolveSegmentSource({ x1: 18.288, y1: -5.5, x2: 18.288, y2: -2.87, net: 'other' }, filesLF)).toBeNull();
  });
});

describe('resolveNetDeclaration', () => {
  const filesLF = files();
  it('finds the typecad.named line for the net', () => {
    const hit = resolveNetDeclaration('led_a', filesLF);
    expect(hit).not.toBeNull();
    expect(hit!.line).toBe(4);
    expect(hit!.detail).toBe("typecad.named('led_a')");
  });

  it('returns null for an unknown net', () => {
    expect(resolveNetDeclaration('nope', filesLF)).toBeNull();
  });
});

describe('typecad.track single-line chains (the apply-bridge emitted form)', () => {
  // mod-ec.ts's real shape: `track_X.push(typecad.track({ net: 'N' }).from(A).to(B));`
  const trackSrc =
    "import { PCB } from '@typecad/pcb';\n" +
    "const typecad = new PCB('demo', {});\n" +
    "let track_PROBE_1: TrackBuilder[] = [];\n" +
    "track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 140.1125, y: 82.8 }, \"F.Cu\", 0.127).to({ x: 139.875, y: 82.5625, layer: \"F.Cu\", width: 0.127 }));\n" +
    "track_PROBE_1.push(typecad.track({ net: 'PROBE_1' }).from({ x: 139.875, y: 82.5625 }, \"F.Cu\", 0.127).to({ x: 139.875, y: 86.275, layer: \"F.Cu\", width: 0.127 }));\n";
  const tf = () => [{ uri: 'C:/p/hw/src/mod-ec.ts', text: trackSrc }];

  it('collects points from single-line typecad.track chains', () => {
    const pts = collectChainPoints(tf());
    expect(pts).toHaveLength(4);
    expect(pts[0]).toMatchObject({ net: 'PROBE_1', x: 140.1125, y: 82.8, line: 4 });
    expect(pts[1]).toMatchObject({ net: 'PROBE_1', x: 139.875, y: 82.5625, line: 4 });
  });

  it('resolves a selected segment to its one-line chain (line of the .to)', () => {
    const hit = resolveSegmentSource({ x1: 139.875, y1: 82.5625, x2: 139.875, y2: 86.275, net: 'PROBE_1' }, tf());
    expect(hit).not.toBeNull();
    expect(hit!.line).toBe(5); // the second push line
    expect(hit!.uri).toContain('mod-ec.ts');
  });

  it('the shared endpoint between two one-line chains resolves to the LATER .to', () => {
    // the first chain's .to sits at the same point as the second chain's
    // .from — the segment belongs to the second chain, whose .to defines it
    const hit = resolveSegmentSource({ x1: 140.1125, y1: 82.8, x2: 139.875, y2: 82.5625, net: 'PROBE_1' }, tf());
    expect(hit!.line).toBe(4);
  });
});
