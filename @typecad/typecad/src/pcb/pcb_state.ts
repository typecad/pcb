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
    IKeepoutZone,
    IAutorouteResult
} from './pcb_interfaces.js';

export class PcbInternalState {
    offsetStack: { x: number; y: number }[] = [];
    currentOffset: { x: number; y: number } = { x: 0, y: 0 };
    pcb: string = '';
    components: Component[] = [];
    stagedComponents: Component[] = [];
    groups: string[] = [];
    outlines: IOutline[] = [];
    stagedOutlines: IOutline[] = [];
    readonly options: IPcbOptions;
    existingBoardElements: unknown[] = [];
    grTexts: IGrTextOptions[] = [];
    zones: IFilledZone[] = [];
    keepoutZones: IKeepoutZone[] = [];
    grLines: IGrLine[] = [];
    grCircles: IGrCircle[] = [];
    grRects: IGrRect[] = [];
    grPolys: IGrPoly[] = [];
    pendingAutoroutes: Set<Promise<IAutorouteResult>> = new Set();

    constructor(options: IPcbOptions) {
        this.options = options;
    }
}
