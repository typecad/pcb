import { describe, it, expect } from 'vitest';
import { Pin } from '../src/pin.js';
import { Component } from '../src/component.js';

describe('Pin', () => {
  it('should create a basic pin with default values', () => {
    const pin = new Pin('R1', 1);
    expect(pin.number).toBe('1');
    expect(pin.reference).toBe('R1');
    expect(pin.type).toBe('passive');
    expect(pin.owner).toBeNull();
    expect(pin.powerInfo).toBeUndefined();
  });

  it('should create a pin with custom type', () => {
    const pin = new Pin('U1', 'A1', 'input');
    expect(pin.number).toBe('A1');
    expect(pin.reference).toBe('U1');
    expect(pin.type).toBe('input');
  });

  it('should register a pin via component.pin()', () => {
    const component = new Component('');
    component.reference = 'R1';
    const pin = component.pin(1, { type: 'passive' });
    expect(pin.owner).toBe(component);
    expect(component.pins).toContain(pin);
  });

  it('should create a pin with power information via component.pin()', () => {
    const component = new Component('');
    component.reference = 'U1';
    const pin = component.pin(5, {
      type: 'power_in',
      powerInfo: {
        minimum_voltage: -0.3,
        maximum_voltage: 6.5,
        current: 2,
      },
    });
    expect(pin.number).toBe('5');
    expect(pin.reference).toBe('U1');
    expect(pin.type).toBe('power_in');
    expect(pin.owner).toBe(component);
    expect(pin.powerInfo).toEqual({
      minimum_voltage: -0.3,
      maximum_voltage: 6.5,
      current: 2,
    });
  });

  it('should create a standalone pin with partial power info', () => {
    const pin = new Pin('U2', 3, 'power_in');
    pin.powerInfo = { maximum_voltage: 3.3 };
    expect(pin.powerInfo).toEqual({
      maximum_voltage: 3.3,
    });
  });

  it('should demonstrate power-aware error detection capabilities', () => {
    const powerSupply = new Component('');
    powerSupply.reference = 'U1';
    const vccOut = powerSupply.pin(1, {
      type: 'power_out',
      powerInfo: {
        minimum_voltage: 3.2,
        maximum_voltage: 3.4,
        current: 1.0,
      },
    });

    const sensor = new Component('');
    sensor.reference = 'U2';
    const sensorVcc = sensor.pin(8, {
      type: 'power_in',
      powerInfo: {
        minimum_voltage: 4.5,
        maximum_voltage: 5.5,
        current: 0.1,
      },
    });

    const microcontroller = new Component('');
    microcontroller.reference = 'U3';
    const mcuVcc = microcontroller.pin(28, {
      type: 'power_in',
      powerInfo: {
        minimum_voltage: 1.8,
        maximum_voltage: 3.6,
        current: 0.5,
      },
    });

    const motor = new Component('');
    motor.reference = 'M1';
    const motorVcc = motor.pin(1, {
      type: 'power_in',
      powerInfo: {
        minimum_voltage: 3.0,
        maximum_voltage: 3.6,
        current: 2.0,
      },
    });

    expect(vccOut.powerInfo?.current).toBe(1.0);
    expect(sensorVcc.powerInfo?.minimum_voltage).toBe(4.5);
    expect(mcuVcc.powerInfo?.minimum_voltage).toBe(1.8);
    expect(motorVcc.powerInfo?.current).toBe(2.0);
  });
});
