import { Component } from './component.js';
import { IPinPowerInfo } from './pcb/pcb_interfaces.js';

type TPinType =
  | 'passive'
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'tri_state'
  | 'power_in'
  | 'unspecified'
  | 'power_out'
  | 'free'
  | 'open_collector'
  | 'open_emitter'
  | 'no_connect';

export class Pin {
  readonly number: string = '';
  readonly reference: string = '';
  type: TPinType;
  /** @internal */
  owner: Component | null;
  /** @internal */
  powerInfo?: IPinPowerInfo;
  /** @internal */
  uuid?: string;
  /** @internal */
  sourceFile?: string;
  /** @internal */
  sourceLine?: number;
  /** @internal */
  sourceColumn?: number;

  /**
   * Creates a standalone pin. To create and register a pin on a component,
   * use `component.pin(number, { type, powerInfo })` instead.
   *
   * @param {string} reference - The reference identifier for the pin.
   * @param {number|string} number - The pin number or identifier. Stored as string internally.
   * @param {TPinType} [type] - The type of the pin. Defaults to 'passive'.
   */
  constructor(reference: string, number: number | string, type?: TPinType) {
    this.reference = reference;
    this.number = String(number);
    this.type = type || 'passive';
    this.owner = null;
  }
}
