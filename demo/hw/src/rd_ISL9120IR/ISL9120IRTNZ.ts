import { Component, Pin } from '@typecad/typecad';
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | LX2_1  | passive      |
 | 2     | PGND  | passive      |
 | 3     | LX1_1  | passive      |
 | 4     | LX1_2  | passive      |
 | 5     | VIN_1  | passive      |
 | 6     | VIN_2  | passive      |
 | 9     | EN  | passive      |
 | 8     | GND  | passive      |
 | 7     | BYPS  | passive      |
 | 13     | EP  | passive      |
 | 12     | LX2_2  | passive      |
 | 11     | VOUT  | passive      |
 | 10     | FB  | passive      |
 */
export class ISL9120IRTNZ extends Component {
  LX2_1 = new Pin(this.reference, 1, 'passive', this);
  PGND = new Pin(this.reference, 2, 'passive', this);
  LX1_1 = new Pin(this.reference, 3, 'passive', this);
  LX1_2 = new Pin(this.reference, 4, 'passive', this);
  VIN_1 = new Pin(this.reference, 5, 'power_in', this);
  VIN_2 = new Pin(this.reference, 6, 'power_in', this);
  EN = new Pin(this.reference, 9, 'passive', this);
  GND = new Pin(this.reference, 8, 'passive', this);
  BYPS = new Pin(this.reference, 7, 'passive', this);
  EP = new Pin(this.reference, 13, 'passive', this);
  LX2_2 = new Pin(this.reference, 12, 'passive', this);
  VOUT = new Pin(this.reference, 11, 'power_out', this);
  FB = new Pin(this.reference, 10, 'passive', this);

  constructor(reference?: string | undefined) {
    super({
      symbol: 'ISL9120IRTNZ:ISL9120IRTNZ',
      reference,
      footprint: 'lib:QFN50P300X300X75-13N-D',
      prefix: 'VR',
      mpn: 'ISL9120IRTNZ',
      datasheet: 'https://www.mouser.com/datasheet/2/698/REN_isl9120ir_DST_20050421-1998698.pdf',
    });
  }
}
