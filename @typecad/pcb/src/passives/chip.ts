import { Component, type ComponentInit } from '../component.js';
import { sizes, PASSIVE_DEFAULT_SIZE, type PassiveSize, type FuseSize } from './configs.js';

/** Options for the chip passive factories. */
export interface PassiveInit extends ComponentInit {
  /** Chip package size preset (default: '0603'). An explicit `footprint`/`symbol` wins. */
  size?: PassiveSize;
}

export class Resistor extends Component {
  constructor({ size = PASSIVE_DEFAULT_SIZE, ...opts }: PassiveInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || sizes[size].Resistor.footprint,
      symbol: opts.symbol || sizes[size].Resistor.symbol,
    });
  }
}

export class Capacitor extends Component {
  constructor({ size = PASSIVE_DEFAULT_SIZE, ...opts }: PassiveInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || sizes[size].Capacitor.footprint,
      symbol: opts.symbol || sizes[size].Capacitor.symbol,
    });
  }
}

export class Inductor extends Component {
  constructor({ size = PASSIVE_DEFAULT_SIZE, ...opts }: PassiveInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || sizes[size].Inductor.footprint,
      symbol: opts.symbol || sizes[size].Inductor.symbol,
    });
  }
}

export class Diode extends Component {
  constructor({ size = PASSIVE_DEFAULT_SIZE, ...opts }: PassiveInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || sizes[size].Diode.footprint,
      symbol: opts.symbol || sizes[size].Diode.symbol,
    });
  }
}

export class LED extends Component {
  constructor({ size = PASSIVE_DEFAULT_SIZE, ...opts }: PassiveInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || sizes[size].LED.footprint,
      symbol: opts.symbol || sizes[size].LED.symbol,
      prefix: 'D',
    });
  }
}

/** Options for the Fuse factory — Fuse presets exist only for larger chip sizes. */
export interface FuseInit extends Omit<PassiveInit, 'size'> {
  size?: FuseSize;
}

export class Fuse extends Component {
  constructor({ size = '0603', ...opts }: FuseInit = {}) {
    super({
      ...opts,
      footprint: opts.footprint || sizes[size].Fuse!.footprint,
      symbol: opts.symbol || sizes[size].Fuse!.symbol,
    });
  }
}
