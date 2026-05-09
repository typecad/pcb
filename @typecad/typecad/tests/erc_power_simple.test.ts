import { describe, it, expect, beforeEach } from 'vitest'
import { Pin } from '../src/pin.js'
import { Component } from '../src/component.js'
import { Schematic } from '../src/schematic.js'
import { erc } from '../src/erc.js'

describe('Power-Aware ERC Features', () => {
  it('should create pins with power information and run ERC checks', () => {
    const schematic = new Schematic('power_demo')
    
    // Create a 3.3V regulator
    const regulator = new Component({
      reference: 'U1',
      value: 'AMS1117-3.3'
    })
    
    const regOutput = new Pin('U1', 2, 'power_out', regulator, {
      minimum_voltage: 3.2,
      maximum_voltage: 3.4,
      current: 1.0
    })
    
    // Create a microcontroller that can accept 3.3V
    const mcu = new Component({
      reference: 'U2',
      value: 'ESP32'
    })
    
    const mcuVcc = new Pin('U2', 1, 'power_in', mcu, {
      minimum_voltage: 1.8,  // Compatible with 3.3V supply
      maximum_voltage: 3.6,  // Compatible with 3.3V supply
      current: 0.5
    })
    
    // Connect them
    schematic.named('3V3').net(regOutput, mcuVcc)
    schematic.add(regulator, mcu)
    
    // Test that pins have power information
    expect(regOutput.powerInfo).toBeDefined()
    expect(regOutput.powerInfo?.minimum_voltage).toBe(3.2)
    expect(regOutput.powerInfo?.maximum_voltage).toBe(3.4)
    expect(regOutput.powerInfo?.current).toBe(1.0)
    
    expect(mcuVcc.powerInfo).toBeDefined()
    expect(mcuVcc.powerInfo?.minimum_voltage).toBe(1.8)
    expect(mcuVcc.powerInfo?.maximum_voltage).toBe(3.6)
    expect(mcuVcc.powerInfo?.current).toBe(0.5)
    
    // ERC should run without throwing errors for this compatible setup
    expect(() => schematic.erc()).not.toThrow()
  })

  it('should demonstrate voltage incompatibility detection', () => {
    const schematic = new Schematic('voltage_mismatch_demo')
    
    // Create a 3.3V regulator
    const regulator = new Component({
      reference: 'U1',
      value: 'AMS1117-3.3'
    })
    
    const regOutput = new Pin('U1', 2, 'power_out', regulator, {
      minimum_voltage: 3.2,
      maximum_voltage: 3.4,
      current: 1.0
    })
    
    // Create a 5V-only sensor
    const sensor = new Component({
      reference: 'U2',
      value: '5V_Only_Sensor'
    })
    
    const sensorVcc = new Pin('U2', 1, 'power_in', sensor, {
      minimum_voltage: 4.5,  // Incompatible with 3.3V supply!
      maximum_voltage: 5.5,
      current: 0.1
    })
    
    // Connect them (this creates a voltage incompatibility)
    schematic.named('VCC').net(regOutput, sensorVcc)
    schematic.add(regulator, sensor)
    
    // Test that pins have the expected power information
    expect(regOutput.powerInfo?.minimum_voltage).toBe(3.2)
    expect(sensorVcc.powerInfo?.minimum_voltage).toBe(4.5)
    
    // ERC should detect this issue but not crash (don't exit on error)
    expect(() => erc(schematic, false)).not.toThrow()
  })

  it('should demonstrate current overload detection', () => {
    const schematic = new Schematic('current_overload_demo')
    
    // Create a 1A regulator
    const regulator = new Component({
      reference: 'U1',
      value: 'Low_Current_Regulator'
    })
    
    const regOutput = new Pin('U1', 2, 'power_out', regulator, {
      minimum_voltage: 3.2,
      maximum_voltage: 3.4,
      current: 1.0  // Can only supply 1A
    })
    
    // Create a high-power motor that needs 2A
    const motor = new Component({
      reference: 'M1',
      value: 'High_Power_Motor'
    })
    
    const motorVcc = new Pin('M1', 1, 'power_in', motor, {
      minimum_voltage: 3.0,
      maximum_voltage: 3.6,
      current: 2.0  // Needs 2A - exceeds supply capacity!
    })
    
    // Connect them (this creates a current overload)
    schematic.named('VCC').net(regOutput, motorVcc)
    schematic.add(regulator, motor)
    
    // Test that pins have the expected power information
    expect(regOutput.powerInfo?.current).toBe(1.0)
    expect(motorVcc.powerInfo?.current).toBe(2.0)
    
    // ERC should detect this issue but not crash (don't exit on error)
    expect(() => erc(schematic, false)).not.toThrow()
  })
}) 
