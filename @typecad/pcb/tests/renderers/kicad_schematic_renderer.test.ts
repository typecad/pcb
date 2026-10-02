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

const { mockGetSymbolDefinition, mockGetPinLocation, mockHasSymbol, mockGetUnitLayout, mockGetUnitBoundingBox } =
  vi.hoisted(() => ({
    mockGetSymbolDefinition: vi.fn(),
    mockGetPinLocation: vi.fn(),
    mockHasSymbol: vi.fn(),
    mockGetUnitLayout: vi.fn(),
    mockGetUnitBoundingBox: vi.fn(),
  }));

vi.mock('../../src/symbol_library_manager.js', () => ({
  SymbolLibraryManager: vi.fn(() => ({
    getSymbolDefinition: mockGetSymbolDefinition,
    getPinLocation: mockGetPinLocation,
    hasSymbol: mockHasSymbol,
    getUnitLayout: mockGetUnitLayout,
    getUnitBoundingBox: mockGetUnitBoundingBox,
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
    // Single-unit shape by default — individual tests override for multi-unit.
    mockGetUnitLayout.mockReturnValue({ count: 1, unitsWithPins: [1] });
    mockGetUnitBoundingBox.mockReturnValue(null);
    const mockManager = {
      getSymbolDefinition: mockGetSymbolDefinition,
      getPinLocation: mockGetPinLocation,
      hasSymbol: mockHasSymbol,
      getUnitLayout: mockGetUnitLayout,
      getUnitBoundingBox: mockGetUnitBoundingBox,
    };
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

    it('should silently initialize to defaults when component has no sch data', () => {
      const comp = makeComp({ sch: undefined });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch).toBeDefined();
      expect(comp.sch.rotation).toBe(0);
      expect(mockLogWarning).not.toHaveBeenCalled();
    });

    it('should silently default sch.x to 0 when null', () => {
      const comp = makeComp({ sch: { x: null, y: 20, rotation: 0 } });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch.x).toBe(0);
      expect(mockLogWarning).not.toHaveBeenCalled();
    });

    it('should silently default sch.y to 0 when null', () => {
      const comp = makeComp({ sch: { x: 10, y: null, rotation: 0 } });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch.y).toBe(0);
      expect(mockLogWarning).not.toHaveBeenCalled();
    });

    it('should silently default sch.rotation to 0 when null', () => {
      const comp = makeComp({ sch: { x: 10, y: 20, rotation: null } });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      expect(comp.sch.rotation).toBe(0);
      expect(mockLogWarning).not.toHaveBeenCalled();
    });

    it('should auto-place a component at (0,0) deterministically', () => {
      const comp = makeComp({ sch: { x: 0, y: 0, rotation: 0 }, reference: 'R9', value: '10k' });
      mockGetSymbolDefinition.mockReturnValue({
        serializedLibEntry: '(lib_symbols ...)',
        rawSexpr: [],
      });
      schematic.update(comp);
      // Moved off the origin onto a grid cell…
      expect(comp.sch.x).not.toBe(0);
      expect(comp.sch.y).not.toBe(0);
      // …stably for the same identity (deterministic, no Math.random).
      const again = makeComp({ sch: { x: 0, y: 0, rotation: 0 }, reference: 'R9', value: '10k' });
      schematic.update(again);
      expect(again.sch.x).toBe(comp.sch.x);
      expect(again.sch.y).toBe(comp.sch.y);
      // Unplaced components are silently auto-placed — no warning.
      expect(mockLogWarning).not.toHaveBeenCalled();
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

  describe('multi-unit symbols', () => {
    it('should place one instance per unit, sharing the reference', () => {
      mockGetSymbolDefinition.mockReturnValue({ serializedLibEntry: '(lib_symbols ...)', rawSexpr: [] });
      mockGetUnitLayout.mockReturnValue({ count: 3, unitsWithPins: [1, 2, 3] });
      mockGetUnitBoundingBox.mockReturnValue({ minX: -7.62, minY: -5.08, maxX: 7.62, maxY: 5.08 });

      const result = schematic.update(makeComp({ symbol: 'Analog_Switch:TS3A24159DRC', reference: 'U3' }));
      expect(result).toHaveLength(3);
      for (const instance of result!) {
        expect(instance).toContain('(lib_id Analog_Switch:TS3A24159DRC)');
        expect(instance).toContain('U3');
      }
      // Unit 1 carries no top-level (unit ...) field — KiCad's own writer
      // records it only past the first unit. (The mocked serializer flattens
      // nested nodes, so only top-level tokens are countable here.)
      const unitTokens = (str: string) => (str.match(/\(unit/g) ?? []).length;
      expect(unitTokens(result![0])).toBe(0);
      expect(unitTokens(result![1])).toBe(1);
      expect(unitTokens(result![2])).toBe(1);
    });

    it('should place only units that carry pins', () => {
      mockGetSymbolDefinition.mockReturnValue({ serializedLibEntry: '(lib_symbols ...)', rawSexpr: [] });
      mockGetUnitLayout.mockReturnValue({ count: 3, unitsWithPins: [1, 2] });

      const result = schematic.update(makeComp({ reference: 'U1' }));
      expect(result).toHaveLength(2);
    });

    it('should resolve identical pin offsets on different units to different points', () => {
      // The reported bug: unit 2's pin 7 shared local coordinates with unit
      // 1's pin 5, so both nets' labels stacked on the one drawn switch and
      // merged in ERC. With per-unit instances the pins must separate.
      mockGetSymbolDefinition.mockReturnValue({ serializedLibEntry: '(lib_symbols ...)', rawSexpr: [] });
      mockGetUnitLayout.mockReturnValue({ count: 2, unitsWithPins: [1, 2] });
      mockGetUnitBoundingBox.mockReturnValue({ minX: -7.62, minY: -5.08, maxX: 7.62, maxY: 5.08 });

      const comp = makeComp({ reference: 'U3', sch: { x: 10.16, y: 20.32, rotation: 0 } });
      schematic.update(comp);

      const local = { x: 7.62, y: -2.54, angle: 0 };
      mockGetPinLocation.mockReturnValue({ ...local, unit: 1 });
      const unit1Pin = schematic.getAbsolutePinCoordinates(comp, { number: 2 } as any);
      mockGetPinLocation.mockReturnValue({ ...local, unit: 2 });
      const unit2Pin = schematic.getAbsolutePinCoordinates(comp, { number: 7 } as any);

      // stride = 15.24 width + 2 grids margin = 20.32; unit 2 sits that far right.
      expect(unit1Pin).toEqual([17.78, 22.86]);
      expect(unit2Pin).toEqual([38.1, 22.86]);
      expect(unit1Pin).not.toEqual(unit2Pin);
    });

    it('should fall back to the component position for unknown units or unplaced components', () => {
      mockGetPinLocation.mockReturnValue({ x: 5.08, y: 0, angle: 0, unit: 3 });
      const comp = makeComp({ sch: { x: 10, y: 20, rotation: 0 } });
      // Component never ran through update() — no unit origins recorded.
      expect(schematic.getAbsolutePinCoordinates(comp, { number: 1 } as any)).toEqual([15.24, 20.32]);
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
      mockHasSymbol.mockImplementation((fqn: string) => fqn === 'power:VCC' || fqn === 'power:PWR_FLAG');

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
      mockHasSymbol.mockReturnValue(false);

      schematic.addPowerSymbols();
      // The suggestion-style message names the net and its missing symbol,
      // and says what to do (rename to a library rail).
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('No power symbol for net "VCC"'));
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('power:VCC'));
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('typecad.named('));
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
