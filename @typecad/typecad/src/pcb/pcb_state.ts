import { type Component } from "../component.js";
import type {
    IPcbOptions,
    IGrLine,
    IGrCircle,
    IGrRect,
    IGrPoly,
    IOutline,
    IGrTextOptions,
    IFilledZone,
    IKeepoutZone
} from './pcb_interfaces.js';

/**
 * Interface exposing the public read/write API of PcbState.
 * Used by extracted modules (pcb_board_creation, pcb_zones, pcb_autoroute, pcb_routing_core)
 * so they don't depend on the full PCB class.
 */
export interface IPcbState {
    components: Component[];
    stagedComponents: Component[];
    groups: string[];
    grTexts: IGrTextOptions[];
    outlines_public: IOutline[];
    stagedOutlines: IOutline[];
    zones: IFilledZone[];
    keepoutZones: IKeepoutZone[];
    grLines: IGrLine[];
    grCircles: IGrCircle[];
    grRects: IGrRect[];
    grPolys: IGrPoly[];
    option: IPcbOptions;
    options: IPcbOptions;
    pcb: string;
    existingBoardElements: unknown[];
    groupsAsMap: Map<string, any>;
    setExistingBoardElements(elements: unknown[]): void;
}

/**
 * Holds all mutable state for a PCB, extracted from the monolithic PCB class
 * so that extracted modules can operate on the same state without depending on
 * the full PCB class.
 */
export class PcbState implements IPcbState {
    components: Component[] = [];
    stagedComponents: Component[] = [];
    groups: string[] = [];
    grTexts: IGrTextOptions[] = [];
    outlines_public: IOutline[] = [];
    stagedOutlines: IOutline[] = [];
    zones: IFilledZone[] = [];
    keepoutZones: IKeepoutZone[] = [];
    grLines: IGrLine[] = [];
    grCircles: IGrCircle[] = [];
    grRects: IGrRect[] = [];
    grPolys: IGrPoly[] = [];
    pcb: string = "";

    readonly option: IPcbOptions;

    existingBoardElements: unknown[] = [];

    constructor(options: IPcbOptions) {
        this.option = options;
    }

    get options(): IPcbOptions {
        return this.option;
    }

    get groupsAsMap(): Map<string, any> {
        const map = new Map<string, any>();
        for (const group of this.groups) {
            map.set(group, true);
        }
        return map;
    }

    setExistingBoardElements(elements: unknown[]): void {
        this.existingBoardElements = elements;
    }
}
