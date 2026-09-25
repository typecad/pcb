import { describe, it, expect } from 'vitest';
import {
  parseSymbolLibrary,
  listSymbolNames,
  findSymbolNode,
  getSymbolProperty,
  footprintOf,
  normalizeFootprintRef,
  extractPins,
  resolveExtends,
} from '../src/symbol_core.js';

const LIB = `(kicad_symbol_lib
  (version 20220914)
  (symbol "R"
    (property "Reference" "R" (at 0 0 0))
    (property "Footprint" "Resistor_SMD:R_0603_1608Metric" (at 0 0 0))
    (symbol "R_1_1"
      (pin passive line (at -3.81 0 0) (length 1.27) (name "~") (number "1"))
      (pin passive line (at 3.81 0 180) (length 1.27) (name "~") (number "2"))
    )
  )
  (symbol "U"
    (property "Footprint" "Pkg:DIP-16" (at 0 0 0))
    (symbol "U_1_1"
      (pin power_in line (at 0 0 0) (length 2.54) (name "VCC") (number "1"))
      (pin power_in line (at 0 5.08 0) (length 2.54) (name "GND") (number "8"))
    )
    (symbol "U_2_1"
      (pin input line (at 5.08 0 0) (length 2.54) (name "GND") (number "9") hide)
    )
  )
  (symbol "R_sm" (extends "R")
    (property "Reference" "RN" (at 0 0 0))
    (property "Value" "R_sm" (at 0 0 0))
  )
  (symbol "R_sm_sm" (extends "R_sm")
    (property "Footprint" "Resistor_SMD:R_0805_2012Metric" (at 0 0 0))
  )
  (symbol "Nested"
    (symbol "Nested_1_1"
      (symbol "deep"
        (pin output line (at 0 0 0) (length 2.54) (name "Q") (number "3"))
      )
    )
  )
)`;

const nodes = parseSymbolLibrary(LIB);

describe('listSymbolNames / findSymbolNode', () => {
  it('lists top-level symbol names in document order', () => {
    expect(listSymbolNames(nodes)).toEqual(['R', 'U', 'R_sm', 'R_sm_sm', 'Nested']);
  });

  it('finds a symbol node by name', () => {
    const found = findSymbolNode(nodes, 'R_sm');
    expect(found).toBeDefined();
    expect(String(found![1])).toBe('R_sm');
  });

  it('returns undefined for a missing symbol', () => {
    expect(findSymbolNode(nodes, 'Missing')).toBeUndefined();
  });
});

describe('getSymbolProperty / footprintOf / normalizeFootprintRef', () => {
  it('reads a property value', () => {
    const r = findSymbolNode(nodes, 'R')!;
    expect(getSymbolProperty(r, 'Reference')).toBe('R');
    expect(footprintOf(r)).toBe('Resistor_SMD:R_0603_1608Metric');
  });

  it('distinguishes absent from empty properties', () => {
    const sym = parseSymbolLibrary(`(kicad_symbol_lib (symbol "E" (property "Footprint" "" (at 0 0 0))))`);
    const e = findSymbolNode(sym, 'E')!;
    expect(footprintOf(e)).toBe('');
    expect(getSymbolProperty(e, 'Datasheet')).toBeUndefined();
  });

  it('normalizes footprint refs to lib:Name', () => {
    expect(normalizeFootprintRef('Resistor_SMD:R_0603_1608Metric')).toBe('lib:R_0603_1608Metric');
    expect(normalizeFootprintRef('DIP-8')).toBe('lib:DIP-8');
  });
});

describe('extractPins', () => {
  it('extracts unit pins in document order', () => {
    const r = findSymbolNode(nodes, 'R')!;
    expect(extractPins(r)).toEqual([
      { type: 'passive', name: '~', number: '1', hidden: false, at: { x: -3.81, y: 0, angle: 0 } },
      { type: 'passive', name: '~', number: '2', hidden: false, at: { x: 3.81, y: 0, angle: 180 } },
    ]);
  });

  it('extracts pins from every unit and marks hidden pins', () => {
    const u = findSymbolNode(nodes, 'U')!;
    expect(extractPins(u)).toEqual([
      { type: 'power_in', name: 'VCC', number: '1', hidden: false, at: { x: 0, y: 0, angle: 0 } },
      { type: 'power_in', name: 'GND', number: '8', hidden: false, at: { x: 0, y: 5.08, angle: 0 } },
      { type: 'input', name: 'GND', number: '9', hidden: true, at: { x: 5.08, y: 0, angle: 0 } },
    ]);
  });

  it('recurses into arbitrary unit nesting depth', () => {
    const nested = findSymbolNode(nodes, 'Nested')!;
    expect(extractPins(nested)).toEqual([
      { type: 'output', name: 'Q', number: '3', hidden: false, at: { x: 0, y: 0, angle: 0 } },
    ]);
  });

  it('skips pins without a number', () => {
    const sym = parseSymbolLibrary(`(kicad_symbol_lib (symbol "S" (pin input line (name "A"))))`);
    const s = findSymbolNode(sym, 'S')!;
    expect(extractPins(s)).toEqual([]);
  });

  it('finds pins hanging directly on the symbol node', () => {
    const sym = parseSymbolLibrary(`(kicad_symbol_lib (symbol "D" (pin passive line (name "X") (number "1"))))`);
    const d = findSymbolNode(sym, 'D')!;
    expect(extractPins(d)).toEqual([{ type: 'passive', name: 'X', number: '1', hidden: false, at: null }]);
  });
});

describe('resolveExtends', () => {
  const loader = (libraryName: string) => (libraryName === 'Device' ? nodes : null);

  it('resolves a plain symbol under its fully qualified name', () => {
    const result = resolveExtends('Device', 'R', loader);
    expect(result).not.toBeNull();
    expect(result!.symbolName).toBe('R');
    expect(result!.serialized).toContain('(symbol "Device:R"');
  });

  it('flattens extends under the requested name, not the base name', () => {
    const result = resolveExtends('Device', 'R_sm', loader);
    expect(result).not.toBeNull();
    expect(result!.symbolName).toBe('R_sm');
    // embedded entry name must match the placed symbol's lib_id
    expect(result!.serialized).toContain('(symbol "Device:R_sm"');
    expect(result!.serialized).not.toContain('(extends');
    // unit sub-symbols follow the parent's (bare) name or KiCad can't load it
    expect(result!.serialized).toContain('(symbol "R_sm_1_1"');
    expect(result!.serialized).not.toContain('(symbol "R_1_1"');
    // graphics/pins inherit from the base
    expect(footprintOf(result!.node)).toBe('Resistor_SMD:R_0603_1608Metric');
    expect(extractPins(result!.node)).toHaveLength(2);
  });

  it('merges derived properties over inherited ones', () => {
    const result = resolveExtends('Device', 'R_sm', loader)!;
    expect(getSymbolProperty(result!.node, 'Reference')).toBe('RN');
    expect(getSymbolProperty(result!.node, 'Value')).toBe('R_sm');
    // properties the derived symbol does not override fall through
    expect(footprintOf(result!.node)).toBe('Resistor_SMD:R_0603_1608Metric');
  });

  it('flattens multi-level chains with each level overriding in turn', () => {
    const result = resolveExtends('Device', 'R_sm_sm', loader)!;
    expect(result!.symbolName).toBe('R_sm_sm');
    expect(result!.serialized).toContain('(symbol "Device:R_sm_sm"');
    expect(result!.serialized).toContain('(symbol "R_sm_sm_1_1"');
    expect(footprintOf(result!.node)).toBe('Resistor_SMD:R_0805_2012Metric');
    expect(getSymbolProperty(result!.node, 'Reference')).toBe('RN');
    expect(getSymbolProperty(result!.node, 'Value')).toBe('R_sm');
  });

  it('resolves cross-library parents written as Lib:Name', () => {
    const localLib = parseSymbolLibrary(`(kicad_symbol_lib (symbol "R_local" (extends "Device:R")))`);
    const crossLoader = (libraryName: string) =>
      libraryName === 'Device' ? nodes : libraryName === 'MyLib' ? localLib : null;
    const result = resolveExtends('MyLib', 'R_local', crossLoader);
    expect(result).not.toBeNull();
    // identity stays the requested symbol's, content flattens across libraries
    expect(result!.libraryName).toBe('MyLib');
    expect(result!.symbolName).toBe('R_local');
    expect(result!.serialized).toContain('(symbol "MyLib:R_local"');
    expect(footprintOf(result!.node)).toBe('Resistor_SMD:R_0603_1608Metric');
  });

  it('returns null on circular extends', () => {
    const circular = parseSymbolLibrary(`(kicad_symbol_lib (symbol "A" (extends "B")) (symbol "B" (extends "A")))`);
    const result = resolveExtends('Loop', 'A', (lib) => (lib === 'Loop' ? circular : null));
    expect(result).toBeNull();
  });

  it('returns null on self-extends', () => {
    const self = parseSymbolLibrary(`(kicad_symbol_lib (symbol "S" (extends "S")))`);
    const result = resolveExtends('Loop', 'S', (lib) => (lib === 'Loop' ? self : null));
    expect(result).toBeNull();
  });

  it('returns null when the chain exceeds the depth cap', () => {
    const parts: string[] = [];
    for (let i = 0; i < 15; i++) parts.push(`(symbol "S${i}" (extends "S${i + 1}"))`);
    parts.push(`(symbol "S15")`);
    const deep = parseSymbolLibrary(`(kicad_symbol_lib ${parts.join(' ')})`);
    const result = resolveExtends('Deep', 'S0', (lib) => (lib === 'Deep' ? deep : null));
    expect(result).toBeNull();
  });

  it('returns null for missing library or symbol', () => {
    expect(resolveExtends('Nope', 'R', loader)).toBeNull();
    expect(resolveExtends('Device', 'Missing', loader)).toBeNull();
  });
});
