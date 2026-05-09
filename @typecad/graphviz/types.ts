// Type Definitions
export type PinType =
    | 'passive'
    | 'input'
    | 'output'
    | 'bidirectional'
    | 'tri_state'
    | 'power_in'
    | 'unspecified'
    | 'power_out'
    | 'free'
    | 'open_collector'
    | 'open_emitter'
    | 'no_connect';

export interface Schematic {
    Sheetname: string;
    Components: Component[];
    Nodes: Node[];
}

export interface Component {
    reference: string;
    constructor?: { name?: string };
    footprint: string;
}

export interface Node {
    name: string;
    code: number;
    nodes: Array<{
        number: number | string;
        name?: string;
        reference: string;
        type: PinType;
    }>;
}
