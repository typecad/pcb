import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockState = vi.hoisted(() => ({ symbolsPath: '' }));

vi.mock('../../../utils/logging.js', () => ({
  default: { log: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../kicad.js', () => ({
  KiCAD: { instance: { getSymbolsPath: () => mockState.symbolsPath } },
}));

import {
  readSymbol,
  readSymbolFile,
  return_list_of_symbols,
  return_list_of_footprints,
  sanitize_name,
} from '../kicad_sym_utils.js';

const DEVICE_LIB = `(kicad_symbol_lib
  (version 20220914)
  (generator kicad_symbol_editor)
  (symbol "R"
    (pin_numbers hide)
    (pin_names (offset 0.254))
    (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "Resistor_SMD:R_0603_1608Metric" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol "R_1_1"
      (pin passive line (at -3.81 0 0) (length 1.27)
        (name "~" (effects (font (size 1.27 1.27))))
        (number "1" (effects (font (size 1.27 1.27))))
      )
      (pin passive line (at 3.81 0 180) (length 1.27)
        (name "~" (effects (font (size 1.27 1.27))))
        (number "2" (effects (font (size 1.27 1.27))))
      )
    )
  )
)`;

const CONNECTOR_LIB = `(kicad_symbol_lib
  (symbol "Conn"
    (property "Reference" "J" (at 0 0 0))
    (property "Footprint" "Connector:PinHeader_1x02" (at 0 0 0))
    (symbol "Conn_1_1"
      (pin power_in line (at 0 0 0) (length 2.54) (name "VIN" ) (number "1"))
      (pin power_out line (at 2.54 0 0) (length 2.54) (name "GND") (number "2"))
    )
  )
  (symbol "NoFp"
    (property "Reference" "N" (at 0 0 0))
    (symbol "NoFp_1_1"
      (pin input line (at 0 0 0) (length 2.54) (name "A") (number "1"))
    )
  )
  (symbol "EmptyFp"
    (property "Footprint" "" (at 0 0 0))
    (symbol "EmptyFp_1_1"
      (pin output line (at 0 0 0) (length 2.54) (name "B") (number "1"))
    )
  )
  (symbol "R_sm" (extends "R")
    (property "Reference" "R" (at 0 0 0))
  )
  (symbol "Conn_sm" (extends "Conn"))
  (symbol "Loop" (extends "Loop"))
)`;

// Cross-library extends: X_sm lives in MyLib but extends Device:R
const MYLIB = `(kicad_symbol_lib
  (symbol "X_sm" (extends "Device:R")
    (property "Reference" "R" (at 0 0 0))
  )
)`;

const MULTIUNIT_LIB = `(kicad_symbol_lib
  (symbol "U"
    (property "Footprint" "Pkg:DIP-16" (at 0 0 0))
    (symbol "U_1_1"
      (pin power_in line (at 0 0 0) (length 2.54) (name "GND") (number "1"))
    )
    (symbol "U_2_1"
      (pin power_in line (at 5.08 0 0) (length 2.54) (name "GND") (number "8"))
    )
  )
)`;

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'kicad-sym-utils-test-'));
  mockState.symbolsPath = join(tmpRoot, 'global');
  await mkdir(join(tmpRoot, 'global'), { recursive: true });
  await mkdir(join(tmpRoot, 'project', 'build', 'lib'), { recursive: true });
  await writeFile(join(tmpRoot, 'global', 'Device.kicad_sym'), DEVICE_LIB, 'utf8');
  await writeFile(join(tmpRoot, 'global', 'Connector.kicad_sym'), CONNECTOR_LIB, 'utf8');
  await writeFile(join(tmpRoot, 'global', 'MyLib.kicad_sym'), MYLIB, 'utf8');
  await writeFile(join(tmpRoot, 'global', 'Multi.kicad_sym'), MULTIUNIT_LIB, 'utf8');
  await writeFile(join(tmpRoot, 'global', 'D.kicad_sym'),
    `(kicad_symbol_lib (symbol "D" (property "Footprint" "Pkg:D") (pin passive line (name "X") (number "1"))))`,
    'utf8');
  await writeFile(join(tmpRoot, 'project', 'build', 'lib', 'Local.kicad_sym'), CONNECTOR_LIB, 'utf8');
  await writeFile(join(tmpRoot, 'plain.kicad_sym'), CONNECTOR_LIB, 'utf8');
  await writeFile(join(tmpRoot, 'bare.kicad_sym'),
    `(kicad_symbol_lib (symbol "B" (property "Footprint" "DIP-8" (at 0 0 0))))`,
    'utf8');
  await writeFile(join(tmpRoot, 'fp.kicad_mod'), '(footprint "Pkg:DIP-8" (layer "F.Cu"))', 'utf8');
  await writeFile(join(tmpRoot, 'legacy.kicad_mod'), '(module "Pkg:DIP-4" (layer F.Cu))', 'utf8');
  await writeFile(join(tmpRoot, 'garbage.kicad_mod'), 'not an sexpr', 'utf8');
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('readSymbol', () => {
  it('returns the footprint and unit pins of a found symbol', () => {
    const lookup = readSymbol('Device:R', './nonexistent-folder');
    expect(lookup).not.toBeNull();
    expect(lookup!.footprint).toBe('Resistor_SMD:R_0603_1608Metric');
    expect(lookup!.prefix).toBe('R');
    // sanitize_name("~") === "_" and the dedup suffix concatenates the raw name: "_" + "_" + "2"
    expect(lookup!.pins).toEqual([
      { type: 'passive', name: '_', number: '1' },
      { type: 'passive', name: '__2', number: '2' },
    ]);
  });

  it('keeps unique pin names untouched', () => {
    const lookup = readSymbol('Connector:Conn', './nonexistent-folder');
    expect(lookup!.pins).toEqual([
      { type: 'power_in', name: 'VIN', number: '1' },
      { type: 'power_out', name: 'GND', number: '2' },
    ]);
  });

  it('suffixes duplicate pin names across units with their pin number', () => {
    const lookup = readSymbol('Multi:U', './nonexistent-folder');
    expect(lookup!.pins).toEqual([
      { type: 'power_in', name: 'GND', number: '1' },
      { type: 'power_in', name: 'GND_8', number: '8' },
    ]);
  });

  it('returns an empty footprint when the symbol has none', () => {
    const lookup = readSymbol('Connector:NoFp', './nonexistent-folder');
    expect(lookup).not.toBeNull();
    expect(lookup!.footprint).toBe('');
    expect(lookup!.pins).toEqual([{ type: 'input', name: 'A', number: '1' }]);
  });

  it('treats an empty-valued Footprint property as no footprint (usable symbol)', () => {
    const lookup = readSymbol('Connector:EmptyFp', './nonexistent-folder');
    expect(lookup).not.toBeNull();
    expect(lookup!.footprint).toBe('');
  });

  it('returns null when the symbol is not in the library', () => {
    expect(readSymbol('Device:Missing', './nonexistent-folder')).toBeNull();
  });

  it('returns null when no library file exists anywhere', () => {
    expect(readSymbol('NoSuchLib:X', './nonexistent-folder')).toBeNull();
  });

  it('returns null for malformed symbol references', () => {
    expect(readSymbol('NoColonHere', './nonexistent-folder')).toBeNull();
  });

  it('resolves same-library extends to the base symbol', () => {
    const lookup = readSymbol('Connector:Conn_sm', './nonexistent-folder');
    expect(lookup!.footprint).toBe('Connector:PinHeader_1x02');
    expect(lookup!.prefix).toBe('J');
    expect(lookup!.pins).toEqual([
      { type: 'power_in', name: 'VIN', number: '1' },
      { type: 'power_out', name: 'GND', number: '2' },
    ]);
  });

  it('resolves cross-library extends parents written as Lib:Name', () => {
    const lookup = readSymbol('MyLib:X_sm', './nonexistent-folder');
    expect(lookup).not.toBeNull();
    expect(lookup!.footprint).toBe('Resistor_SMD:R_0603_1608Metric');
    expect(lookup!.pins).toHaveLength(2);
  });

  it('aborts extends cycles with null', () => {
    expect(readSymbol('Connector:Loop', './nonexistent-folder')).toBeNull();
  });

  it('falls back to <folder>/build/lib/<lib>.kicad_sym when no global library exists', () => {
    const lookup = readSymbol('Local:Conn', join(tmpRoot, 'project'));
    expect(lookup!.footprint).toBe('Connector:PinHeader_1x02');
  });
});

describe('readSymbolFile', () => {
  it('returns footprint and pins of the named symbol only', () => {
    const lookup = readSymbolFile(join(tmpRoot, 'plain.kicad_sym'), 'NoFp');
    expect(lookup!.footprint).toBe('');
    expect(lookup!.pins).toEqual([{ type: 'input', name: 'A', number: '1' }]);
  });

  it('uses the first symbol when no name is given', () => {
    const lookup = readSymbolFile(join(tmpRoot, 'plain.kicad_sym'));
    expect(lookup!.footprint).toBe('lib:PinHeader_1x02');
    expect(lookup!.prefix).toBe('J');
    expect(lookup!.pins).toEqual([
      { type: 'power_in', name: 'VIN', number: '1' },
      { type: 'power_out', name: 'GND', number: '2' },
    ]);
  });

  it('normalizes "Lib:FP" to "lib:FP"', () => {
    expect(readSymbolFile(join(tmpRoot, 'plain.kicad_sym'), 'Conn')!.footprint).toBe('lib:PinHeader_1x02');
  });

  it('prefixes bare footprint names with "lib:"', () => {
    expect(readSymbolFile(join(tmpRoot, 'bare.kicad_sym'), 'B')!.footprint).toBe('lib:DIP-8');
  });

  it('finds pins that hang directly on the symbol node (no units)', () => {
    const lookup = readSymbolFile(join(tmpRoot, 'global', 'D.kicad_sym'), 'D');
    expect(lookup!.footprint).toBe('lib:D');
    expect(lookup!.pins).toEqual([{ type: 'passive', name: 'X', number: '1' }]);
  });

  it('returns null for a missing file or a missing symbol', () => {
    expect(readSymbolFile(join(tmpRoot, 'missing.kicad_sym'), 'Conn')).toBeNull();
    expect(readSymbolFile(join(tmpRoot, 'plain.kicad_sym'), 'Missing')).toBeNull();
  });
});

describe('return_list_of_symbols', () => {
  it('lists all top-level symbol names in file order', () => {
    expect(return_list_of_symbols(join(tmpRoot, 'plain.kicad_sym'))).toEqual([
      { value: 'Conn' },
      { value: 'NoFp' },
      { value: 'EmptyFp' },
      { value: 'R_sm' },
      { value: 'Conn_sm' },
      { value: 'Loop' },
    ]);
  });

  it('returns [] for a missing file', () => {
    expect(return_list_of_symbols(join(tmpRoot, 'missing.kicad_sym'))).toEqual([]);
  });
});

describe('return_list_of_footprints', () => {
  it('reads the name from a (footprint ...) file', () => {
    expect(return_list_of_footprints(join(tmpRoot, 'fp.kicad_mod'))).toEqual([{ value: 'Pkg:DIP-8' }]);
  });

  it('reads the name from a legacy (module ...) file', () => {
    expect(return_list_of_footprints(join(tmpRoot, 'legacy.kicad_mod'))).toEqual([{ value: 'Pkg:DIP-4' }]);
  });

  it('returns [] for non-footprint content', () => {
    expect(return_list_of_footprints(join(tmpRoot, 'garbage.kicad_mod'))).toEqual([]);
  });
});

describe('sanitize re-exports', () => {
  it('sanitizes names', () => {
    expect(sanitize_name('V+')).toBe('V');
    expect(sanitize_name('1N4148')).toBe('_1N4148');
  });
});
