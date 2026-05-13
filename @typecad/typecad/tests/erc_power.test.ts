import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Pin } from '../src/pin.js'
import { Component } from '../src/component.js'
import { Schematic } from '../src/schematic.js'
import { erc } from '../src/erc.js'

// Mock console outputs to capture ERC output (logger uses console.error/warn/info)
const mockConsoleError = vi.fn()
const mockConsoleWarn = vi.fn()
const mockConsoleInfo = vi.fn()

beforeEach(() => {
  mockConsoleError.mockClear()
  mockConsoleWarn.mockClear()
  mockConsoleInfo.mockClear()
  
  vi.spyOn(console, 'error').mockImplementation(mockConsoleError)
  vi.spyOn(console, 'warn').mockImplementation(mockConsoleWarn)
  vi.spyOn(console, 'info').mockImplementation(mockConsoleInfo)
})

describe('Power-Aware ERC', () => {
  describe('Voltage Incompatibility Detection', () => {
    it('should detect when power output voltage range cannot supply power input requirements', () => {
      const schematic = new Schematic('voltage_test')
      
      // 3.3V power supply
      const powerSupply = new Component({ reference: 'U1' })
      const vccOut = new Pin('U1', 1, 'power_out', powerSupply, {
        minimum_voltage: 3.2,
        maximum_voltage: 3.4,
        current: 1.0
      })
      
      // 5V-only component
      const sensor = new Component({ reference: 'U2' })
      const sensorVcc = new Pin('U2', 1, 'power_in', sensor, {
        minimum_voltage: 4.5,
        maximum_voltage: 5.5,
        current: 0.1
      })
      
      // Connect them to same net
      schematic.named('VCC').net(vccOut, sensorVcc)
      schematic.add(powerSupply, sensor)
      
      // Run ERC
      erc(schematic, false) // Don't exit on error for testing
      
      // Check that voltage incompatibility error was reported
      const errorMessages = [
        ...mockConsoleError.mock.calls.map(call => call.join(' ')),
        ...mockConsoleWarn.mock.calls.map(call => call.join(' ')),
        ...mockConsoleInfo.mock.calls.map(call => call.join(' '))
      ].join('')
      
      expect(errorMessages).toContain('Voltage incompatibility')
      expect(errorMessages).toContain('U1:1')
      expect(errorMessages).toContain('U2:1')
    })

    it('should pass when voltage ranges are compatible', () => {
      const schematic = new Schematic('compatible_voltage_test')
      
      // 3.3V power supply
      const powerSupply = new Component({ reference: 'U100' })
      const vccOut = new Pin('U100', 1, 'power_out', powerSupply, {
        minimum_voltage: 3.2,
        maximum_voltage: 3.4,
        current: 1.0
      })
      
      // 3.3V-compatible component
      const mcu = new Component({ reference: 'U200' })
      const mcuVcc = new Pin('U200', 1, 'power_in', mcu, {
        minimum_voltage: 1.8,
        maximum_voltage: 3.6,
        current: 0.5
      })
      
      // Connect them to same net
      schematic.named('VCC').net(vccOut, mcuVcc)
      schematic.add(powerSupply, mcu)
      
      // Run ERC
      erc(schematic, false)
      
      // Should not have voltage incompatibility errors
      const errorMessages = [
        ...mockConsoleError.mock.calls.map(call => call.join(' ')),
        ...mockConsoleWarn.mock.calls.map(call => call.join(' ')),
        ...mockConsoleInfo.mock.calls.map(call => call.join(' '))
      ].join('')
      
      expect(errorMessages).not.toContain('Voltage incompatibility')
    })
  })

  describe('Current Capacity Detection', () => {
    it('should detect when current demand exceeds supply capacity', () => {
      const schematic = new Schematic('current_overload_test')
      
      // 1A power supply
      const powerSupply = new Component({ reference: 'U1' })
      const vccOut = new Pin('U1', 1, 'power_out', powerSupply, {
        minimum_voltage: 3.2,
        maximum_voltage: 3.4,
        current: 1.0  // Can supply 1A
      })
      
      // High-power component needing 2A
      const motor = new Component({ reference: 'M1' })
      const motorVcc = new Pin('M1', 1, 'power_in', motor, {
        minimum_voltage: 3.0,
        maximum_voltage: 3.6,
        current: 2.0  // Needs 2A - exceeds supply!
      })
      
      // Connect them to same net
      schematic.named('VCC').net(vccOut, motorVcc)
      schematic.add(powerSupply, motor)
      
      // Run ERC
      erc(schematic, false)
      
      // Check that current capacity error was reported
      const errorMessages = [
        ...mockConsoleError.mock.calls.map(call => call.join(' ')),
        ...mockConsoleWarn.mock.calls.map(call => call.join(' ')),
        ...mockConsoleInfo.mock.calls.map(call => call.join(' '))
      ].join('')
      
      expect(errorMessages).toContain('Current capacity exceeded')
      expect(errorMessages).toContain('2A demanded')
      expect(errorMessages).toContain('1A supplied')
    })

    it('should warn about high current utilization', () => {
      const schematic = new Schematic('high_utilization_test')
      
      // 1A power supply
      const powerSupply = new Component({ reference: 'U1' })
      const vccOut = new Pin('U1', 1, 'power_out', powerSupply, {
        minimum_voltage: 3.2,
        maximum_voltage: 3.4,
        current: 1.0
      })
      
      // Component using 0.9A (90% utilization)
      const highPowerComponent = new Component({ reference: 'U2' })
      const componentVcc = new Pin('U2', 1, 'power_in', highPowerComponent, {
        minimum_voltage: 3.0,
        maximum_voltage: 3.6,
        current: 0.9
      })
      
      // Connect them to same net
      schematic.named('VCC').net(vccOut, componentVcc)
      schematic.add(powerSupply, highPowerComponent)
      
      // Run ERC
      erc(schematic, false)
      
      // Check that high utilization warning was reported
      const warningMessages = [
        ...mockConsoleError.mock.calls.map(call => call.join(' ')),
        ...mockConsoleWarn.mock.calls.map(call => call.join(' ')),
        ...mockConsoleInfo.mock.calls.map(call => call.join(' '))
      ].join('')
      
      expect(warningMessages).toContain('High current utilization')
      expect(warningMessages).toContain('90.0% utilization')
    })
  })

  // describe('Missing Power Specifications', () => {
  //   // it('should warn about power pins without power information', () => {
  //   //   const schematic = new Schematic('missing_power_info_test')
      
  //   //   // Power pin without powerInfo
  //   //   const component = new Component({ reference: 'U20' })
  //   //   const powerPin = new Pin('U20', 1, 'power_in', component) // No powerInfo provided
      
  //   //   // Another pin on same net for ERC to check
  //   //   const component2 = new Component({ reference: 'U30' })
  //   //   const otherPin = new Pin('U30', 1, 'power_out', component2, {
  //   //     minimum_voltage: 3.2,
  //   //     maximum_voltage: 3.4,
  //   //     current: 1.0
  //   //   })
      
  //   //   // Connect to net
  //   //   schematic.named('VCC').net(powerPin, otherPin)
  //   //   schematic.add(component, component2)
      
  //   //   // Run ERC
  //   //   erc(schematic, false)
      
  //   //   // Check that missing power info warning was reported
  //   //   const warningMessages = mockStdoutWrite.mock.calls
  //   //     .map(call => call[0])
  //   //     .join('')
      
  //   //   expect(warningMessages).toContain('lacks power specification')
  //   //   expect(warningMessages).toContain('U20:1')
  //   // })
  // })

  describe('Edge Cases', () => {
    it('should handle pins with only some power info fields', () => {
      const schematic = new Schematic('partial_power_info_test')
      
      // Pin with only current specified
      const component1 = new Component({ reference: 'U1' })
      const pin1 = new Pin('U1', 1, 'power_out', component1, {
        current: 1.0  // Only current, no voltage info
      })
      
      // Pin with only voltage specified
      const component2 = new Component({ reference: 'U2' })
      const pin2 = new Pin('U2', 1, 'power_in', component2, {
        maximum_voltage: 3.6  // Only max voltage
      })
      
      schematic.named('VCC').net(pin1, pin2)
      schematic.add(component1, component2)
      
      // Should not crash and should handle gracefully
      expect(() => erc(schematic, false)).not.toThrow()
    })

    it('should handle empty nets gracefully', () => {
      const schematic = new Schematic('empty_net_test')
      
      // Create components but don't connect them
      const component = new Component({ reference: 'U1' })
      const pin = new Pin('U1', 1, 'power_in', component, {
        minimum_voltage: 3.0,
        maximum_voltage: 3.6,
        current: 0.5
      })
      
      schematic.add(component)
      
      // Should not crash on empty or single-pin nets
      expect(() => erc(schematic, false)).not.toThrow()
    })
  })
}) 
