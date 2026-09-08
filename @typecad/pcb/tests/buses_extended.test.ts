import { describe, it, expect } from 'vitest';
import { I2C, UART, USB, Power } from '../src/buses.js';
import { Pin } from '../src/pin.js';
import { ComponentError } from '../src/utils/errors.js';

describe('I2C', () => {
  it('should assign sda and scl pins', () => {
    const sda = new Pin('U1', 5);
    const scl = new Pin('U1', 6);
    const i2c = new I2C(sda, scl);
    expect(i2c.sda).toBe(sda);
    expect(i2c.scl).toBe(scl);
  });
});

describe('UART', () => {
  it('should assign rx and tx pins', () => {
    const rx = new Pin('U1', 1);
    const tx = new Pin('U1', 2);
    const uart = new UART(rx, tx);
    expect(uart.rx).toBe(rx);
    expect(uart.tx).toBe(tx);
  });

  it('should optionally assign rts and cts', () => {
    const rx = new Pin('U1', 1);
    const tx = new Pin('U1', 2);
    const rts = new Pin('U1', 3);
    const cts = new Pin('U1', 4);
    const uart = new UART(rx, tx, rts, cts);
    expect(uart.rts).toBe(rts);
    expect(uart.cts).toBe(cts);
  });

  it('should not have rts/cts when not provided', () => {
    const uart = new UART(new Pin('U1', 1), new Pin('U1', 2));
    expect(uart.rts).toBeUndefined();
    expect(uart.cts).toBeUndefined();
  });
});

describe('USB', () => {
  it('should assign dp and dn pins', () => {
    const dp = new Pin('J1', 3);
    const dn = new Pin('J1', 2);
    const usb = new USB(dp, dn);
    expect(usb.dp).toBe(dp);
    expect(usb.dn).toBe(dn);
  });
});

describe('Power', () => {
  it('should set power pin type to power_out by default', () => {
    const pwr = new Pin('U1', 8);
    const gnd = new Pin('U1', 4);
    new Power({ power: pwr, gnd: gnd });
    expect(pwr.type).toBe('power_out');
    expect(gnd.type).toBe('power_in');
  });

  it('should set power pin type to power_in when direction is input', () => {
    const pwr = new Pin('U1', 8);
    const gnd = new Pin('U1', 4);
    new Power({ power: pwr, gnd: gnd, direction: 'input' });
    expect(pwr.type).toBe('power_in');
  });

  it('should store voltage and current', () => {
    const pwr = new Pin('U1', 8);
    const gnd = new Pin('U1', 4);
    const power = new Power({ power: pwr, gnd: gnd, voltage: 3.3, current: 0.5 });
    expect(power.voltage).toBe(3.3);
    expect(power.current).toBe(0.5);
  });

  it('should set powerInfo on power pin when voltage/current provided', () => {
    const pwr = new Pin('U1', 8);
    const gnd = new Pin('U1', 4);
    new Power({ power: pwr, gnd: gnd, voltage: 5, current: 1 });
    expect(pwr.powerInfo).toBeDefined();
    expect(pwr.powerInfo!.minimum_voltage).toBe(5);
    expect(pwr.powerInfo!.maximum_voltage).toBe(5);
    expect(pwr.powerInfo!.current).toBe(1);
  });

  it('should set powerInfo current on gnd pin when current provided', () => {
    const pwr = new Pin('U1', 8);
    const gnd = new Pin('U1', 4);
    new Power({ power: pwr, gnd: gnd, current: 0.5 });
    expect(gnd.powerInfo).toBeDefined();
    expect(gnd.powerInfo!.current).toBe(0.5);
  });

  it('should throw ComponentError when power pin is missing', () => {
    const gnd = new Pin('U1', 4);
    expect(() => new Power({ gnd: gnd })).toThrow(ComponentError);
    expect(() => new Power({ gnd: gnd })).toThrow(/missing required.*power/);
  });

  it('should throw ComponentError when gnd pin is missing', () => {
    const pwr = new Pin('U1', 8);
    expect(() => new Power({ power: pwr })).toThrow(ComponentError);
    expect(() => new Power({ power: pwr })).toThrow(/missing required.*gnd/);
  });

  it('should not set powerInfo when voltage/current not provided', () => {
    const pwr = new Pin('U1', 8);
    const gnd = new Pin('U1', 4);
    new Power({ power: pwr, gnd: gnd });
    expect(pwr.powerInfo).toBeUndefined();
    expect(gnd.powerInfo).toBeUndefined();
  });

  it('should work without voltage or current', () => {
    const pwr = new Pin('U1', 8);
    const gnd = new Pin('U1', 4);
    const power = new Power({ power: pwr, gnd: gnd });
    expect(power.voltage).toBeUndefined();
    expect(power.current).toBeUndefined();
  });
});
