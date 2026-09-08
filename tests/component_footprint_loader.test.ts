import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
}));

const { mockGetLibraryPaths } = vi.hoisted(() => ({
  mockGetLibraryPaths: vi.fn(() => ({
    symbols: '/usr/share/kicad/symbols',
    footprints: '/usr/share/kicad/footprints',
  })),
}));

vi.mock('../src/kicad.js', () => ({
  KiCAD: {
    instance: {
      getLibraryPaths: mockGetLibraryPaths,
      isFlatpak: false,
    },
  },
}));

vi.mock('../src/kicad_commands.js', () => ({
  executeKiCADCommandSync: vi.fn(),
}));

vi.mock('../src/utils/logging.js', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), success: vi.fn() },
}));

vi.mock('../src/utils/constants.js', () => ({
  LIBRARY_SEPARATOR: ':',
}));

import { loadFootprintLib } from '../src/pcb/component_footprint_loader.js';

describe('loadFootprintLib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached content when provided', () => {
    const result = loadFootprintLib('Lib:Fp', 'R1', '10k', '(footprint "cached")');
    expect(result).toBe('(footprint "cached")');
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('treats empty string as no cache and searches filesystem', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => loadFootprintLib('Lib:Fp', 'R1', '10k', '')).toThrow(/Footprint file not found/);
  });

  it('resolves footprint from flatpak runtime paths via getLibraryPaths', () => {
    const flatpakFootprints =
      '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Footprints/x86_64/stable/active/files/footprints';
    mockGetLibraryPaths.mockReturnValue({
      symbols: '/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols/x86_64/stable/active/files/symbols',
      footprints: flatpakFootprints,
    });

    const footprintPath = `${flatpakFootprints}/Resistor_SMD.pretty/R_0603.kicad_mod`;
    mockExistsSync.mockImplementation((p: string) => p === footprintPath);
    mockReadFileSync.mockReturnValue('(footprint "Resistor_SMD:R_0603" (layer "F.Cu") (pad 1 smd rect (at 0 0 0)))');

    const result = loadFootprintLib('Resistor_SMD:R_0603', 'R1', '10k', undefined);

    expect(mockGetLibraryPaths).toHaveBeenCalled();
    expect(mockExistsSync).toHaveBeenCalledWith(footprintPath);
    expect(result).toContain('footprint');
  });

  it('does NOT construct path from KiCAD.path — uses getLibraryPaths instead', () => {
    const expectedFootprintsDir = '/some/kicad/footprints';
    mockGetLibraryPaths.mockReturnValue({
      symbols: '/some/kicad/symbols',
      footprints: expectedFootprintsDir,
    });

    const footprintPath = `${expectedFootprintsDir}/Capacitor_SMD.pretty/C_0402.kicad_mod`;
    mockExistsSync.mockImplementation((p: string) => p === footprintPath);
    mockReadFileSync.mockReturnValue('(footprint "Capacitor_SMD:C_0402" (layer "F.Cu"))');

    loadFootprintLib('Capacitor_SMD:C_0402', 'C1', '100nF', undefined);

    expect(mockExistsSync).toHaveBeenCalledWith(footprintPath);
  });

  it('throws ComponentError with searched paths when footprint not found', () => {
    mockGetLibraryPaths.mockReturnValue({
      symbols: '/usr/share/kicad/symbols',
      footprints: '/usr/share/kicad/footprints',
    });
    mockExistsSync.mockReturnValue(false);

    expect(() => loadFootprintLib('Missing:Fp', 'U1', 'IC', undefined)).toThrow(/Footprint file not found/);
    expect(() => loadFootprintLib('Missing:Fp', 'U1', 'IC', undefined)).toThrow(/Searched:/);
  });
});
