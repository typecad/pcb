import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | PD3  | bidirectional      |
 | 2     | PD4  | bidirectional      |
 | 3     | VCC  | power_in      |
 | 4     | GND  | power_in      |
 | 5     | XTAL1_PB6  | bidirectional      |
 | 6     | XTAL2_PB7  | bidirectional      |
 | 7     | PD5  | bidirectional      |
 | 8     | PD6  | bidirectional      |
 | 9     | PD7  | bidirectional      |
 | 10     | PB0  | bidirectional      |
 | 11     | PB1  | bidirectional      |
 | 12     | PB2  | bidirectional      |
 | 13     | PB3  | bidirectional      |
 | 14     | PB4  | bidirectional      |
 | 15     | PB5  | bidirectional      |
 | 16     | AVCC  | power_in      |
 | 17     | AREF  | passive      |
 | 18     | GND_18  | passive      |
 | 19     | PC0  | bidirectional      |
 | 20     | PC1  | bidirectional      |
 | 21     | PC2  | bidirectional      |
 | 22     | PC3  | bidirectional      |
 | 23     | PC4  | bidirectional      |
 | 24     | PC5  | bidirectional      |
 | 25     | _RESET_PC6  | bidirectional      |
 | 26     | PD0  | bidirectional      |
 | 27     | PD1  | bidirectional      |
 | 28     | PD2  | bidirectional      |
 | 29     | GND_29  | passive      |
 */
export class ATmega328_MM extends Component {
    PD3 = new Pin(this.reference, 1, 'bidirectional', this);
    PD4 = new Pin(this.reference, 2, 'bidirectional', this);
    VCC = new Pin(this.reference, 3, 'power_in', this);
    GND = new Pin(this.reference, 4, 'power_in', this);
    XTAL1_PB6 = new Pin(this.reference, 5, 'bidirectional', this);
    XTAL2_PB7 = new Pin(this.reference, 6, 'bidirectional', this);
    PD5 = new Pin(this.reference, 7, 'bidirectional', this);
    PD6 = new Pin(this.reference, 8, 'bidirectional', this);
    PD7 = new Pin(this.reference, 9, 'bidirectional', this);
    PB0 = new Pin(this.reference, 10, 'bidirectional', this);
    PB1 = new Pin(this.reference, 11, 'bidirectional', this);
    PB2 = new Pin(this.reference, 12, 'bidirectional', this);
    PB3 = new Pin(this.reference, 13, 'bidirectional', this);
    PB4 = new Pin(this.reference, 14, 'bidirectional', this);
    PB5 = new Pin(this.reference, 15, 'bidirectional', this);
    AVCC = new Pin(this.reference, 16, 'power_in', this);
    AREF = new Pin(this.reference, 17, 'passive', this);
    GND_18 = new Pin(this.reference, 18, 'passive', this);
    PC0 = new Pin(this.reference, 19, 'bidirectional', this);
    PC1 = new Pin(this.reference, 20, 'bidirectional', this);
    PC2 = new Pin(this.reference, 21, 'bidirectional', this);
    PC3 = new Pin(this.reference, 22, 'bidirectional', this);
    PC4 = new Pin(this.reference, 23, 'bidirectional', this);
    PC5 = new Pin(this.reference, 24, 'bidirectional', this);
    _RESET_PC6 = new Pin(this.reference, 25, 'bidirectional', this);
    PD0 = new Pin(this.reference, 26, 'bidirectional', this);
    PD1 = new Pin(this.reference, 27, 'bidirectional', this);
    PD2 = new Pin(this.reference, 28, 'bidirectional', this);
    GND_29 = new Pin(this.reference, 29, 'passive', this);

    constructor(reference?: string | undefined) {
        super({
            reference,
            footprint: "Package_DFN_QFN:QFN-28-1EP_4x4mm_P0.45mm_EP2.4x2.4mm",
            symbol: "MCU_Microchip_ATmega:ATmega328-MM",
            typehal: {
                role: 'mcu',
                pinLookup: {
                    'PD0': 'D0', 'PD1': 'D1', 'PD2': 'D2', 'PD3': 'D3',
                    'PD4': 'D4', 'PD5': 'D5', 'PD6': 'D6', 'PD7': 'D7',
                    'PB0': 'D8', 'PB1': 'D9', 'PB2': 'D10', 'PB3': 'D11',
                    'PB4': 'D12', 'PB5': 'D13',
                    'PC0': 'A0', 'PC1': 'A1', 'PC2': 'A2', 'PC3': 'A3',
                    'PC4': 'A4', 'PC5': 'A5',
                },
            }
        });
    }
}