import type { Pin } from '../pin.js';
import type { Component } from '../component.js';

export interface ISchematicNode {
  name: string;
  code: number;
  nodes: Pin[];
  owner: Component | null;
  /** declaring `pcb.net(...)` call, "file:line" — serialized into the netlist */
  source?: string;
  /** declaring `pcb.route(<net>)` call, "file:line" — where traces come from */
  routeSource?: string;
}
