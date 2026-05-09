import { Component } from '@typecad/typecad';
interface IMountingHole {
    reference?: string;
    footprint?: string;
    uuid?: string;
    size?: 'M2' | 'M2.5' | 'M3' | 'M4' | 'M5' | 'M6' | 'M8';
    pcb?: {
        x: number;
        y: number;
        rotation: number;
    };
}
export declare class MountingHole extends Component {
    constructor({ reference, footprint, size, pcb, uuid }?: IMountingHole);
}
export {};
