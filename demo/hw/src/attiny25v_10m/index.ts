import * as _0603 from '@typecad/passives/0603';
import { PCB, TrackBuilder, Component } from '@typecad/typecad';
import { ATtiny25V_10M } from './ATtiny25V_10M';

export interface Attiny25v_10mOptions {
    reference?: string;
    passives?: typeof _0603;
    pcb: PCB;
}

/**
 * ### Attiny25v_10m - Description
 * 
 * #### Input Connections
 * 
 * #### Output Connections
 * 
 */
export class Attiny25v_10m {
    #passives: typeof _0603;
    readonly pcb: PCB;
    readonly components: (Component | TrackBuilder)[] = [];
    readonly U1: ATtiny25V_10M;

    constructor({ reference, passives, pcb }: Attiny25v_10mOptions) {
        this.#passives = passives || _0603;
        this.pcb = pcb;

        // create the components
        this.U1 = new ATtiny25V_10M(reference);

        // connect the components
        // this.pcb.net(this.U1.pin(1), this.U2.pin(2));

        // create the tracks

        // add the components to the pcb and group them
        this.components.push(this.U1);
        this.pcb.group('ATtiny25V_10M', this.U1);

    }
}