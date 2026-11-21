import { describe, expect, it } from 'vitest';
import { sameSyncRouteGeometry, syncRouteGeometry } from '../src/kicad2typecad/route_geometry.js';

// The layout view wrote the +BATT net as two routes joined at 5.402,0.077;
// the board regenerator chains the same copper into one route. Seen live as
// check-sync drift on the build's own output ("the build does not reproduce
// this board from source").
const SPLIT = [
  "  const route3 = new TrackBuilder(typecad, { net: '+BATT',  })",
  "  .from({ x: 15.8, y: -12.5 }, 'F.Cu', 0.3)",
  "  .to({ x: 15.8, y: -10.321, layer: 'F.Cu', width: 0.3 })",
  "  .to({ x: 5.402, y: 0.077, layer: 'F.Cu', width: 0.3 });",
  '  syncTracks.push(route3);',
  "  const route4 = new TrackBuilder(typecad, { net: '+BATT',  })",
  "  .from({ x: 5.402, y: 0.077 }, 'F.Cu', 0.3)",
  "  .to({ x: 4.402, y: 0.077, layer: 'F.Cu', width: 0.3 })",
  "  .to({ x: 4.325, y: 0, layer: 'F.Cu', width: 0.3 });",
  '  syncTracks.push(route4);',
].join('\n');

const CHAINED = [
  '  // Net: +BATT',
  "  const route3 = new TrackBuilder(typecad, { net: '+BATT',  })",
  "  .from({ x: 15.8, y: -12.5 }, 'F.Cu', 0.3)",
  "  .to({ x: 15.8, y: -10.321, layer: 'F.Cu', width: 0.3 })",
  "  .to({ x: 5.402, y: 0.077, layer: 'F.Cu', width: 0.3 })",
  "  .to({ x: 4.402, y: 0.077, layer: 'F.Cu', width: 0.3 })",
  "  .to({ x: 4.325, y: 0, layer: 'F.Cu', width: 0.3 });",
  '  syncTracks.push(route3);',
].join('\n');

describe('sidecar route geometry', () => {
  it('two legs drawn separately equal the regenerator chaining them into one', () => {
    expect(sameSyncRouteGeometry(SPLIT, CHAINED)).toBe(true);
  });

  it('route order does not matter', () => {
    const gnd = [
      "  const route9 = new TrackBuilder(typecad, { net: 'GND',  })",
      "  .from({ x: 0, y: 0 }, 'F.Cu', 0.5)",
      "  .to({ x: 1, y: 0, layer: 'F.Cu', width: 0.5 });",
      '  syncTracks.push(route9);',
    ].join('\n');
    expect(sameSyncRouteGeometry(`${gnd}\n${SPLIT}`, `${CHAINED}\n${gnd}`)).toBe(true);
  });

  it('a moved endpoint, a width change, or a layer change is drift', () => {
    expect(sameSyncRouteGeometry(SPLIT, CHAINED.replace('x: 4.325', 'x: 4.4'))).toBe(false);
    expect(sameSyncRouteGeometry(SPLIT, CHAINED.replace(/width: 0\.3 \}\);/, 'width: 0.25 });'))).toBe(false);
    expect(sameSyncRouteGeometry(SPLIT, CHAINED.replace("layer: 'F.Cu', width: 0.3 });", "layer: 'B.Cu', width: 0.3 });"))).toBe(false);
  });

  it('a missing or duplicated segment is drift (multiset, not set)', () => {
    const doubled = `${SPLIT}\n${SPLIT.replace(/route3/g, 'route5').replace(/route4/g, 'route6')}`;
    expect(sameSyncRouteGeometry(doubled, CHAINED)).toBe(false);
  });

  it('chain-end and standalone vias take part in the comparison', () => {
    const withVia = CHAINED.replace(
      "  .to({ x: 4.325, y: 0, layer: 'F.Cu', width: 0.3 });",
      "  .to({ x: 4.325, y: 0, layer: 'F.Cu', width: 0.3 })\n  .via({ size: 0.6, drill: 0.3 });",
    );
    expect(sameSyncRouteGeometry(withVia, CHAINED)).toBe(false);
    expect(sameSyncRouteGeometry(withVia, withVia)).toBe(true);
    const sv = "  typecad.via({ at: { x: 1, y: 2 }, net: 'GND', size: 0.6, drill: 0.3 });";
    expect(sameSyncRouteGeometry(`${CHAINED}\n${sv}`, `${sv}\n${CHAINED}`)).toBe(true);
  });

  it('anything it does not understand is unparseable — the token compare stays in charge', () => {
    expect(syncRouteGeometry(`${CHAINED}\n  parts.r1.pcb = { x: 1, y: 2 };`)).toBeNull();
    // a declared route never collected
    expect(syncRouteGeometry(CHAINED.replace('  syncTracks.push(route3);', ''))).toBeNull();
    // computed coordinates
    expect(syncRouteGeometry(CHAINED.replace('x: 15.8, y: -12.5', 'x: X0, y: -12.5'))).toBeNull();
    expect(sameSyncRouteGeometry(`${CHAINED}\n  foo();`, `${CHAINED}\n  foo();`)).toBe(false);
  });

  it('a mid-chain via (layout view layer change) equals the regenerator\'s standalone via', () => {
    // found by the round-trip harness: an F.Cu→via→B.Cu route drawn in the
    // layout view kept reading as check-sync drift on its own build
    const drawn = [
      "  const route1 = new TrackBuilder(typecad, { net: '+BATT',  })",
      "  .from({ x: 5, y: 5 }, 'F.Cu', 0.3)",
      "  .to({ x: 8, y: 5, layer: 'F.Cu', width: 0.3 })",
      '  .via({ size: 0.6, drill: 0.3 })',
      "  .to({ x: 8, y: 9, layer: 'B.Cu', width: 0.3 });",
      '  syncTracks.push(route1);',
    ].join('\n');
    const regenerated = [
      '  // Net: +BATT',
      "  const route1 = new TrackBuilder(typecad, { net: '+BATT',  })",
      "  .from({ x: 5, y: 5 }, 'F.Cu', 0.3)",
      "  .to({ x: 8, y: 5, layer: 'F.Cu', width: 0.3 })",
      "  .to({ x: 8, y: 9, layer: 'B.Cu', width: 0.3 });",
      '  syncTracks.push(route1);',
      '',
      "  typecad.via({ at: { x: 8, y: 5 }, net: '+BATT', size: 0.6, drill: 0.3 });",
    ].join('\n');
    expect(sameSyncRouteGeometry(drawn, regenerated)).toBe(true);
    // a different barrel, net or position is still drift
    expect(sameSyncRouteGeometry(drawn, regenerated.replace('drill: 0.3 })', 'drill: 0.4 })'))).toBe(false);
    expect(sameSyncRouteGeometry(drawn, regenerated.replace("net: '+BATT', size", "net: 'GND', size"))).toBe(false);
    expect(sameSyncRouteGeometry(drawn, regenerated.replace('x: 8, y: 5 }, net', 'x: 8, y: 6 }, net'))).toBe(false);
    // a blind via names its span; the plain through pair is the default
    expect(
      sameSyncRouteGeometry(
        drawn.replace('drill: 0.3 })', "drill: 0.3, layers: ['F.Cu', 'B.Cu'] })"),
        regenerated,
      ),
    ).toBe(true);
    expect(
      sameSyncRouteGeometry(drawn.replace('drill: 0.3 })', "drill: 0.3, layers: ['F.Cu', 'In1.Cu'] })"), regenerated),
    ).toBe(false);
  });

  it('CRLF blocks reduce the same', () => {
    expect(sameSyncRouteGeometry(SPLIT.replace(/\n/g, '\r\n'), CHAINED)).toBe(true);
  });
});
