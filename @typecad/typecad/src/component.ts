import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { KiCAD } from "./kicad.js";
import { Pin } from "./pin.js";
import chalk from 'chalk';
import { ReferenceCounter } from "./reference_counter.js";
import { IVia, ITextPositioning } from "./pcb/pcb_interfaces.js";
import { ComponentError } from "./errors.js";
import logger from "./logging.js";
import { inspectSource } from "./source_inspector.js";
import { getCallSite } from "./utils/stack_trace.js";
import { LIBRARY_SEPARATOR } from './constants.js';
import {
    parseTextOrPositioning,
    applyTextPositioning,
    parseFab,
} from './component_text.js';
import type {
    TextOrPositioning,
    TextPositioning,
    TextWithPositioning,
    TextEntry,
    FabEntry,
} from './component_text.js';
import { loadFootprintLib } from './component_footprint_loader.js';
import { loadSymbolLib } from './component_symbol_loader.js';

export type { TextOrPositioning, TextPositioning, TextWithPositioning, TextEntry, FabEntry };
export { parseTextOrPositioning };

export interface ITypeHalInfo {
    boardPackage?: string;
    driver?: string;
    role?: string;
    config?: Record<string, unknown>;
    pinLookup?: Record<string, string>;
}

export interface IComponent {
    symbol?: string,
    reference?: TextOrPositioning,
    value?: TextOrPositioning,
    fab?: TextPositioning | TextWithPositioning,
    footprint?: string,
    prefix?: string, datasheet?: string, description?: string, voltage?: string,
    wattage?: string, uuid?: string, mpn?: string, dnp?: boolean,
    pcb?: { x: number, y: number, rotation?: number, side?: 'front' | 'back' }, pins?: Pin[], via?: boolean,
    simulation?: { include: boolean, model?: string }, sch?: { x: number, y: number, rotation: number },
    viaData?: IVia;
    sourceInfo?: SourceInfo;
    typehal?: ITypeHalInfo;
    text?: TextEntry[];
}

export interface SourceInfo {
    file: string;
    line: number;
    variable?: string;
    params?: Record<string, unknown>;
    isThis?: boolean;
}

export class Component {
    private static _activeCounter: ReferenceCounter | null = null;
    private static _defaultCounter: ReferenceCounter | null = null;

    static setActiveCounter(counter: ReferenceCounter | null): void {
        Component._activeCounter = counter;
    }

    static getActiveCounter(): ReferenceCounter {
        if (Component._activeCounter) return Component._activeCounter;
        if (!Component._defaultCounter) {
            Component._defaultCounter = new ReferenceCounter();
        }
        return Component._defaultCounter;
    }

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
    viaData?: IVia;
    simulation: { include: boolean, model: string } = { include: false, model: '' };
    symbol?: string = '';
    sch: { x: number, y: number, rotation?: number } = { x: 0, y: 0, rotation: 0 };
    groups: string[] = [];
    sourceInfo?: SourceInfo;
    typehal?: ITypeHalInfo;
    text: TextEntry[] = [];
    fab?: FabEntry;
    valueFootprint?: ITextPositioning;
    #isInitialized: boolean = false;
    #uuid: string = '';

    constructor({ reference, value, footprint, prefix, datasheet, description, voltage, wattage, mpn, via, uuid, simulation, symbol, sch, pcb, viaData, text, fab, dnp, typehal }: IComponent = {}) {
        this.captureSourceInfo();
        const counter = Component.getActiveCounter();
        const { referenceStr, referencePositioning } = this.parseReference(reference, prefix, counter);
        const { valueStr, valuePositioning } = this.parseValue(value);
        this.assignProperties({ footprint, datasheet, description, voltage, wattage, mpn, simulation, symbol, sch, pcb, via, viaData, text, reference, value });
        applyTextPositioning(this.text, 'Reference', referenceStr ?? this.reference, referencePositioning);
        applyTextPositioning(this.text, 'Value', valueStr ?? this.value, valuePositioning);
        if (valuePositioning) {
            this.valueFootprint = valuePositioning;
        }
        this.fab = parseFab(fab);
        if (dnp !== undefined) {
            this.dnp = dnp;
        }
        if (uuid !== undefined) {
            this.#uuid = uuid;
        }
        if (typehal !== undefined) {
            this.typehal = typehal;
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
                params: undefined,
                isThis: undefined
            };
            const inspection = inspectSource(callSite.file, callSite.line);
            if (inspection.variable) {
                this.sourceInfo!.variable = inspection.variable;
                this.sourceInfo!.params = inspection.params;
                this.sourceInfo!.isThis = inspection.isThis;
            }
        }
    }

    private parseReference(
        reference: IComponent['reference'],
        prefix: string | undefined,
        counter: ReferenceCounter
    ): { referenceStr: string | undefined; referencePositioning: ITextPositioning | undefined } {
        const { text, positioning } = parseTextOrPositioning(reference);

        if (text !== undefined && text !== '') {
            this.reference = text;
            const referencePattern = /^[A-Za-z]+\d+$/;
            if (!referencePattern.test(text)) {
                throw new ComponentError(`[${text}, undefined, undefined] Reference designator must match the format {prefix}{number} (e.g. R1, U3)`);
            }
            if (!counter.setReference(text)) {
                this.reference = counter.getNextReference(prefix || 'U');
                logger.warn(chalk.whiteBright.bgYellow(`🚩  renaming ${text} to ${this.reference}`));
            }
        } else if (reference !== undefined) {
            this.reference = counter.getNextReference(prefix || 'U');
        } else {
            this.reference = counter.getNextReference(prefix || 'U');
        }

        return { referenceStr: text, referencePositioning: positioning };
    }

    private parseValue(value: IComponent['value']): { valueStr: string | undefined; valuePositioning: ITextPositioning | undefined } {
        const { text, positioning } = parseTextOrPositioning(value);
        if (text !== undefined) {
            this.value = text;
        } else if (value !== undefined && positioning !== undefined) {
            this.value = '';
        }
        return { valueStr: text, valuePositioning: positioning };
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
        if (props.footprint !== undefined) {
            if (props.footprint && !props.footprint.includes(LIBRARY_SEPARATOR)) {
                throw new ComponentError(`[${props.reference || 'Unknown'}, ${props.value || 'Unknown'}, ${props.footprint}] Footprint must be in format "library${LIBRARY_SEPARATOR}footprint" (e.g., "Resistor_SMD${LIBRARY_SEPARATOR}R_0603_1608Metric" or "lib${LIBRARY_SEPARATOR}Local_Footprint"))`);
            }
            this.footprint = props.footprint;
        }
        if (props.datasheet !== undefined) this.datasheet = props.datasheet;
        if (props.description !== undefined) this.description = props.description;
        if (props.voltage !== undefined) this.voltage = props.voltage;
        if (props.wattage !== undefined) this.wattage = props.wattage;
        if (props.symbol !== undefined) this.symbol = props.symbol;
        if (props.sch !== undefined) this.sch = props.sch;
        if (props.pcb !== undefined) this.pcb = props.pcb;
        if (props.mpn !== undefined) this.mpn = props.mpn;
        if (props.simulation !== undefined) this.simulation = { include: props.simulation.include ?? false, model: props.simulation.model || '' };
        this.via = props.via || false;
        if (props.viaData) this.viaData = props.viaData;
        if (props.text !== undefined) this.text = props.text;
    }

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

    get uuid(): string {
        if (this.#uuid === '' && this.#isInitialized) {
            this.#uuid = randomUUID();
        }
        return this.#uuid;
    }

    set uuid(value: string) {
        this.#uuid = value;
    }

    get footprintHash(): string {
        const str = `${this.footprint || ''}:${this.reference || ''}`;
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    pin(number: number | string): Pin {
        if (typeof number !== 'number' && typeof number !== 'string') {
            throw new ComponentError(`Pin number must be a number or a string`);
        }
        const pinNumberStr = String(number);

        const existingPin = this.pins.find(pin => pin.number === pinNumberStr);
        if (existingPin) {
            if (!existingPin.uuid) {
                existingPin.uuid = this.uuid;
            }
            return existingPin;
        }

        const newPin = new Pin(this.reference, pinNumberStr, undefined, this);
        newPin.uuid = this.uuid;
        this.pins.push(newPin);
        return newPin;
    }

    isInGroup(groupName: string): boolean {
        return this.groups.includes(groupName);
    }

    getGroups(): string[] {
        return [...this.groups];
    }

    footprint_lib(footprint: string): string {
        const result = loadFootprintLib(footprint, this.reference, this.value, this.#footprint_file);
        this.#footprint_file = result;
        return result;
    }

    symbol_lib(symbol: string): string {
        const result = loadSymbolLib(symbol, this.reference, this.value, this.#symbol_file);
        this.#symbol_file = result;
        return result;
    }
}
