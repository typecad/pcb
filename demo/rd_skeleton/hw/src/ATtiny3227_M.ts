import { Component } from '@typecad/pcb';
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
  PA2 = this.pin(1, { type: 'bidirectional' });
  PA3 = this.pin(2, { type: 'bidirectional' });
  GND = this.pin(3, { type: 'power_in' });
  VCC = this.pin(4, { type: 'power_in' });
  PA4 = this.pin(5, { type: 'bidirectional' });
  PA5 = this.pin(6, { type: 'bidirectional' });
  PA6 = this.pin(7, { type: 'bidirectional' });
  PA7 = this.pin(8, { type: 'bidirectional' });
  PB7 = this.pin(9, { type: 'bidirectional' });
  PB6 = this.pin(10, { type: 'bidirectional' });
  PB5 = this.pin(11, { type: 'bidirectional' });
  PB4 = this.pin(12, { type: 'bidirectional' });
  PB3 = this.pin(13, { type: 'bidirectional' });
  PB2 = this.pin(14, { type: 'bidirectional' });
  PB1 = this.pin(15, { type: 'bidirectional' });
  PB0 = this.pin(16, { type: 'bidirectional' });
  PC0 = this.pin(17, { type: 'bidirectional' });
  PC1 = this.pin(18, { type: 'bidirectional' });
  PC2 = this.pin(19, { type: 'bidirectional' });
  PC3 = this.pin(20, { type: 'bidirectional' });
  PC4 = this.pin(21, { type: 'bidirectional' });
  PC5 = this.pin(22, { type: 'bidirectional' });
  RESET_PA0 = this.pin(23, { type: 'bidirectional' });
  PA1 = this.pin(24, { type: 'bidirectional' });
  GND_25 = this.pin(25, { type: 'passive' });

  constructor(reference?: string | undefined) {
    super({
      footprint: 'Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm',
      symbol: 'MCU_Microchip_ATtiny:ATtiny3227-M',
      value: 'ATtiny3227-M',
    });
    if (reference) this.reference = reference;
  }
}
