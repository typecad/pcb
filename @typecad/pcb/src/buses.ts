import { Pin } from './pin.js';
import { ComponentError } from './utils/errors.js';
import { getCallSite } from './utils/stack_trace.js';
import { formatSourceError } from './utils/error_reporter.js';

export class I2C {
  sda: Pin;
  scl: Pin;
  constructor(sda: Pin, scl: Pin) {
    this.sda = sda;
    this.scl = scl;
  }
}

export class UART {
  tx: Pin;
  rx: Pin;
  rts?: Pin;
  cts?: Pin;
  constructor(rx: Pin, tx: Pin, rts?: Pin, cts?: Pin) {
    this.rx = rx;
    this.tx = tx;
    if (rts) this.rts = rts;
    if (cts) this.cts = cts;
  }
}

export class USB {
  dp: Pin;
  dn: Pin;
  constructor(DP: Pin, DN: Pin) {
    this.dp = DP;
    this.dn = DN;
  }
}

export interface IPower {
  power?: Pin;
  gnd?: Pin;
  voltage?: number;
  current?: number;
  direction?: 'input' | 'output';
}
export class Power {
  power: Pin;
  gnd: Pin;
  voltage?: number;
  current?: number;
  constructor({ power, gnd, voltage, current, direction = 'output' }: IPower = {}) {
    if (power) {
      this.power = power;
      this.power.type = direction === 'input' ? 'power_in' : 'power_out';

      // Set powerInfo based on Power object properties
      if (voltage !== undefined || current !== undefined) {
        this.power.powerInfo = {
          minimum_voltage: voltage !== undefined ? voltage : undefined,
          maximum_voltage: voltage !== undefined ? voltage : undefined,
          current,
        };
      }
    } else {
      const site = getCallSite();
      const err = new ComponentError(formatSourceError('`Power` missing required `power` element', site));
      err.stack = err.message;
      throw err;
    }
    if (gnd) {
      this.gnd = gnd;
      this.gnd.type = 'power_in';

      // GND pins typically don't need voltage specs, but we can set current if provided
      if (current !== undefined) {
        this.gnd.powerInfo = {
          current,
        };
      }
    } else {
      const site = getCallSite();
      const err = new ComponentError(formatSourceError('`Power` missing required `gnd` element', site));
      err.stack = err.message;
      throw err;
    }
    if (voltage !== undefined) {
      this.voltage = voltage;
    }
    if (current !== undefined) {
      this.current = current;
    }
  }
}
