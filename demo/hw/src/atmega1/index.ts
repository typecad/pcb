import * as _0603 from '@typecad/passives/0603';
import { PCB, TrackBuilder, Component } from '@typecad/typecad';
import { ATMEGA328_MU } from './ATMEGA328_MU';

interface Iatmega1 {
    reference?: string,
    passives?: typeof _0603
    pcb: PCB;
};

/**
 * ### atmega1 - Description
 * 
 * #### Input Connections
 * 
 * #### Output Connections
 * 
 */
export class atmega1 {
    #passives: typeof _0603;
    pcb: PCB;
    components: (Component | TrackBuilder)[] = [];
    U1: ATMEGA328_MU;

    constructor({ reference, passives, pcb }: Iatmega1) {
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