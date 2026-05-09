import { Component } from './component.js';
import { IPinPowerInfo } from './pcb/pcb_interfaces.js';
/**
 * Type representing the possible types of a pin.
 *
 * @typedef {"passive" | "input" | "output" | "bidirectional" | "tri_state" | "power_in" | "unspecified" | "power_out" | "free" | "open_collector" | "open_emitter" | "no_connect"} TPinType
 */
type TPinType = "passive" | "input" | "output" | "bidirectional" | "tri_state" | "power_in" | "unspecified" | "power_out" | "free" | "open_collector" | "open_emitter" | "no_connect";

/**
 * Class representing a pin in a schematic.
 *
 * @class Pin
 */
export class Pin {
    number: number | string = '';
    reference: string = '';
    type: TPinType;
    owner: Component | null;
    powerInfo?: IPinPowerInfo;
    uuid?: string;

    /**
     * Initializes a new pin with a given reference, number, and optional type.
     *
     * @param {string} reference - The reference identifier for the pin.
     * @param {number|string} number - The pin number or identifier.
     * @param {TPinType} [type] - The type of the pin. Defaults to 'passive'.
     * @param {Component} [owner] - The owner component of this pin.
     * @param {IPinPowerInfo} [powerInfo] - Power characteristics of the pin.
     * @example
     * ```ts
     * let pin = new Pin('R1', 1, 'input');
     * let powerPin = new Pin('U1', 5, 'power_in', this, { minimum_voltage: -0.3, maximum_voltage: 6.5, current: 2 });
     * ```
     */
    constructor(reference: string, number: number | string, type?: TPinType, owner?: Component, powerInfo?: IPinPowerInfo) {
        this.reference = reference;
        this.number = number;
        this.type = type || 'passive';
        this.owner = owner || null;
        this.powerInfo = powerInfo;
    }
}