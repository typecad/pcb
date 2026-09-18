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
  /** source designator for the ngspice card (must start with V/v; auto-prefixed otherwise) */
  name?: string;
  /** AC magnitude for small-signal (ac) analysis, e.g. `ac: 1` emits `AC 1` */
  ac?: number;
  /** raw ngspice source waveform appended to the card, e.g. `waveform: 'PULSE(0 5 1m 1u 1u 5m 20m)'` */
  waveform?: string;
}
export class Power {
  power: Pin;
  gnd: Pin;
  voltage?: number;
  current?: number;
  name?: string;
  ac?: number;
  waveform?: string;
  constructor({ power, gnd, voltage, current, direction = 'output', name, ac, waveform }: IPower = {}) {
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
    this.name = name;
    this.ac = ac;
    this.waveform = waveform;
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
