import { Component, Pin } from '@typecad/typecad';
export declare class Tie extends Component {
    power: string;
    ground: string;
    maximum: number;
    minimum: number;
    power_pin: Pin;
    ground_pin: Pin;
    name: string;
    constructor({ reference, xy, schematic, net1, net2, net3, net4, footprint, uuid }: {
        reference: any;
        xy: any;
        schematic: any;
        net1: any;
        net2: any;
        net3: any;
        net4: any;
        footprint: any;
        uuid: any;
    });
}
