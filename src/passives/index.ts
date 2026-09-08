import { Component } from '../component.js';
import { sizes, PASSIVE_DEFAULT_SIZE, type PassiveSize, type FuseSize } from './configs.js';
import { Resistor, Capacitor, Inductor, Diode, LED, Fuse, type PassiveInit, type FuseInit } from './chip.js';
import { Connector, type ConnectorInit } from './connector.js';
import { TestPoint, MountingHole, type MountingHoleInit } from './mechanical.js';
import { NetTie, type NetTieInit } from './net_tie.js';

export type { PassiveSize, FuseSize, ConnectorSeries } from './configs.js';
export { PASSIVE_DEFAULT_SIZE } from './configs.js';
export type { PassiveInit, FuseInit } from './chip.js';
export type { ConnectorInit } from './connector.js';
export type { MountingHoleInit } from './mechanical.js';
export type { NetTieInit } from './net_tie.js';
export { Resistor, Capacitor, Inductor, Diode, LED, Fuse } from './chip.js';
export { Connector } from './connector.js';
export { TestPoint, MountingHole } from './mechanical.js';
export { NetTie } from './net_tie.js';

/**
 * The standard passive component factory shape consumed by `Package`
 * (`this.passives.Capacitor(...)`) and injectable via `PackageOptions.passives`.
 */
export type PassiveFactory = {
  Resistor: new (options?: PassiveInit) => Component;
  Capacitor: new (options?: PassiveInit) => Component;
  Inductor: new (options?: PassiveInit) => Component;
  Diode: new (options?: PassiveInit) => Component;
  LED: new (options?: PassiveInit) => Component;
  Fuse: new (options?: FuseInit) => Component;
};

/**
 * Build a `PassiveFactory` bound to one chip size — the default source for
 * `Package`'s `this.passives`. The bound size is a default: an explicit
 * per-instance `size` still wins.
 */
export function passiveFactory(size: PassiveSize = PASSIVE_DEFAULT_SIZE): PassiveFactory {
  // 0201/0402 carry no Fuse preset — the factory falls back to the smallest
  // size that has one rather than producing a broken factory entry.
  const fuseSize: FuseSize = sizes[size].Fuse ? (size as FuseSize) : '0603';
  return {
    Resistor: class extends Resistor {
      constructor(opts: PassiveInit = {}) {
        super({ ...opts, size: opts.size ?? size });
      }
    },
    Capacitor: class extends Capacitor {
      constructor(opts: PassiveInit = {}) {
        super({ ...opts, size: opts.size ?? size });
      }
    },
    Inductor: class extends Inductor {
      constructor(opts: PassiveInit = {}) {
        super({ ...opts, size: opts.size ?? size });
      }
    },
    Diode: class extends Diode {
      constructor(opts: PassiveInit = {}) {
        super({ ...opts, size: opts.size ?? size });
      }
    },
    LED: class extends LED {
      constructor(opts: PassiveInit = {}) {
        super({ ...opts, size: opts.size ?? size });
      }
    },
    Fuse: class extends Fuse {
      constructor(opts: FuseInit = {}) {
        super({ ...opts, size: opts.size ?? fuseSize });
      }
    },
  };
}
