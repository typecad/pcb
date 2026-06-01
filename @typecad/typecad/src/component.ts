import { randomUUID } from "node:crypto";
import { Pin } from "./pin.js";
import chalk from 'chalk';
import { ReferenceCounter } from "./utils/reference_counter.js";
import { IVia } from "./pcb/pcb_interfaces.js";
import { ComponentError } from "./utils/errors.js";
import logger from "./utils/logging.js";
import { inspectSource } from "./utils/source_inspector.js";
import { getCallSite } from "./utils/stack_trace.js";
import { validateFinite } from "./utils/numeric_validation.js";
import { LIBRARY_SEPARATOR } from './utils/constants.js';
import {
    parseTextOrPositioning,
    parseFab,
} from './pcb/component_text.js';
import type {
    TextOrPositioning,
    TextPositioning,
    TextWithPositioning,
    TextEntry,
    FabEntry,
    FabLayout,
} from './pcb/component_text.js';
import type { ITextPositioning } from './pcb/pcb_interfaces.js';
import { loadFootprintLib } from './pcb/component_footprint_loader.js';
import { loadSymbolLib } from './renderers/component_symbol_loader.js';

const defaultCounter = new ReferenceCounter();
const pendingInspections: Set<Promise<void>> = new Set();

export function awaitPendingInspections(): Promise<void> {
    return Promise.all(Array.from(pendingInspections)).then(() => {});
}

export type { TextOrPositioning, TextPositioning, TextWithPositioning, TextEntry, FabEntry, FabLayout };
export { parseTextOrPositioning };

export interface ITypeHalInfo {
    boardPackage?: string;
    driver?: string;
    role?: string;
    config?: Record<string, unknown>;
    pinLookup?: Record<string, string>;
}

export interface SourceInfo {
    file: string;
    line: number;
    variable?: string;
    params?: Record<string, unknown>;
    isThis?: boolean;
}

export interface ComponentInit {
    footprint?: string;
    reference?: string;
    prefix?: string;
    value?: string;
    via?: boolean;
    viaData?: IVia;
    uuid?: string;
    pcb?: { x: number; y: number; rotation?: number; side?: 'front' | 'back' };
    sch?: { x: number; y: number; rotation?: number };
    simulation?: { include: boolean; model?: string };
    symbol?: string;
    sourceInfo?: SourceInfo;
    typehal?: ITypeHalInfo;
    datasheet?: string;
    description?: string;
    voltage?: string;
    wattage?: string;
    mpn?: string;
    dnp?: boolean;
    fab?: TextPositioning | TextWithPositioning;
    text?: TextEntry[];
    referenceLayout?: ITextPositioning;
    valueLayout?: ITextPositioning;
    fabLayout?: FabLayout;
}

/** @deprecated Use `ComponentInit` instead. */
export type IComponent = ComponentInit;

export class Component {
    #ref: string = '';
    #prefix: string = '';
    #refLocked: boolean = false;
    #committed: boolean = false;
    #footprint: string = '';
    #value: string = '';
    #datasheet: string = '';
    #description: string = '';
    #voltage: string = '';
    #wattage: string = '';
    #mpn: string = '';
    #symbol: string = '';
    pcb: { x: number, y: number, rotation?: number, side?: 'front' | 'back' } = { x: 0, y: 0, rotation: 0, side: 'front' };
    dnp: boolean = false;
    via: boolean = false;
    viaData: IVia | undefined = undefined;
    simulation: { include: boolean, model?: string } = { include: false };
    sch: { x: number, y: number, rotation?: number } = { x: 0, y: 0, rotation: 0 };
    /** @internal */
    groups: string[] = [];
    /** @internal */
    sourceInfo?: SourceInfo;
    /** @internal */
    typehal?: ITypeHalInfo;
    text: TextEntry[] = [];
    fab: FabEntry | undefined = undefined;
    referenceLayout: ITextPositioning | undefined = undefined;
    valueLayout: ITextPositioning | undefined = undefined;
    #fabLayout: FabLayout | undefined = undefined;
    get fabLayout(): FabLayout | undefined { return this.#fabLayout; }
    set fabLayout(value: FabLayout | undefined) {
        this.#fabLayout = value;
        if (value) {
            this.fab = {
                text: value.text || '${REFERENCE}',
                x: value.x,
                y: value.y,
                rotation: value.rotation,
                layer: value.layer,
                width: value.width,
                height: value.height,
                fontSize: value.fontSize,
                thickness: value.thickness,
                bold: value.bold,
                italic: value.italic,
                justify: value.justify,
                show: value.show,
            };
        } else {
            this.fab = undefined;
        }
    }
    /** @internal */
    valueFootprint?: import('./pcb/pcb_interfaces.js').ITextPositioning;
    /** @internal */
    pins: Pin[] = [];
    #pinMap: Map<string, Pin> = new Map();
    #footprint_file?: string = '';
    #symbol_file?: string = '';
    #isInitialized: boolean = false;
    #uuid: string = '';

    get footprint(): string { return this.#footprint; }
    set footprint(value: string) {
        if (this.#committed && value !== this.#footprint) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing footprint on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#footprint = value;
    }

    get value(): string { return this.#value; }
    set value(v: string) {
        if (this.#committed && v !== this.#value) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing value on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#value = v;
    }

    get datasheet(): string { return this.#datasheet; }
    set datasheet(v: string) {
        if (this.#committed && v !== this.#datasheet) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing datasheet on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#datasheet = v;
    }

    get description(): string { return this.#description; }
    set description(v: string) {
        if (this.#committed && v !== this.#description) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing description on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#description = v;
    }

    get voltage(): string { return this.#voltage; }
    set voltage(v: string) {
        if (this.#committed && v !== this.#voltage) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing voltage on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#voltage = v;
    }

    get wattage(): string { return this.#wattage; }
    set wattage(v: string) {
        if (this.#committed && v !== this.#wattage) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing wattage on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#wattage = v;
    }

    get mpn(): string { return this.#mpn; }
    set mpn(v: string) {
        if (this.#committed && v !== this.#mpn) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing mpn on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#mpn = v;
    }

    get symbol(): string { return this.#symbol; }
    set symbol(v: string) {
        if (this.#committed && v !== this.#symbol) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  Changing symbol on "${this.#ref}" after it was added to a schematic/PCB. Changes may not take effect.`));
        }
        this.#symbol = v;
    }

    get reference(): string {
        if (!this.#ref && this.#isInitialized) {
            this.#ref = defaultCounter.getNextReference(this.#prefix || this.#inferPrefix());
            this.#refLocked = true;
        }
        return this.#ref;
    }

    set reference(value: string) {
        this.#ref = value;
        this.#refLocked = true;
        if (value && this.#isInitialized) {
            if (!/\d/.test(value)) {
                logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  reference="${value}" has no number suffix. KiCad requires references like "R1", "C2", "U3".`));
            }
            defaultCounter.setReference(value);
        }
    }

    set prefix(value: string) {
        if (this.#refLocked) {
            const refPrefix = this.#ref.match(/^[A-Za-z]+/)?.[0] ?? '';
            if (refPrefix && refPrefix !== value) {
                logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  prefix="${value}" conflicts with reference="${this.#ref}". Set prefix before reference.`));
            } else {
                logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  prefix="${value}" has no effect \u2014 reference is already set to "${this.#ref}".`));
            }
            return;
        }
        this.#prefix = value;
    }

    constructor(footprint: string | ComponentInit) {
        this.captureSourceInfo();
        if (typeof footprint !== 'string') {
            const init = footprint as Partial<ComponentInit>;
            const fp = init.footprint ?? '';
            if (fp && !fp.includes(LIBRARY_SEPARATOR)) {
                throw new ComponentError(`[${fp}] Footprint must be in format "library${LIBRARY_SEPARATOR}footprint"`);
            }
            this.#footprint = fp;
            this.#applyInit(init);
            this.#isInitialized = true;
            if (init.reference) defaultCounter.setReference(init.reference);
            return;
        }
        if (footprint && !footprint.includes(LIBRARY_SEPARATOR)) {
            throw new ComponentError(`[${footprint}] Footprint must be in format "library${LIBRARY_SEPARATOR}footprint" (e.g., "Resistor_SMD${LIBRARY_SEPARATOR}R_0603_1608Metric")`);
        }
        this.#footprint = footprint;
        this.#isInitialized = true;
    }

    #applyInit(init: ComponentInit): void {
        if (init.prefix) this.#prefix = init.prefix;
        if (init.reference) this.#ref = init.reference;
        if (init.value !== undefined) this.#value = init.value;
        if (init.symbol) this.#symbol = init.symbol;
        if (init.datasheet) this.#datasheet = init.datasheet;
        if (init.description) this.#description = init.description;
        if (init.voltage) this.#voltage = init.voltage;
        if (init.wattage) this.#wattage = init.wattage;
        if (init.mpn) this.#mpn = init.mpn;
        if (init.dnp !== undefined) this.dnp = init.dnp;
        if (init.pcb) {
            validateFinite(init.pcb.x, 'pcb.x');
            validateFinite(init.pcb.y, 'pcb.y');
            if (init.pcb.rotation !== undefined) validateFinite(init.pcb.rotation, 'pcb.rotation');
            this.pcb = init.pcb;
        }
        if (init.sch) this.sch = init.sch;
        if (init.via) this.via = init.via;
        if (init.viaData) this.viaData = init.viaData;
        if (init.simulation) this.simulation = { include: init.simulation.include, model: init.simulation.model ?? '' };
        if (init.uuid) this.#uuid = init.uuid;
        if (init.fab) this.fab = parseFab(init.fab);
        if (init.text) this.text = init.text;
        if (init.referenceLayout) this.referenceLayout = init.referenceLayout;
        if (init.valueLayout) this.valueLayout = init.valueLayout;
        if (init.fabLayout) this.fabLayout = init.fabLayout;
        if (init.typehal) this.typehal = init.typehal;
        if (init.sourceInfo) this.sourceInfo = init.sourceInfo;
    }

    static via(at: { x: number; y: number }, options?: { size?: number; drill?: number }): Component {
        const viaUuid = randomUUID();
        return Component._create({
            via: true,
            prefix: 'V',
            uuid: viaUuid,
            footprint: '',
            pcb: { x: at.x, y: at.y, rotation: 0, side: 'front' },
            viaData: {
                uuid: viaUuid,
                at,
                size: options?.size ?? 0.8,
                drill: options?.drill ?? 0.4,
                layers: ['F.Cu', 'B.Cu'],
            }
        });
    }

    /** @internal */
    static _create(init: ComponentInit): Component {
        const c = new Component(init.footprint ?? '');
        c.#applyInit(init);
        return c;
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
            const inspectionPromise = inspectSource(callSite.file, callSite.line).then((inspection) => {
                if (inspection.variable) {
                    this.sourceInfo!.variable = inspection.variable;
                    this.sourceInfo!.params = inspection.params;
                    this.sourceInfo!.isThis = inspection.isThis;
                }
            }).catch((e: unknown) => logger.debug('Source inspection failed:', String(e))).finally(() => {
                pendingInspections.delete(inspectionPromise);
            });
            pendingInspections.add(inspectionPromise);
        }
    }

    /** @internal */
    registerReference(counter: ReferenceCounter): boolean {
        const ref = this.reference;
        if (!counter.setReference(ref)) {
            const newRef = counter.getNextReference(this.#prefix || this.#inferPrefix());
            logger.warn(chalk.whiteBright.bgYellow(`\u{1F6A9}  renaming ${ref} to ${newRef}`));
            this.#ref = newRef;
        }
        if (!this.#footprint && !this.via) {
            logger.warn(chalk.whiteBright.bgYellow(`\u26A0\uFE0F  "${ref}" has no footprint. It will not appear in the output.`));
        }
        this.#committed = true;
        return true;
    }

    #inferPrefix(): string {
        const fp = this.#footprint;
        if (!fp) return 'U';
        const parts = fp.split(LIBRARY_SEPARATOR);
        const name = parts[parts.length - 1] || parts[0];
        const match = name.match(/^([A-Za-z]+)/);
        if (match) {
            const prefix = match[1].charAt(0).toUpperCase();
            if (['R', 'C', 'L', 'D', 'Q', 'U', 'J', 'F', 'T', 'Y', 'S', 'K'].includes(prefix)) {
                return prefix;
            }
        }
        return 'U';
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

    /** @internal */
    get footprintFingerprint(): string {
        const str = `${this.#footprint || ''}:${this.reference || ''}`;
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    pin(number: number | string, config?: { type?: Pin['type']; powerInfo?: import('./pcb/pcb_interfaces.js').IPinPowerInfo }): Pin {
        if (typeof number !== 'number' && typeof number !== 'string') {
            throw new ComponentError(`Pin number must be a number or a string`);
        }
        const pinNumberStr = String(number);

        const existingPin = this.#pinMap.get(pinNumberStr);
        if (existingPin) {
            if (config?.type) existingPin.type = config.type;
            if (config?.powerInfo) existingPin.powerInfo = config.powerInfo;
            if (!existingPin.uuid) {
                existingPin.uuid = this.uuid;
            }
            return existingPin;
        }

        const newPin = new Pin(this.reference, pinNumberStr, config?.type);
        newPin.owner = this;
        newPin.uuid = this.uuid;
        if (config?.powerInfo) newPin.powerInfo = config.powerInfo;
        this.pins.push(newPin);
        this.#pinMap.set(pinNumberStr, newPin);
        return newPin;
    }

    #isInGroup(groupName: string): boolean {
        return this.groups.includes(groupName);
    }

    /** @internal */
    getGroups(): string[] {
        return [...this.groups];
    }

    #registerPin(pin: Pin): void {
        if (this.#pinMap.has(pin.number)) return;
        this.#pinMap.set(pin.number, pin);
        if (!this.pins.includes(pin)) {
            this.pins.push(pin);
        }
    }

    /** @internal */
    footprint_lib(footprint: string): string {
        const result = loadFootprintLib(footprint, this.reference, this.value, this.#footprint_file);
        this.#footprint_file = result;
        return result;
    }

    #symbolLib(symbol: string): string {
        const result = loadSymbolLib(symbol, this.reference, this.value, this.#symbol_file);
        this.#symbol_file = result;
        return result;
    }
}
