import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { PCB } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';

const { mockRefill } = vi.hoisted(() => ({ mockRefill: vi.fn() }));

// Refill is kicad-cli's job; mock it so the gating logic is testable
// without KiCad (CI runs with KICAD_NOT_AVAILABLE=1).
vi.mock('../src/kicad_commands.js', () => ({
  executeKiCADCommandSync: mockRefill,
}));

vi.mock('../src/kicad.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/kicad.js')>();
  // The KiCAD locator must not throw here or the sync executor never runs;
  // everything else in the module stays real.
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

describe('materializeZoneFills', () => {
  const previousEnv = process.env.KICAD_NOT_AVAILABLE;
  beforeEach(() => {
    vi.clearAllMocks();
    // CI sets this for the whole suite; these tests assert the refill path,
    // so they must run with the escape hatch off.
    delete process.env.KICAD_NOT_AVAILABLE;
    try {
      fs.rmSync('./build/test_zone_fill.kicad_pcb');
    } catch {
      /* not written yet */
    }
    try {
      fs.mkdirSync('./build');
    } catch {
      /* exists */
    }
  });
  afterEach(() => {
    if (previousEnv !== undefined) process.env.KICAD_NOT_AVAILABLE = previousEnv;
    else delete process.env.KICAD_NOT_AVAILABLE;
  });

  it('refills after create() when a zone requests filling', () => {
    const { pcb, c1 } = boardWithZone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 10, height: 10 });
    pcb.create(c1);
    expect(mockRefill).toHaveBeenCalledTimes(1);
    const [command, args] = mockRefill.mock.calls[0];
    expect(command).toBe('pcb');
    expect(args).toContain('--refill-zones');
    expect(args).toContain('--save-board');
    expect(args.join(' ')).toContain('test_zone_fill.kicad_pcb');
  });

  it('does not refill when the only zone opts out with fill: false', () => {
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
    expect(mockRefill).not.toHaveBeenCalled();
  });

  it('does not refill when the board has no zones at all', () => {
    const { pcb, c1 } = boardWithZone(null);
    pcb.create(c1);
    expect(mockRefill).not.toHaveBeenCalled();
  });

  it('does not refill with the global opt-out fill_zones: false', () => {
    const { pcb, c1 } = boardWithZone(
      { net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 10, height: 10 },
      { fill_zones: false },
    );
    pcb.create(c1);
    expect(mockRefill).not.toHaveBeenCalled();
  });

  it('treats a kicad-cli failure as non-fatal when the fill did not land', () => {
    mockRefill.mockImplementation(() => {
      throw new Error('kicad-cli failed');
    });
    const { pcb, c1 } = boardWithZone({ net: 'GND', layers: ['F.Cu'], x: 0, y: 0, width: 10, height: 10 });
    expect(() => pcb.create(c1)).not.toThrow();
    expect(mockRefill).toHaveBeenCalled();
  });
});
