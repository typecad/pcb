import { Component } from "@typecad/pcb";
/**
 | Pin # | Name | Type          |
 | --:   | :--  | :--           |
 | 1     | GND  | power_in      |
 | 2     | DQ  | bidirectional      |
 | 3     | V__DD  | power_in      |
 */
export class DS18B20 extends Component {
    GND = this.pin(1, { type: 'power_in' });
    DQ = this.pin(2, { type: 'bidirectional' });
    V__DD = this.pin(3, { type: 'power_in' });

    constructor(reference?: string | undefined) {
        super({
            footprint: "Package_TO_SOT_THT:TO-92_Inline",
            symbol: "Sensor_Temperature:DS18B20",
            prefix: "U",
        });
        if (reference) this.reference = reference;
    }
}