import { Component } from '@typecad/typecad';
export class Testpoint extends Component {
    constructor({ reference, footprint, uuid, pcb, sch } = {}) {
        super({ reference, footprint: footprint || 'TestPoint:TestPoint_Pad_D1.0mm', prefix: 'TP', uuid, pcb, sch, symbol: 'Connector:TestPoint' });
    }
}
//# sourceMappingURL=index.js.map