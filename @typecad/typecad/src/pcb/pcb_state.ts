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

    /**
     * Computes the bounding box of all board outlines (line and arc elements)
     * across both `outlines` and `stagedOutlines`. Used by {@link board}
     * to determine the board's physical extent.
     *
     * @returns `{ minX, minY, maxX, maxY }` in mm, or `null` if no outlines exist.
     */
    getOutlineBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
        const allOutlines = [...this.outlines, ...this.stagedOutlines];
        if (allOutlines.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const outline of allOutlines) {
            for (const el of outline.elements) {
                if (el.type === 'line') {
                    minX = Math.min(minX, el.start.x, el.end.x);
                    minY = Math.min(minY, el.start.y, el.end.y);
                    maxX = Math.max(maxX, el.start.x, el.end.x);
                    maxY = Math.max(maxY, el.start.y, el.end.y);
                } else if (el.type === 'arc') {
                    minX = Math.min(minX, el.start.x, el.mid.x, el.end.x);
                    minY = Math.min(minY, el.start.y, el.mid.y, el.end.y);
                    maxX = Math.max(maxX, el.start.x, el.mid.x, el.end.x);
                    maxY = Math.max(maxY, el.start.y, el.mid.y, el.end.y);
                }
            }
        }

        if (minX === Infinity) return null;

        return { minX, minY, maxX, maxY };
    }
}
