import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | VBUS  | power_out      |
 | 2     | D  | bidirectional      |
 | 3     | D_3  | bidirectional      |
 | 4     | ID  | passive      |
 | 5     | GND  | power_out      |
 | 'SH'     | Shield  | passive      |
 */
export class USB_B_Micro extends Component {
    VBUS = this.pin(1, { type: 'power_out' });
    D = this.pin(2, { type: 'bidirectional' });
    D_3 = this.pin(3, { type: 'bidirectional' });
    ID = this.pin(4, { type: 'passive' });
    GND = this.pin(5, { type: 'power_out' });
    Shield = this.pin('SH', { type: 'passive' });

    constructor(reference?: string | undefined) {
        super({
            footprint: "Connector_USB:USB_Micro-B_Molex-105017-0001",
            symbol: "Connector:USB_B_Micro",
            prefix: "J",
        });
        if (reference) this.reference = reference;
    }
}