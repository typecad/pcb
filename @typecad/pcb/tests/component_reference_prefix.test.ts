import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockState = vi.hoisted(() => ({ symbolsPath: '' }));

vi.mock('../src/kicad.js', () => ({
  KiCAD: {
    instance: {
      getLibraryPaths: () => ({ symbols: mockState.symbolsPath, footprints: '' }),
    },
  },
}));

vi.mock('../src/utils/logging.js', () => ({
  default: { log: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

import { Component } from '../src/component.js';

// MCU-style symbols: Reference "U", QFN-ish footprint names that the old
// footprint-letter heuristic would misread as "Q".
const MCU_LIB = (libName: string) => `(kicad_symbol_lib
  (symbol "MCU"
    (property "Reference" "U" (at 0 0 0))
    (property "Footprint" "Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm" (at 0 0 0))
    (symbol "MCU_1_1"
      (pin bidirectional line (at 0 0 0) (length 2.54) (name "PA0") (number "1"))
    )
  )
  (symbol "MCU_sm" (extends "MCU"))
)`;

const POT_LIB = `(kicad_symbol_lib
  (symbol "POT"
    (property "Reference" "RV" (at 0 0 0))
    (symbol "POT_1_1"
      (pin passive line (at 0 0 0) (length 2.54) (name "W") (number "1"))
    )
  )
)`;

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'component-prefix-'));
  mockState.symbolsPath = join(tmpRoot, 'global');
  await mkdir(join(tmpRoot, 'global'), { recursive: true });
  await mkdir(join(tmpRoot, 'project', 'build', 'lib'), { recursive: true });
  await writeFile(join(tmpRoot, 'global', 'McuA.kicad_sym'), MCU_LIB('McuA'), 'utf8');
  await writeFile(join(tmpRoot, 'global', 'McuB.kicad_sym'), MCU_LIB('McuB'), 'utf8');
  await writeFile(join(tmpRoot, 'global', 'Pots.kicad_sym'), POT_LIB, 'utf8');
  await writeFile(join(tmpRoot, 'project', 'build', 'lib', 'Local.kicad_sym'), MCU_LIB('Local'), 'utf8');
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('reference prefix inference', () => {
  it('uses the symbol Reference property over the QFN footprint heuristic (rd_skeleton case)', () => {
    const u1 = new Component({
      footprint: 'Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm',
      symbol: 'McuA:MCU',
    });
    expect(u1.reference).toBe('U1');
  });

  it('increments the inferred prefix per component', () => {
    const a = new Component({ footprint: 'Package_DFN_QFN:QFN-24', symbol: 'McuB:MCU' });
    const b = new Component({ footprint: 'Package_DFN_QFN:QFN-24', symbol: 'McuB:MCU_sm' });
    expect(a.reference).toBe('U2');
    expect(b.reference).toBe('U3');
  });

  it('inherits the prefix through extends chains', () => {
    const derived = new Component({ footprint: 'Package_DFN_QFN:QFN-24', symbol: 'McuB:MCU_sm' });
    expect(derived.reference).toMatch(/^U\d+$/);
  });

  it('keeps multi-letter prefixes like RV intact', () => {
    const pot = new Component({ footprint: 'Potentiometer:Potentiometer_Vertical', symbol: 'Pots:POT' });
    expect(pot.reference).toBe('RV1');
  });

  it('explicit prefix wins over the symbol Reference property', () => {
    const custom = new Component({
      footprint: 'Package_DFN_QFN:QFN-24',
      symbol: 'McuA:MCU',
      prefix: 'IC',
    });
    expect(custom.reference).toBe('IC1');
  });

  it('explicit reference wins over everything', () => {
    const named = new Component({
      footprint: 'Package_DFN_QFN:QFN-24',
      symbol: 'McuA:MCU',
      reference: 'U9',
    });
    expect(named.reference).toBe('U9');
  });

  it('falls back to the footprint heuristic when the symbol cannot be resolved', () => {
    const qfn = new Component({ footprint: 'Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm' });
    expect(qfn.reference).toBe('Q1');

    const unresolvable = new Component({
      footprint: 'Package_DFN_QFN:QFN-24',
      symbol: 'NoSuchLib:MCU',
    });
    expect(unresolvable.reference).toBe('Q2');
  });

  it('resolves symbols from <buildDir>/lib when no global library matches', () => {
    vi.stubEnv('TYPECAD_BUILD_DIR', join(tmpRoot, 'project', 'build'));
    try {
      const local = new Component({ footprint: 'Package_DFN_QFN:QFN-24', symbol: 'Local:MCU' });
      // explicit "U9" earlier advanced the shared counter past the inferred ones
      expect(local.reference).toBe('U10');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('infers from the symbol when pins are declared as class fields (generated-class pattern)', () => {
    // Exact shape of classes emitted by `typecad-pcb add component`: pin field
    // initializers run before the constructor body sets this.symbol.
    class GeneratedMCU extends Component {
      PA2 = this.pin(1, { type: 'bidirectional' });
      GND = this.pin(3, { type: 'power_in' });

      constructor(reference?: string) {
        super('Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm');
        this.symbol = 'McuA:MCU';
        if (reference) this.reference = reference;
      }
    }
    const u1 = new GeneratedMCU();
    expect(u1.reference).toBe('U11');
    // pins report the component's reference live
    expect(u1.PA2.reference).toBe('U11');
    expect(u1.GND.reference).toBe('U11');
  });
});
