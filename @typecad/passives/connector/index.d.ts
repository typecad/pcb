import { Component } from '@typecad/typecad';
interface IConnector {
    reference?: string;
    number: number;
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
export declare class Connector extends Component {
    constructor({ number, reference, footprint, uuid, pcb, sch }?: IConnector);
}
export {};
