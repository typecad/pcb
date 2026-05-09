import { Component } from "../component.js";
import { Schematic } from "../schematic.js";
import logger from "../logging.js";
import {
    IPcbOptions,
    INetResolution,
    IAutorouteOptions,
    IAutorouteResult,
    IOutline,
    IGrLine,
    IGrArc,
    IGrCircle,
    IGrRect,
    IGrPoly,
    IGrTextOptions,
    IFilledZone,
    IKeepoutZone
} from "./pcb_interfaces.js";
import { TrackBuilder } from "./pcb_track_builder.js";

/**
 * Typed interface for the PCB board context used by extracted board creation,
 * zone management, and autorouting modules.
 *
 * Replaces the `pcb: any` anti-pattern with a fully typed contract, enabling
 * the extracted functions to work without depending on the full PCB class.
 */
export interface IPcbBoardContext {
    // ==================== Core Identity ====================
    readonly Boardname: string;

    // ==================== Associated Modules ====================
    readonly Schematic: Schematic | undefined;
    readonly options: IPcbOptions;

    // ==================== Existing Board State ====================
    readonly existingBoardElements: unknown[];

    // ==================== Component Collections ====================
    readonly components: Component[];
    readonly stagedComponents: Component[];

    // ==================== Outline/Track Collections ====================
    /** Staged outlines (mutable - can be filtered/reassigned by extracted modules) */
    stagedOutlines: IOutline[];
    readonly outlines_public: IOutline[];

    // ==================== Group State ====================
    readonly groups: string[];

    // ==================== Graphical Elements ====================
    readonly grLines: IGrLine[];
    readonly grCircles: IGrCircle[];
    readonly grRects: IGrRect[];
    readonly grPolys: IGrPoly[];
    readonly grTexts: IGrTextOptions[];

    // ==================== Zone Collections ====================
    readonly zones: IFilledZone[];
    readonly keepoutZones: IKeepoutZone[];

    // ==================== Mutable Output Buffers ====================
    outlines: IOutline[];
    tracks: IOutline[];

    // ==================== Final PCB Output ====================
    readonly pcb: string;

    // ==================== Board Properties ====================
    /** Copper thickness in microns */
    readonly copper_thickness: number;

    // ==================== Internal Accessors ====================
    /** Get staged outlines as an array (method form for compatibility) */
    _getStagedOutlines(): IOutline[];

    /** Remove staged outlines matching the given UUIDs */
    _removeStagedOutlinesByUuid(uuids: string[]): void;

    /** Get all components (including internal/staged) */
    _getComponents(): Component[];

    /** Get staged components */
    _getStagedComponents(): Component[];

    // ==================== Track Operations ====================
    /** Create a TrackBuilder for manual routing */
    track(opts: { locked?: boolean; net?: string; deferStaging?: boolean; debug?: boolean }): TrackBuilder;

    /** Stage a track element directly onto the board */
    _track(start: { x: number; y: number }, end: { x: number; y: number }, width: number, layer: string, locked: boolean, uuid: string, net?: string): void;

    // ==================== Routing ====================
    /** Route a connection or named net */
    route(options: IAutorouteOptions): Promise<IAutorouteResult>;

    // ==================== Collection Management ====================
    /** Clear all components from the board state */
    _clearComponents(): void;

    /** Clear all outlines from the board state */
    _clearOutlines(): void;

    /** Clear all groups from the board state */
    _clearGroups(): void;

    /** Add a component to the internal component collection */
    _addComponentToBoardPublic(component: Component): void;

    // ==================== Footprint Node Operations ====================
    /**
     * Create a KiCad footprint s-expression node for a component.
     * @param component - The component to create a footprint for
     * @param boardNetNameToCodeMap - Optional map of board net names to net codes
     * @returns The s-expression node array for the footprint
     */
    _createFootprintNodePublic(component: Component, boardNetNameToCodeMap?: Map<string, number>): any[];

    /**
     * Update an existing KiCad footprint s-expression node with current component data.
     * @param node - The existing s-expression node to update
     * @param component - The component with updated data
     * @param boardNetNameToCodeMap - Optional map of board net names to net codes
     * @returns The updated s-expression node array
     */
    _updateFootprintNodePublic(node: any[], component: Component, boardNetNameToCodeMap?: Map<string, number>): any[];

    // ==================== Net Resolution ====================
    /**
     * Resolve a net assignment for a component pin or via.
     * @param componentReference - Reference designator (e.g., "R1", "U1")
     * @param pinNumber - Pin number or name (e.g., "1", "VCC")
     * @param componentUuid - Optional UUID for via lookup
     * @param boardNetNameToCodeMap - Optional map of board net names to net codes
     * @param fallbackNetName - Optional fallback net name if not found in schematic
     * @returns Net resolution result with code, name, and status
     */
    _resolveNetPublic(
        componentReference: string,
        pinNumber: string,
        componentUuid?: string,
        boardNetNameToCodeMap?: Map<string, number>,
        fallbackNetName?: string
    ): INetResolution;

    /**
     * Public net resolution method (same as _resolveNetPublic but named differently
     * for API compatibility).
     */
    resolveNet(
        componentReference: string,
        pinNumber: string,
        componentUuid?: string,
        boardNetNameToCodeMap?: Map<string, number>,
        fallbackNetName?: string
    ): INetResolution;

    // ==================== Output Management ====================
    /** Set the final serialized PCB output string */
    _setPcb(content: string): void;

    // ==================== Utilities ====================
    /** Get the call site info for error reporting */
    getCallSite(): { file: string; line: number; column: number } | undefined;

    /** Pretty-print an s-expression string */
    prettyPrintSExpr(sexpr: string): string;
}

/**
 * Default logger instance used by board context operations.
 * Re-exported for convenience so extracted modules don't need separate imports.
 */
export { logger };
