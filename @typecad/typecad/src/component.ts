import fsexp from "fast-sexpr";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import S from "./utils/sexpr_instance.js";
import { prettyPrintSExpr } from './utils/sexpr_formatter.js';
import { KiCAD } from "./kicad.js";
import { Pin } from "./pin.js";
import chalk from 'chalk';
import { ReferenceCounter } from "./reference_counter.js";
import { IVia, ITextPositioning } from "./pcb/pcb_interfaces.js";
import { ComponentError } from "./errors.js";
import logger from "./logging.js";
import { inspectSource } from "./source_inspector.js";
import { upgradeFootprint, executeKiCADCommandSync } from "./kicad_commands.js";
import { getCallSite } from "./utils/stack_trace.js";



export const referenceCounter = new ReferenceCounter();

/** Lazy singleton KiCAD instance to avoid re-creating on every footprint/symbol lookup. */
let _cachedKiCAD: KiCAD | null = null;
function getKiCADInstance(): KiCAD {
    if (!_cachedKiCAD) {
        _cachedKiCAD = new KiCAD();
    }
    return _cachedKiCAD;
}



export interface IComponent {
    symbol?: string,
    reference?: string | ITextPositioning | [string | undefined | null, ITextPositioning] | undefined,
    value?: string | ITextPositioning | [string, ITextPositioning] | undefined,
    fab?: ITextPositioning | [string | undefined | null, ITextPositioning] | undefined,
    footprint?: string,
    prefix?: string, datasheet?: string, description?: string, voltage?: string,
    wattage?: string, uuid?: string, mpn?: string, dnp?: boolean,
    pcb?: { x: number, y: number, rotation?: number, side?: 'front' | 'back' }, pins?: Pin[], via?: boolean,
    simulation?: { include: boolean, model?: string }, sch?: { x: number, y: number, rotation: number },
    viaData?: IVia; // Added for components that are vias
    sourceInfo?: SourceInfo;
    text?: Array<{ property: string, text: string, x: number, y: number, rotation?: number, layer?: string, width?: number, height?: number, fontSize?: number, thickness?: number, bold?: boolean, italic?: boolean, justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean; }, show?: boolean }>;
}

export interface SourceInfo {
    file: string;
    line: number;
    variable?: string;
    params?: Record<string, unknown>; // Allows nested objects/arrays from AST
}

/**
 * Represents a component in an electronic circuit.
 * @property reference - Reference designator (e.g., R1) or a tuple with positioning info (e.g., ['U2', {x: 1, y: 1, rotation: 0}]).
 *                       When provided as a tuple, the positioning controls where the reference text appears in KiCad.
 * @property value - Component value (e.g., 1 kOhm) or a tuple with positioning info (e.g., ['10k', {x: 0, y: 5, rotation: 0}]).
 *                   When provided as a tuple, the positioning controls where the value text appears in KiCad.
 * @property footprint - Component footprint (e.g., Resistor_SMD:R_0603_1608Metric).
 * @property datasheet - Link to component datasheet.
 * @property description - Description of the component.
 * @property mpn - Manufacturer Part Number.
 * @property pcb - PCB placement details (x, y, rotation).
 * @property dnp - True if Do Not Place.
 * @property uuid - Unique identifier.
 * @property pins - Array of component pins.
 * @property via - True if the component is a via.
 * @property simulation - Simulation details.
 * @property sourceInfo - Source code location and instantiation details where the component was created, parsed via AST.
 *                          Includes file path, line number, variable name (if in declaration like `let r1 = new Component()`),
 *                          and fully structured parameters (supports nested objects/arrays from `{value: '10k', sim: {include: true}}`).
 */
export class Component {
    reference: string = '';
    value: string = '';
    footprint: string = '';
    datasheet: string = '';
    description: string = '';
    voltage: string = '';
    wattage: string = '';
    mpn: string = '';
    pcb: { x: number, y: number, rotation?: number, side?: 'front' | 'back' } = { x: 0, y: 0, rotation: 0, side: 'front' };
    dnp: boolean = false;
    #footprint_file?: string = '';
    #symbol_file?: string = '';
    pins: Pin[] = [];
    via: boolean = false;
    viaData?: IVia; // Added for components that are vias
    simulation: { include: boolean, model: string } = { include: false, model: '' };
    symbol?: string = '';
    sch: { x: number, y: number, rotation?: number } = { x: 0, y: 0, rotation: 0 };
    groups: string[] = []; // Track which groups this component belongs to
    sourceInfo?: SourceInfo;
    text: Array<{ property: string, text: string, x: number, y: number, rotation?: number, layer?: string, width?: number, height?: number, fontSize?: number, thickness?: number, bold?: boolean, italic?: boolean, justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean; }, show?: boolean }> = [];
    fab?: { text: string, x: number, y: number, rotation?: number, layer?: string, width?: number, height?: number, fontSize?: number, thickness?: number, bold?: boolean, italic?: boolean, justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean; }, show?: boolean };
    valueFootprint?: { x: number, y: number, rotation?: number, layer?: string, width?: number, height?: number, fontSize?: number, thickness?: number, bold?: boolean, italic?: boolean, justify?: { horizontal?: 'left' | 'right' | 'center'; vertical?: 'top' | 'bottom' | 'middle'; mirror?: boolean; }, show?: boolean };
    #isInitialized: boolean = false;
    // Private backing field for uuid
    #uuid: string = '';
    // Private flag to prevent recursion
    #gettingUuid: boolean = false;

    /**
     * Creates an instance of Component.
     * @param {IComponent} [options={}] - The component options.
     */
    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, via, uuid, simulation, symbol, sch, pcb, viaData, text, fab, dnp }: IComponent = {}) {
        this.captureSourceInfo();
        const { referenceStr, referencePositioning } = this.parseReference(reference, prefix);
        const { valueStr, valuePositioning } = this.parseValue(value);
        this.assignProperties({ footprint, datasheet, description, voltage, wattage, mpn, simulation, symbol, sch, pcb, via, viaData, text, reference, value });
        this.applyTextPositioning('Reference', referenceStr ?? this.reference, referencePositioning);
        this.applyTextPositioning('Value', valueStr ?? this.value, valuePositioning);
        if (valuePositioning) {
            this.valueFootprint = valuePositioning;
        }
        this.parseFab(fab);
        if (dnp != undefined) {
            this.dnp = dnp;
        }
        if (uuid != undefined) {
            this.#uuid = uuid;
        }
        this.#isInitialized = true;
    }

    private captureSourceInfo(): void {
        const callSite = this.getCallSiteForInstantiation();
        if (callSite) {
            this.sourceInfo = {
                file: callSite.file,
                line: callSite.line,
                variable: undefined,
                params: undefined
            };
            const inspection = inspectSource(callSite.file, callSite.line);
            if (inspection.variable) {
                this.sourceInfo!.variable = inspection.variable;
                this.sourceInfo!.params = inspection.params;
            }
        }
    }

    private parseReference(
        reference: IComponent['reference'],
        prefix: string | undefined
    ): { referenceStr: string | undefined; referencePositioning: ITextPositioning | undefined } {
        let referenceStr: string | undefined;
        let referencePositioning: ITextPositioning | undefined;

        if (reference != undefined) {
            if (Array.isArray(reference)) {
                const refString = reference[0];
                referencePositioning = reference[1];
                referenceStr = (refString && refString !== '') ? refString : undefined;
            } else if (typeof reference === 'object') {
                referencePositioning = reference;
            } else {
                referenceStr = reference;
            }

            if (referenceStr != undefined && referenceStr !== '') {
                this.reference = referenceStr;
                const referencePattern = /^[A-Za-z]+\d+$/;
                if (!referencePattern.test(referenceStr)) {
                    throw new ComponentError(`[${referenceStr}, undefined, undefined] Reference designator must match the format {prefix}{number} (e.g. R1, U3)`);
                }
                if (!referenceCounter.setReference(referenceStr)) {
                    this.reference = referenceCounter.getNextReference(prefix || 'U');
                    logger.warn(chalk.whiteBright.bgYellow(`🚩  renaming ${referenceStr} to ${this.reference}`));
                }
            } else {
                this.reference = referenceCounter.getNextReference(prefix || 'U');
            }
        } else {
            this.reference = referenceCounter.getNextReference(prefix || 'U');
        }

        return { referenceStr, referencePositioning };
    }

    private parseValue(value: IComponent['value']): { valueStr: string | undefined; valuePositioning: ITextPositioning | undefined } {
        let valueStr: string | undefined;
        let valuePositioning: ITextPositioning | undefined;

        if (value != undefined) {
            if (Array.isArray(value)) {
                valueStr = value[0];
                valuePositioning = value[1];
            } else if (typeof value === 'object') {
                valuePositioning = value;
                valueStr = '';
            } else {
                valueStr = value;
            }
            if (valueStr !== undefined) {
                this.value = valueStr;
            }
        }

        return { valueStr, valuePositioning };
    }

    private assignProperties(props: {
        footprint?: string; datasheet?: string; description?: string; voltage?: string;
        wattage?: string; mpn?: string; simulation?: { include?: boolean; model?: string };
        symbol?: string; sch?: { x: number; y: number; rotation?: number; side?: 'front' | 'back' };
        pcb?: { x: number; y: number; rotation?: number; side?: 'front' | 'back' };
        via?: boolean; viaData?: IVia;
        text?: IComponent['text'];
        reference?: IComponent['reference'];
        value?: IComponent['value'];
    }): void {
        if (props.footprint != undefined) {
            if (props.footprint && !props.footprint.includes(':')) {
                throw new ComponentError(`[${props.reference || 'Unknown'}, ${props.value || 'Unknown'}, ${props.footprint}] Footprint must be in format "library:footprint" (e.g., "Resistor_SMD:R_0603_1608Metric" or "lib:Local_Footprint"))`);
            }
            this.footprint = props.footprint;
        }
        if (props.datasheet != undefined) this.datasheet = props.datasheet;
        if (props.description != undefined) this.description = props.description;
        if (props.voltage != undefined) this.voltage = props.voltage;
        if (props.wattage != undefined) this.wattage = props.wattage;
        if (props.symbol != undefined) this.symbol = props.symbol;
        if (props.sch != undefined) this.sch = props.sch;
        if (props.pcb != undefined) this.pcb = props.pcb;
        if (props.mpn != undefined) this.mpn = props.mpn;
        if (props.simulation != undefined) this.simulation = { include: props.simulation.include, model: props.simulation.model || '' };
        this.via = props.via || false;
        if (props.viaData) this.viaData = props.viaData;
        if (props.text != undefined) this.text = props.text;
    }

    private applyTextPositioning(property: 'Reference' | 'Value', text: string, positioning: ITextPositioning | undefined): void {
        if (!positioning) return;

        const entry = {
            property,
            text,
            x: positioning.x,
            y: positioning.y,
            rotation: positioning.rotation,
            layer: positioning.layer,
            width: positioning.width,
            height: positioning.height,
            fontSize: positioning.fontSize,
            thickness: positioning.thickness,
            bold: positioning.bold,
            italic: positioning.italic,
            justify: positioning.justify,
            show: positioning.show
        };

        const existingIndex = this.text.findIndex(t => t.property === property);
        if (existingIndex >= 0) {
            this.text[existingIndex] = entry;
        } else {
            this.text.push(entry);
        }
    }

    private parseFab(fab: IComponent['fab']): void {
        if (fab == undefined) return;

        let fabText: string;
        let fabPositioning: ITextPositioning;

        if (Array.isArray(fab)) {
            fabText = fab[0] || '${REFERENCE}';
            if (!fabText || fabText === '') fabText = '${REFERENCE}';
            fabPositioning = fab[1];
        } else {
            fabText = '${REFERENCE}';
            fabPositioning = fab;
        }

        this.fab = {
            text: fabText,
            x: fabPositioning.x,
            y: fabPositioning.y,
            rotation: fabPositioning.rotation,
            layer: fabPositioning.layer,
            width: fabPositioning.width,
            height: fabPositioning.height,
            fontSize: fabPositioning.fontSize,
            thickness: fabPositioning.thickness,
            bold: fabPositioning.bold,
            italic: fabPositioning.italic,
            justify: fabPositioning.justify,
            show: fabPositioning.show
        };
    }



    /**
     * Get the call site information with a more targeted approach to find the exact line
     * where the component was instantiated, not just the class definition.
     * @returns Call site info or null if not found
     */
    private getCallSiteForInstantiation(): { file: string; line: number; column: number; function: string } | null {
        const callSite = getCallSite();
        if (!callSite) {
            return null;
        }

        return {
            ...callSite,
            function: callSite.function || 'anonymous'
        };
    }

    /**
     * Get the UUID for this component. If not explicitly set, it will be generated
     * consistently based on component properties.
     */
    get uuid(): string {
        // If uuid is not set yet and the component is fully initialized,
        // get it from the registry
        if (this.#uuid === '' && this.#isInitialized) {
            // Prevent circular dependency by checking if we're already in the process of getting a UUID
            if (this.#gettingUuid) {
                return randomUUID(); // Fallback to random UUID to break recursion
            }
            
            try {
                this.#gettingUuid = true;
                // Fallback to a random UUID if component registry is not available
                this.#uuid = randomUUID();
            } finally {
                this.#gettingUuid = false;
            }
        }
        return this.#uuid;
    }

    /**
     * Set the UUID for this component
     */
    set uuid(value: string) {
        this.#uuid = value;
    }

    /**
     * Returns a {@link Pin} object from the component.
     * @param number - The pin number or identifier.
     * @returns The pin object.
     */
    pin(number: number | string): Pin {
        if (typeof number !== 'number' && typeof number !== 'string') {
            throw new ComponentError(`Pin number must be a number or a string`);
        }
        // Ensure pin number is a string for consistent comparisons later if needed
        const pinNumberStr = String(number);

        const existingPin = this.pins.find(pin => pin.number === pinNumberStr);
        if (existingPin) {
            // Ensure existing pin also has the uuid if it was added before this logic
            if (!existingPin.uuid) {
                existingPin.uuid = this.uuid;
            }
            return existingPin;
        }

        const newPin = new Pin(this.reference, pinNumberStr, undefined, this);
        // Add the component's UUID directly to the Pin object
        // This makes it accessible for lookups like p.uuid in pcb.ts
        newPin.uuid = this.uuid; 
        this.pins.push(newPin);
        return newPin;
    }

    /**
     * Check if this component belongs to a specific group.
     * @param groupName - The name of the group to check.
     * @returns True if the component is in the specified group.
     */
    isInGroup(groupName: string): boolean {
        return this.groups.includes(groupName);
    }

    /**
     * Get all groups this component belongs to.
     * @returns Array of group names this component is a member of.
     */
    getGroups(): string[] {
        return [...this.groups]; // Return a copy to prevent external modification
    }

    /**
     * Retrieves the footprint library for the component.
     * Used internally to manage footprint files.
     * 
     * @param {string} footprint - The footprint identifier
     * @returns {string} - The serialized footprint data
     * @ignore
     */
    footprint_lib(footprint: string): string {
        // if we already found this footprint, return it before doing anything
        if (this.#footprint_file != '') return this.#footprint_file!;

        let footprint_file_contents = "";
        const footprint_file_name = footprint.split(":");
        let kicad_footprint: string = '';

        // Get library paths based on installation type
        const kicad = getKiCADInstance();
        const libraryPaths = kicad.getLibraryPaths();
        kicad_footprint = libraryPaths.footprints;

        try {
            // First try to find the footprint in the system library
            if (kicad_footprint && fs.existsSync(`${kicad_footprint}/${footprint_file_name[0]}.pretty/${footprint_file_name[1]}.kicad_mod`)) {
                footprint_file_contents = fs.readFileSync(
                    `${kicad_footprint}/${footprint_file_name[0]}.pretty/${footprint_file_name[1]}.kicad_mod`,
                    "utf8"
                );
            } else {
                // if the footprint is in this folder, it came from elsewhere and might be an older format
                // run kicad-cli to fix/upgrade the footprint using the wrapper
                try {
                    executeKiCADCommandSync('fp', ['upgrade', '--output', './build/lib/footprints/', './build/lib/footprints/'], { stdio: 'ignore' });
                } catch (e) {
                    // Footprint upgrade is best-effort; KiCad may not be installed or the footprint may already be current
                    if (process.env.TYPECAD_DEBUG === '1') {
                        logger.warn('[typeCAD] Footprint upgrade failed:', e instanceof Error ? e.message : String(e));
                    }
                }

                // Check if the file exists in the build directory before trying to read it
                const buildFootprintPath = `./build/lib/footprints/${footprint_file_name[1]}.kicad_mod`;
                if (!fs.existsSync(buildFootprintPath)) {
                    throw new ComponentError(`Footprint file not found: ${buildFootprintPath}. Is the .kicad_mod missing or empty in build/footprints/? Footprint must be in format "library:footprint" (e.g., "Resistor_SMD:R_0603_1608Metric" or "lib:Local_Footprint")`);
                }

                footprint_file_contents = fs.readFileSync(buildFootprintPath, "utf8");
            }

            footprint_file_contents = footprint_file_contents.replaceAll('"', "`");

            const l = fsexp(footprint_file_contents).pop();

            // some footprints have a 'module' instead of 'footprint'
            if (l[0] == 'module') {
                l[0] = 'footprint'
            }
            // Serialize the structure with pretty printing
            const serialized = S.serialize(l).replaceAll("`", '"');
            this.#footprint_file = prettyPrintSExpr(serialized);

        } catch (err: any) {
            // Instead of just logging the error, throw it so it can be properly handled
            // by the calling context (e.g., pcb.create)
            const errorMessage = err.message || 'Unknown error occurred while loading footprint';
            throw new ComponentError(`[${this.reference || 'Unknown'}, ${this.value || 'Unknown'}, ${footprint}] ${errorMessage}`);
        }

        if (this.#footprint_file == '') {
            throw new ComponentError(`[${this.reference || 'Unknown'}, ${this.value || 'Unknown'}, ${footprint}] Failed to load footprint. Footprint file is empty or invalid.`);
        }

        return this.#footprint_file!;
    }

    /**
     * Load a schematic symbol from the library
     * @param {string} symbol - The symbol identifier in format "library:symbol" (e.g., "Device:R_Small")
     * @returns {string} - The symbol data or empty string if not found
     * @ignore
     */
    symbol_lib(symbol: string): string {
        // if we already found this symbol, return it before doing anything
        if (this.#symbol_file != '') return this.#symbol_file!;

        const symbol_parts = symbol.split(":");
        if (symbol_parts.length !== 2) {
            logger.warn(`Invalid symbol format: ${symbol}. Expected format "library:symbol"`);
            return '';
        }

        const [library, symbol_name] = symbol_parts;
        let symbol_file_contents = "";

        // Get library paths based on installation type
        const kicad = getKiCADInstance();
        const libraryPaths = kicad.getLibraryPaths();
        const kicad_symbols = libraryPaths.symbols;

        try {
            // First try to find the symbol in the system library
            if (kicad_symbols && fs.existsSync(`${kicad_symbols}/${library}.kicad_sym`)) {
                const library_content = fs.readFileSync(`${kicad_symbols}/${library}.kicad_sym`, "utf8");

                // Parse the library file and extract the specific symbol
                const parsed = fsexp(library_content);
                for (const item of parsed) {
                    if (Array.isArray(item) && item[0] === 'symbol' && item[1] === symbol_name) {
                        symbol_file_contents = S.serialize(item);
                        break;
                    }
                }
            }

            // If not found in system library, try build directory
            if (symbol_file_contents === '') {
                const buildSymbolPath = `./build/lib/symbols/${symbol_name}.kicad_sym`;
                if (fs.existsSync(buildSymbolPath)) {
                    symbol_file_contents = fs.readFileSync(buildSymbolPath, "utf8");
                }
            }

            if (symbol_file_contents !== '') {
                this.#symbol_file = symbol_file_contents;
            }

        } catch (err: any) {
            logger.warn(`Failed to load symbol ${symbol}: ${err.message}`);
        }

        return this.#symbol_file || '';
    }




}
