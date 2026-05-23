import { Component } from "../component.js";
import { Schematic, ISchematicNetDefinition } from "../schematic.js";
import { Pin } from "../pin.js";
import type { SExpr } from '../sexpr/types.js';
import { TrackBuilder } from './pcb_track_builder.js';
import type {
    IPcbOptions,
    INetResolution,
    IVia,
    IGrLine,
    IGrArc,
    IGrCircle,
    IGrRect,
    IGrPoly,
    OutlineElement,
    IOutline,
    ISourceInfo,
    IGrTextOptions,
    IFilledZone,
    IKeepoutZone,
    IAutorouteOptions,
    IAutorouteResult,
    IRouteMetadata
} from './pcb_interfaces.js';
import { PadResolver } from '../routing/shared/pad_resolver.js';
import { RoutingGrid } from '../routing/shared/routing_grid.js';
import { ObstacleBuilder } from '../routing/shared/obstacle_builder.js';
import { DebugVisualizer } from '../routing/utils/debug_visualizer.js';
import { getCallSite as getCallSiteUtil } from '../utils/stack_trace.js';

import type {
    IAutorouteWaypoint
} from './pcb_interfaces.js';

import { formatSourceInfoForProperty, generateUuid } from './pcb_utils.js';
import { resolveNet as resolveNetStandalone } from './pcb_net_resolver.js';
import { mapLayerToSide, transformSexprLayers, mirrorChamferDirection } from './pcb_layer_utils.js';
import { pcbLine, pcbCircle, pcbRect, pcbPoly, pcbOutline, pcbText } from './pcb_graphics.js';
import { zone, keepout } from './pcb_zones.js';
import { createVia } from './pcb_via.js';
import { loadExistingBoardElements } from './pcb_board_loader.js';
import { IPcbBoardContext } from './pcb_board_context.js';
import { PcbInternalState } from './pcb_state.js';
import {
    calculateViaCurrentCapacity,
    calculateMinTraceWidth,
    calculateBoardBounds
} from './pcb_routing_calculations.js';
import { pinToIdentifier } from './pcb_routing_helpers.js';
import {
    routeNet as extractRouteNet
} from './pcb_routing_core.js';

import { exportContract } from '../contract.js';
import type { ContractOptions } from '../contract.js';
import { createBoard } from './pcb_board_creation.js';
import { createFootprintNode, updateFootprintNode } from './pcb_footprint.js';
import { autoroute } from './pcb_autoroute.js';
import logger from '../logging.js';
import { placeComponent, stageComponent, unstageComponent, groupComponents } from './pcb_component_lifecycle.js';
import { registerRouter, createRouter, getRouterGridConfigurator, getRegisteredRouters } from './pcb_router_registry.js';
import type { RouterFactory, RouterGridConfigurator, IRouterContext } from './pcb_router_registry.js';
import { autorouteBatch } from './pcb_autoroute_batch.js';


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

interface IRouterGridConfig {
    gridResolution?: number;
    reason?: string;
}

// Type guard using `'in'` operator instead of `(value as any).name` to narrow unknown
// without bypassing the type system. The `(value as { name: unknown })` cast is safe
// because we already checked `'name' in value`.
function isSchematicNetDefinition(value: unknown): value is ISchematicNetDefinition {
    return Boolean(
        value &&
        typeof value === 'object' &&
        'name' in value &&
        typeof (value as { name: unknown }).name === 'string' &&
        'pins' in value &&
        Array.isArray((value as { pins: unknown }).pins)
    );
}


/**
 * Represents a printed circuit board (PCB).
 */
export class PCB implements IPcbBoardContext {
    Boardname: string;
    Schematic: Schematic;
    thickness: number;
    copper_thickness: number;
    outlines: IOutline[] = [];
    tracks: IOutline[] = [];

    /** @internal Mutable state capsule shared with extracted sub-modules. */
    readonly state: PcbInternalState;

    /**
     * Initializes a new PCB.
     * @param Boardname - Name and filename of generated files.
     * @param schematic - Optional schematic associated with the PCB.
     */
    constructor(Boardname: string, options?: IPcbOptions) {
        this.Boardname = Boardname;
        const resolvedOptions = options || { remove_orphans: true, thickness: 1.6, copper_thickness: 35, Schematic: new Schematic(Boardname) };
        this.state = new PcbInternalState(resolvedOptions);
        this.thickness = resolvedOptions.thickness || 1.6;
        this.copper_thickness = resolvedOptions.copper_thickness || 35;
        this.Schematic = resolvedOptions.Schematic || new Schematic(Boardname);

        this.state.existingBoardElements = loadExistingBoardElements(Boardname);
    }

    /**
     * Pushes a new offset to the stack. All subsequent coordinates will be relative to this offset.
     */
    pushOffset(x: number, y: number): void {
        this.state.offsetStack.push({ ...this.state.currentOffset });
        this.state.currentOffset.x += x;
        this.state.currentOffset.y += y;
    }

    popOffset(): void {
        const prev = this.state.offsetStack.pop();
        if (prev) {
            this.state.currentOffset = prev;
        } else {
            this.state.currentOffset = { x: 0, y: 0 };
        }
    }

    get currentOffset(): { x: number, y: number } {
        return { ...this.state.currentOffset };
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

    get grLines(): IGrLine[] {
        return this.state.grLines;
    }

    get grCircles(): IGrCircle[] {
        return this.state.grCircles;
    }

    get grRects(): IGrRect[] {
        return this.state.grRects;
    }

    get grPolys(): IGrPoly[] {
        return this.state.grPolys;
    }

    get stagedOutlines(): IOutline[] {
        return this.state.stagedOutlines;
    }

    set stagedOutlines(val: IOutline[]) {
        this.state.stagedOutlines = val;
    }

    get zones(): IFilledZone[] {
        return this.state.zones;
    }

    get keepoutZones(): IKeepoutZone[] {
        return this.state.keepoutZones;
    }

    get components(): Component[] {
        return this.state.components;
    }

    get stagedComponents(): Component[] {
        return this.state.stagedComponents;
    }

    get groups(): string[] {
        return this.state.groups;
    }

    get groupsAsMap(): Map<string, string> {
        const groupsMap = new Map<string, string>();
        this.state.groups.forEach(groupString => {
            const match = groupString.match(/^\(group\s+"([^"]+)"/);
            if (match) {
                groupsMap.set(match[1], groupString);
            }
        });
        return groupsMap;
    }

    get existingBoardElements(): SExpr[] {
        return this.state.existingBoardElements;
    }

    get grTexts(): IGrTextOptions[] {
        return this.state.grTexts;
    }

    get pcb(): string {
        return this.state.pcb;
    }

    get outlines_public(): IOutline[] {
        return this.state.outlines;
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
            this.Schematic,
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

    /**
     * Adds board-level text (gr_text) to the PCB.
     * @param options - Text options including content, position, layer, and formatting
     * @example
     * pcb.text({
     *   text: 'TYPECAD 1HZ',
     *   x: 145.415,
     *   y: 108.585,
     *   rotation: 0,
     *   layer: 'F.SilkS',
     *   font: 'Super Skinny Pixel Bricks',
     *   width: 5,
     *   height: 5
     * });
     */
    text(options: IGrTextOptions): void {
        const modifiedOptions: IGrTextOptions = {
            ...options,
            x: options.x + this.state.currentOffset.x,
            y: options.y + this.state.currentOffset.y,
        };
        pcbText(this, modifiedOptions);
    }

    #_update_footprint_node(node: SExpr[], component: Component, boardNetNameToCodeMap?: Map<string, number>): SExpr[] {
        return updateFootprintNode(node, component, this.resolveNet.bind(this), boardNetNameToCodeMap);
    }

    #_create_footprint_node(component: Component, boardNetNameToCodeMap?: Map<string, number>): SExpr[] {
        return createFootprintNode(component, this.resolveNet.bind(this), boardNetNameToCodeMap);
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
        return createBoard(this, ...flattened);
    }

    getCallSite(): { file: string; line: number; column: number } | undefined {
        return getCallSiteUtil();
    }

    /**
     * Calculate the current capacity of a via based on its size and drill
     * @param size - Via size in mm
     * @param drill - Via drill size in mm
     * @param thickness - Copper plating thickness in microns (defaults to PCB copper thickness)
     * @param boardThickness - Board thickness in mm (defaults to PCB thickness)
     * @param maxTempRise - Maximum temperature rise in °C (defaults to 10)
     * @returns Maximum current capacity in amperes
     */
    #calculateViaCurrentCapacity(size: number, drill: number, thickness?: number, boardThickness?: number, maxTempRise: number = 10): number {
        // Use PCB options as defaults
        const actualThickness = thickness ?? this.copper_thickness;
        const actualBoardThickness = boardThickness ?? this.thickness;

        return calculateViaCurrentCapacity(size, drill, actualThickness, actualBoardThickness, maxTempRise);
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

    /**
     * Creates a filled zone on copper layers connected to a specific net.
     * For full documentation and examples, see {@link zone} in `pcb_zones.ts`.
     */
    zone(options: {
        // Net specification (required - one of these)
        pin?: Pin;
        net?: string;
        layers: string[];
        x: number;
        y: number;
        width: number;
        height: number;

        // Basic zone settings
        fillMode?: 'solid' | 'hatched';
        filled?: boolean;
        priority?: number;
        locked?: boolean;
        name?: string;
        minThickness?: number;

        // Hatch display settings (for zone outline)
        hatchStyle?: 'none' | 'edge' | 'full';
        hatchPitch?: number;

        // Pad connection settings
        clearance?: number;
        connectPads?: 'thru_hole_only' | 'full' | 'no';

        // Thermal relief settings
        thermalGap?: number;
        thermalBridgeWidth?: number;

        // Corner smoothing
        smoothing?: 'chamfer' | 'fillet' | 'none';
        smoothingRadius?: number;

        // Island removal
        islandRemovalMode?: number;
        islandAreaMin?: number;

        // Hatched fill options
        hatchThickness?: number;
        hatchGap?: number;
        hatchOrientation?: number;
        hatchSmoothingLevel?: number;
        hatchSmoothingValue?: number;
        hatchBorderAlgorithm?: 'hatch_thickness' | 'min_thickness';
        hatchMinHoleArea?: number;

        // Additional fill settings
        fillArcSegments?: number;
        filledAreasThickness?: boolean;
    }): void {
        const modifiedOptions = { 
            ...options,
            x: options.x + this.state.currentOffset.x,
            y: options.y + this.state.currentOffset.y
        };
        zone(this, modifiedOptions);
    }

    /**
     * Creates a keepout zone that restricts routing and placement.
     * For full documentation and examples, see {@link keepout} in `pcb_zones.ts`.
     */
    keepout(options: {
        // Position and size (required)
        layers: string[];
        x: number;
        y: number;
        width: number;
        height: number;

        // Restrictions
        restrictions?: {
            tracks?: boolean;
            vias?: boolean;
            pads?: boolean;
            copperpour?: boolean;
            footprints?: boolean;
        };

        // Basic zone settings
        priority?: number;
        locked?: boolean;
        name?: string;

        // Hatch display settings
        hatchStyle?: 'none' | 'edge' | 'full';
        hatchPitch?: number;

        // Corner smoothing
        smoothing?: 'chamfer' | 'fillet' | 'none';
        smoothingRadius?: number;
    }): void {
        const modifiedOptions = { 
            ...options,
            x: options.x + this.state.currentOffset.x,
            y: options.y + this.state.currentOffset.y
        };
        keepout(this, modifiedOptions);
    }

    /**
     * Creates a graphical line on the board.
     * For full documentation and examples, see {@link pcbLine} in `pcb_graphics.ts`.
     */
    line(options: {
        start: { x: number; y: number };
        end: { x: number; y: number };
        layer?: string;
        width?: number;
        locked?: boolean;
    }): void {
        const modifiedOptions = { 
            ...options,
            start: { x: options.start.x + this.state.currentOffset.x, y: options.start.y + this.state.currentOffset.y },
            end: { x: options.end.x + this.state.currentOffset.x, y: options.end.y + this.state.currentOffset.y }
        };
        pcbLine(this, modifiedOptions);
    }

    /**
     * Creates a graphical circle on the board.
     * For full documentation and examples, see {@link pcbCircle} in `pcb_graphics.ts`.
     */
    circle(options: {
        center: { x: number; y: number };
        radius?: number;
        end?: { x: number; y: number };
        layer?: string;
        width?: number;
        fill?: boolean;
        locked?: boolean;
    }): void {
        const modifiedOptions = { 
            ...options,
            center: { x: options.center.x + this.state.currentOffset.x, y: options.center.y + this.state.currentOffset.y }
        };
        if (options.end) {
            modifiedOptions.end = { x: options.end.x + this.state.currentOffset.x, y: options.end.y + this.state.currentOffset.y };
        }
        pcbCircle(this, modifiedOptions);
    }

    /**
     * Creates a graphical rectangle on the board.
     * For full documentation and examples, see {@link pcbRect} in `pcb_graphics.ts`.
     */
    rect(options: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        start?: { x: number; y: number };
        end?: { x: number; y: number };
        layer?: string;
        strokeWidth?: number;
        fill?: boolean;
        locked?: boolean;
    }): void {
        const modifiedOptions = { ...options };
        if (modifiedOptions.x !== undefined) modifiedOptions.x += this.state.currentOffset.x;
        if (modifiedOptions.y !== undefined) modifiedOptions.y += this.state.currentOffset.y;
        if (modifiedOptions.start) {
            modifiedOptions.start = { x: modifiedOptions.start.x + this.state.currentOffset.x, y: modifiedOptions.start.y + this.state.currentOffset.y };
        }
        if (modifiedOptions.end) {
            modifiedOptions.end = { x: modifiedOptions.end.x + this.state.currentOffset.x, y: modifiedOptions.end.y + this.state.currentOffset.y };
        }
        pcbRect(this, modifiedOptions);
    }

    /**
     * Creates a graphical polygon on the board.
     * For full documentation and examples, see {@link pcbPoly} in `pcb_graphics.ts`.
     */
    poly(options: {
        points: { x: number; y: number }[];
        layer?: string;
        width?: number;
        fill?: boolean;
        locked?: boolean;
    }): void {
        const modifiedOptions = { 
            ...options,
            points: options.points.map(p => ({ x: p.x + this.state.currentOffset.x, y: p.y + this.state.currentOffset.y }))
        };
        pcbPoly(this, modifiedOptions);
    }

    /**
     * Creates a rectangular outline on the Edge.Cuts layer.
     * @param x - The x-coordinate of the rectangle's start point.
     * @param y - The y-coordinate of the rectangle's start point.
     * @param width - The width of the rectangle.
     * @param height - The height of the rectangle.
     * @param filletRadius - The radius for filleted corners (0 for sharp).
     * @param conceptualUuidFromUser - Optional UUID for the conceptual outline.
     */
    outline(x: number, y: number, width: number, height: number, filletRadius: number = 0, conceptualUuidFromUser?: string): void {
        pcbOutline(this, x + this.state.currentOffset.x, y + this.state.currentOffset.y, width, height, filletRadius, conceptualUuidFromUser);
    }

    _track(start: { x: number, y: number }, end: { x: number, y: number }, width: number = 0.05, layer: string = "F.Cu", locked: boolean = false, uuid?: string, net?: string): string {
        const trackUuid = uuid || generateUuid();
        const offsetStart = { x: start.x + this.state.currentOffset.x, y: start.y + this.state.currentOffset.y };
        const offsetEnd = { x: end.x + this.state.currentOffset.x, y: end.y + this.state.currentOffset.y };

        const lineData: IGrLine = {
            type: 'line',
            uuid: trackUuid,
            layer: layer,
            strokeWidth: width,
            start: offsetStart,
            end: offsetEnd,
            locked: locked,
            net: net
        };

        this.state.stagedOutlines.push({
            uuid: trackUuid,
            x: lineData.start.x,
            y: lineData.start.y,
            width: Math.abs(lineData.end.x - lineData.start.x),
            height: Math.abs(lineData.end.y - lineData.start.y),
            filletRadius: 0,
            elements: [lineData]
        });

        return trackUuid;
    }

    /**
     * Begins a fluent interface for creating connected tracks and vias.
     * @returns A TrackBuilder instance.
     *
     * Example:
     * ```
     * let power_track_elements = pcb.connect()
     *  .from({x: 100, y: 100}, "F.Cu", 0.2)
     *  .to({x: 110, y: 100})
     *  .via({size: 0.8, drill: 0.4}) // Transitions to B.Cu (or other side of via)
     *  .to({x: 110, y: 120, layer: "B.Cu"}) // Continues on B.Cu
     * ```
     */
    track(options?: { locked?: boolean; net?: string; deferStaging?: boolean }): TrackBuilder {
        return new TrackBuilder(this, options);
    }

    /**
     * Automatically routes traces between specified pins.
     *
     * This method generates optimized PCB traces that connect pins while respecting
     * various constraints such as impedance control, layer restrictions, trace width,
     * and routing requirements.
     *
     * @param options - Configuration options for the autoroute operation
     * @param options.from - Starting pin(s) for the route. Can be a single Pin or array of Pins.
     * @param options.to - Destination pin(s) for the route. Can be a single Pin or array of Pins.
     * @param options.waypoints - Optional array of waypoints to guide the routing path
     * @param options.impedance - Impedance control settings with target ohms and tolerance
     * @param options.layers - Restrict routing to specific copper layers (e.g., ['F.Cu', 'B.Cu'])
     * @param options.width - Trace width in mm. If not specified, calculated from powerInfo or defaults.
     * @param options.clearance - Minimum clearance from other objects in mm
     * @param options.net - Explicit net name. If not provided, inferred from pins.
     * @param options.powerInfo - Power characteristics for automatic trace width calculation
     * @param options.locked - Lock generated traces to prevent manual editing in KiCAD
     *
     * @returns Array of TrackBuilder instances (with metadata) that can be passed to create()
     *
     * @example
     * ```ts
     * // Simple point-to-point routing - spread into create()
     * let tracks = pcb.autoroute({
     *   algorithm: RoutingAlgorithm.AStar,
     *   from: r1.pin(1),
     *   to: r2.pin(2)
     * });
     * pcb.create(r1, r2, ...tracks);
     *
     * // Access metadata
     * if (tracks.success) {
     *   console.log(`Routed ${tracks.completedCount} traces`);
     *   console.log(`Length: ${tracks.routeDetails[0].length.toFixed(2)}mm`);
     * }
     *
     * // Impedance controlled differential pair
     * let diffPair = pcb.autoroute({
     *   algorithm: RoutingAlgorithm.AStar,
     *   from: [usb.pin('D+'), usb.pin('D-')],
     *   to: [ic.pin(23), ic.pin(24)],
     *   impedance: { target: 90, tolerance: 10 },
     *   layers: ['F.Cu', 'B.Cu']
     * });
     * pcb.create(usb, ic, ...diffPair);
     *
     * // Power trace with waypoints
     * let powerTrace = pcb.autoroute({
     *   algorithm: RoutingAlgorithm.AStar,
     *   from: regulator.pin('OUT'),
     *   to: ic.pin('VCC'),
     *   powerInfo: { current: 2.0, maxTempRise: 10 },
     *   waypoints: [{ x: 10, y: 20 }, { x: 15, y: 25 }]
     * });
     * pcb.create(regulator, ic, ...powerTrace);
     * ```
     *
     * @throws {Error} If pins are invalid or routing constraints cannot be satisfied
     */

    
    /**
     * Unified routing API.
     *
     * Overloads:
     * - Route specific pins: route({ from: U1.pin(1), to: [U2.pin(1)], width: 0.5 })
     * - Route a named net:   route(netDefinition, { gridResolution: 0.15 })
     */
    route(options: IAutorouteOptions): Promise<IAutorouteResult>;
    route(netDefinition: ISchematicNetDefinition, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): Promise<IAutorouteResult>;
    async route(arg1: ISchematicNetDefinition | IAutorouteOptions, options?: import('./pcb_interfaces.js').IAutorouteRouteOptions): Promise<IAutorouteResult> {
        if (isSchematicNetDefinition(arg1)) {
            return extractRouteNet(this, arg1, options);
        }
        const opts = arg1 as IAutorouteOptions;
        const netLabel = opts.net || `${pinToIdentifier(Array.isArray(opts.from) ? opts.from[0] : opts.from)} → ${pinToIdentifier(Array.isArray(opts.to) ? opts.to[0] : opts.to)}`;
        logger.info(`⏳ Routing '${netLabel}'...`);
        const result = await this.#autoroute(opts);
        if (result.success) {
            logger.info(`✔ Routing '${netLabel}' complete (${result.completedCount}/${result.routeCount} routes)`);
        } else {
            logger.warn(`⚠ Routing '${netLabel}' incomplete (${result.completedCount}/${result.routeCount} routes)`);
        }
        return result;
    }

    async #autoroute(options: IAutorouteOptions): Promise<IAutorouteResult> {
        const task = Promise.resolve(autoroute(this, options));
        this.state.pendingAutoroutes.add(task);
        try {
            return await task;
        } finally {
            this.state.pendingAutoroutes.delete(task);
        }
    }

    async waitForPendingAutoroutes(): Promise<void> {
        if (this.state.pendingAutoroutes.size === 0) return;
        await Promise.all(Array.from(this.state.pendingAutoroutes));
    }


  
    /**
     * Batch autorouter orchestrator with simple rip-up-and-retry.
     * Routes multiple connections together, retrying with different ordering
     * and relaxed parameters across rounds to negotiate congestion.
     */
    async autorouteBatch(
        items: Array<{ from: Pin | Pin[]; to: Pin | Pin[]; options?: import('./pcb_interfaces.js').IAutorouteRouteOptions; name?: string }>,
        batchOptions?: {
            rounds?: number;
            reorder?: 'none' | 'reverse' | 'byDistance';
            relaxViaCostPerRound?: number;        // subtract per round (min 0)
            increaseIterationsPerRound?: number;  // add per round
        }
    ): Promise<{ results: IAutorouteResult[]; success: boolean; rounds: number }> {
        return autorouteBatch(this, items, batchOptions);
    }

    /**
     * Calculate board bounds from components and outlines.
     * Creates a bounding box centered around all component positions.
     * @param additionalComponents - Additional components to include (e.g., from pins being routed)
     * @private
     */
    #calculateBoardBounds(additionalComponents?: Component[]): { minX: number; maxX: number; minY: number; maxY: number } {
        const allComponents: Component[] = [];

        if (this.state.components) {
            allComponents.push(...this.state.components);
        }

        if (this.state.stagedComponents) {
            allComponents.push(...this.state.stagedComponents);
        }

        if (additionalComponents) {
            allComponents.push(...additionalComponents);
        }

        return calculateBoardBounds(allComponents, this.outlines);
    }

    /**
     * Calculate minimum trace width using IPC-2221 formula.
     * Reuses the formula from TrackBuilder.
     * @private
     */
    #calculateMinTraceWidth(
        current: number,
        layer: string,
        maxTempRise: number,
        thickness: number
    ): number {
        return calculateMinTraceWidth(current, layer, maxTempRise, thickness);
    }

    /**
     * Connects a group of pins together in the associated schematic.
     * Returns a description of the resulting net so it can be reused later.
     * @param pins - Pins to connect in the net.
     */
    net(...pins: Pin[]): ISchematicNetDefinition {
        return this.Schematic.net(...pins);
    }

    /**
     * Sets a name for a net in the associated schematic.
     * This is a pass-through to the Schematic.named() method.
     * @param name - The name to set for the net.
     * @returns The PCB instance for chaining.
     */
    named(name: string): this {
        this.Schematic.named(name);
        return this;
    }

    
    /**
     * Generates a Bill of Materials (BOM) for the associated schematic.
     * This is a pass-through to the Schematic.bom() method.
     * @param output_folder - The folder to output the BOM to.
     */
    bom(output_folder?: string): void {
        if (this.Schematic) {
            this.Schematic.bom(output_folder);
        }
    }

    /**
     * Performs electrical rule checks on the associated schematic.
     * This is a pass-through to the Schematic.erc() method.
     */
    erc(): void {
        if (this.Schematic) {
            this.Schematic.erc();
        }
    }

    /**
     * Exports a hardware contract JSON file describing which MCU pins are wired
     * in the circuit. The firmware toolchain (TypeHAL) consumes this contract to
     * generate a board wrapper that only exposes connected pins and peripherals.
     *
     * When a component has a `typehal.boardPackage` property, the MCU is auto-detected
     * and pin names are read from the KiCAD symbol file. No options are needed.
     *
     * @param options - Contract generation options (all optional when typehal is set on the MCU).
     * @param options.mcuSymbolPattern - Substring to match against Component.symbol to find the MCU (fallback).
     * @param options.mcuReference - Exact reference designator (e.g. 'U1'). Takes priority over mcuSymbolPattern.
     * @param options.pinMapping - Pin mapping table for the MCU (legacy — only needed without typehal).
     * @param options.peripheralPins - Peripheral pin requirements (board pin names).
     * @param options.boardPackage - Board package name for the consumer (default: from typehal.boardPackage).
     * @param options.outputPath - Output file path (default: "./build/<boardname>.contract.json").
     *
     * @example
     * ```ts
     * // Auto-detect MCU from typehal.boardPackage property on the component:
     * pcb.contract();
     *
     * // With custom output path:
     * pcb.contract({ outputPath: '../fw/contract.json' });
     *
     * // Legacy — manual MCU identification:
     * pcb.contract({
     *   mcuSymbolPattern: 'ATmega328',
     *   pinMapping: atmega328,
     * });
     * ```
     */
    contract(options: ContractOptions = {}): void {
        const outputPath = options.outputPath ?? `./build/${this.Boardname}.contract.json`;
        exportContract(this, { ...options, outputPath });
    }

    /**
     * Adds components to the associated schematic.
     * This is a pass-through to the Schematic.add() method.
     * @param components - Components to add to the schematic.
     */
    add(...components: Component[]): void {
        if (this.Schematic) {
            this.Schematic.add(...components);
        }
    }

    _getTrackData(uuid: string): IGrLine | null {
        for (const outline of this.state.stagedOutlines) {
            if (outline.uuid === uuid && outline.elements.length === 1 && outline.elements[0].type === 'line') {
                return outline.elements[0] as IGrLine;
            }
        }
        return null;
    }

}
