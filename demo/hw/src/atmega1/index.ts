import * as _0603 from '@typecad/passives/0603';
import { PCB, TrackBuilder, Component } from '@typecad/typecad';
import { ATMEGA328_MU } from './ATMEGA328_MU';

export interface Atmega1Options {
    reference?: string;
    passives?: typeof _0603;
    pcb: PCB;
}

/**
 * ### Atmega1 - Description
 * 
 * #### Input Connections
 * 
 * #### Output Connections
 * 
 */
export class Atmega1 {
    #passives: typeof _0603;
    readonly pcb: PCB;
    readonly components: (Component | TrackBuilder)[] = [];
    readonly U1: ATMEGA328_MU;

    constructor({ reference, passives, pcb }: Atmega1Options) {
        this.#passives = passives || _0603;
        this.pcb = pcb;

        // create the components
        this.U1 = new ATMEGA328_MU(reference);

        // connect the components
        // this.pcb.net(this.U1.pin(1), this.U2.pin(2));

        // create the tracks

        // add the components to the pcb and group them
        this.components.push(this.U1);
        this.pcb.group('ATMEGA328_MU', this.U1);
    }
}
