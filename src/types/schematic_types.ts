import type { Pin } from '../pin.js';
import type { Component } from '../component.js';

export interface ISchematicNode {
  name: string;
  code: number;
  nodes: Pin[];
  owner: Component | null;
}
