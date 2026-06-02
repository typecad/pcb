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
import { IPcbBoardContext } from './pcb_board_context.js';
import { PcbInternalState } from './pcb_state.js';
import { RoutingGrid } from '../routing/shared/routing_grid.js';

import { createBoard } from './pcb_board_creation.js';
import { placeComponent, stageComponent, groupComponents } from './pcb_component_lifecycle.js';
import { registerRouter, createRouter, getRouterGridConfigurator, getRegisteredRouters } from './pcb_router_registry.js';
import type { RouterFactory, RouterGridConfigurator, IRouterContext } from './pcb_router_registry.js';
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
export class PCB implements IPcbBoardContext {
    boardName: string;
    /** @internal */
    schematic: Schematic;
    thickness: number;
    copper_thickness: number;
    outlines: IOutline[] = [];
    tracks: IOutline[] = [];

    /** @internal Mutable state capsule shared with extracted sub-modules. */
    readonly state: PcbInternalState;

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
        this.state = new PcbInternalState(resolvedOptions);
        this.thickness = resolvedOptions.thickness ?? 1.6;
        this.copper_thickness = resolvedOptions.copper_thickness ?? 35;
        this.schematic = resolvedOptions.schematic ?? new Schematic(boardName);

        this.state.existingBoardElements = loadExistingBoardElements(boardName);
    }

    /**
     * Pushes a new offset to the stack. All subsequent coordinates will be relative to this offset.
     */
    pushOffset(x: number, y: number): void {
        this.state.pushOffset(x, y);
    }

    popOffset(): void {
        this.state.popOffset();
    }

    get currentOffset(): { x: number, y: number } {
        return this.state.getOffset();
    }

    /**
     * Register a routing algorithm with this PCB instance.
     *
     * @param registerFn - A registerRouter function (e.g., from @typecad-astar)
     * @param algorithm - Optional algorithm name (defaults to 'astar')
     */
    registerRouter(
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

    createRouter(name: string, grid: RoutingGrid, options: unknown): IRouterContext {
        return createRouter(name, grid, options);
    }

    getRouterGridConfigurator(name: string): RouterGridConfigurator | undefined {
        return getRouterGridConfigurator(name);
    }

    getRegisteredRouters(): string[] {
        return getRegisteredRouters();
    }

    /**
     * Getter for PCB options.
     */
    get option(): IPcbOptions {
        return this.state.options;
    }

    get options(): IPcbOptions {
        return {
            ...this.state.options,
            remove_orphans: this.state.options.remove_orphans ?? true
        };
    }

    
    resolveNet(
        componentReference: string,
        pinNumber: string,
        componentUuid?: string,
        boardNetNameToCodeMap?: Map<string, number>,
        fallbackNetName?: string
    ): INetResolution {
        return resolveNetStandalone(
            this.schematic,
            componentReference,
            pinNumber,
            componentUuid,
            boardNetNameToCodeMap,
            fallbackNetName
        );
    }

    /**
     * Places components on the board.
     * @param components - List of components to place.
     */
    place(...components: Component[]) {
        components.forEach(component => {
            placeComponent(this.state, component);
        });
    }

    stage(...components: Component[]) {
        components.forEach(component => {
            stageComponent(this.state, component);
        });
    }

    /**
     * Groups components and/or elements from a TrackBuilder together on the board.
     * @param group_name - Name of the group.
     * @param items - A list of Component instances or TrackBuilder instances.
     */
    group(group_name: string, ...items: Array<Component | TrackBuilder>) {
        groupComponents(this.state, (...comps) => this.place(...comps), group_name, ...items);
    }

    text(options: IGrTextOptions): void {
        pcbTextWithOffset(this.state, options);
    }

    async create(...items: Array<Component | TrackBuilder | Array<Component | TrackBuilder>>) {
        // Flatten any arrays passed as arguments
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
            this.state.currentOffset,
            (c) => this.stage(c),
            { at, size, drill, net, powerInfo }
        );
    }

    zone(options: IPcbZoneOptions): void {
        pcbZoneWithOffset(this.state, options);
    }

    keepout(options: IPcbKeepoutOptions): void {
        pcbKeepoutWithOffset(this.state, options);
    }

    line(options: IPcbLineOptions): void {
        pcbLineWithOffset(this.state, options);
    }

    circle(options: IPcbCircleOptions): void {
        pcbCircleWithOffset(this.state, options);
    }

    rect(options: IPcbRectOptions): void {
        pcbRectWithOffset(this.state, options);
    }

    poly(options: IPcbPolyOptions): void {
        pcbPolyWithOffset(this.state, options);
    }

    outline(x: number, y: number, width: number, height: number, filletRadius: number = 0, conceptualUuidFromUser?: string): void {
        pcbOutlineWithOffset(this.state, x, y, width, height, filletRadius, conceptualUuidFromUser);
    }

    /** @internal */
    _track(start: { x: number, y: number }, end: { x: number, y: number }, width: number = 0.05, layer: string = "F.Cu", locked: boolean = false, uuid?: string, net?: string): string {
        return pcbTrackWithOffset(this.state, start, end, width, layer, locked, uuid, net);
    }

    track(options?: { locked?: boolean; net?: string; deferStaging?: boolean }): TrackBuilder {
        return new TrackBuilder(this, options);
    }

    route(options: IAutorouteOptions): Promise<IAutorouteResult>;
    route(netDefinition: ISchematicNetDefinition, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): Promise<IAutorouteResult>;
    async route(arg1: ISchematicNetDefinition | IAutorouteOptions, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): Promise<IAutorouteResult> {
        return pcbRoute(this, this.state, arg1, options);
    }

    async waitForPendingAutoroutes(): Promise<void> {
        return pcbWaitForPendingAutoroutes(this.state);
    }

    async autorouteBatch(
        items: Array<{ from: Pin | Pin[]; to: Pin | Pin[]; options?: import('./pcb_interfaces.js').IAutorouteRouteOptions; name?: string }>,
        batchOptions?: {
            rounds?: number;
            reorder?: 'none' | 'reverse' | 'byDistance';
            relaxViaCostPerRound?: number;
            increaseIterationsPerRound?: number;
        }
    ): Promise<{ results: IAutorouteResult[]; success: boolean; rounds: number }> {
        return pcbAutorouteBatch(this, items, batchOptions);
    }

    net(...pins: Pin[]): ISchematicNetDefinition {
        return pcbNet(this.schematic, ...pins);
    }

    named(name: string) {
        return pcbNamed(this.schematic, name);
    }

    bom(output_folder?: string): void {
        pcbBom(this.schematic, output_folder);
    }

    contract(options: import('../contract.js').ContractOptions = {}): void {
        pcbContract(this, options);
    }

    add(...components: Component[]): void {
        pcbAdd(this.schematic, ...components);
    }

    /** @internal */
    _getTrackData(uuid: string): IGrLine | null {
        for (const outline of this.state.stagedOutlines) {
            if (outline.uuid === uuid && outline.elements.length === 1 && outline.elements[0].type === 'line') {
                return outline.elements[0] as IGrLine;
            }
        }
        return null;
    }

}
