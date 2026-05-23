import { Component, IComponent } from "./component.js";
import { Pin } from "./pin.js";
import fs from "node:fs";
import chalk from 'chalk';
import logger from './logging.js';
import { erc } from "./erc.js";
import { randomUUID, UUID } from "node:crypto";
import { TypeCadError } from "./errors.js";
import { ReferenceCounter } from "./reference_counter.js";
import type { ISchematicNode } from "./types/schematic_types.js";
import { buildProjectTree } from "./project_tree.js";
import { generateBom } from "./bom_generator.js";
import { renderComp, renderNetlist } from "./renderers/sexp_renderers.js";
import { NetManager } from './net_manager.js';
import type { ISchematicNetDefinition } from './net_manager.js';
import {
    setActiveSummaryHost,
    setupPendingSummary,
    setPendingSchematicPath as _setPendingSchematicPath,
    setPendingBoardFilePath as _setPendingBoardFilePath,
    printTypecadOutputSummary as _printTypecadOutputSummary,
} from "./pending_summary.js";
import type { IPendingSummaryHost, PendingTypecadSummary } from "./pending_summary.js";

export { _setPendingSchematicPath as setPendingSchematicPath };
export { _setPendingBoardFilePath as setPendingBoardFilePath };
export { _printTypecadOutputSummary as printTypecadOutputSummary };

export type BomField =
    | 'Reference'
    | 'Value'
    | 'Datasheet'
    | 'Footprint'
    | 'MPN'
    | 'Description'
    | 'Voltage'
    | 'Wattage';

export interface ISchematicOptions {
    net_prefix: string;
    bom_fields: BomField[];
    bom_separator: string;
}

/** @deprecated Import from net_manager.ts instead */
export type { ISchematicNetDefinition } from './net_manager.js';
/** @deprecated Import from net_manager.ts instead */
export type { INetConnectionInfo } from './net_manager.js';

/**
 * The main class for typeCAD. Holds all {@link Component} classes, creates work files, and creates nets.
 *
 * @class Schematic
 * @typedef {Schematic}
 */
export class Schematic implements IPendingSummaryHost {
    components: Component[] = [];
    /** @deprecated Use `components` instead. Kept for backward compatibility. */
    get Components(): Component[] { return this.components; }
    /** @deprecated Use `components` instead. Kept for backward compatibility. */
    set Components(value: Component[]) { this.components = value; }
    Sheetname: string = '';
    uuid: UUID = randomUUID();
    private sxexp_components: string[] = [];
    readonly referenceCounter = new ReferenceCounter();
    private netManager: NetManager;
    #options: ISchematicOptions = {
        net_prefix: 'net',
        bom_fields: ['Reference', 'Value', 'Datasheet', 'Footprint', 'MPN'],
        bom_separator: ','
    };
    #groupedComponents: Map<string, Component[]> = new Map();
    #pendingSummary: PendingTypecadSummary | undefined;

    pendingSummaryData() { return this.#pendingSummary; }
    setPendingSummaryData(data: PendingTypecadSummary | undefined) { this.#pendingSummary = data; }

    get Nodes(): ISchematicNode[] { return this.netManager.Nodes; }
    set Nodes(val: ISchematicNode[]) { this.netManager.Nodes = val; }

    get merged_nets() { return this.netManager.merged_nets; }

    get option(): ISchematicOptions {
        return this.#options;
    }

    bom(output_folder?: string): boolean {
        return generateBom(this.components, this.Sheetname, this.#options, output_folder);
    }

    /**
     * Initializes a new schematic with a given sheet name.
     *
     * @param {string} Sheetname - Name and filename of generated files.
     * @example
     * ```ts
     * let typecad = new Schematic('sheetname');
     * ```
     */
    constructor(Sheetname: string) {
        this.Sheetname = Sheetname;
        this.netManager = new NetManager(this.#options.net_prefix);
    }

    /**
     * Adds components to the schematic.
     *
     * @param {...Component[]} components - Components to add to the schematic.
     * @example
     * ```ts
     * let typecad = new Schematic('sheetname');
     * let r1 = new Component({});
     * let r2 = new Component({});
     * typecad.add(r1, r2);
     * ```
     */
    add(...components: Component[]) {
        // Activate this schematic's counter so any components created
        // downstream (e.g. via Package) are scoped to this schematic.
        Component.setActiveCounter(this.referenceCounter);
        try {
        components.forEach(component => {
            if (component.dnp === true) {
                return;
            }
            // Register the reference in this schematic's counter (handles
            // components created before add() was called).
            this.referenceCounter.setReference(component.reference);
            this.components.push(component);
            const comp_data: IComponent = { reference: component.reference, value: component.value, footprint: component.footprint };
            if (component.wattage) {
                comp_data.wattage = component.wattage;
            }
            if (component.voltage) {
                comp_data.voltage = component.voltage;
            }
            if (component.datasheet) {
                comp_data.datasheet = component.datasheet;
            }
            if (component.description) {
                comp_data.description = component.description;
            }
            if (component.mpn) {
                comp_data.mpn = component.mpn;
            }
            const _comp = renderComp(comp_data);
            this.sxexp_components.push(_comp);

            // Track components by group
            const groups = component.getGroups();
            if (groups.length > 0) {
                groups.forEach(group => {
                    if (!this.#groupedComponents.has(group)) {
                        this.#groupedComponents.set(group, []);
                    }
                    this.#groupedComponents.get(group)?.push(component);
                });
            } else {
                // Add to default group if no groups specified
                if (!this.#groupedComponents.has('Project')) {
                    this.#groupedComponents.set('Project', []);
                }
                this.#groupedComponents.get('Project')?.push(component);
            }

        });
        } finally {
            Component.setActiveCounter(null);
        }
    }

    /**
     * Adds a no-connection flag to a pin.
     *
     * @param {...Pin[]} pins - Pins to mark as no-connect.
     * @example
     * ```ts
     * let typecad = new Schematic('sheetname');
     * let r1 = new Resistor({ symbol: "Device:R_Small", reference: 'R1' });
     * typecad.dnc(r1.pin(1));
     * ```
     */
    dnc(...pins: Pin[]) {
        pins.forEach((pin) => {
            pin.type = 'no_connect';
            this.net(pin)
        });
    }

    /**
     * Sets a name for a net.
     *
     * @param {string} name - The name of the net.
     * @example
     * ```ts
     * let typecad = new Schematic('sheetname');
     * let r1 = new Component({});
     * let r2 = new Component({});
     * 
     * // named net
     * typecad.named('vin').net(r1.pin(1), r2.pin(1));
     * 
     * // unnamed net
     * typecad.net(r1.pin(1), r2.pin(1));
     * ```
     */
    named(name: string) {
        this.netManager.setChainedName(name);
        return this;
    }

    net(...pins: Pin[]): ISchematicNetDefinition {
        return this.netManager.addNet(pins);
    }

    /**
     * Creates schematic files.
     *
     * @param {...Component[]} component - All the components to be included in the schematic.
     * @example
     * ```ts
     * let typecad = new Schematic('sheetname');
     * let r1 = new Component({});
     * let r2 = new Component({});
     * typecad.create(r1, r2);
     * ```
     */
    create(...component: Component[]) {
        component.forEach((component) => {
            this.add(component);
        });

        const projectTree = buildProjectTree(this.#groupedComponents, this.Nodes, this.Sheetname);

        const _nets = this.netManager.renderNets();
        const _schematic = renderNetlist({ components: this.sxexp_components, nets: [_nets] });

        try {
            const netPath = `./build/${this.Sheetname}.net`;
            fs.mkdirSync('./build', { recursive: true });
            fs.writeFileSync(netPath, _schematic);
            setActiveSummaryHost(this);
            setupPendingSummary(this, this.Sheetname, netPath, projectTree);
        } catch (err) {
            throw new TypeCadError(`Failed to write schematic file: ${(err as Error).message}`);
        }
    }

    /**
     * Performs electrical rule checks.
     */
    erc() {
        erc(this);
    }

    /**
     * Logs an error message and exits.
     *
     * @param {string} error - The error message to log.
     */
    error(error: string) {
        throw new TypeCadError(error);
    }

    /**
     * Logs a warning message.
     *
     * @param {string} warning - The warning message to log.
     */
    warn(warning: string) {
        logger.log(chalk.bgYellow(`WARN:`) +  chalk.bold(` ${warning}`));
    }

}
