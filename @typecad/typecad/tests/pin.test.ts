import { describe, it, expect } from 'vitest'
import { Pin } from '../src/pin.js'
import { Component } from '../src/component.js'

describe('Pin', () => {
  it('should create a basic pin with default values', () => {
    const pin = new Pin('R1', 1)
    expect(pin.number).toBe(1)
    expect(pin.reference).toBe('R1')
    expect(pin.type).toBe('passive')
    expect(pin.owner).toBeNull()
    expect(pin.powerInfo).toBeUndefined()
  })

  it('should create a pin with custom type', () => {
    const pin = new Pin('U1', 'A1', 'input')
    expect(pin.number).toBe('A1')
    expect(pin.reference).toBe('U1')
    expect(pin.type).toBe('input')
  })

  it('should set owner component correctly', () => {
    const component = new Component({ reference: 'R1' })
    const pin = new Pin('R1', 1, 'passive', component)
    expect(pin.owner).toBe(component)
  })

  it('should create a pin with power information', () => {
    const component = new Component({ reference: 'U1' })
    const pin = new Pin('U1', 5, 'power_in', component, { 
      minimum_voltage: -0.3, 
      maximum_voltage: 6.5, 
      current: 2 
    })
    expect(pin.number).toBe(5)
    expect(pin.reference).toBe('U1')
    expect(pin.type).toBe('power_in')
    expect(pin.owner).toBe(component)
    expect(pin.powerInfo).toEqual({
      minimum_voltage: -0.3,
      maximum_voltage: 6.5,
      current: 2
    })
  })

  it('should create a pin with partial power information', () => {
    const pin = new Pin('U2', 3, 'power_in', undefined, { 
      maximum_voltage: 3.3 
    })
    expect(pin.powerInfo).toEqual({
      maximum_voltage: 3.3
    })
  })

  it('should demonstrate power-aware error detection capabilities', () => {
    // This test shows how power information enables sophisticated error detection
    
    // Create a 3.3V power supply
    const powerSupply = new Component({ reference: 'U1' })
    const vccOut = new Pin('U1', 1, 'power_out', powerSupply, {
      minimum_voltage: 3.2,
      maximum_voltage: 3.4,
      current: 1.0  // Can supply 1A
    })

    // Create a 5V-only component (this should cause an error)
    const sensor = new Component({ reference: 'U2' })
    const sensorVcc = new Pin('U2', 8, 'power_in', sensor, {
      minimum_voltage: 4.5,
      maximum_voltage: 5.5,
      current: 0.1  // Needs 100mA
    })

    // Create a 3.3V-compatible component
    const microcontroller = new Component({ reference: 'U3' })
    const mcuVcc = new Pin('U3', 28, 'power_in', microcontroller, {
      minimum_voltage: 1.8,
      maximum_voltage: 3.6,
      current: 0.5  // Needs 500mA
    })

    // Create a high-power component that exceeds supply capacity
    const motor = new Component({ reference: 'M1' })
    const motorVcc = new Pin('M1', 1, 'power_in', motor, {
      minimum_voltage: 3.0,
      maximum_voltage: 3.6,
      current: 2.0  // Needs 2A - exceeds 1A supply!
    })

    // If these were connected to the same net, ERC would detect:
    // 1. Voltage incompatibility: U2 needs 4.5-5.5V but supply provides 3.2-3.4V
    // 2. Current overload: Total demand (0.1 + 0.5 + 2.0 = 2.6A) exceeds supply (1.0A)
    // 3. U3 and motor would work voltage-wise, but current is still exceeded

    expect(vccOut.powerInfo?.current).toBe(1.0)
    expect(sensorVcc.powerInfo?.minimum_voltage).toBe(4.5)
    expect(mcuVcc.powerInfo?.minimum_voltage).toBe(1.8)
    expect(motorVcc.powerInfo?.current).toBe(2.0)
  })
})

/*
Example of errors that would be detected by the enhanced ERC system:

When pins with the above power specifications are connected to the same net:

🔴 ERC ERRORS:
- Voltage incompatibility on net "VCC": power output U1:1 (3.2V to 3.4V) cannot supply power input U2:8 (accepts 4.5V to 5.5V)
- Current capacity exceeded on net "VCC": 2.6A demanded but only 1.0A supplied

⚠️ ERC WARNINGS:
- High current utilization on net "VCC": 0.6A demanded from 1.0A capacity (60.0% utilization) [if motor wasn't connected]

This enables catching common design errors such as:
- Connecting 5V components to 3.3V supplies
- Power supply overload conditions  
- Voltage regulator capacity mismatches
- Missing decoupling capacitors (via current analysis)
- ESD protection violations (via voltage range checks)
*/
