import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Schematic } from '../src/schematic.js'
import { Component } from '../src/component.js'

// Mock KiCAD detection and fs to avoid requiring KiCAD installation
vi.mock('../src/kicad.js', () => ({
  KiCAD: class {
    kicad_cli_path = ''
    kicad_path = ''
  },
  kicad_path: '',
  kicad_cli_path: '',
  is_flatpak: false,
}))

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
}))

describe('schematic_visualizer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should export a schematic function', async () => {
    const mod = await import('../src/schematic_visualizer.js')
    expect(mod.schematic).toBeTypeOf('function')
  })

  it('should handle empty schematic without throwing', async () => {
    const { schematic } = await import('../src/schematic_visualizer.js')
    const emptySchematic = new Schematic('empty_test')

    // Should not throw even with no components
    expect(() => schematic(emptySchematic)).not.toThrow()
  })

  it('should skip null and non-object entries in Components', async () => {
    const { schematic } = await import('../src/schematic_visualizer.js')
    const sch = new Schematic('null_test')

    // Add a valid component
    const comp = new Component({ reference: 'XSV1', value: 'test' })
    sch.add(comp)

    // Manually push a null entry to test the guard
    sch.Components.push(null as any)

    expect(() => schematic(sch)).not.toThrow()
  })
})
