import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | VIN  | power_in      |
 | 2     | GND  | power_in      |
 | 3     | EN  | input      |
 | 4     | NC  | no_connect      |
 | 5     | VOUT  | power_out      |
 */
export class AP2112K_3_3 extends Component {
    VIN = this.pin(1, { type: 'power_in' });
    GND = this.pin(2, { type: 'power_in' });
    EN = this.pin(3, { type: 'input' });
    NC = this.pin(4, { type: 'no_connect' });
    VOUT = this.pin(5, { type: 'power_out' });

    constructor(reference?: string | undefined) {
        super({
            footprint: "Package_TO_SOT_SMD:SOT-23-5",
            symbol: "Regulator_Linear:AP2112K-3.3",
        prefix: "U",
        });
        if (reference) this.reference = reference;
    }
}