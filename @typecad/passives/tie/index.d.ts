import { Component, Pin, Schematic } from '@typecad/typecad';
interface TieOptions {
    reference?: string;
    xy?: {
        x: number;
        y: number;
    };
    schematic?: Schematic;
    net1?: Pin;
    net2?: Pin;
    net3?: Pin;
    net4?: Pin;
    footprint?: string;
    uuid?: string;
}
export declare class Tie extends Component {
    power: string;
    ground: string;
    maximum: number;
    minimum: number;
    power_pin: Pin;
    ground_pin: Pin;
    name: string;
    constructor({ reference, xy, schematic, net1, net2, net3, net4, footprint, uuid }?: TieOptions);
}
export {};
