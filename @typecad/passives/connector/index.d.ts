import { Component, type ComponentInit } from '@typecad/typecad';
interface IConnector extends ComponentInit {
    number: number;
}
export declare class Connector extends Component {
    constructor({ number, ...opts }?: IConnector);
}
export {};
