import { Component, IComponent } from '@typecad/typecad'

interface IConnector extends IComponent {
    number: number;
}

export class Connector extends Component {
    constructor({ number = 1, ...opts }: IConnector = { number: 1 }) {
        const num = number < 10 ? '0' + number : number.toString();
        super({
            ...opts,
            footprint: opts.footprint || `Connector_PinHeader_2.54mm:PinHeader_1x${num}_P2.54mm_Vertical`,
            symbol: opts.symbol || `Connector:Conn_01x${num}_Pin`,
            prefix: 'J'
        });
    }
}
