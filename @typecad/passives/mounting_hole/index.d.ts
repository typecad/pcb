import { Component, type ComponentInit } from '@typecad/typecad';
interface IMountingHole extends ComponentInit {
    size?: 'M2' | 'M2.5' | 'M3' | 'M4' | 'M5' | 'M6' | 'M8';
}
export declare class MountingHole extends Component {
    constructor({ size, ...opts }?: IMountingHole);
}
export {};
