import { Component } from "../component.js";
import { Schematic } from "../schematic.js";
import type { ISchematicNetDefinition } from "../net_manager.js";
import { Pin } from "../pin.js";
import { TrackBuilder } from './pcb_track_builder.js';
import type {
    IPcbOptions,
    INetResolution,
    IVia,
    IGrLine,
    IOutline,
    IGrTextOptions,
    IAutorouteOptions,
    IAutorouteResult,
    IPcbZoneOptions,
    IPcbKeepoutOptions,
    IPcbLineOptions,
    IPcbCircleOptions,
    IPcbRectOptions,
    IPcbPolyOptions
} from './pcb_interfaces.js';

import { resolveNet as resolveNetStandalone } from './pcb_net_resolver.js';
import { createVia } from './pcb_via.js';
import { loadExistingBoardElements } from './pcb_board_loader.js';
import { PcbInternalState } from './pcb_state.js';

import { createBoard } from './pcb_board_creation.js';
import { placeComponent, stageComponent, groupComponents } from './pcb_component_lifecycle.js';
import { registerRouter } from './pcb_router_registry.js';
import type { RouterFactory, RouterGridConfigurator } from './pcb_router_registry.js';
import { pcbNet, pcbNamed, pcbBom, pcbContract, pcbAdd } from './pcb_schematic_bridge.js';
import { pcbRoute, pcbWaitForPendingAutoroutes, pcbAutorouteBatch } from './pcb_routing_api.js';
import {
    pcbTextWithOffset,
    pcbZoneWithOffset,
    pcbKeepoutWithOffset,
    pcbLineWithOffset,
    pcbCircleWithOffset,
    pcbRectWithOffset,
    pcbPolyWithOffset,
    pcbOutlineWithOffset,
    pcbTrackWithOffset
} from './pcb_graphics_delegation.js';


// Re-export types and classes that other modules expect to import from './pcb'
export { TrackBuilder } from './pcb_track_builder.js';
export type {
    IPcbOptions,
    INetResolution,
    IVia,
    IGraphicPrimitive,
    IGrLine,
    IGrArc,
    IGrCircle,
    IGrRect,
    IGrPoly,
    OutlineElement,
    IOutline,
    ISourceInfo,
    IGeneratedElement,
    IGrTextOptions,
    IZone,
    IFilledZone,
    IKeepoutZone,
    IAutorouteOptions,
    IAutorouteResult,
    IAutorouteWaypoint,
    IImpedanceConstraint,
    IRouteMetadata,
    IConnectionIdentifier,
    IManualRoute,
    IAutorouteRouteOptions
} from './pcb_interfaces.js';


/**
 * Represents a printed circuit board (PCB).
 */
export class PCB {
    readonly boardName: string;
    private _schematic: Schematic;
    private _state: PcbInternalState;
    private _outlines: IOutline[] = [];
    private _tracks: IOutline[] = [];

    /**
     * Initializes a new PCB.
     * @param boardName - Name and filename of generated files.
     * @param options - Optional configuration for the PCB.
     */
    constructor(boardName: string, options?: IPcbOptions) {
        this.boardName = boardName;
        const resolvedOptions: IPcbOptions = {
            remove_orphans: true,
            thickness: 1.6,
            copper_thickness: 35,
            schematic: new Schematic(boardName),
            ...options,
        };
        this._state = new PcbInternalState(resolvedOptions);
        this._schematic = resolvedOptions.schematic ?? new Schematic(boardName);

        this._state.existingBoardElements = loadExistingBoardElements(boardName);
    }

    get schematic(): Schematic {
        return this._schematic;
    }

    get thickness(): number {
        return this._state.options.thickness ?? 1.6;
    }

    get copper_thickness(): number {
        return this._state.options.copper_thickness ?? 35;
    }

    get outlines(): readonly IOutline[] {
        return this._outlines;
    }

    get tracks(): readonly IOutline[] {
        return this._tracks;
    }

    get options(): IPcbOptions {
        return {
            ...this._state.options,
            remove_orphans: this._state.options.remove_orphans ?? true
        };
    }

    /**
     * Places components on the board.
     * @param components - List of components to place.
     */
    place(...components: Component[]) {
        components.forEach(component => {
            placeComponent(this._state, component);
        });
    }

    stage(...components: Component[]) {
        components.forEach(component => {
            stageComponent(this._state, component);
        });
    }

    /**
     * Groups components and/or elements from a TrackBuilder together on the board.
     * @param group_name - Name of the group.
     * @param items - A list of Component instances or TrackBuilder instances.
     */
    group(group_name: string, ...items: Array<Component | TrackBuilder>) {
        groupComponents(this._state, (...comps) => this.place(...comps), group_name, ...items);
    }

    text(options: IGrTextOptions): void {
        pcbTextWithOffset(this._state, options);
    }

    async create(...items: Array<Component | TrackBuilder | Array<Component | TrackBuilder>>) {
        const flattened: Array<Component | TrackBuilder> = [];
        for (const item of items) {
            if (Array.isArray(item)) {
                flattened.push(...item);
            } else {
                flattened.push(item);
            }
        }
        const result = await createBoard(this, ...flattened);
        this.bom();
        return result;
    }

    /**
     * Handles via-related operations.
     * @param via - The via details.
     * @returns The component representing the via.
     */
    via({ at, size, drill, net, powerInfo }: Omit<IVia, 'uuid' | 'netCode' | 'layers'> = {}): Component {
        return createVia(
            this._state.currentOffset,
            (c) => this.stage(c),
            { at, size, drill, net, powerInfo }
        );
    }

    zone(options: IPcbZoneOptions): void {
        pcbZoneWithOffset(this._state, options);
    }

    keepout(options: IPcbKeepoutOptions): void {
        pcbKeepoutWithOffset(this._state, options);
    }

    line(options: IPcbLineOptions): void {
        pcbLineWithOffset(this._state, options);
    }

    circle(options: IPcbCircleOptions): void {
        pcbCircleWithOffset(this._state, options);
    }

    rect(options: IPcbRectOptions): void {
        pcbRectWithOffset(this._state, options);
    }

    poly(options: IPcbPolyOptions): void {
        pcbPolyWithOffset(this._state, options);
    }

    outline(x: number, y: number, width: number, height: number, filletRadius: number = 0, conceptualUuidFromUser?: string): void {
        pcbOutlineWithOffset(this._state, x, y, width, height, filletRadius, conceptualUuidFromUser);
    }

    track(options?: { locked?: boolean; net?: string; deferStaging?: boolean; debug?: boolean }): TrackBuilder {
        return new TrackBuilder(this, options);
    }

    route(options: IAutorouteOptions): Promise<IAutorouteResult>;
    route(netDefinition: ISchematicNetDefinition, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): Promise<IAutorouteResult>;
    async route(arg1: ISchematicNetDefinition | IAutorouteOptions, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): Promise<IAutorouteResult> {
        return pcbRoute(this, this._state, arg1, options);
    }

    async waitForPendingAutoroutes(): Promise<void> {
        return pcbWaitForPendingAutoroutes(this._state);
    }

    net(...pins: Pin[]): ISchematicNetDefinition {
        return pcbNet(this._schematic, ...pins);
    }

    named(name: string) {
        return pcbNamed(this._schematic, name);
    }

    bom(output_folder?: string): void {
        pcbBom(this._schematic, output_folder);
    }

    contract(options: import('../contract.js').ContractOptions = {}): void {
        pcbContract(this, options);
    }

    add(...components: Component[]): void {
        pcbAdd(this._schematic, ...components);
    }
}

export function getPcbState(pcb: PCB): PcbInternalState {
    return (pcb as unknown as { _state: PcbInternalState })._state;
}

export function setPcbOutlines(pcb: PCB, outlines: IOutline[]): void {
    (pcb as unknown as { _outlines: IOutline[] })._outlines = outlines;
}

export function setPcbTracks(pcb: PCB, tracks: IOutline[]): void {
    (pcb as unknown as { _tracks: IOutline[] })._tracks = tracks;
}

export function pcbTrackSegment(
    pcb: PCB,
    start: { x: number, y: number },
    end: { x: number, y: number },
    width: number = 0.05,
    layer: string = "F.Cu",
    locked: boolean = false,
    uuid?: string,
    net?: string
): string {
    const state = getPcbState(pcb);
    return pcbTrackWithOffset(state, start, end, width, layer, locked, uuid, net);
}

export function pcbGetTrackData(pcb: PCB, uuid: string): IGrLine | null {
    const state = getPcbState(pcb);
    for (const outline of state.stagedOutlines) {
        if (outline.uuid === uuid && outline.elements.length === 1 && outline.elements[0].type === 'line') {
            return outline.elements[0] as IGrLine;
        }
    }
    return null;
}

export function pcbResolveNet(
    pcb: PCB,
    componentReference: string,
    pinNumber: string,
    componentUuid?: string,
    boardNetNameToCodeMap?: Map<string, number>,
    fallbackNetName?: string
): INetResolution {
    return resolveNetStandalone(
        (pcb as unknown as { _schematic: Schematic })._schematic,
        componentReference,
        pinNumber,
        componentUuid,
        boardNetNameToCodeMap,
        fallbackNetName
    );
}

export function pcbPushOffset(pcb: PCB, x: number, y: number): void {
    getPcbState(pcb).pushOffset(x, y);
}

export function pcbPopOffset(pcb: PCB): void {
    getPcbState(pcb).popOffset();
}

export function pcbGetCurrentOffset(pcb: PCB): { x: number, y: number } {
    return getPcbState(pcb).getOffset();
}

export function pcbRegisterRouter(
    pcb: PCB,
    registerFn: (
        registry: {
            register(
                name: string,
                factory: RouterFactory,
                options?: { configureGrid?: RouterGridConfigurator }
            ): void;
        },
        algorithm?: string
    ) => void
): void {
    registerRouter(registerFn);
}

export function autorouteBatchOnPcb(
    pcb: PCB,
    items: Array<{ from: Pin | Pin[]; to: Pin | Pin[]; options?: import('./pcb_interfaces.js').IAutorouteRouteOptions; name?: string }>,
    batchOptions?: {
        rounds?: number;
        reorder?: 'none' | 'reverse' | 'byDistance';
        relaxViaCostPerRound?: number;
        increaseIterationsPerRound?: number;
    }
): Promise<{ results: IAutorouteResult[]; success: boolean; rounds: number }> {
    return pcbAutorouteBatch(pcb, items, batchOptions);
}
