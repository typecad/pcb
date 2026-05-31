import { Component } from '@typecad/typecad';
export class Testpoint extends Component {
    constructor(opts = {}) {
        super({ ...opts, footprint: opts.footprint || 'TestPoint:TestPoint_Pad_D1.0mm', symbol: opts.symbol || 'Connector:TestPoint', prefix: 'TP' });
    }
}
//# sourceMappingURL=index.js.map