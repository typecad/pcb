import { Component } from "../component.js";
import { Schematic } from "../schematic.js";
import type { ISchematicNetDefinition } from "../net_manager.js";
import { Pin } from "../pin.js";
import type { Power } from "../buses.js";
import { SimulationContext } from "../simulation/ngspice.js";
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
import { resolveRules } from './pcb_rules.js';
import type { IPcbRules, INetClass, INetClassOptions } from './pcb_rules.js';
import { NetClassRegistry } from './pcb_net_class.js';
import { validateLayerCount } from './pcb_stackup.js';
import type { IStackupOptions } from './pcb_stackup.js';

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
    pcbOutlinePolygonWithOffset,
    pcbOutlineCircleWithOffset,
    pcbCutoutWithOffset,
    pcbCutoutCircleWithOffset,
    pcbOutlinePathWithOffset,
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
export type { IPcbRules, INetClass, INetClassOptions } from './pcb_rules.js';
export type { IStackupOptions } from './pcb_stackup.js';


/**
 * Represents a printed circuit board (PCB).
 */
export class PCB {
    readonly boardName: string;
    private _schematic: Schematic;
    private _state: PcbInternalState;
    private _outlines: IOutline[] = [];
    private _tracks: IOutline[] = [];
    private _netClasses = new NetClassRegistry();
    private _stackup?: { layerCount: number; options: IStackupOptions };

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

    /**
     * Resolved board-wide design rules (JLCPCB no-surcharge defaults merged
     * with any constructor overrides). The autorouter reads these as its
     * fallback clearance and track width; they are also written to the
     * `.kicad_pro` file for DRC.
     */
    get rules(): Required<IPcbRules> {
        return resolveRules(this._state.options.rules);
    }

    /**
     * The net-class registry, holding user-defined net classes and net→class
     * assignments. Consumed by the build write path and the autorouter.
     */
    get netClasses(): NetClassRegistry {
        return this._netClasses;
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

    /**
     * Generates all KiCad project files: schematic (.net), PCB (.kicad_pcb),
     * and BOM. Writes outputs to the build directory.
     *
     * @param items - Components, TrackBuilders, or arrays thereof to include.
     */
    create(...items: Array<Component | TrackBuilder | Array<Component | TrackBuilder>>) {
        const flattened: Array<Component | TrackBuilder> = [];
        for (const item of items) {
            if (Array.isArray(item)) {
                flattened.push(...item);
            } else {
                flattened.push(item);
            }
        }
        const result = createBoard(this, ...flattened);
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

    /**
     * Define a custom polygon board outline on Edge.Cuts. The polygon is
     * emitted as a single `gr_poly`; KiCad treats it as a closed contour.
     * @param points - Polygon vertices in mm (≥3).
     */
    outlinePolygon(points: Array<{ x: number; y: number }>): void {
        pcbOutlinePolygonWithOffset(this._state, points);
    }

    /**
     * Define a circular board outline on Edge.Cuts.
     * @param cx - Center X in mm.
     * @param cy - Center Y in mm.
     * @param radius - Radius in mm.
     */
    outlineCircle(cx: number, cy: number, radius: number): void {
        pcbOutlineCircleWithOffset(this._state, cx, cy, radius);
    }

    /**
     * Define an internal cutout (e.g. a milled slot or non-circular mounting
     * cutout) on Edge.Cuts. Same mechanism as a polygon outline; KiCad treats
     * nested closed contours on Edge.Cuts as holes.
     * @param points - Cutout vertices in mm (≥3).
     */
    cutout(points: Array<{ x: number; y: number }>): void {
        pcbCutoutWithOffset(this._state, points);
    }

    /**
     * Define a circular cutout (e.g. a mounting hole) on Edge.Cuts.
     * @param cx - Center X in mm.
     * @param cy - Center Y in mm.
     * @param radius - Radius in mm.
     */
    cutoutCircle(cx: number, cy: number, radius: number): void {
        pcbCutoutCircleWithOffset(this._state, cx, cy, radius);
    }

    /**
     * Start building an arbitrary outline path of line/arc segments on
     * Edge.Cuts. Use `.lineTo()`, `.arcTo()`, and `.close()` on the returned
     * builder.
     * @param x - Start X in mm.
     * @param y - Start Y in mm.
     */
    outlinePath(x: number, y: number) {
        return pcbOutlinePathWithOffset(this._state, x, y);
    }

    /**
     * Define a net class with per-net physical dimensions (mm). Nets assigned
     * to the class (via {@link assign}) get these dimensions for routing and
     * DRC. Unspecified fields fall back to the board design rules.
     *
     * @param name - Class name. Must not be `Default` (reserved).
     * @param options - Partial dimensions.
     */
    netClass(name: string, options: INetClassOptions): void {
        this._netClasses.define(name, options, this.rules);
    }

    /**
     * Assign a net to a previously-defined net class. Accepts the
     * {@link ISchematicNetDefinition} returned by `pcb.net()` or
     * `pcb.named().net()`, so it works for named and auto-named nets.
     *
     * @param netDef - The net definition object.
     * @param className - The class name (must have been defined via {@link netClass}).
     */
    assign(netDef: ISchematicNetDefinition, className: string): void {
        this._netClasses.assign(netDef, className);
    }

    /**
     * Configure the board's physical layer stackup. Generates the
     * `(setup (stackup ...))` block and regenerates the `(layers ...)` block to
     * match the copper-layer count. Uses JLCPCB-standard materials (FR4,
     * 1oz copper, green mask) at the board's total thickness.
     *
     * @param layerCount - Number of copper layers (2–32).
     * @param options - Optional stackup-level overrides (copper finish, etc.).
     */
    stackup(layerCount: number, options?: IStackupOptions): void {
        validateLayerCount(layerCount);
        this._stackup = { layerCount, options: options ?? {} };
    }

    /** The configured stackup, if `pcb.stackup()` was called. */
    get stackupConfig(): Readonly<{ layerCount: number; options: IStackupOptions }> | undefined {
        return this._stackup;
    }

    track(options?: { locked?: boolean; net?: string; deferStaging?: boolean; debug?: boolean }): TrackBuilder {
        return new TrackBuilder(this, options);
    }

    route(options: IAutorouteOptions): IAutorouteResult;
    route(netDefinition: ISchematicNetDefinition, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): IAutorouteResult;
    route(arg1: ISchematicNetDefinition | IAutorouteOptions, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): IAutorouteResult {
        return pcbRoute(this, this._state, arg1, options);
    }

    waitForPendingAutoroutes(): void {
        pcbWaitForPendingAutoroutes(this._state);
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

    contract(options: import('../contract.js').ContractOptions): void {
        pcbContract(this, options);
    }

    add(...components: Component[]): void {
        pcbAdd(this._schematic, ...components);
    }

    /**
     * Mark pins as do-not-connect (no-connect flag in the schematic).
     * Equivalent to placing a no-connect flag on unused pins in KiCad's
     * schematic editor.
     */
    dnc(...pins: Pin[]): void {
        this._schematic.dnc(...pins);
    }

    /**
     * Run ngspice SPICE simulation on this board's schematic.
     * Returns a {@link SimulationContext} for running DC operating point
     * (`.op()`) or transient (`.tran()`) analyses.
     *
     * @param powers - One or more {@link Power} objects defining voltage sources.
     *
     * @example
     * ```ts
     * const result = pcb.simulate(vin).op();
     * const voltage = result.getVoltage('vdiv');
     * ```
     */
    simulate(...powers: Power[]): SimulationContext {
        return this._schematic.simulate(...powers);
    }

    /**
     * Throw a typed error with a user-defined message. Useful for validating
     * design constraints in build code.
     */
    error(message: string): void {
        this._schematic.error(message);
    }

    /**
     * Emit a warning message to the console.
     */
    warn(message: string): void {
        this._schematic.warn(message);
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
): { results: IAutorouteResult[]; success: boolean; rounds: number } {
    return pcbAutorouteBatch(pcb, items, batchOptions);
}
