import { Component, Pin } from "@typecad/typecad";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | _PCINT19_OC2B_INT1_PD3  | unspecified      |
 | 2     | _PCINT20_XCK_T0_PD4  | unspecified      |
 | 3     | GND  | unspecified      |
 | 4     | VCC  | unspecified      |
 | 5     | GND_5  | unspecified      |
 | 6     | VCC_6  | unspecified      |
 | 7     | _PCINT6_XTAL1_TOSC1_PB6  | unspecified      |
 | 8     | _PCINT7_XTAL2_TOSC2_PB7  | unspecified      |
 | 9     | _PCINT21_OC0B_T1_PD5  | unspecified      |
 | 10     | _PCINT22_OC0A_AIN0_PD6  | unspecified      |
 | 11     | _PCINT23_AIN1_PD7  | unspecified      |
 | 12     | _PCINT0_CLKO_ICP1_PB0  | unspecified      |
 | 13     | _PCINT1_OC1A_PB1  | unspecified      |
 | 14     | _PCINT2_SS_OC1B_PB2  | unspecified      |
 | 15     | _PCINT3_OC2A_MOSI_PB3  | unspecified      |
 | 16     | _PCINT4_MISO_PB4  | unspecified      |
 | 17     | PB5_SCK_PCINT5_  | unspecified      |
 | 18     | AVCC  | unspecified      |
 | 19     | ADC6  | unspecified      |
 | 20     | AREF  | unspecified      |
 | 21     | GND_21  | unspecified      |
 | 22     | ADC7  | unspecified      |
 | 23     | PC0_ADC0_PCINT8_  | unspecified      |
 | 24     | PC1_ADC1_PCINT9_  | unspecified      |
 | 25     | PC2_ADC2_PCINT10_  | unspecified      |
 | 26     | PC3_ADC3_PCINT11_  | unspecified      |
 | 27     | PC4_ADC4_SDA_PCINT12_  | unspecified      |
 | 28     | PC5_ADC5_SCL_PCINT13_  | unspecified      |
 | 29     | _PC6_RESET_PCINT14_  | unspecified      |
 | 30     | PD0_RXD_PCINT16_  | unspecified      |
 | 31     | PD1_TXD_PCINT17_  | unspecified      |
 | 32     | PD2_INT0_PCINT18_  | unspecified      |
 | 33     | EP  | unspecified      |
 */
export class ATMEGA328_MU extends Component {
    _PCINT19_OC2B_INT1_PD3 = new Pin(this.reference, 1, 'unspecified', this);
    _PCINT20_XCK_T0_PD4 = new Pin(this.reference, 2, 'unspecified', this);
    GND = new Pin(this.reference, 3, 'unspecified', this);
    VCC = new Pin(this.reference, 4, 'unspecified', this);
    GND_5 = new Pin(this.reference, 5, 'unspecified', this);
    VCC_6 = new Pin(this.reference, 6, 'unspecified', this);
    _PCINT6_XTAL1_TOSC1_PB6 = new Pin(this.reference, 7, 'unspecified', this);
    _PCINT7_XTAL2_TOSC2_PB7 = new Pin(this.reference, 8, 'unspecified', this);
    _PCINT21_OC0B_T1_PD5 = new Pin(this.reference, 9, 'unspecified', this);
    _PCINT22_OC0A_AIN0_PD6 = new Pin(this.reference, 10, 'unspecified', this);
    _PCINT23_AIN1_PD7 = new Pin(this.reference, 11, 'unspecified', this);
    _PCINT0_CLKO_ICP1_PB0 = new Pin(this.reference, 12, 'unspecified', this);
    _PCINT1_OC1A_PB1 = new Pin(this.reference, 13, 'unspecified', this);
    _PCINT2_SS_OC1B_PB2 = new Pin(this.reference, 14, 'unspecified', this);
    _PCINT3_OC2A_MOSI_PB3 = new Pin(this.reference, 15, 'unspecified', this);
    _PCINT4_MISO_PB4 = new Pin(this.reference, 16, 'unspecified', this);
    PB5_SCK_PCINT5_ = new Pin(this.reference, 17, 'unspecified', this);
    AVCC = new Pin(this.reference, 18, 'unspecified', this);
    ADC6 = new Pin(this.reference, 19, 'unspecified', this);
    AREF = new Pin(this.reference, 20, 'unspecified', this);
    GND_21 = new Pin(this.reference, 21, 'unspecified', this);
    ADC7 = new Pin(this.reference, 22, 'unspecified', this);
    PC0_ADC0_PCINT8_ = new Pin(this.reference, 23, 'unspecified', this);
    PC1_ADC1_PCINT9_ = new Pin(this.reference, 24, 'unspecified', this);
    PC2_ADC2_PCINT10_ = new Pin(this.reference, 25, 'unspecified', this);
    PC3_ADC3_PCINT11_ = new Pin(this.reference, 26, 'unspecified', this);
    PC4_ADC4_SDA_PCINT12_ = new Pin(this.reference, 27, 'unspecified', this);
    PC5_ADC5_SCL_PCINT13_ = new Pin(this.reference, 28, 'unspecified', this);
    _PC6_RESET_PCINT14_ = new Pin(this.reference, 29, 'unspecified', this);
    PD0_RXD_PCINT16_ = new Pin(this.reference, 30, 'unspecified', this);
    PD1_TXD_PCINT17_ = new Pin(this.reference, 31, 'unspecified', this);
    PD2_INT0_PCINT18_ = new Pin(this.reference, 32, 'unspecified', this);
    EP = new Pin(this.reference, 33, 'unspecified', this);
    
    constructor(reference?: string | undefined) {
        super({ reference, footprint: "lib:VQFN-32_L5.0-W5.0-P0.50-TL-EP3.1", symbol: "ATMEGA328-MU:ATMEGA328-MU" });
    }
}