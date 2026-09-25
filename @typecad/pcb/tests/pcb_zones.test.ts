import { describe, it, expect } from 'vitest';
import { zone, keepout } from '../src/pcb/pcb_zones.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';
import { Schematic } from '../src/schematic.js';
import { Pin } from '../src/pin.js';

function makeState(): PcbInternalState {
  return new PcbInternalState({ schematic: new Schematic('test') });
}

describe('zone', () => {
  it('should create a zone with net identifier', () => {
    const state = makeState();
    zone(state, {
      net: 'GND',
      layers: ['F.Cu', 'B.Cu'],
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
    expect(state.zones).toHaveLength(1);
    expect(state.zones[0].net).toBe('net:GND');
    expect(state.zones[0].layers).toEqual(['F.Cu', 'B.Cu']);
  });

  it('should create a zone with pin identifier', () => {
    const state = makeState();
    const pin = new Pin('U1', 5);
    zone(state, {
      pin,
      layers: ['F.Cu'],
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
    expect(state.zones).toHaveLength(1);
    expect(state.zones[0].net).toBe('pin:U1:5');
  });

  it('should create an unconnected pour (net 0) when neither pin nor net provided', () => {
    const state = makeState();
    zone(state, {
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(state.zones).toHaveLength(1);
    expect(state.zones[0].net).toBeUndefined();
  });

  it('should not add zone when both pin and net provided', () => {
    const state = makeState();
    zone(state, {
      pin: new Pin('U1', 5),
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(state.zones).toHaveLength(0);
  });

  it('should create correct polygon corners', () => {
    const state = makeState();
    zone(state, {
      net: 'VCC',
      layers: ['F.Cu'],
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
    const z = state.zones[0];
    expect(z.polygon).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
    ]);
  });

  it('should apply default fill settings', () => {
    const state = makeState();
    zone(state, {
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const z = state.zones[0];
    expect(z.fillMode).toBe('solid');
    expect(z.filled).toBe(true);
    expect(z.priority).toBe(0);
    expect(z.locked).toBe(false);
  });

  it('should apply default thermal relief settings', () => {
    const state = makeState();
    zone(state, {
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const z = state.zones[0];
    expect(z.clearance).toBe(0.2);
    expect(z.thermalGap).toBe(0.254);
    expect(z.thermalBridgeWidth).toBe(0.4064);
  });

  it('should apply custom settings', () => {
    const state = makeState();
    zone(state, {
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fillMode: 'hatched',
      filled: false,
      priority: 5,
      locked: true,
      clearance: 0.3,
    });
    const z = state.zones[0];
    expect(z.fillMode).toBe('hatched');
    expect(z.filled).toBe(false);
    expect(z.priority).toBe(5);
    expect(z.locked).toBe(true);
    expect(z.clearance).toBe(0.3);
  });
});

describe('keepout', () => {
  it('should create a keepout zone with default restrictions', () => {
    const state = makeState();
    keepout(state, {
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(state.keepoutZones).toHaveLength(1);
    const kz = state.keepoutZones[0];
    expect(kz.restrictions.tracks).toBe(true);
    expect(kz.restrictions.vias).toBe(true);
    expect(kz.restrictions.pads).toBe(true);
    expect(kz.restrictions.copperpour).toBe(true);
    expect(kz.restrictions.footprints).toBe(true);
  });

  it('should allow custom restrictions', () => {
    const state = makeState();
    keepout(state, {
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      restrictions: {
        tracks: false,
        vias: false,
        pads: false,
        copperpour: true,
        footprints: false,
      },
    });
    const kz = state.keepoutZones[0];
    expect(kz.restrictions.tracks).toBe(false);
    expect(kz.restrictions.vias).toBe(false);
    expect(kz.restrictions.pads).toBe(false);
    expect(kz.restrictions.copperpour).toBe(true);
    expect(kz.restrictions.footprints).toBe(false);
  });

  it('should create correct polygon corners', () => {
    const state = makeState();
    keepout(state, {
      layers: ['F.Cu'],
      x: 5,
      y: 10,
      width: 20,
      height: 30,
    });
    const kz = state.keepoutZones[0];
    expect(kz.polygon).toEqual([
      { x: 5, y: 10 },
      { x: 25, y: 10 },
      { x: 25, y: 40 },
      { x: 5, y: 40 },
    ]);
  });

  it('should apply default settings', () => {
    const state = makeState();
    keepout(state, {
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    const kz = state.keepoutZones[0];
    expect(kz.priority).toBe(0);
    expect(kz.locked).toBe(false);
    expect(kz.hatchStyle).toBe('edge');
    expect(kz.hatchPitch).toBe(0.508);
  });

  it('should apply custom settings', () => {
    const state = makeState();
    keepout(state, {
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      priority: 10,
      locked: true,
      name: 'Antenna Keepout',
      hatchStyle: 'full',
      hatchPitch: 1.0,
    });
    const kz = state.keepoutZones[0];
    expect(kz.priority).toBe(10);
    expect(kz.locked).toBe(true);
    expect(kz.name).toBe('Antenna Keepout');
    expect(kz.hatchStyle).toBe('full');
    expect(kz.hatchPitch).toBe(1.0);
  });
});
