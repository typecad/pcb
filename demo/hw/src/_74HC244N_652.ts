import { Component, Pin } from '@typecad/typecad';
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 20     | VCC  | power_in      |
 | 1     | _1OE  | input      |
 | 19     | _2OE  | input      |
 | 2     | _1A0  | input      |
 | 4     | _1A1  | input      |
 | 6     | _1A2  | input      |
 | 8     | _1A3  | input      |
 | 17     | _2A0  | input      |
 | 15     | _2A1  | input      |
 | 13     | _2A2  | input      |
 | 11     | _2A3  | input      |
 | 10     | GND  | passive      |
 | 18     | _1Y0  | output      |
 | 16     | _1Y1  | output      |
 | 14     | _1Y2  | output      |
 | 12     | _1Y3  | output      |
 | 3     | _2Y0  | output      |
 | 5     | _2Y1  | output      |
 | 7     | _2Y2  | output      |
 | 9     | _2Y3  | output      |
 */
export class _74HC244N_652 extends Component {
  VCC = new Pin(this.reference, 20, 'power_in', this);
  _1OE = new Pin(this.reference, 1, 'input', this);
  _2OE = new Pin(this.reference, 19, 'input', this);
  _1A0 = new Pin(this.reference, 2, 'input', this);
  _1A1 = new Pin(this.reference, 4, 'input', this);
  _1A2 = new Pin(this.reference, 6, 'input', this);
  _1A3 = new Pin(this.reference, 8, 'input', this);
  _2A0 = new Pin(this.reference, 17, 'input', this);
  _2A1 = new Pin(this.reference, 15, 'input', this);
  _2A2 = new Pin(this.reference, 13, 'input', this);
  _2A3 = new Pin(this.reference, 11, 'input', this);
  GND = new Pin(this.reference, 10, 'passive', this);
  _1Y0 = new Pin(this.reference, 18, 'output', this);
  _1Y1 = new Pin(this.reference, 16, 'output', this);
  _1Y2 = new Pin(this.reference, 14, 'output', this);
  _1Y3 = new Pin(this.reference, 12, 'output', this);
  _2Y0 = new Pin(this.reference, 3, 'output', this);
  _2Y1 = new Pin(this.reference, 5, 'output', this);
  _2Y2 = new Pin(this.reference, 7, 'output', this);
  _2Y3 = new Pin(this.reference, 9, 'output', this);

  constructor(reference?: string | undefined) {
    super({ reference, footprint: 'lib:DIP254P762X420-20', symbol: '74HC244N_652:74HC244N_652' });
  }
}
