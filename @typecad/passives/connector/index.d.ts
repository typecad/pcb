import { Component, IComponent } from '@typecad/typecad';
interface IConnector extends IComponent {
    number: number;
}
export declare class Connector extends Component {
    constructor({ number, ...opts }?: IConnector);
}
export {};
