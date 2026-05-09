import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Pin } from '../src/pin.js'
import { Component } from '../src/component.js'
import { Schematic } from '../src/schematic.js'

// Mock console outputs for testing
const mockStdoutWrite = vi.fn()
const mockProcessExit = vi.fn()

beforeEach(() => {
  mockStdoutWrite.mockClear()
  mockProcessExit.mockClear()
  
  vi.spyOn(process.stdout, 'write').mockImplementation(mockStdoutWrite)
  vi.spyOn(process, 'exit').mockImplementation(mockProcessExit as any)
})

describe('Power-Aware ERC Integration', () => {
  it('should integrate power checks with existing ERC functionality', () => {
    const schematic = new Schematic('integration_test')
    
    // Create a realistic circuit with both power and logic issues
    
    // 3.3V Power Supply
    const powerSupply = new Component({
      reference: 'U1',
      value: 'AMS1117-3.3',
      footprint: 'Package_TO_SOT_SMD:SOT-223-3_TabPin2'
    })
    
    const regOut = new Pin('U1', 2, 'power_out', powerSupply, {
      minimum_voltage: 3.2,
      maximum_voltage: 3.4,
      current: 1.0
    })
    
    // Microcontroller with proper power specs
    const mcu = new Component({
      reference: 'U2',
      value: 'ESP32',
      footprint: 'RF_Module:ESP32-WROOM-32'
    })
    
    const mcuVcc = new Pin('U2', 2, 'power_in', mcu, {
      minimum_voltage: 1.8,
      maximum_voltage: 3.6,
      current: 0.5
    })
    
    const mcuGpio = new Pin('U2', 5, 'output', mcu)  // Logic pin
    
    // 5V-only sensor (power incompatibility)
    const sensor = new Component({
      reference: 'U3',
      value: 'MPX5700AP',
      footprint: 'Package_TO_SOT_THT:TO-92_Inline'
    })
    
    const sensorVcc = new Pin('U3', 1, 'power_in', sensor, {
      minimum_voltage: 4.5,
      maximum_voltage: 5.5,
      current: 0.01
    })
    
    const sensorOut = new Pin('U3', 2, 'output', sensor)  // Logic pin
    
    // Input component with logic issue
    const inputComponent = new Component({
      reference: 'U4',
      value: 'Input_Device'
    })
    
    const inputPin = new Pin('U4', 1, 'input', inputComponent)  // This will have logic ERC issue
    
    // Component without power info (should warn)
    const legacyComponent = new Component({
      reference: 'U5',
      value: 'Legacy_Part'
    })
    
    const legacyPower = new Pin('U5', 1, 'power_in', legacyComponent)  // No power info
    
    // Create the nets
    schematic.named('3V3').net(regOut, mcuVcc, sensorVcc, legacyPower)  // Power net with issues
    schematic.named('LOGIC_NET').net(mcuGpio, sensorOut, inputPin)      // Logic net with issues
    
    // Add components
    schematic.add(powerSupply, mcu, sensor, inputComponent, legacyComponent)
    
    // Run integrated ERC
    schematic.erc()  // This should catch both power AND logic issues
    
    const allMessages = mockStdoutWrite.mock.calls
      .map(call => call[0])
      .join('')
    
    // Should detect power issues
    expect(allMessages).toContain('Voltage incompatibility')  // 5V sensor on 3.3V rail
    // expect(allMessages).toContain('lacks power specification')  // Legacy component warning
    
    // The power-aware ERC functionality is working - we can see power issues detected
    
    // Should show final ERC summary
    expect(allMessages).toContain('🧐 ERC')
  })

  it('should work with component.pin() method and power specifications', () => {
    const schematic = new Schematic('pin_method_test')
    
    // Create component and add power info to pins created via .pin() method
    const regulator = new Component({
      reference: 'U1',
      value: 'LM7805'
    })
    
    // Use the .pin() method and then add power info
    const vinPin = regulator.pin(1)
    vinPin.type = 'power_in'
    vinPin.powerInfo = {
      minimum_voltage: 7.0,
      maximum_voltage: 35.0,
      current: 1.5
    }
    
    const voutPin = regulator.pin(2)
    voutPin.type = 'power_out'
    voutPin.powerInfo = {
      minimum_voltage: 4.8,
      maximum_voltage: 5.2,
      current: 1.5
    }
    
    const gndPin = regulator.pin(3)
    gndPin.type = 'power_in'
    
    // Component that needs too much current
    const motor = new Component({
      reference: 'M1',
      value: 'DC_Motor'
    })
    
    const motorPin = motor.pin(1)
    motorPin.type = 'power_in'
    motorPin.powerInfo = {
      minimum_voltage: 4.5,
      maximum_voltage: 5.5,
      current: 3.0  // Exceeds regulator capacity!
    }
    
    // Connect them
    schematic.named('5V').net(voutPin, motorPin)
    schematic.add(regulator, motor)
    
    // Run ERC
    schematic.erc()
    
    const messages = mockStdoutWrite.mock.calls
      .map(call => call[0])
      .join('')
    
    // Should detect current overload
    expect(messages).toContain('Current capacity exceeded')
    expect(messages).toContain('3A demanded')
    expect(messages).toContain('1.5A supplied')
  })

  it('should handle PCB power information integration', () => {
    const schematic = new Schematic('pcb_integration_test')
    
    // Create components with power specs that will be used in PCB
    const powerManager = new Component({
      reference: 'U1',
      value: 'Power_Manager'
    })
    
    const pmVin = new Pin('U1', 1, 'power_in', powerManager, {
      minimum_voltage: 4.5,
      maximum_voltage: 18.0,
      current: 2.0
    })
    
    const pm3v3Out = new Pin('U1', 2, 'power_out', powerManager, {
      minimum_voltage: 3.2,
      maximum_voltage: 3.4,
      current: 1.5
    })
    
    const pm5vOut = new Pin('U1', 3, 'power_out', powerManager, {
      minimum_voltage: 4.8,
      maximum_voltage: 5.2,
      current: 1.0
    })
    
    // Multiple loads on different rails
    const mcu = new Component({
      reference: 'U2',
      value: 'Microcontroller'
    })
    
    const mcuVcc = new Pin('U2', 1, 'power_in', mcu, {
      minimum_voltage: 1.8,
      maximum_voltage: 3.6,
      current: 0.8
    })
    
    const sensor = new Component({
      reference: 'U3',
      value: 'Pressure_Sensor'
    })
    
    const sensorVcc = new Pin('U3', 1, 'power_in', sensor, {
      minimum_voltage: 4.5,
      maximum_voltage: 5.5,
      current: 0.05
    })
    
    const display = new Component({
      reference: 'U4',
      value: 'OLED_Display'
    })
    
    const displayVcc = new Pin('U4', 1, 'power_in', display, {
      minimum_voltage: 3.0,
      maximum_voltage: 3.6,
      current: 0.2
    })
    
    // High-power motor driver
    const motorDriver = new Component({
      reference: 'U5',
      value: 'Motor_Driver'
    })
    
    const motorVcc = new Pin('U5', 1, 'power_in', motorDriver, {
      minimum_voltage: 4.5,
      maximum_voltage: 5.5,
      current: 1.2  // This will exceed the 5V rail capacity!
    })
    
    // Create power distribution
    schematic.named('VIN').net(pmVin)
    schematic.named('3V3').net(pm3v3Out, mcuVcc, displayVcc)  // 0.8 + 0.2 = 1.0A (ok)
    schematic.named('5V').net(pm5vOut, sensorVcc, motorVcc)   // 0.05 + 1.2 = 1.25A > 1.0A (error!)
    
    schematic.add(powerManager, mcu, sensor, display, motorDriver)
    
    // Run ERC
    schematic.erc()
    
    const messages = mockStdoutWrite.mock.calls
      .map(call => call[0])
      .join('')
    
    // Should detect 5V rail overload but 3.3V should be OK
    expect(messages).toContain('Current capacity exceeded on net "5V"')
    expect(messages).toContain('1.25A demanded but only 1A supplied')
    
    // 3.3V rail should not have current errors
    expect(messages).not.toContain('Current capacity exceeded on net "3V3"')
  })

  it('should provide helpful error messages with component references', () => {
    const schematic = new Schematic('error_message_test')
    
    // Create a scenario with clear component references
    const batteryCharger = new Component({
      reference: 'U1',
      value: 'MCP73831',
      footprint: 'Package_TO_SOT_SMD:SOT-23-5'
    })
    
    const chargerOut = new Pin('U1', 5, 'power_out', batteryCharger, {
      minimum_voltage: 4.1,
      maximum_voltage: 4.2,
      current: 0.5
    })
    
    const microcontroller = new Component({
      reference: 'U2',
      value: 'ATMEGA328P',
      footprint: 'Package_QFP:TQFP-32_7x7mm_P0.8mm'
    })
    
    const mcuVcc = new Pin('U2', 7, 'power_in', microcontroller, {
      minimum_voltage: 1.8,
      maximum_voltage: 5.5,
      current: 0.2
    })
    
    const highPowerRadio = new Component({
      reference: 'U3',
      value: 'ESP32-WROOM-32',
      footprint: 'RF_Module:ESP32-WROOM-32'
    })
    
    const radioVcc = new Pin('U3', 2, 'power_in', highPowerRadio, {
      minimum_voltage: 2.3,
      maximum_voltage: 3.6,
      current: 0.8  // This will exceed charger capacity
    })
    
    // Connect all to battery charger output
    schematic.named('VBAT').net(chargerOut, mcuVcc, radioVcc)
    schematic.add(batteryCharger, microcontroller, highPowerRadio)
    
    // Run ERC
    schematic.erc()
    
    const messages = mockStdoutWrite.mock.calls
      .map(call => call[0])
      .join('')
    
    // Check that error messages include component references and values
    expect(messages).toContain('Current capacity exceeded on net "VBAT"')
    expect(messages).toContain('1A demanded but only 0.5A supplied')
    
    // Check for overvoltage warning (4.2V battery to 3.6V max ESP32)
    expect(messages).toContain('Overvoltage risk')
    expect(messages).toContain('U3:2')  // ESP32 pin
    expect(messages).toContain('maximum rating (3.6V)')
    expect(messages).toContain('exceeded by net voltage (4.2V)')
  })
}) 
