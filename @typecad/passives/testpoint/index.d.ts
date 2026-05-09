import { Component } from '@typecad/typecad';
interface ITestpoint {
    reference?: string;
    footprint?: string;
    uuid?: string;
    pcb?: {
        x: number;
        y: number;
        rotation: number;
    };
    sch?: {
        x: number;
        y: number;
        rotation: number;
    };
}
export declare class Testpoint extends Component {
    constructor({ reference, footprint, uuid, pcb, sch }?: ITestpoint);
}
export {};
