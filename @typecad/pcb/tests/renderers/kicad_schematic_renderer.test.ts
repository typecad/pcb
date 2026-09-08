import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockIsSym } = vi.hoisted(() => ({
  mockIsSym: vi.fn(),
}));

vi.mock('../../src/sexpr/index.js', () => ({
  serialize: vi.fn((x: any) => {
    if (Array.isArray(x)) return `(${x.map((e: any) => (typeof e === 'string' ? e : '')).join(' ')})`;
    return String(x);
  }),
  s: vi.fn((...args: any[]) => [args[0], ...args.slice(1)]),
  sym: vi.fn((name: string) => ({ name, sym: true })),
  yes: vi.fn(() => 'yes'),
  no: vi.fn(() => 'no'),
  Sym: { isSym: mockIsSym },
}));

const { mockGetSymbolDefinition, mockGetPinLocation } = vi.hoisted(() => ({
  mockGetSymbolDefinition: vi.fn(),
  mockGetPinLocation: vi.fn(),
}));

vi.mock('../../src/symbol_library_manager.js', () => ({
  SymbolLibraryManager: vi.fn(() => ({
    getSymbolDefinition: mockGetSymbolDefinition,
    getPinLocation: mockGetPinLocation,
  })),
}));

const { mockLogError, mockLogWarning } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
  mockLogWarning: vi.fn(),
}));

const { mockReportError } = vi.hoisted(() => ({
  mockReportError: vi.fn(),
}));

vi.mock('../../src/renderers/schematic_visualizer_types.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    logError: mockLogError,
    logWarning: mockLogWarning,
    displayName: actual.displayName,
    GRID_UNIT_MM: 2.54,
    PAGE_WIDTH_MM: 279.4,
    PAGE_HEIGHT_MM: 215.9,
  };
});

vi.mock('../../src/utils/error_reporter.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    reportError: mockReportError,
    displayName: actual.displayName,
  };
});

vi.mock('../../src/pin.js', () => ({
  Pin: vi.fn(function (ref: string, num: string) {
    return { reference: ref, number: num, owner: undefined };
  }),
}));

vi.mock('../../src/renderers/schematic_templates.js', () => ({
  renderLabel: vi.fn((params) => `(label ${params.net_name} at ${params.x} ${params.y})`),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomUUID: vi.fn(() => '00000000-0000-0000-0000-000000000000'),
    UUID: vi.fn(),
  };
});

import { KiCADSchematic } from '../../src/renderers/kicad_schematic_renderer.js';

function makeComp(overrides: any = {}): any {
  return {
    symbol: 'Device:R',
    reference: 'R1',
    value: '10k',
    footprint: 'Resistor_SMD:R_0805',
    sch: { x: 10, y: 20, rotation: 0 },
    ...overrides,
  };
}

describe('KiCADSchematic', () => {
  let schematic: KiCADSchematic;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockManager = { getSymbolDefinition: mockGetSymbolDefinition, getPinLocation: mockGetPinLocation };
    schematic = new KiCADSchematic(mockManager as any);
  });

  describe('update', () => {
    it('should return null when component has no symbol', () => {
      const result = schematic.update(makeComp({ symbol: undefined }));
      expect(result).toBeNull();
      expect(mockReportError).toHaveBeenCalledWith(expect.stringContaining('no symbol'), expect.anything());
    });

    it('should return null when symbol definition not found', () => {
      mockGetSymbolDefinition.mockReturnValue(null);
      const result = schematic.update(makeComp());
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('should add serializedLibEntry to lib_symbols on first use', () => {
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols (symbol "R" ...))',
        rawSexpr: [],
      });
      schematic.update(makeComp());
      expect(schematic.lib_symbols).toContain('(lib_symbols (symbol "R" ...))');
    });

    it('should not duplicate lib_symbols entries', () => {
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols (symbol "R" ...))',
        rawSexpr: [],
      });
      schematic.update(makeComp());
      schematic.update(makeComp());
      expect(schematic.lib_symbols.filter((s) => s === '(lib_symbols (symbol "R" ...))')).toHaveLength(1);
    });

    it('should warn when component has no sch data and initialize to zero', () => {
      const comp = makeComp({ sch: undefined });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch).toBeDefined();
      expect(comp.sch.rotation).toBe(0);
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('missing schematic placement'));
    });

    it('should warn when sch.x is null', () => {
      const comp = makeComp({ sch: { x: null, y: 20, rotation: 0 } });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch.x).toBe(0);
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('missing sch.x'));
    });

    it('should warn when sch.y is null', () => {
      const comp = makeComp({ sch: { x: 10, y: null, rotation: 0 } });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch.y).toBe(0);
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('missing sch.y'));
    });

    it('should warn when sch.rotation is null', () => {
      const comp = makeComp({ sch: { x: 10, y: 20, rotation: null } });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch.rotation).toBe(0);
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('missing sch.rotation'));
    });

    it('should warn when component is at (0,0) and place randomly', () => {
      Math.random = vi.fn(() => 0.5);
      const comp = makeComp({ sch: { x: 0, y: 0, rotation: 0 } });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('coordinates'));
    });

    it('should warn when component has no reference', () => {
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(makeComp({ reference: '' }));
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('missing a reference'));
    });
  });

  describe('getAbsolutePinCoordinates', () => {
    it('should return null when component has no symbol', () => {
      const result = schematic.getAbsolutePinCoordinates(makeComp({ symbol: undefined }), { number: 1 } as any);
      expect(result).toBeNull();
      expect(mockReportError).toHaveBeenCalledWith(expect.stringContaining('no symbol'), expect.anything());
    });

    it('should return null when component has no sch data', () => {
      const result = schematic.getAbsolutePinCoordinates(makeComp({ sch: undefined }), { number: 1 } as any);
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('no schematic placement'));
    });

    it('should return null when pin is malformed', () => {
      const result = schematic.getAbsolutePinCoordinates(makeComp(), undefined as any);
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('malformed'));
    });

    it('should return null when pin location not found', () => {
      mockGetPinLocation.mockReturnValue(null);
      const result = schematic.getAbsolutePinCoordinates(makeComp(), { number: 1 } as any);
      expect(result).toBeNull();
    });

    it('should calculate absolute coordinates with rotation', () => {
      mockGetPinLocation.mockReturnValue({ x: 5.08, y: 2.54, angle: 0 });
      const comp = makeComp({ sch: { x: 10, y: 20, rotation: 90 } });
      const result = schematic.getAbsolutePinCoordinates(comp, { number: 1 } as any);
      expect(result).toEqual([7.62, 15.24]);
    });

    it('should return snapped coordinates', () => {
      mockGetPinLocation.mockReturnValue({ x: 1, y: 1, angle: 0 });
      const comp = makeComp({ sch: { x: 10, y: 20, rotation: 0 } });
      const result = schematic.getAbsolutePinCoordinates(comp, { number: 1 } as any);
      expect(result).toEqual([10.16, 17.78]);
    });
  });

  describe('net', () => {
    it('should warn when net has no pins', () => {
      schematic.net({ name: 'GND', nodes: [] });
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('no pins'));
    });

    it('should warn when pin has no owner', () => {
      schematic.net({ name: 'NET1', nodes: [{ number: 1, owner: undefined, reference: 'R1', type: 'passive' }] });
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('no owner'));
    });

    it('should warn when pin coordinates cannot be resolved', () => {
      mockGetPinLocation.mockReturnValue(null);
      schematic.net({
        name: 'NET1',
        nodes: [{ number: 1, owner: makeComp({ symbol: undefined }), reference: 'R1', type: 'passive' }],
      });
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get absolute coordinates'));
    });
  });

  describe('addPowerSymbols', () => {
    it('should do nothing when no power net entries exist', () => {
      schematic.addPowerSymbols();
      expect(mockLogWarning).not.toHaveBeenCalled();
    });

    it('should add power symbols and flags for power nets', () => {
      mockGetPinLocation.mockReturnValue({ x: 0, y: 0, angle: 0 });
      (schematic as any).net({
        name: 'VCC',
        nodes: [
          {
            number: 1,
            owner: makeComp({ sch: { x: 100, y: 100, rotation: 0 } }),
            reference: 'U1',
            type: 'power_in',
          },
        ],
      });

      mockGetSymbolDefinition.mockImplementation((fqn: string) => {
        if (fqn === 'power:PWR_FLAG') {
          return { serializedLibEntry: '(symbol "PWR_FLAG" ...)', rawSexpr: [] };
        }
        if (fqn === 'power:VCC') {
          return { serializedLibEntry: '(symbol "VCC" ...)', rawSexpr: [] };
        }
        return null;
      });

      schematic.addPowerSymbols();
      expect(schematic.symbols.length).toBeGreaterThan(0);
    });

    it('should warn when power symbol not found', () => {
      mockGetPinLocation.mockReturnValue({ x: 0, y: 0, angle: 0 });
      (schematic as any).net({
        name: 'VCC',
        nodes: [
          {
            number: 1,
            owner: makeComp({ sch: { x: 100, y: 100, rotation: 0 } }),
            reference: 'U1',
            type: 'power_in',
          },
        ],
      });

      mockGetSymbolDefinition.mockImplementation((fqn: string) => {
        if (fqn === 'power:PWR_FLAG') return { serializedLibEntry: '...', rawSexpr: [] };
        return null;
      });

      schematic.addPowerSymbols();
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('should warn when PWR_FLAG symbol not found', () => {
      mockGetPinLocation.mockReturnValue({ x: 0, y: 0, angle: 0 });
      (schematic as any).net({
        name: 'VCC',
        nodes: [
          {
            number: 1,
            owner: makeComp({ sch: { x: 100, y: 100, rotation: 0 } }),
            reference: 'U1',
            type: 'power_in',
          },
        ],
      });

      mockGetSymbolDefinition.mockReturnValue(null);

      schematic.addPowerSymbols();
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('PWR_FLAG'));
    });
  });
});
