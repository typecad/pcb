import { Component } from "../component.js";
import { Schematic } from "../schematic.js";
import logger from "../logging.js";
import type { SExpr } from '../sexpr/types.js';
import {
    IPcbOptions,
    INetResolution,
    IAutorouteOptions,
    IAutorouteResult,
    IOutline,
    IGrLine,
    IKeepoutZone,
    IVia
} from "./pcb_interfaces.js";
import { TrackBuilder } from "./pcb_track_builder.js";
import { PcbInternalState } from "./pcb_state.js";

export interface IPcbBoardContext {
    readonly Boardname: string;
    readonly Schematic: Schematic | undefined;
    readonly options: IPcbOptions;

    /** @internal Direct access to mutable internal state for extracted modules. */
    readonly state: PcbInternalState;

    readonly existingBoardElements: SExpr[];
    readonly components: Component[];
    readonly stagedComponents: Component[];
    stagedOutlines: IOutline[];
    readonly outlines_public: IOutline[];
    readonly groups: string[];
    readonly grLines: IGrLine[];
    readonly grCircles: import('./pcb_interfaces.js').IGrCircle[];
    readonly grRects: import('./pcb_interfaces.js').IGrRect[];
    readonly grPolys: import('./pcb_interfaces.js').IGrPoly[];
    readonly grTexts: import('./pcb_interfaces.js').IGrTextOptions[];
    readonly zones: import('./pcb_interfaces.js').IFilledZone[];
    readonly keepoutZones: IKeepoutZone[];
    outlines: IOutline[];
    tracks: IOutline[];
    readonly pcb: string;
    readonly copper_thickness: number;

    track(opts: { locked?: boolean; net?: string; deferStaging?: boolean; debug?: boolean }): TrackBuilder;
    _track(start: { x: number; y: number }, end: { x: number; y: number }, width: number, layer: string, locked: boolean, uuid?: string, net?: string): string;
    _getTrackData(uuid: string): IGrLine | null;
    place(...components: Component[]): void;
    via(params: Omit<IVia, 'uuid' | 'netCode' | 'layers'>): Component;
    route(options: IAutorouteOptions): Promise<IAutorouteResult>;
    resolveNet(
        componentReference: string,
        pinNumber: string,
        componentUuid?: string,
        boardNetNameToCodeMap?: Map<string, number>,
        fallbackNetName?: string
    ): INetResolution;
    getCallSite(): { file: string; line: number; column: number } | undefined;
}

export { logger };
