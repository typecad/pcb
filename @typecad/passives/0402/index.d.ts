import { Component, IComponent } from '@typecad/typecad';
export declare class Fuse extends Component {
    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, simulation, uuid, pcb, sch }?: IComponent);
}
export declare class Inductor extends Component {
    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, simulation, uuid, symbol, pcb, sch }?: IComponent);
}
export declare class Diode extends Component {
    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, simulation, uuid, symbol, pcb, sch }?: IComponent);
}
export declare class LED extends Component {
    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, simulation, uuid, symbol, pcb, sch }?: IComponent);
}
export declare class Resistor extends Component {
    Wattage?: string;
    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, simulation, uuid, symbol, pcb, sch }?: IComponent);
}
export declare class Capacitor extends Component {
    Voltage?: string;
    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, simulation, uuid, symbol, pcb, sch }?: IComponent);
}
