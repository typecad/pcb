import { Component, type ComponentInit } from '../component.js';
import { connectorSeries, type ConnectorSeries } from './configs.js';

/** Options for the Connector factory. */
export interface ConnectorInit extends ComponentInit {
  /** Number of pins (default: 1). */
  number?: number;
  /** Connector series preset (default: 'pin-header'). An explicit `footprint`/`symbol` wins. */
  series?: ConnectorSeries;
}

export class Connector extends Component {
  constructor({ number = 1, series = 'pin-header', ...opts }: ConnectorInit = {}) {
    const preset = connectorSeries[series](number);
    super({
      ...opts,
      footprint: opts.footprint || preset.footprint,
      symbol: opts.symbol || preset.symbol,
      prefix: 'J',
    });
  }
}
