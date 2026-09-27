import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | PD3  | bidirectional      |
 | 2     | PD4  | bidirectional      |
 | 3     | GND  | power_in      |
 | 4     | VCC  | power_in      |
 | 5     | GND_5  | passive      |
 | 6     | VCC_6  | passive      |
 | 7     | XTAL1_PB6  | bidirectional      |
 | 8     | XTAL2_PB7  | bidirectional      |
 | 9     | PD5  | bidirectional      |
 | 10     | PD6  | bidirectional      |
 | 11     | PD7  | bidirectional      |
 | 12     | PB0  | bidirectional      |
 | 13     | PB1  | bidirectional      |
 | 14     | PB2  | bidirectional      |
 | 15     | PB3  | bidirectional      |
 | 16     | PB4  | bidirectional      |
 | 17     | PB5  | bidirectional      |
 | 18     | AVCC  | power_in      |
 | 19     | ADC6  | input      |
 | 20     | AREF  | passive      |
 | 21     | GND_21  | passive      |
 | 22     | ADC7  | input      |
 | 23     | PC0  | bidirectional      |
 | 24     | PC1  | bidirectional      |
 | 25     | PC2  | bidirectional      |
 | 26     | PC3  | bidirectional      |
 | 27     | PC4  | bidirectional      |
 | 28     | PC5  | bidirectional      |
 | 29     | RESET_PC6  | bidirectional      |
 | 30     | PD0  | bidirectional      |
 | 31     | PD1  | bidirectional      |
 | 32     | PD2  | bidirectional      |
 */
export class ATmega328P_A extends Component {
    PD3 = this.pin(1, { type: 'bidirectional' });
    PD4 = this.pin(2, { type: 'bidirectional' });
    GND = this.pin(3, { type: 'power_in' });
    VCC = this.pin(4, { type: 'power_in' });
    GND_5 = this.pin(5, { type: 'passive' });
    VCC_6 = this.pin(6, { type: 'passive' });
    XTAL1_PB6 = this.pin(7, { type: 'bidirectional' });
    XTAL2_PB7 = this.pin(8, { type: 'bidirectional' });
    PD5 = this.pin(9, { type: 'bidirectional' });
    PD6 = this.pin(10, { type: 'bidirectional' });
    PD7 = this.pin(11, { type: 'bidirectional' });
    PB0 = this.pin(12, { type: 'bidirectional' });
    PB1 = this.pin(13, { type: 'bidirectional' });
    PB2 = this.pin(14, { type: 'bidirectional' });
    PB3 = this.pin(15, { type: 'bidirectional' });
    PB4 = this.pin(16, { type: 'bidirectional' });
    PB5 = this.pin(17, { type: 'bidirectional' });
    AVCC = this.pin(18, { type: 'power_in' });
    ADC6 = this.pin(19, { type: 'input' });
    AREF = this.pin(20, { type: 'passive' });
    GND_21 = this.pin(21, { type: 'passive' });
    ADC7 = this.pin(22, { type: 'input' });
    PC0 = this.pin(23, { type: 'bidirectional' });
    PC1 = this.pin(24, { type: 'bidirectional' });
    PC2 = this.pin(25, { type: 'bidirectional' });
    PC3 = this.pin(26, { type: 'bidirectional' });
    PC4 = this.pin(27, { type: 'bidirectional' });
    PC5 = this.pin(28, { type: 'bidirectional' });
    RESET_PC6 = this.pin(29, { type: 'bidirectional' });
    PD0 = this.pin(30, { type: 'bidirectional' });
    PD1 = this.pin(31, { type: 'bidirectional' });
    PD2 = this.pin(32, { type: 'bidirectional' });

    constructor(reference?: string | undefined) {
        super({
            footprint: "Package_QFP:TQFP-32_7x7mm_P0.8mm",
            symbol: "MCU_Microchip_ATmega:ATmega328P-A",
        prefix: "U",
        });
        if (reference) this.reference = reference;
    }
}