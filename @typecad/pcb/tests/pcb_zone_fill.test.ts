import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import { PCB, getPcbState } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { materializeZoneFills } from '../src/pcb/pcb_zone_fill.js';

// create() renders a schematic, which resolves symbols through the KiCAD
// locator; the fake keeps that working on machines (and CI) without an
// install. The fill itself is native — no kicad-cli anywhere in this path.
vi.mock('../src/kicad.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/kicad.js')>();
  const fakeInstance = {
    path: '/fake/kicad',
    cliPath: '/fake/kicad/bin/kicad-cli',
    isFlatpak: false,
    getLibraryPaths: () => ({ symbols: '', footprints: '', templates: '' }),
  };
  class FakeKiCAD {
    static get instance() {
      return fakeInstance;
    }
    static resetInstance(): void {}
    static get path() {
      return fakeInstance.path;
    }
    static get cliPath() {
      return fakeInstance.cliPath;
    }
    static get isFlatpak() {
      return fakeInstance.isFlatpak;
    }
  }
  return { ...actual, KiCAD: FakeKiCAD };
});

function boardWithZone(zoneOptions: Record<string, unknown> | null, pcbOptions?: Record<string, unknown>) {
  const pcb = new PCB('test_zone_fill', pcbOptions as never);
  const c1 = new Component('test:pad');
  c1.reference = 'U1';
  c1.pins = [c1.pin(1)];
  c1.pcb = { x: 5, y: 5 } as never;
  const simpleFootprint = '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))';
  vi.spyOn(c1, 'footprint_lib').mockReturnValue(simpleFootprint as never);
  pcb.add(c1);
  if (zoneOptions) pcb.zone(zoneOptions as never);
  return { pcb, c1 };
}

const boardPath = './build/test_zone_fill.kicad_pcb';
const hasFills = (): boolean => fs.readFileSync(boardPath, 'utf8').includes('(filled_polygon');

describe('materializeZoneFills (native)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.rmSync(boardPath, { force: true });
    fs.mkdirSync('./build', { recursive: true });
  });

  it("does not fill from create() — fills are the consumer's responsibility", () => {
    const { pcb, c1 } = boardWithZone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 10, height: 10 });
    pcb.create(c1);
    expect(fs.existsSync(boardPath)).toBe(true);
    expect(hasFills()).toBe(false);
  });

  it('writes filled_polygon blocks natively (no kicad-cli) when called on a board with zones', () => {
    const { pcb, c1 } = boardWithZone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 10, height: 10 });
    pcb.create(c1);
    materializeZoneFills(pcb, getPcbState(pcb));
    expect(hasFills()).toBe(true);
    // the fill is KiCad-readable: layer-tagged polygon inside the zone
    const filled = fs.readFileSync(boardPath, 'utf8');
    expect(filled).toMatch(/\(filled_polygon \(layer "F\.Cu"\) \(pts /);
  });

  it('does not fill when the only zone opts out with fill: false', () => {
    const { pcb, c1 } = boardWithZone({
      net: 'GND',
      layers: ['F.Cu'],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fill: false,
    });
    pcb.create(c1);
    materializeZoneFills(pcb, getPcbState(pcb));
    expect(hasFills()).toBe(false);
  });

  it('does not fill when the board has no zones at all', () => {
    const { pcb, c1 } = boardWithZone(null);
    pcb.create(c1);
    materializeZoneFills(pcb, getPcbState(pcb));
    expect(hasFills()).toBe(false);
  });

  it('does not fill with the global opt-out fill_zones: false', () => {
    const { pcb, c1 } = boardWithZone(
      { net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 10, height: 10 },
      { fill_zones: false },
    );
    pcb.create(c1);
    materializeZoneFills(pcb, getPcbState(pcb));
    expect(hasFills()).toBe(false);
  });

  it('treats a fill failure as non-fatal and leaves the board file alone', () => {
    const { pcb, c1 } = boardWithZone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 10, height: 10 });
    pcb.create(c1);
    const before = fs.readFileSync(boardPath, 'utf8');
    // a directory at the board path makes the read throw inside the refill —
    // the catch must warn, not propagate
    fs.rmSync(boardPath);
    fs.mkdirSync(boardPath);
    expect(() => materializeZoneFills(pcb, getPcbState(pcb))).not.toThrow();
    fs.rmSync(boardPath, { recursive: true });
    fs.writeFileSync(boardPath, before, 'utf8');
  });
});
