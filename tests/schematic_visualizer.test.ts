import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Schematic } from '../src/schematic.js';
import { Component } from '../src/component.js';

vi.mock('../src/kicad.js', () => ({
  KiCAD: class {
    static path = '';
    static cliPath = '';
    static isFlatpak = false;
    static instance = { getLibraryPaths: () => ({ symbols: '', footprints: '' }) };
  },
  kicad_cli_path: '',
  getKicadCliPath: () => '',
}));

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
  },
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

describe('schematic_visualizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should still export schematic function for internal use', async () => {
    const mod = await import('../src/renderers/schematic_visualizer.js');
    expect(mod.schematic).toBeTypeOf('function');
  });

  it('should handle empty schematic without throwing', async () => {
    const { schematic } = await import('../src/renderers/schematic_visualizer.js');
    const emptySchematic = new Schematic('empty_test');

    expect(() => schematic(emptySchematic)).not.toThrow();
  });

  it('should skip null and non-object entries in components', async () => {
    const { schematic } = await import('../src/renderers/schematic_visualizer.js');
    const sch = new Schematic('null_test');

    const comp = new Component('');
    comp.reference = 'XSV1';
    comp.value = 'test';
    sch.add(comp);

    sch.components.push(null as any);

    expect(() => schematic(sch)).not.toThrow();
  });
});
