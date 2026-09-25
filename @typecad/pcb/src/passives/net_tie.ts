import { Component, type ComponentInit } from '../component.js';
import { Pin } from '../pin.js';
import { Schematic } from '../schematic.js';

/** Options for the NetTie factory. */
export interface NetTieInit extends ComponentInit {
  schematic?: Schematic;
  net1?: Pin;
  net2?: Pin;
  net3?: Pin;
  net4?: Pin;
}

/**
 * A net tie connects two or more nets together. The pin count is derived
 * from how many nets are passed — the nets are the single source of truth.
 *
 * When `schematic` and at least `net1`/`net2` are given, the tie wires
 * itself up and joins the schematic; otherwise it is created unconnected.
 */
export class NetTie extends Component {
  constructor({ schematic, net1, net2, net3, net4, ...opts }: NetTieInit = {}) {
    const pinCount = net4 && net3 ? 4 : net3 ? 3 : 2;
    super({
      ...opts,
      footprint: opts.footprint || `NetTie:NetTie-${pinCount}_SMD_Pad0.5mm`,
      symbol: opts.symbol || `Device:NetTie_${pinCount}`,
    });

    if (!schematic || !net1 || !net2) return;

    schematic.net(this.pin(1), net1);
    schematic.net(this.pin(2), net2);

    if (net3) {
      schematic.net(this.pin(3), net3);
    }
    if (net4 && net3) {
      schematic.net(this.pin(4), net4);
    }
    schematic.add(this);
  }
}
