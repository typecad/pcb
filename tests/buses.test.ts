import { describe, it, expect } from 'vitest';
import { Pin } from '../src/pin.js';
import { I2C, UART, USB, Power } from '../src/buses.js';
import { ComponentError } from '../src/utils/errors.js';

function makePin(ref: string, num: number | string = 1): Pin {
  return new Pin(ref, num);
}

describe('I2C', () => {
  it('should assign sda and scl pins', () => {
    const sda = makePin('U1', 5);
    const scl = makePin('U1', 6);
    const bus = new I2C(sda, scl);
    expect(bus.sda).toBe(sda);
    expect(bus.scl).toBe(scl);
  });
});

describe('UART', () => {
  it('should assign tx and rx pins', () => {
    const tx = makePin('U1', 1);
    const rx = makePin('U1', 2);
    const bus = new UART(rx, tx);
    expect(bus.tx).toBe(tx);
    expect(bus.rx).toBe(rx);
    expect(bus.rts).toBeUndefined();
    expect(bus.cts).toBeUndefined();
  });

  it('should assign optional rts and cts pins', () => {
    const tx = makePin('U1', 1);
    const rx = makePin('U1', 2);
    const rts = makePin('U1', 3);
    const cts = makePin('U1', 4);
    const bus = new UART(rx, tx, rts, cts);
    expect(bus.rts).toBe(rts);
    expect(bus.cts).toBe(cts);
  });
});

describe('USB', () => {
  it('should assign dp and dn pins', () => {
    const dp = makePin('J1', 2);
    const dn = makePin('J1', 3);
    const bus = new USB(dp, dn);
    expect(bus.dp).toBe(dp);
    expect(bus.dn).toBe(dn);
  });
});

describe('Power', () => {
  it('should assign power and gnd pins', () => {
    const power = makePin('U1', 8);
    const gnd = makePin('U1', 4);
    const bus = new Power({ power, gnd });
    expect(bus.power).toBe(power);
    expect(bus.gnd).toBe(gnd);
  });

  it('should set power_out type by default', () => {
    const power = makePin('U1', 8);
    const gnd = makePin('U1', 4);
    new Power({ power, gnd });
    expect(power.type).toBe('power_out');
    expect(gnd.type).toBe('power_in');
  });

  it('should set power_in type when direction is input', () => {
    const power = makePin('U1', 8);
    const gnd = makePin('U1', 4);
    new Power({ power, gnd, direction: 'input' });
    expect(power.type).toBe('power_in');
    expect(gnd.type).toBe('power_in');
  });

  it('should store voltage and current', () => {
    const power = makePin('U1', 8);
    const gnd = makePin('U1', 4);
    const bus = new Power({ power, gnd, voltage: 3.3, current: 0.5 });
    expect(bus.voltage).toBe(3.3);
    expect(bus.current).toBe(0.5);
  });

  it('should set powerInfo on power pin when voltage/current provided', () => {
    const power = makePin('U1', 8);
    const gnd = makePin('U1', 4);
    new Power({ power, gnd, voltage: 5, current: 1 });
    expect(power.powerInfo).toBeDefined();
    expect(power.powerInfo?.maximum_voltage).toBe(5);
    expect(power.powerInfo?.current).toBe(1);
  });

  it('should set powerInfo current on gnd pin', () => {
    const power = makePin('U1', 8);
    const gnd = makePin('U1', 4);
    new Power({ power, gnd, current: 0.5 });
    expect(gnd.powerInfo).toBeDefined();
    expect(gnd.powerInfo?.current).toBe(0.5);
  });

  it('should throw ComponentError when power pin is missing', () => {
    const gnd = makePin('U1', 4);
    expect(() => new Power({ gnd })).toThrow(ComponentError);
    expect(() => new Power({ gnd })).toThrow('`Power` missing required `power` element');
  });

  it('should throw ComponentError when gnd pin is missing', () => {
    const power = makePin('U1', 8);
    expect(() => new Power({ power })).toThrow(ComponentError);
    expect(() => new Power({ power })).toThrow('`Power` missing required `gnd` element');
  });

  it('should throw ComponentError when both pins are missing', () => {
    expect(() => new Power({})).toThrow(ComponentError);
  });
});
