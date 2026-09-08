import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
}));

const { mockParse, mockParseAsList, mockSerialize, mockIsSym } = vi.hoisted(() => ({
  mockParse: vi.fn(),
  mockParseAsList: vi.fn(),
  mockSerialize: vi.fn(),
  mockIsSym: vi.fn(),
}));

vi.mock('../../src/sexpr/index.js', () => ({
  parse: mockParse,
  parseAsList: mockParseAsList,
  serialize: mockSerialize,
  Sym: { isSym: mockIsSym },
}));

const { mockGetLibraryPaths } = vi.hoisted(() => ({
  mockGetLibraryPaths: vi.fn(),
}));

vi.mock('../../src/kicad.js', () => ({
  KiCAD: {
    instance: {
      getLibraryPaths: mockGetLibraryPaths,
    },
  },
}));

vi.mock('../../src/utils/constants.js', () => ({
  LIBRARY_SEPARATOR: ':',
}));

const { MockComponentError } = vi.hoisted(() => ({
  MockComponentError: class extends Error {
    constructor(m: string) {
      super(m);
      this.name = 'ComponentError';
    }
  },
}));

vi.mock('../../src/utils/errors.js', () => ({
  ComponentError: MockComponentError,
}));

import { loadSymbolLib } from '../../src/renderers/component_symbol_loader.js';

function makeSym(name: string) {
  return { name, sym: true };
}

describe('loadSymbolLib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLibraryPaths.mockReturnValue({ symbols: '/kicad/symbols' });
  });

  it('should return cached content if provided and non-empty', () => {
    const result = loadSymbolLib('Device:R', 'R1', '10k', 'cached content');
    expect(result).toBe('cached content');
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('should not use cache when content is empty string', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => loadSymbolLib('Device:R', 'R1', '10k', '')).toThrow('Symbol not found');
  });

  it('should not use cache when content is undefined', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => loadSymbolLib('Device:R', 'R1', '10k', undefined)).toThrow('Symbol not found');
  });

  it('should throw for invalid symbol format (no colon)', () => {
    expect(() => loadSymbolLib('InvalidSymbol', 'R1', '10k', undefined)).toThrow('Invalid symbol format');
  });

  it('should throw for invalid symbol format (too many colons)', () => {
    expect(() => loadSymbolLib('a:b:c', 'R1', '10k', undefined)).toThrow('Invalid symbol format');
  });

  it('should load symbol from kicad library path', () => {
    mockExistsSync.mockImplementation((path: string) => path.includes('Device.kicad_sym'));
    mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R" (pin (number 1))))');
    mockParseAsList.mockReturnValue([
      makeSym('kicad_symbol_lib'),
      [makeSym('symbol'), 'R', [makeSym('pin'), [makeSym('number'), '1']]],
    ]);
    mockIsSym.mockImplementation((x: any) => x && x.name);
    mockSerialize.mockReturnValue('(symbol "R" ...)');

    const result = loadSymbolLib('Device:R', 'R1', '10k', undefined);

    expect(result).toBe('(symbol "R" ...)');
    expect(mockExistsSync).toHaveBeenCalledWith(expect.stringContaining('Device.kicad_sym'));
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('Device.kicad_sym'), 'utf8');
    expect(mockParseAsList).toHaveBeenCalled();
  });

  it('should fall back to build/lib/symbols/ when not in kicad library', () => {
    mockExistsSync.mockImplementation((path: string) => path.includes('build/lib/symbols'));
    mockReadFileSync.mockReturnValue('(symbol from build version)');

    const result = loadSymbolLib('Device:R', 'R1', '10k', undefined);

    expect(result).toBe('(symbol from build version)');
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('build/lib/symbols'), 'utf8');
  });

  it('should throw when symbol not found in library', () => {
    mockExistsSync.mockImplementation((path: string) => path.includes('Device.kicad_sym'));
    mockReadFileSync.mockReturnValue('(kicad_symbol_lib)');
    mockParseAsList.mockReturnValue([makeSym('kicad_symbol_lib'), [makeSym('symbol'), 'Other', [makeSym('pin')]]]);
    mockIsSym.mockImplementation((x: any) => x && x.name);

    expect(() => loadSymbolLib('Device:R', 'R1', '10k', undefined)).toThrow('Symbol not found in library');
  });

  it('should throw when kicad library file does not exist and build fallback also missing', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => loadSymbolLib('Device:R', 'R1', '10k', undefined)).toThrow('Symbol not found');
  });

  it('should wrap non-ComponentError as ComponentError', () => {
    mockExistsSync.mockImplementation(() => {
      throw new Error('disk io error');
    });
    expect(() => loadSymbolLib('Device:R', 'R1', '10k', undefined)).toThrow('Failed to load symbol');
  });

  it('should re-throw ComponentError as-is', () => {
    mockExistsSync.mockImplementation(() => {
      throw new MockComponentError('already wrapped');
    });
    expect(() => loadSymbolLib('Device:R', 'R1', '10k', undefined)).toThrow('already wrapped');
  });
});
