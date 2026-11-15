import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | RESET_PB5  | bidirectional      |
 | 2     | XTAL1_PB3  | bidirectional      |
 | 3     | XTAL2_PB4  | bidirectional      |
 | 4     | GND  | power_in      |
 | 5     | AREF_PB0  | bidirectional      |
 | 6     | PB1  | bidirectional      |
 | 7     | PB2  | bidirectional      |
 | 8     | VCC  | power_in      |
 */
export class ATtiny85_20S extends Component {
    RESET_PB5 = this.pin(1, { type: 'bidirectional' });
    XTAL1_PB3 = this.pin(2, { type: 'bidirectional' });
    XTAL2_PB4 = this.pin(3, { type: 'bidirectional' });
    GND = this.pin(4, { type: 'power_in' });
    AREF_PB0 = this.pin(5, { type: 'bidirectional' });
    PB1 = this.pin(6, { type: 'bidirectional' });
    PB2 = this.pin(7, { type: 'bidirectional' });
    VCC = this.pin(8, { type: 'power_in' });

    constructor(reference?: string | undefined) {
        super({
            footprint: "Package_SO:SOIC-8_5.3x5.3mm_P1.27mm",
            symbol: "MCU_Microchip_ATtiny:ATtiny85-20S",
            prefix: "U",
        });
        if (reference) this.reference = reference;
    }
}