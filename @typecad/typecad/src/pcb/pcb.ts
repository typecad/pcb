import { Component } from "../component.js";
import { Schematic, ISchematicNetDefinition } from "../schematic.js";
import { Pin } from "../pin.js";
import fs from "node:fs";
import fsexp from "fast-sexpr";
import SExpr from "s-expression.js";
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
import { pcbLine, pcbCircle, pcbRect, pcbPoly, pcbOutline } from './pcb_graphics.js';
import { zone, keepout, _getStagedOutlines, _removeStagedOutlinesByUuid } from './pcb_zones.js';
import {
    calculateViaCurrentCapacity,
    calculateMinTraceWidth,
    calculateBoardBounds
} from './pcb_routing_calculations.js';
import {
    pinToIdentifier,
    pinsMatch,
    connectionMatches
} from './pcb_routing_helpers.js';
import {
    pointOnLineSegment,
    routeNet as extractRouteNet
} from './pcb_routing_core.js';
import { prettyPrintSExpr } from '../utils/sexpr_formatter.js';
import { createBoard } from './pcb_board_creation.js';
import { createFootprintNode, updateFootprintNode } from './pcb_footprint.js';
import { RoutingError } from '../errors.js';
import { autoroute } from './pcb_autoroute.js';
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

const S = new SExpr();

interface IRouterGridConfig {
    gridResolution?: number;
    reason?: string;
}

interface IRouterContext {
    [key: string]: unknown;
}

type RouterFactory = (grid: RoutingGrid, options: unknown) => IRouterContext;
type RouterGridConfigurator = (context: IRouterContext) => IRouterGridConfig | void;

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
export class PCB {
    Boardname: string;
    Schematic: Schematic;
    thickness: number;
    copper_thickness: number;
    outlines: IOutline[] = [];
    tracks: IOutline[] = [];
    #offsetStack: { x: number, y: number }[] = [];
    #currentOffset: { x: number, y: number } = { x: 0, y: 0 };
    #pcb: string = '';
    #components: Component[] = [];
    #stagedComponents: Component[] = []; // Components placed/grouped but not yet created
    #groups: string[] = [];
    #outlines: IOutline[] = [];
    #stagedOutlines: IOutline[] = []; // Outlines/tracks created but not yet included in create
    #options: IPcbOptions;
    #existingBoardElements: unknown[] = [];
    #grTexts: IGrTextOptions[] = []; // Board-level text elements
    #zones: IFilledZone[] = []; // Filled zones
    #keepoutZones: IKeepoutZone[] = []; // Keepout zones
    #grLines: IGrLine[] = []; // Graphical lines
    #grCircles: IGrCircle[] = []; // Graphical circles
    #grRects: IGrRect[] = []; // Graphical rectangles
    #grPolys: IGrPoly[] = []; // Graphical polygons
    // Static router registry shared across all PCB instances.
    // Register a routing algorithm once and all PCB instances can use it.
    static #routerRegistry: Map<string, { factory: RouterFactory; configureGrid?: RouterGridConfigurator }> = new Map();
    // Previously attached dynamically via (this as any)._pendingAutoroutes. Promoted to a
    // proper private field so callers like waitForPendingAutoroutes() don't need `as any` casts.
    #pendingAutoroutes: Set<Promise<IAutorouteResult>> = new Set();

    /**
     * Initializes a new PCB.
     * @param Boardname - Name and filename of generated files.
     * @param schematic - Optional schematic associated with the PCB.
     */
    constructor(Boardname: string, options?: IPcbOptions) {
        this.Boardname = Boardname;
        this.#options = options || { remove_orphans: true, thickness: 1.6, copper_thickness: 35, Schematic: new Schematic(Boardname) };
        this.thickness = this.#options.thickness || 1.6;
        this.copper_thickness = this.#options.copper_thickness || 35;
        this.Schematic = this.#options.Schematic || new Schematic(Boardname);

        // Load existing board elements early so they're available for track preservation
        this.#loadExistingBoardElements();
    }

    public prettyPrintSExpr(sexpr: string): string {
        return prettyPrintSExpr(sexpr);
    }

    /**
     * Pushes a new offset to the stack. All subsequent coordinates will be relative to this offset.
     */
    pushOffset(x: number, y: number): void {
        this.#offsetStack.push({ ...this.#currentOffset });
        this.#currentOffset.x += x;
        this.#currentOffset.y += y;
    }

    /**
     * Pops the last offset from the stack.
     */
    popOffset(): void {
        const prev = this.#offsetStack.pop();
        if (prev) {
            this.#currentOffset = prev;
        } else {
            this.#currentOffset = { x: 0, y: 0 };
        }
    }

    /**
     * Gets the current active offset.
     */
    get currentOffset(): { x: number, y: number } {
        return { ...this.#currentOffset };
    }

    /**
     * Register a routing algorithm with this PCB instance.
     *
     * @param registerFn - A registerRouter function (e.g., from @typecad-astar)
     * @param algorithm - Optional algorithm name (defaults to 'astar')
     */
    registerRouter(
        registerFn: {
            (
                registry: {
                    register(
                        name: string,
                        factory: RouterFactory,
                        options?: { configureGrid?: RouterGridConfigurator }
                    ): void;
                },
                algorithm?: string
            ): void;
        }
    ): void {
        const instanceRegistry = {
            register: (
                name: string,
                factory: RouterFactory,
                options?: { configureGrid?: RouterGridConfigurator }
            ) => {
                PCB.#routerRegistry.set(name, {
                    factory,
                    configureGrid: options?.configureGrid
                });
            }
        };

        // Call the external registerRouter function with our instance registry
        // The external function will call instanceRegistry.register to store the factory
        registerFn(instanceRegistry);
    }

    /**
     * Create a routing engine by name from this PCB instance's registry.
     * @internal
     */
    createRouter(name: string, grid: RoutingGrid, options: unknown): IRouterContext {
        const registration = PCB.#routerRegistry.get(name);
        if (!registration) {
            throw new RoutingError(`Routing algorithm '${name}' is not registered with this PCB instance. Use typecad.registerRouter() first.`);
        }
        return registration.factory(grid, options);
    }

    /**
     * Get the grid configuration hook for an algorithm from this PCB instance's registry.
     * @internal
     */
    getRouterGridConfigurator(name: string): RouterGridConfigurator | undefined {
        return PCB.#routerRegistry.get(name)?.configureGrid;
    }

    /**
     * Get the list of registered router names from this PCB instance's registry.
     * @internal
     */
    getRegisteredRouters(): string[] {
        return Array.from(PCB.#routerRegistry.keys());
    }

    /**
     * Loads existing board elements for track and component preservation.
     * @private
     */
    #loadExistingBoardElements(): void {
        const boardFilePath = `./build/${this.Boardname}.kicad_pcb`;

        if (fs.existsSync(boardFilePath)) {
            try {
                let board_contents_str = fs.readFileSync(boardFilePath, "utf8");
                
                // Sanitize problematic characters BEFORE S-expression parsing
                // This prevents fsexp from fragmenting strings with special characters.
                // Only replace double quotes inside S-expression string tokens (between parentheses),
                // not all quotes globally, to avoid corrupting legitimate strings.
                board_contents_str = board_contents_str.replace(/[±]/g, ''); // Remove plus-minus and other problematic Unicode
                // Replace double quotes with backticks only within S-expression string tokens
                // e.g., (net 1 "GND") -> (net 1 `GND`) — this is needed for fsexp compatibility
                // but we must NOT replace quotes in already-valid strings.
                board_contents_str = board_contents_str.replace(/"([^"]*)"/g, '`$1`');
                
                const parsed = fsexp(board_contents_str);
                if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]) && parsed[0][0] === 'kicad_pcb') {
                    const existing_board_contents = parsed[0];
                    // Populate #existingBoardElements for track preservation logic
                    this.#existingBoardElements = existing_board_contents.slice(1); // Skip the 'kicad_pcb' header
                } else {
                    this.#existingBoardElements = [];
                }
            } catch {
                this.#existingBoardElements = [];
            }
        } else {
            this.#existingBoardElements = [];
        }
    }

    /**
     * Getter for PCB options.
     */
    get option(): IPcbOptions {
        return this.#options;
    }

    /**
     * Getter for graphics lines (required by PcbGraphicsInstance interface).
     */
    get grLines(): IGrLine[] {
        return this.#grLines;
    }

    /**
     * Getter for graphics circles (required by PcbGraphicsInstance interface).
     */
    get grCircles(): IGrCircle[] {
        return this.#grCircles;
    }

    /**
     * Getter for graphics rectangles (required by PcbGraphicsInstance interface).
     */
    get grRects(): IGrRect[] {
        return this.#grRects;
    }

    /**
     * Getter for graphics polygons (required by PcbGraphicsInstance interface).
     */
    get grPolys(): IGrPoly[] {
        return this.#grPolys;
    }

    /**
     * Getter for staged outlines (required by PcbGraphicsInstance interface).
     */
    get stagedOutlines(): IOutline[] {
        return this.#stagedOutlines;
    }

    /**
     * Getter for filled zones.
     */
    get zones(): IFilledZone[] {
        return this.#zones;
    }

    /**
     * Getter for keepout zones.
     */
    get keepoutZones(): IKeepoutZone[] {
        return this.#keepoutZones;
    }

    /**
     * Getter for components.
     */
    get components(): Component[] {
        return this.#components;
    }

    /**
     * Getter for staged components.
     */
    get stagedComponents(): Component[] {
        return this.#stagedComponents;
    }

    /**
     * Getter for groups.
     */
    get groups(): string[] {
        return this.#groups;
    }

    /**
     * Getter for groups as Map (for footprint functions that expect Map).
     */
    get groupsAsMap(): Map<string, any> {
        // Convert string array to Map to match the interface expected by footprint functions
        const groupsMap = new Map<string, any>();
        this.#groups.forEach(groupString => {
            // Extract group name from string like '(group "groupName" (members ...))'
            const match = groupString.match(/^\(group\s+"([^"]+)"/);
            if (match) {
                groupsMap.set(match[1], groupString);
            }
        });
        return groupsMap;
    }

    /**
     * Getter for existing board elements.
     */
    get existingBoardElements(): unknown[] {
        return this.#existingBoardElements;
    }

    /**
     * Getter for grTexts.
     */
    get grTexts(): IGrTextOptions[] {
        return this.#grTexts;
    }

    
    /**
     * Getter for pcb string.
     */
    get pcb(): string {
        return this.#pcb;
    }

    /**
     * Getter for outlines_public.
     */
    get outlines_public(): IOutline[] {
        return this.#outlines;
    }

    /**
     * Getter for options.
     */
    get options(): IPcbOptions {
        return {
            ...this.#options,
            remove_orphans: this.#options.remove_orphans ?? true
        };
    }

    
    /**
     * Public resolveNet method that delegates to the private implementation.
     * This is needed for the extracted functions that expect a public resolveNet method.
     */
    resolveNet(
        componentReference: string,
        pinNumber: string,
        componentUuid?: string,
        boardNetNameToCodeMap?: Map<string, number>,
        fallbackNetName?: string
    ): INetResolution {
        return this.#resolveNet(componentReference, pinNumber, componentUuid, boardNetNameToCodeMap, fallbackNetName);
    }

    /**
     * Resolves the net assignment for a component pin or via.
     * Delegates to the standalone resolveNet function from pcb_net_resolver.ts.
     * @param componentReference - The reference designator of the component (e.g., "R1", "U1")
     * @param pinNumber - The pin number or name (e.g., "1", "2", "VCC")
     * @param componentUuid - Optional UUID for via lookup (used when componentReference represents a via)
     * @param boardNetNameToCodeMap - Map of existing board net names to their codes
     * @param fallbackNetName - Optional fallback net name if not found in schematic
     * @returns Net resolution result containing net code, name, and status
     * @private
     */
    #resolveNet(
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

    // ─── Internal Methods ────────────────────────────────────────────────
    // These methods are used by extracted modules (board creation, routing,
    // obstacle detection) and are NOT part of the public API. Do not call
    // these from consumer code — they may change without notice.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Actually adds a component to the board (internal use only).
     * @param component - Component to add to the board.
     * @private
     */
    #addComponentToBoard(component: Component) {
        if (component.dnp === true) {
            return;
        }

        // Simply add the component - no duplicate checking
        this.#components.push(component);
    }

    /**
     * Public accessor for addComponentToBoard functionality.
     * Used by extracted modules to add components to the board.
     * @param component - Component to add to the board.
     * @internal
     */
    _addComponentToBoardPublic(component: Component) {
        this.#addComponentToBoard(component);
    }

    /**
     * Public accessor for resolveNet functionality.
     * Used by extracted modules to resolve net assignments.
     * @internal
     */
    _resolveNetPublic(
        componentReference: string,
        pinNumber: string,
        componentUuid?: string,
        boardNetNameToCodeMap?: Map<string, number>,
        fallbackNetName?: string
    ): INetResolution {
        return this.#resolveNet(componentReference, pinNumber, componentUuid, boardNetNameToCodeMap, fallbackNetName);
    }

    /**
     * Public accessor for createFootprintNode functionality.
     * Used by extracted modules to create footprint nodes.
     * @internal
     */
    _createFootprintNodePublic(component: Component, boardNetNameToCodeMap?: Map<string, number>): any[] {
        return this.#_create_footprint_node(component, boardNetNameToCodeMap);
    }

    /**
     * Public accessor for updateFootprintNode functionality.
     * Used by extracted modules to update footprint nodes.
     * @internal
     */
    _updateFootprintNodePublic(node: any[], component: Component, boardNetNameToCodeMap?: Map<string, number>): any[] {
        return this.#_update_footprint_node(node, component, boardNetNameToCodeMap);
    }

    /**
     * Public method to clear components.
     * Used by extracted modules to reset components during board creation.
     * @internal
     */
    _clearComponents() {
        this.#components = [];
    }

    /**
     * Public method to clear outlines.
     * Used by extracted modules to reset outlines during board creation.
     * @internal
     */
    _clearOutlines() {
        this.#outlines = [];
    }

    /**
     * Public method to clear groups.
     * Used by extracted modules to reset groups during board creation.
     * @internal
     */
    _clearGroups() {
        this.#groups = [];
    }

    /**
     * Public method to set PCB content.
     * Used by extracted modules to set the PCB content.
     * @internal
     */
    _setPcb(content: string) {
        this.#pcb = content;
    }

    /**
     * Places components on the board.
     * @param components - List of components to place.
     */
    place(...components: Component[]) {
        components.forEach(component => {
            this.#unstageComponent(component);
            this.#addComponentToBoard(component);
        });
    }

    /**
     * Stage components so they're considered for routing/debug before full board creation.
     * @param components - Components to stage
     */
    stage(...components: Component[]) {
        components.forEach(component => {
            this.#stageComponent(component);
        });
    }

    /**
     * Internal helper to add component to staged list if not already present.
     * @private
     */
    #stageComponent(component?: Component) {
        if (!component || component.dnp === true) {
            return;
        }

        const uuid = component.uuid;
        if (this.#stagedComponents.some(existing => existing.uuid === uuid)) {
            return;
        }

        this.#stagedComponents.push(component);
    }

    /**
     * Internal helper to remove component from staged list once placed.
     * @private
     */
    #unstageComponent(component?: Component) {
        if (!component) {
            return;
        }

        const uuid = component.uuid;
        const index = this.#stagedComponents.findIndex(existing => existing.uuid === uuid);
        if (index !== -1) {
            this.#stagedComponents.splice(index, 1);
        }
    }

    /**
     * Groups components and/or elements from a TrackBuilder together on the board.
     * @param group_name - Name of the group.
     * @param items - A list of Component instances or TrackBuilder instances.
     */
    group(group_name: string, ...items: Array<Component | TrackBuilder>) {
        let uuid_list = '';
        const componentsToPlaceAndProcess: Component[] = [];

        items.forEach(item => {
            if (item && typeof item === 'object' && 'reference' in item) {
                componentsToPlaceAndProcess.push(item);
            } else if (item instanceof TrackBuilder) {
                const builderElements = item.getElements();
                builderElements.forEach(element => {
                    // UUIDs from TrackBuilder elements (tracks and vias) are added directly.
                    // Vias are already 'placed' by the builder. Tracks aren't 'placed' components.
                    uuid_list += `"${element.uuid}" `;
                });
            }
        });

        // Place all explicit components and process them
        if (componentsToPlaceAndProcess.length > 0) {
            this.place(...componentsToPlaceAndProcess); // Ensure components are registered, DNP handled etc.

            componentsToPlaceAndProcess.forEach((_component) => {
                if (_component.dnp === true) {
                    return;
                }
                uuid_list += `"${_component.uuid}" `;
                
                // Track group membership in the component
                if (!_component.groups.includes(group_name)) {
                    _component.groups.push(group_name);
                }
            });
        }

        const existingGroupIndex = this.#groups.findIndex(group =>
            group.startsWith(`(group "${group_name}"`)
        );

        const newGroupString = `(group "${group_name}" (members ${uuid_list}))`;

        if (existingGroupIndex !== -1) {
            this.#groups[existingGroupIndex] = newGroupString;
        } else {
            this.#groups.push(newGroupString);
        }
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
        const textElement: IGrTextOptions = {
            text: options.text,
            x: options.x + this.#currentOffset.x,
            y: options.y + this.#currentOffset.y,
            layer: options.layer || 'F.SilkS',
            width: options.width || 1.27,
            height: options.height || 1.27,
            thickness: options.thickness,
            rotation: options.rotation || 0,
            font: options.font,
            bold: options.bold,
            italic: options.italic,
            justify: options.justify,
            hide: options.hide,
            uuid: options.uuid || generateUuid()
        };

        this.#grTexts.push(textElement);
    }

    /**
     * Updates an existing footprint S-expression node with data from a component.
     * @param node The existing footprint S-expression node array.
     * @param component The component data to update with.
     * @param boardNetNameToCodeMap Map of existing board net names to their codes.
     * @returns The updated S-expression node array.
     * @private
     */
    #_update_footprint_node(node: any[], component: Component, boardNetNameToCodeMap?: Map<string, number>): any[] {
        return updateFootprintNode(node, component, this.#resolveNet.bind(this), boardNetNameToCodeMap);
    }

    /**
     * Creates a new footprint S-expression node from a component.
     * Reads the .kicad_mod file, parses it, and inserts component data.
     * @param component The component to create the node for.
     * @param boardNetNameToCodeMap Map of existing board net names to their codes.
     * @returns The new S-expression node array.
     * @throws Error if the .kicad_mod file is missing, empty, or parsing fails.
     * @private
     */
    #_create_footprint_node(component: Component, boardNetNameToCodeMap?: Map<string, number>): any[] {
        return createFootprintNode(component, this.#resolveNet.bind(this), boardNetNameToCodeMap);
    }

    async create(...items: Array<Component | TrackBuilder | Array<Component | TrackBuilder>>) {
        const finalItems = (items.length === 1 && Array.isArray(items[0])) ? items[0] : items;
        return createBoard(this, ...finalItems as Array<Component | TrackBuilder>);
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
        const viaPosition = { 
            x: (at?.x ?? 0) + this.#currentOffset.x, 
            y: (at?.y ?? 0) + this.#currentOffset.y 
        };

        const viaComponent = new Component({
            via: true,
            pcb: { x: viaPosition.x, y: viaPosition.y, rotation: 0, side: 'front' },
            viaData: {
                uuid: generateUuid(),
                at: viaPosition,
                size: size || 0.8,
                drill: drill || 0.4,
                layers: ["F.Cu", "B.Cu"], // Default layers
                net,
                powerInfo: powerInfo
            }
        });

        // Stage via components immediately so they're available for routing/visualization without create()
        this.stage(viaComponent);

        return viaComponent;
    }

    /**
     * Creates a filled zone on copper layers connected to a specific net.
     * For full documentation and examples, see {@link zone} in `pcb_zones.ts`.
     */
    zone(options: {
        // Net specification (required - one of these)
        pin?: any;
        net?: string;

        // Position and size (required)
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
            x: options.x + this.#currentOffset.x,
            y: options.y + this.#currentOffset.y
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
            x: options.x + this.#currentOffset.x,
            y: options.y + this.#currentOffset.y
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
            start: { x: options.start.x + this.#currentOffset.x, y: options.start.y + this.#currentOffset.y },
            end: { x: options.end.x + this.#currentOffset.x, y: options.end.y + this.#currentOffset.y }
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
            center: { x: options.center.x + this.#currentOffset.x, y: options.center.y + this.#currentOffset.y }
        };
        if (options.end) {
            modifiedOptions.end = { x: options.end.x + this.#currentOffset.x, y: options.end.y + this.#currentOffset.y };
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
        if (modifiedOptions.x !== undefined) modifiedOptions.x += this.#currentOffset.x;
        if (modifiedOptions.y !== undefined) modifiedOptions.y += this.#currentOffset.y;
        if (modifiedOptions.start) {
            modifiedOptions.start = { x: modifiedOptions.start.x + this.#currentOffset.x, y: modifiedOptions.start.y + this.#currentOffset.y };
        }
        if (modifiedOptions.end) {
            modifiedOptions.end = { x: modifiedOptions.end.x + this.#currentOffset.x, y: modifiedOptions.end.y + this.#currentOffset.y };
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
            points: options.points.map(p => ({ x: p.x + this.#currentOffset.x, y: p.y + this.#currentOffset.y }))
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
        pcbOutline(this, x + this.#currentOffset.x, y + this.#currentOffset.y, width, height, filletRadius, conceptualUuidFromUser);
    }

    // ─── Routing Internals ───────────────────────────────────────────────
    // Accessors used by routing/obstacle modules. NOT part of the public API.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Get staged outlines for obstacle detection during autorouting.
     * @internal Used by ObstacleBuilder to detect tracks from previous autoroute calls.
     */
    _getStagedOutlines(): IOutline[] {
        return _getStagedOutlines(this);
    }

    /**
     * Get keepout zones for obstacle detection during autorouting.
     * @internal Used by ObstacleBuilder to include keepout areas in the routing grid.
     */
    _getKeepoutZones(): IKeepoutZone[] {
        return this.#keepoutZones;
    }

    /**
     * Get active components on the PCB.
     * @internal Used by ObstacleBuilder to include components as obstacles.
     */
    _getComponents(): Component[] {
        return this.#components;
    }

    /**
     * Get staged components (placed but not yet created).
     * @internal Used by ObstacleBuilder to include staged components as obstacles.
     */
    _getStagedComponents(): Component[] {
        return this.#stagedComponents;
    }

    /**
     * @internal Remove staged outlines with specific UUIDs (used when reusing autoroute results in manual routes)
     */
    _removeStagedOutlinesByUuid(uuids: string[]): void {
        _removeStagedOutlinesByUuid(this, uuids);
    }

    /**
     * Create a low-level track segment. Used internally by TrackBuilder.
     * @internal
     */
    _track(start: { x: number, y: number }, end: { x: number, y: number }, width: number = 0.05, layer: string = "F.Cu", locked: boolean = false, uuid?: string, net?: string): string {
        const trackUuid = uuid || generateUuid();
        const offsetStart = { x: start.x + this.#currentOffset.x, y: start.y + this.#currentOffset.y };
        const offsetEnd = { x: end.x + this.#currentOffset.x, y: end.y + this.#currentOffset.y };

        // Create the line data structure
        const lineData: IGrLine = {
            type: 'line',
            uuid: trackUuid,
            layer: layer,
            strokeWidth: width,
            start: offsetStart,
            end: offsetEnd,
            locked: locked,
            net: net  // Store net for obstacle detection
        };

        // Always add new track to staged outlines
        this.#stagedOutlines.push({
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
     * Convert a Pin object to a string identifier in "component.pin" format.
     * @param pin - The Pin object to convert
     * @returns String identifier (e.g., "U1.5" or "R1.pad1")
     * @private
     */
    #_pinToIdentifier(pin: Pin): string {
        return pinToIdentifier(pin);
    }

    /**
     * Check if two pins represent the same pin (same component and pin number).
     * @param pin1 - First pin
     * @param pin2 - Second pin
     * @returns True if the pins match
     * @private
     */
    #_pinsMatch(pin1: Pin, pin2: Pin): boolean {
        return pinsMatch(pin1, pin2);
    }

    /**
     * Check if two connections match (order-independent).
     * @param conn1From - First connection from pin
     * @param conn1To - First connection to pin
     * @param conn2From - Second connection from pin
     * @param conn2To - Second connection to pin
     * @returns True if the connections represent the same connection
     * @private
     */
    #_connectionMatches(
        conn1From: Pin,
        conn1To: Pin,
        conn2From: Pin,
        conn2To: Pin
    ): boolean {
        return connectionMatches(conn1From, conn1To, conn2From, conn2To);
    }

    
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
        return await this.#autoroute(arg1 as IAutorouteOptions);
    }

    async #autoroute(options: IAutorouteOptions): Promise<IAutorouteResult> {
        // Track pending autoroutes so callers that write the board can wait for
        // any in-progress routing to complete (prevents writing the board
        // before async routing finishes).
        const task = Promise.resolve(autoroute(this, options));
        this.#pendingAutoroutes.add(task);
        try {
            return await task;
        } finally {
            this.#pendingAutoroutes.delete(task);
        }
    }

    /**
     * Wait for any pending autoroute operations initiated on this PCB instance.
     * This is useful to ensure the board file is written after routing completes.
     */
    async waitForPendingAutoroutes(): Promise<void> {
        if (this.#pendingAutoroutes.size === 0) return;
        await Promise.all(Array.from(this.#pendingAutoroutes));
    }


  
    /**
     * Check if a point lies on (or very near) a line segment, within a tolerance
     * derived from the segment width.
     * @private
     */
    #_pointOnLineSegment(
        p: { x: number; y: number },
        line: IGrLine,
        widthTol: number
    ): boolean {
        return pointOnLineSegment(p, line, widthTol);
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
        // Collect all components from both staged and active lists
        const allComponents: Component[] = [];

        if (this.#components) {
            allComponents.push(...this.#components);
        }

        if (this.#stagedComponents) {
            allComponents.push(...this.#stagedComponents);
        }

        // Add any additional components (e.g., from pins being routed)
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
     * Adds components to the associated schematic.
     * This is a pass-through to the Schematic.add() method.
     * @param components - Components to add to the schematic.
     */
    add(...components: Component[]): void {
        if (this.Schematic) {
            this.Schematic.add(...components);
        }
    }

    /**
     * Gets the actual track data for a given UUID, including any preserved manual edits.
     * @param uuid - The UUID of the track to retrieve
     * @returns The track data if found, null otherwise
     * @internal Used by TrackBuilder to retrieve deferred track data.
     */
    _getTrackData(uuid: string): IGrLine | null {
        // Look for the track in staged outlines
        for (const outline of this.#stagedOutlines) {
            if (outline.uuid === uuid && outline.elements.length === 1 && outline.elements[0].type === 'line') {
                return outline.elements[0] as IGrLine;
            }
        }
        return null;
    }

}
