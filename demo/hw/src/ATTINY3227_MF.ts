import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | PA2  | unspecified      |
 | 2     | EXTCLK_PA3  | unspecified      |
 | 3     | GND  | unspecified      |
 | 4     | VDD  | unspecified      |
 | 5     | PA4  | unspecified      |
 | 6     | PA5  | unspecified      |
 | 7     | PA6  | unspecified      |
 | 8     | PA7  | unspecified      |
 | 9     | PB7  | unspecified      |
 | 10     | PB6  | unspecified      |
 | 11     | PB5  | unspecified      |
 | 12     | PB4  | unspecified      |
 | 13     | PB3_TOSC1  | unspecified      |
 | 14     | PB2_TOSC2  | unspecified      |
 | 15     | PB1  | unspecified      |
 | 16     | PB0  | unspecified      |
 | 17     | PC0  | unspecified      |
 | 18     | PC1  | unspecified      |
 | 19     | PC2  | unspecified      |
 | 20     | PC3  | unspecified      |
 | 21     | PC4  | unspecified      |
 | 22     | PC5  | unspecified      |
 | 23     | PA0_UPDI_RESET  | unspecified      |
 | 24     | PA1  | unspecified      |
 | 25     | EP  | unspecified      |
 */
export class ATTINY3227_MF extends Component {
    PA2 = new Pin(this.reference, 1, 'unspecified', this);
    EXTCLK_PA3 = new Pin(this.reference, 2, 'unspecified', this);
    GND = new Pin(this.reference, 3, 'unspecified', this);
    VDD = new Pin(this.reference, 4, 'unspecified', this);
    PA4 = new Pin(this.reference, 5, 'unspecified', this);
    PA5 = new Pin(this.reference, 6, 'unspecified', this);
    PA6 = new Pin(this.reference, 7, 'unspecified', this);
    PA7 = new Pin(this.reference, 8, 'unspecified', this);
    PB7 = new Pin(this.reference, 9, 'unspecified', this);
    PB6 = new Pin(this.reference, 10, 'unspecified', this);
    PB5 = new Pin(this.reference, 11, 'unspecified', this);
    PB4 = new Pin(this.reference, 12, 'unspecified', this);
    PB3_TOSC1 = new Pin(this.reference, 13, 'unspecified', this);
    PB2_TOSC2 = new Pin(this.reference, 14, 'unspecified', this);
    PB1 = new Pin(this.reference, 15, 'unspecified', this);
    PB0 = new Pin(this.reference, 16, 'unspecified', this);
    PC0 = new Pin(this.reference, 17, 'unspecified', this);
    PC1 = new Pin(this.reference, 18, 'unspecified', this);
    PC2 = new Pin(this.reference, 19, 'unspecified', this);
    PC3 = new Pin(this.reference, 20, 'unspecified', this);
    PC4 = new Pin(this.reference, 21, 'unspecified', this);
    PC5 = new Pin(this.reference, 22, 'unspecified', this);
    PA0_UPDI_RESET = new Pin(this.reference, 23, 'unspecified', this);
    PA1 = new Pin(this.reference, 24, 'unspecified', this);
    EP = new Pin(this.reference, 25, 'unspecified', this);
    
    constructor(reference?: string | undefined) {
        super({ reference, footprint: "lib:VQFN-24_L4.0-W4.0-P0.50-TL-EP2.5", symbol: "ATTINY3227-MF:ATTINY3227-MF" });
    }
}