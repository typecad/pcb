// No-install builds: library data decoupled from the kicad-cli binary.
// Simulates a machine with no KiCad (discovery throws), vendored symbol +
// footprint in build/lib, and asserts a full create() produces the board,
// the schematic AND the ERC report — the flow that used to crash on
// KiCAD.instance before resolution went through libraryRoots().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../src/kicad.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/kicad.js')>();
  // discovery throws like a machine without KiCad; libraryRoots() must
  // still resolve (to nothing here — build/lib carries the project)
  class NoKiCAD {
    static get instance(): never {
      throw new (actual.KiCadNotFoundError ?? Error)('KiCad CLI not found (simulated)');
    }
    static resetInstance(): void {}
    static isAvailable(): boolean {
      return false;
    }
  }
  return { ...actual, KiCAD: NoKiCAD };
});

const { PCB, Component } = await import('../src/index.js');

const SYMBOL_LIB = `(kicad_symbol_lib
  (version 20200101)
  (generator "typecad-test")
  (symbol "RES"
    (pin_names (offset 0.254))
    (property "Reference" "R" (at 0 0 0))
    (symbol "RES_0_1"
      (rectangle (start -0.762 1.778) (end 0.762 -1.778))
    )
    (symbol "RES_1_1"
      (pin passive line (at 0 2.54 270) (length 0.762) (name "~" ) (number "1"))
      (pin passive line (at 0 -2.54 90) (length 0.762) (name "~" ) (number "2"))
    )
  )
)`;

const FOOTPRINT = `(footprint "Test:RES_0603" (layer "F.Cu")
  (pad "1" smd rect (at -0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask"))
  (pad "2" smd rect (at 0.75 0) (size 0.8 0.75) (layers "F.Cu" "F.Paste" "F.Mask"))
)`;

let tmpCwd: string;

beforeEach(() => {
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-noinstall-'));
  process.chdir(tmpCwd);
  process.env.TYPECAD_BUILD_DIR = path.join(tmpCwd, 'build');
  fs.mkdirSync(path.join(tmpCwd, 'build', 'lib', 'footprints'), { recursive: true });
  fs.writeFileSync(path.join(tmpCwd, 'build', 'lib', 'Test.kicad_sym'), SYMBOL_LIB, 'utf8');
  fs.writeFileSync(path.join(tmpCwd, 'build', 'lib', 'footprints', 'RES_0603.kicad_mod'), FOOTPRINT, 'utf8');
});

afterEach(() => {
  delete process.env.TYPECAD_BUILD_DIR;
  process.chdir(os.tmpdir());
  fs.rmSync(tmpCwd, { recursive: true, force: true });
});

describe('build without a KiCad install', () => {
  it('creates board, schematic and ERC report from build/lib alone', () => {
    const pcb = new PCB('noinstall_board');
    const r1 = new Component({ reference: 'R1', symbol: 'Test:RES', footprint: 'Test:RES_0603' });
    const r2 = new Component({ reference: 'R2', symbol: 'Test:RES', footprint: 'Test:RES_0603' });
    r1.pcb = { x: 10, y: 10 };
    r2.pcb = { x: 16, y: 10 };
    r1.sch = { x: 10, y: 10 };
    r2.sch = { x: 16, y: 10 };
    pcb.net(r1.pin(1), r2.pin(1));
    pcb.net(r1.pin(2), r2.pin(2));

    expect(() => pcb.create(r1, r2)).not.toThrow();

    const build = path.join(tmpCwd, 'build');
    expect(fs.existsSync(path.join(build, 'noinstall_board.kicad_pcb'))).toBe(true);
    const sch = fs.readFileSync(path.join(build, 'noinstall_board.kicad_sch'), 'utf8');
    // the vendored symbol rendered: lib entry + both instances
    expect(sch).toContain('(lib_symbols');
    expect(sch).toContain('Test:RES');
    expect(sch).toContain('(lib_id "Test:RES")');
    expect(sch).toContain('"R1"');
    expect(sch).toContain('(label "net1"');
    // ERC ran over the object model and wrote its report
    const erc = JSON.parse(fs.readFileSync(path.join(build, 'noinstall_board_erc.json'), 'utf8'));
    expect(erc.engine).toBe('typecad-native');
    expect(erc.sheets[0].violations).toHaveLength(0);
  });

  it('still resolves the bundled power library with no install and no build/lib copy', async () => {
    fs.rmSync(path.join(tmpCwd, 'build', 'lib', 'power.kicad_sym'), { force: true });
    const { SymbolLibraryManager } = await import('../src/symbol_library_manager.js');
    const manager = new SymbolLibraryManager(); // must not throw
    const def = manager.getSymbolDefinition('power:PWR_FLAG');
    expect(def).not.toBeNull();
  });
});
