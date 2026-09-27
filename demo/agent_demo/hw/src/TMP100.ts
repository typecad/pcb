import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | SCL  | input      |
 | 2     | GND  | power_in      |
 | 3     | ADD1  | input      |
 | 4     | V  | power_in      |
 | 5     | ADD0  | input      |
 | 6     | SDA  | bidirectional      |
 */
export class TMP100 extends Component {
    SCL = this.pin(1, { type: 'input' });
    GND = this.pin(2, { type: 'power_in' });
    ADD1 = this.pin(3, { type: 'input' });
    V = this.pin(4, { type: 'power_in' });
    ADD0 = this.pin(5, { type: 'input' });
    SDA = this.pin(6, { type: 'bidirectional' });

    constructor(reference?: string | undefined) {
        super({
            footprint: "Package_TO_SOT_SMD:SOT-23-6",
            symbol: "Sensor_Temperature:TMP100",
        prefix: "U",
        });
        if (reference) this.reference = reference;
    }
}