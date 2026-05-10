import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | _RESET_PB5  | bidirectional      |
 | 2     | XTAL1_PB3  | bidirectional      |
 | 3     | NC  | no_connect      |
 | 4     | NC_4  | no_connect      |
 | 5     | XTAL2_PB4  | bidirectional      |
 | 6     | NC_6  | no_connect      |
 | 7     | NC_7  | no_connect      |
 | 8     | GND  | power_in      |
 | 9     | NC_9  | no_connect      |
 | 10     | NC_10  | no_connect      |
 | 11     | AREF_PB0  | bidirectional      |
 | 12     | PB1  | bidirectional      |
 | 13     | NC_13  | no_connect      |
 | 14     | PB2  | bidirectional      |
 | 15     | VCC  | power_in      |
 | 16     | NC_16  | no_connect      |
 | 17     | NC_17  | no_connect      |
 | 18     | NC_18  | no_connect      |
 | 19     | NC_19  | no_connect      |
 | 20     | NC_20  | no_connect      |
 | 21     | GND_21  | passive      |
 */
export class ATtiny25V_10M extends Component {
    _RESET_PB5 = new Pin(this.reference, 1, 'bidirectional', this);
    XTAL1_PB3 = new Pin(this.reference, 2, 'bidirectional', this);
    NC = new Pin(this.reference, 3, 'no_connect', this);
    NC_4 = new Pin(this.reference, 4, 'no_connect', this);
    XTAL2_PB4 = new Pin(this.reference, 5, 'bidirectional', this);
    NC_6 = new Pin(this.reference, 6, 'no_connect', this);
    NC_7 = new Pin(this.reference, 7, 'no_connect', this);
    GND = new Pin(this.reference, 8, 'power_in', this);
    NC_9 = new Pin(this.reference, 9, 'no_connect', this);
    NC_10 = new Pin(this.reference, 10, 'no_connect', this);
    AREF_PB0 = new Pin(this.reference, 11, 'bidirectional', this);
    PB1 = new Pin(this.reference, 12, 'bidirectional', this);
    NC_13 = new Pin(this.reference, 13, 'no_connect', this);
    PB2 = new Pin(this.reference, 14, 'bidirectional', this);
    VCC = new Pin(this.reference, 15, 'power_in', this);
    NC_16 = new Pin(this.reference, 16, 'no_connect', this);
    NC_17 = new Pin(this.reference, 17, 'no_connect', this);
    NC_18 = new Pin(this.reference, 18, 'no_connect', this);
    NC_19 = new Pin(this.reference, 19, 'no_connect', this);
    NC_20 = new Pin(this.reference, 20, 'no_connect', this);
    GND_21 = new Pin(this.reference, 21, 'passive', this);
    
    constructor(reference?: string | undefined) {
        super({ reference, footprint: "Package_DFN_QFN:QFN-20-1EP_4x4mm_P0.5mm_EP2.6x2.6mm", symbol: "MCU_Microchip_ATtiny:ATtiny25V-10M" });
    }
}