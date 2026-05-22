import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | PA2  | bidirectional      |
 | 2     | PA3  | bidirectional      |
 | 3     | GND  | power_in      |
 | 4     | VCC  | power_in      |
 | 5     | PA4  | bidirectional      |
 | 6     | PA5  | bidirectional      |
 | 7     | PA6  | bidirectional      |
 | 8     | PA7  | bidirectional      |
 | 9     | PB7  | bidirectional      |
 | 10     | PB6  | bidirectional      |
 | 11     | PB5  | bidirectional      |
 | 12     | PB4  | bidirectional      |
 | 13     | PB3  | bidirectional      |
 | 14     | PB2  | bidirectional      |
 | 15     | PB1  | bidirectional      |
 | 16     | PB0  | bidirectional      |
 | 17     | PC0  | bidirectional      |
 | 18     | PC1  | bidirectional      |
 | 19     | PC2  | bidirectional      |
 | 20     | PC3  | bidirectional      |
 | 21     | PC4  | bidirectional      |
 | 22     | PC5  | bidirectional      |
 | 23     | RESET_PA0  | bidirectional      |
 | 24     | PA1  | bidirectional      |
 | 25     | GND_25  | passive      |
 */
export class ATtiny3227_M extends Component {
    PA2 = new Pin(this.reference, 1, 'bidirectional', this);
    PA3 = new Pin(this.reference, 2, 'bidirectional', this);
    GND = new Pin(this.reference, 3, 'power_in', this);
    VCC = new Pin(this.reference, 4, 'power_in', this);
    PA4 = new Pin(this.reference, 5, 'bidirectional', this);
    PA5 = new Pin(this.reference, 6, 'bidirectional', this);
    PA6 = new Pin(this.reference, 7, 'bidirectional', this);
    PA7 = new Pin(this.reference, 8, 'bidirectional', this);
    PB7 = new Pin(this.reference, 9, 'bidirectional', this);
    PB6 = new Pin(this.reference, 10, 'bidirectional', this);
    PB5 = new Pin(this.reference, 11, 'bidirectional', this);
    PB4 = new Pin(this.reference, 12, 'bidirectional', this);
    PB3 = new Pin(this.reference, 13, 'bidirectional', this);
    PB2 = new Pin(this.reference, 14, 'bidirectional', this);
    PB1 = new Pin(this.reference, 15, 'bidirectional', this);
    PB0 = new Pin(this.reference, 16, 'bidirectional', this);
    PC0 = new Pin(this.reference, 17, 'bidirectional', this);
    PC1 = new Pin(this.reference, 18, 'bidirectional', this);
    PC2 = new Pin(this.reference, 19, 'bidirectional', this);
    PC3 = new Pin(this.reference, 20, 'bidirectional', this);
    PC4 = new Pin(this.reference, 21, 'bidirectional', this);
    PC5 = new Pin(this.reference, 22, 'bidirectional', this);
    RESET_PA0 = new Pin(this.reference, 23, 'bidirectional', this);
    PA1 = new Pin(this.reference, 24, 'bidirectional', this);
    GND_25 = new Pin(this.reference, 25, 'passive', this);
    
    constructor(reference?: string | undefined) {
        super({ reference, footprint: "Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm", symbol: "MCU_Microchip_ATtiny:ATtiny3227-M" });
    }
}