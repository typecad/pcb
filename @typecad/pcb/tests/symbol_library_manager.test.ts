import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockExistsSync, mockReadFileSync, mockPlatform } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockPlatform: vi.fn(() => 'linux'),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync },
}));
vi.mock('node:os', () => ({
  platform: mockPlatform,
}));

const { mockParse, mockParseAsList, mockSerialize, mockIsSym } = vi.hoisted(() => ({
  mockParse: vi.fn(),
  mockParseAsList: vi.fn(),
  mockSerialize: vi.fn((x: any) => {
    if (Array.isArray(x))
      return `(${x.map((e: any) => (typeof e === 'object' && e.name ? e.name : String(e))).join(' ')})`;
    return String(x);
  }),
  mockIsSym: vi.fn((x: any) => x && x.name !== undefined),
}));

vi.mock('../src/sexpr/index.js', () => ({
  parse: mockParse,
  parseAsList: mockParseAsList,
  serialize: mockSerialize,
  Sym: { isSym: mockIsSym },
}));

const { mockLogError, mockLogWarning } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
  mockLogWarning: vi.fn(),
}));

vi.mock('../src/renderers/schematic_visualizer_types.js', () => ({
  logError: mockLogError,
  logWarning: mockLogWarning,
}));

vi.mock('../src/kicad.js', () => ({
  KiCAD: {
    path: '/usr/share/kicad/',
    instance: {
      cliPath: 'kicad-cli',
      path: '/usr/share/kicad/',
      isFlatpak: false,
      getLibraryPaths: () => ({ symbols: '/usr/share/kicad/symbols', footprints: '/usr/share/kicad/footprints' }),
    },
  },
}));

vi.mock('../src/utils/constants.js', () => ({
  LIBRARY_SEPARATOR: ':',
}));

import {
  SymbolLibraryManager,
  getSymbolLibraryManager,
  resetSymbolLibraryManager,
} from '../src/symbol_library_manager.js';

function makeSym(name: string) {
  return { name, sym: true };
}

describe('SymbolLibraryManager', () => {
  let manager: SymbolLibraryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('linux');
    manager = new SymbolLibraryManager();
  });

  afterEach(() => {
    resetSymbolLibraryManager();
  });

  describe('getSymbolLibraryManager (singleton)', () => {
    it('should return the same instance on repeated calls', () => {
      const a = getSymbolLibraryManager();
      const b = getSymbolLibraryManager();
      expect(a).toBe(b);
    });

    it('should return a new instance after reset', () => {
      const a = getSymbolLibraryManager();
      resetSymbolLibraryManager();
      const b = getSymbolLibraryManager();
      expect(a).not.toBe(b);
    });
  });

  describe('constructor', () => {
    it('should set kicadSymbolPath from library paths', () => {
      expect((manager as any).kicadSymbolPath).toBe('/usr/share/kicad/symbols');
    });
  });

  describe('getSymbolDefinition', () => {
    it('should return cached definition if available', () => {
      const cached = { rawSexpr: [], serializedLibEntry: 'cached' };
      (manager as any).symbolCache.set('Device:R', cached);
      const result = manager.getSymbolDefinition('Device:R');
      expect(result).toBe(cached);
    });

    it('should return null for invalid FQN (no colon)', () => {
      const result = manager.getSymbolDefinition('Invalid');
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('Invalid fully qualified symbol name'));
    });

    it('should return null for invalid FQN (multiple colons)', () => {
      const result = manager.getSymbolDefinition('a:b:c');
      expect(result).toBeNull();
    });

    it('should return null when library content cannot be loaded', () => {
      mockExistsSync.mockReturnValue(false);
      const result = manager.getSymbolDefinition('Device:R');
      expect(result).toBeNull();
    });

    it('should load symbol from library file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R" (pin number 1) (pin number 2)))');
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [makeSym('symbol'), 'R', [makeSym('pin'), [makeSym('number'), '1']]],
      ]);

      const result = manager.getSymbolDefinition('Device:R');
      expect(result).not.toBeNull();
      expect(result!.serializedLibEntry).toBeTruthy();
    });

    it('should handle extends by recursively resolving base symbol', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R" (extends "Base") (pin number 1)))');
      const baseSymbol = [
        makeSym('symbol'),
        'Base',
        [makeSym('pin'), [makeSym('number'), '1'], [makeSym('at'), '0', '0', '0']],
      ];
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        baseSymbol,
        [makeSym('symbol'), 'R', [makeSym('extends'), 'Base']],
      ]);

      const result = manager.getSymbolDefinition('Device:R');
      expect(result).not.toBeNull();
    });

    it('should detect circular extends', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R" (extends "R")))');
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [makeSym('symbol'), 'R', [makeSym('extends'), 'R']],
      ]);

      const visited = new Set<string>();
      visited.add('Device:R');
      const result = manager.getSymbolDefinition('Device:R', visited);
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('Circular'));
    });

    it('should log error when symbol definition not found in library', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib)');
      mockParseAsList.mockReturnValue([makeSym('kicad_symbol_lib')]);

      const result = manager.getSymbolDefinition('Device:Nonexistent');
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('getPinLocation', () => {
    it('should return cached pin location', () => {
      const cached = { x: 10, y: 20, angle: 90 };
      (manager as any).pinLocationCache.set('Device:R_1', cached);
      const result = manager.getPinLocation('Device:R', '1');
      expect(result).toBe(cached);
    });

    it('should return null when symbol definition not found', () => {
      const result = manager.getPinLocation('Device:Nonexistent', '1');
      expect(result).toBeNull();
    });

    it('should find pin location in top-level pin', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R" (pin (number "1") (at 5.08 0 0))))');
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [makeSym('symbol'), 'R', [makeSym('pin'), [makeSym('number'), '1'], [makeSym('at'), '5.08', '0', '0']]],
      ]);

      const result = manager.getPinLocation('Device:R', '1');
      expect(result).toEqual({ x: 5.08, y: 0, angle: 0 });
    });

    it('should find pin location in nested symbol unit', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '(kicad_symbol_lib (symbol "R" (symbol "R_1_1" (pin (number "1") (at 0 0 0)))))',
      );
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [
          makeSym('symbol'),
          'R',
          [makeSym('symbol'), 'R_1_1', [makeSym('pin'), [makeSym('number'), '1'], [makeSym('at'), '0', '0', '0']]],
        ],
      ]);

      const result = manager.getPinLocation('Device:R', '1');
      expect(result).toEqual({ x: 0, y: 0, angle: 0 });
    });

    it('should log error when pin not found', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R"))');
      mockParseAsList.mockReturnValue([makeSym('kicad_symbol_lib'), [makeSym('symbol'), 'R']]);

      const result = manager.getPinLocation('Device:R', '99');
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('should handle parsing errors gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(invalid)');
      mockParseAsList.mockImplementation(() => {
        throw new Error('parse error');
      });

      const result = manager.getPinLocation('Device:R', '1');
      expect(result).toBeNull();
    });
  });

  describe('getPinInfoMap', () => {
    it('should return cached pin info map', () => {
      const cached = new Map([['1', { name: 'A0', type: 'bidirectional' }]]);
      (manager as any).pinInfoCache.set('Device:R', cached);
      const result = manager.getPinInfoMap('Device:R');
      expect(result).toBe(cached);
    });

    it('should return null when symbol definition not found', () => {
      const result = manager.getPinInfoMap('Device:Nonexistent');
      expect(result).toBeNull();
    });

    it('should extract pin info from symbol', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '(kicad_symbol_lib (symbol "R" (pin bidirectional passive (name "A0") (number "1"))))',
      );
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [
          makeSym('symbol'),
          'R',
          [makeSym('pin'), 'bidirectional', 'passive', [makeSym('name'), 'A0'], [makeSym('number'), '1']],
        ],
      ]);

      const result = manager.getPinInfoMap('Device:R');
      expect(result).not.toBeNull();
      expect(result!.get('1')).toEqual({ name: 'A0', type: 'bidirectional' });
    });

    it('should return null when no pins found', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R"))');
      mockParseAsList.mockReturnValue([makeSym('kicad_symbol_lib'), [makeSym('symbol'), 'R']]);

      const result = manager.getPinInfoMap('Device:R');
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('No pins found'));
    });
  });

  describe('getSymbolBoundingBox', () => {
    it('should return cached bounding box', () => {
      (manager as any).boundingBoxCache.set('Device:R', { minX: 0, minY: 0, maxX: 10, maxY: 10 });
      const result = manager.getSymbolBoundingBox('Device:R');
      expect(result).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    });

    it('should return null when symbol not found', () => {
      const result = manager.getSymbolBoundingBox('Device:Nonexistent');
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('should calculate bounding box from rectangle elements', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '(kicad_symbol_lib (symbol "R" (rectangle (start -5.08 2.54) (end 5.08 -2.54))))',
      );
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [
          makeSym('symbol'),
          'R',
          [makeSym('rectangle'), [makeSym('start'), '-5.08', '2.54'], [makeSym('end'), '5.08', '-2.54']],
        ],
      ]);

      const result = manager.getSymbolBoundingBox('Device:R');
      expect(result).toEqual({ minX: -5.08, minY: -2.54, maxX: 5.08, maxY: 2.54 });
    });

    it('should calculate bounding box from pin elements', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '(kicad_symbol_lib (symbol "R" (pin (at 0 0 90) (number "1")) (pin (at 10 5 270) (number "2"))))',
      );
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [
          makeSym('symbol'),
          'R',
          [makeSym('pin'), [makeSym('at'), '0', '0', '90'], [makeSym('number'), '1']],
          [makeSym('pin'), [makeSym('at'), '10', '5', '270'], [makeSym('number'), '2']],
        ],
      ]);

      const result = manager.getSymbolBoundingBox('Device:R');
      expect(result).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
    });

    it('should calculate bounding box from circle elements', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R" (circle (center 0 0) (radius 5))))');
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [makeSym('symbol'), 'R', [makeSym('circle'), [makeSym('center'), '0', '0'], [makeSym('radius'), '5']]],
      ]);

      const result = manager.getSymbolBoundingBox('Device:R');
      expect(result).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
    });

    it('should warn and return null when no graphical elements found', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('(kicad_symbol_lib (symbol "R" (property (key "value"))))');
      mockParseAsList.mockReturnValue([
        makeSym('kicad_symbol_lib'),
        [makeSym('symbol'), 'R', [makeSym('property'), [makeSym('key'), 'value']]],
      ]);

      const result = manager.getSymbolBoundingBox('Device:R');
      expect(result).toBeNull();
      expect(mockLogWarning).toHaveBeenCalledWith(expect.stringContaining('No recognized graphical elements'));
    });
  });

  describe('library content loading', () => {
    it('should use cached library content if available', () => {
      const cached = [[makeSym('cached')]];
      (manager as any).libraryCache.set('Device', cached);
      mockExistsSync.mockImplementation(() => {
        throw new Error('should not be called');
      });
      const result = (manager as any).getLibraryContent('Device');
      expect(result).toBe(cached);
    });

    it('should return null when library file does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const result = (manager as any).getLibraryContent('Device');
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('should return null when library file parse fails', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid content');
      mockParseAsList.mockImplementation(() => {
        throw new Error('parse error');
      });

      const result = (manager as any).getLibraryContent('Device');
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('Error reading'), expect.any(Error));
    });
  });
});
