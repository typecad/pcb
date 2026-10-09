import { describe, expect, it } from 'vitest';
import { resolveZoneSource } from '../zoneSource.js';

const file = (text: string) => [{ uri: 'C:/hw/src/_sync.ts', text }];

// the shape the canonical writer emits (seen on the live project's _sync.ts)
const realWorld = `export function syncBoard(typecad: PCB, parts: Record<string, Component>): void {
  syncTracks.length = 0;
  typecad.zone({ net: 'GND', layers: ['F.Cu'], points: [{ x: 130.002, y: 78.001 }, { x: 130.003, y: 93.005 }, { x: 154.991, y: 93.005 }, { x: 154.991, y: 77.984 }], priority: 1 });
}`;

// a probe as the page sends it: board-frame pts (gerber y already negated)
const gndProbe = {
  net: 'GND',
  layer: 'F.Cu',
  keepout: false,
  pts: [
    { x: 130.002, y: 78.001 },
    { x: 130.003, y: 93.005 },
    { x: 154.991, y: 93.005 },
    { x: 154.991, y: 77.984 },
  ],
};

describe('resolveZoneSource (selected zone → zone({...}) literal)', () => {
  it('matches by points bbox and returns the zone( call line', () => {
    const hit = resolveZoneSource(gndProbe, file(realWorld));
    expect(hit).not.toBeNull();
    expect(hit!.uri).toContain('_sync.ts');
    expect(hit!.line).toBe(3);
    expect(hit!.detail).toContain('GND');
  });

  it('prefers its own net among coincident zones (a pour per layer)', () => {
    const src = realWorld + `\n  typecad.zone({ net: 'PWR', layers: ['B.Cu'], points: [{ x: 130.002, y: 78.001 }, { x: 130.003, y: 93.005 }, { x: 154.991, y: 93.005 }, { x: 154.991, y: 77.984 }], priority: 1 });`;
    const pwr = { ...gndProbe, net: 'PWR', layer: 'B.Cu' };
    const hit = resolveZoneSource(pwr, file(src));
    expect(hit).not.toBeNull();
    expect(hit!.line).toBe(5);
  });

  it('matches a multi-line literal at the zone( line', () => {
    const src = `typecad.zone({
      net: 'GND',
      layers: ['F.Cu'],
      points: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 6 },
        { x: 0, y: 6 },
      ],
    });`;
    const hit = resolveZoneSource(
      { net: 'GND', layer: 'F.Cu', keepout: false, pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }] },
      file(src),
    );
    expect(hit).not.toBeNull();
    expect(hit!.line).toBe(1);
  });

  it('null when nothing matches (stale page, moved zone)', () => {
    const moved = { ...gndProbe, pts: gndProbe.pts.map((p) => ({ x: p.x + 5, y: p.y })) };
    expect(resolveZoneSource(moved, file(realWorld))).toBeNull();
    expect(resolveZoneSource({ ...gndProbe, pts: [] }, file(realWorld))).toBeNull();
  });
});
