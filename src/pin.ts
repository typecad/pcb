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
  type: TPinType;
  /** @internal */
  owner: Component | null;
  /** @internal */
  powerInfo?: IPinPowerInfo;
  /** @internal */
  sourceFile?: string;
  /** @internal */
  sourceLine?: number;
  /** @internal */
  sourceColumn?: number;

  #standaloneReference: string;
  #uuidOverride: string | undefined;

  /**
   * Creates a standalone pin. To create and register a pin on a component,
   * use `component.pin(number, { type, powerInfo })` instead.
   *
   * @param {string} reference - The reference identifier for the pin.
   * @param {number|string} number - The pin number or identifier. Stored as string internally.
   * @param {TPinType} [type] - The type of the pin. Defaults to 'passive'.
   */
  constructor(reference: string, number: number | string, type?: TPinType) {
    this.#standaloneReference = reference;
    this.number = String(number);
    this.type = type || 'passive';
    this.owner = null;
  }

  /**
   * The owning component's reference designator, resolved lazily so that
   * class-field pins (`PA0 = this.pin(1)`) never force reference inference
   * before the constructor body has set the symbol or prefix. Standalone
   * pins keep the reference they were constructed with.
   */
  get reference(): string {
    return this.owner ? this.owner.reference : this.#standaloneReference;
  }

  /** @internal — the owning component's uuid unless explicitly overridden. */
  get uuid(): string | undefined {
    if (this.#uuidOverride !== undefined) return this.#uuidOverride;
    return this.owner ? this.owner.uuid : undefined;
  }

  /** @internal */
  set uuid(value: string | undefined) {
    this.#uuidOverride = value;
  }
}
