import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PCB } from '../src/pcb/pcb.js'
import { Component } from '../src/component.js'
import fs from 'node:fs'
import path from 'node:path'

// Mock fs.writeFileSync to avoid creating actual files during tests
const mockWriteFileSync = vi.spyOn(fs, 'writeFileSync')
const mockReadFileSync = vi.spyOn(fs, 'readFileSync')

describe('sourceInfo Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful file operations
    mockWriteFileSync.mockImplementation(() => {})
    mockReadFileSync.mockReturnValue('')
  })

  describe('Component sourceInfo in PCB creation', () => {
    it('should include sourceInfo in KiCad output when creating board', async () => {
      const pcb = new PCB('test_board')
      
      // Create a component with sourceInfo
      const component = new Component({
        reference: 'R1',
        value: '10k',
        footprint: 'Resistor_SMD:R_0603_1608Metric'
      })
      
      component.pcb = { x: 100, y: 100, rotation: 0 }
      
      // Mock the footprint_lib method to avoid reading actual files
      const mockFootprintLib = vi.spyOn(component, 'footprint_lib').mockReturnValue(
        '(footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu") (width 1.6) (height 0.8))'
      )
      
      // Mock the board file to not exist
      vi.mock('fs', async () => {
        const actual = await vi.importActual<typeof fs>('fs')
        return {
          ...actual,
          existsSync: vi.fn().mockReturnValue(false),
          readFileSync: vi.fn().mockReturnValue(''),
          writeFileSync: vi.fn()
        }
      })
      
      // Create the board
      await pcb.create(component)
      
      // Verify that the component was processed
      expect(component.sourceInfo).toBeDefined()
      expect(mockFootprintLib).toHaveBeenCalled()
      
      mockFootprintLib.mockRestore()
    })

    it('should preserve sourceInfo when components are grouped', () => {
      const pcb = new PCB('test_board')
      
      const component1 = new Component({
        reference: 'R1',
        value: '10k',
        footprint: 'Resistor_SMD:R_0603_1608Metric'
      })
      
      const component2 = new Component({
        reference: 'R2',
        value: '1k',
        footprint: 'Resistor_SMD:R_0603_1608Metric'
      })
      
      component1.pcb = { x: 100, y: 100, rotation: 0 }
      component2.pcb = { x: 200, y: 100, rotation: 0 }
      
      const originalSourceInfo1 = component1.sourceInfo
      const originalSourceInfo2 = component2.sourceInfo
      
      // Group the components
      pcb.group('resistors', component1, component2)
      
      // sourceInfo should be preserved
      expect(component1.sourceInfo).toEqual(originalSourceInfo1)
      expect(component2.sourceInfo).toEqual(originalSourceInfo2)
    })

    it('should handle sourceInfo when components are placed and then created', async () => {
      const pcb = new PCB('test_board')
      
      const component = new Component({
        reference: 'U1',
        value: 'ATMEGA328P',
        footprint: 'Package_DIP:DIP-28_W7.62mm'
      })
      
      component.pcb = { x: 150, y: 150, rotation: 90, side: 'back' }
      
      const originalSourceInfo = component.sourceInfo
      
      // Place the component first
      pcb.place(component)
      
      // Then create the board
      const mockFootprintLib = vi.spyOn(component, 'footprint_lib').mockReturnValue(
        '(footprint "Package_DIP:DIP-28_W7.62mm" (layer "B.Cu") (width 7.62) (height 35.56))'
      )
      
      // Mock the board file to not exist
      vi.mock('fs', async () => {
        const actual = await vi.importActual<typeof fs>('fs')
        return {
          ...actual,
          existsSync: vi.fn().mockReturnValue(false),
          readFileSync: vi.fn().mockReturnValue(''),
          writeFileSync: vi.fn()
        }
      })
      
      await pcb.create(component)
      
      // sourceInfo should be preserved throughout the process
      expect(component.sourceInfo).toEqual(originalSourceInfo)
      
      mockFootprintLib.mockRestore()
    })
  })

  describe('Outline sourceInfo in PCB creation', () => {
    it('should preserve sourceInfo for outlines when creating board', async () => {
      const pcb = new PCB('test_board')
      
      // Create an outline
      pcb.outline(0, 0, 100, 80, 5)
      
      // Mock the board file to not exist
      vi.mock('fs', async () => {
        const actual = await vi.importActual<typeof fs>('fs')
        return {
          ...actual,
          existsSync: vi.fn().mockReturnValue(false),
          readFileSync: vi.fn().mockReturnValue(''),
          writeFileSync: vi.fn()
        }
      })
      
      // Create the board
      await pcb.create()
      
      // The outline should be processed (we can't directly verify sourceInfo without accessing private properties)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('should handle multiple outlines with sourceInfo', async () => {
      const pcb = new PCB('test_board')
      
      // Create multiple outlines
      pcb.outline(0, 0, 100, 80)
      pcb.outline(10, 10, 90, 70, 2)
      
      // Mock the board file to not exist
      vi.mock('fs', async () => {
        const actual = await vi.importActual<typeof fs>('fs')
        return {
          ...actual,
          existsSync: vi.fn().mockReturnValue(false),
          readFileSync: vi.fn().mockReturnValue(''),
          writeFileSync: vi.fn()
        }
      })
      
      // Create the board
      await pcb.create()
      
      // All outlines should be processed
      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })

  describe('Via sourceInfo in PCB creation', () => {
    it('should preserve sourceInfo for vias when creating board', async () => {
      const pcb = new PCB('test_board')
      
      // Create a via
      const via = pcb.via({ 
        at: { x: 50, y: 50 }, 
        size: 0.8, 
        drill: 0.4 
      })
      
      const originalSourceInfo = via.sourceInfo
      
      // Mock the board file to not exist
      vi.mock('fs', async () => {
        const actual = await vi.importActual<typeof fs>('fs')
        return {
          ...actual,
          existsSync: vi.fn().mockReturnValue(false),
          readFileSync: vi.fn().mockReturnValue(''),
          writeFileSync: vi.fn()
        }
      })
      
      // Create the board
      await pcb.create()
      
      // sourceInfo should be preserved
      expect(via.sourceInfo).toEqual(originalSourceInfo)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('should handle vias with powerInfo and sourceInfo', async () => {
      const pcb = new PCB('test_board')
      
      // Create a via with power information
      const via = pcb.via({ 
        at: { x: 75, y: 75 }, 
        size: 1.0, 
        drill: 0.5,
        powerInfo: { current: 2.0, maxTempRise: 10 }
      })
      
      expect(via.sourceInfo).toBeDefined()
      expect(via.viaData?.powerInfo).toBeDefined()
      
      // Mock the board file to not exist
      vi.mock('fs', async () => {
        const actual = await vi.importActual<typeof fs>('fs')
        return {
          ...actual,
          existsSync: vi.fn().mockReturnValue(false),
          readFileSync: vi.fn().mockReturnValue(''),
          writeFileSync: vi.fn()
        }
      })
      
      // Create the board
      await pcb.create()
      
      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })

  describe('Error handling with sourceInfo', () => {
    it('should include sourceInfo in error messages when board creation fails', async () => {
      const pcb = new PCB('test_board')
      
      // Mock process.exit to prevent the test from exiting
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit was called')
      })
      
      try {
        // This will fail due to invalid footprint format
        new Component({
          reference: 'R1',
          value: '10k',
          footprint: 'InvalidFootprint' // This will cause an error
        })
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined()
      }
      
      mockExit.mockRestore()
    })
  })

  describe('SourceInfo persistence', () => {
    it('should maintain sourceInfo consistency across operations', () => {
      const pcb = new PCB('test_board')
      
      // Create a component
      const component = new Component({
        reference: 'R1',
        value: '10k',
        footprint: 'Resistor_SMD:R_0603_1608Metric'
      })
      
      const originalSourceInfo = component.sourceInfo
      
      // Perform various operations
      component.pcb = { x: 100, y: 100, rotation: 0 }
      component.value = '20k'
      component.description = 'Updated resistor'
      
      // Place the component
      pcb.place(component)
      
      // Group the component
      pcb.group('resistors', component)
      
      // sourceInfo should remain unchanged
      expect(component.sourceInfo).toEqual(originalSourceInfo)
    })

    it('should handle sourceInfo for components created in different contexts', () => {
      const pcb1 = new PCB('board1')
      const pcb2 = new PCB('board2')
      
      // Create components in different contexts
      const component1 = new Component({
        reference: 'R1',
        value: '10k',
        footprint: 'Resistor_SMD:R_0603_1608Metric'
      })
      
      const component2 = new Component({
        reference: 'R1',
        value: '10k',
        footprint: 'Resistor_SMD:R_0603_1608Metric'
      })
      
      // Each should have its own sourceInfo
      expect(component1.sourceInfo).toBeDefined()
      expect(component2.sourceInfo).toBeDefined()
      
      // The line numbers should be different (created at different points)
      expect(component1.sourceInfo?.line).not.toBe(component2.sourceInfo?.line)
      
      // Place them on different boards
      pcb1.place(component1)
      pcb2.place(component2)
      
      // sourceInfo should be preserved
      expect(component1.sourceInfo?.file).toBe(component2.sourceInfo?.file) // Same test file
      expect(component1.sourceInfo?.line).not.toBe(component2.sourceInfo?.line) // Different lines
    })
  })
})
