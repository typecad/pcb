import { type Component } from "../component.js";
import type { SExpr } from '../sexpr/types.js';
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
    existingBoardElements: SExpr[] = [];
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

    pushOffset(x: number, y: number): void {
        this.offsetStack.push({ ...this.currentOffset });
        this.currentOffset.x += x;
        this.currentOffset.y += y;
    }

    popOffset(): void {
        const prev = this.offsetStack.pop();
        if (prev) {
            this.currentOffset = prev;
        } else {
            this.currentOffset = { x: 0, y: 0 };
        }
    }

    getOffset(): { x: number; y: number } {
        return { ...this.currentOffset };
    }
}
