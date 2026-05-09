import { Component, IComponent } from "./component.js";
import { Pin } from "./pin.js";
import fs from "node:fs";
import Handlebars from "handlebars";
import chalk from 'chalk';
import logger from './logging.js';
import { erc } from "./erc.js";
import { randomUUID, UUID } from "node:crypto";
import { createRequire } from "node:module";
import { TypeCadError } from "./errors.js";
const require = createRequire(import.meta.url);
const pkg = require("../package.json");

type PendingTypecadSummary = {
    sheetName: string;
    netPath: string;
    projectTree?: string;
    schPath?: string;
    boardFilePath?: string;
    printed: boolean;
    hookInstalled: boolean;
};

let pendingTypecadSummary: PendingTypecadSummary | undefined;

export function setPendingSchematicPath(schPath: string): void {
    if (pendingTypecadSummary) {
        pendingTypecadSummary.schPath = schPath;
    }
}

export function setPendingBoardFilePath(boardFilePath: string): void {
    if (pendingTypecadSummary) {
        pendingTypecadSummary.boardFilePath = boardFilePath;
    }
}

function setPendingTypecadOutputSummary(sheetName: string, netPath: string, projectTree?: string): void {
    if (!pendingTypecadSummary) {
        pendingTypecadSummary = {
            sheetName,
            netPath,
            projectTree,
            printed: false,
            hookInstalled: false
        };
    } else {
        pendingTypecadSummary.sheetName = sheetName;
        pendingTypecadSummary.netPath = netPath;
        if (projectTree) pendingTypecadSummary.projectTree = projectTree;
    }

    if (!pendingTypecadSummary.hookInstalled) {
        pendingTypecadSummary.hookInstalled = true;
        process.once('beforeExit', () => {
            // If no PCB was ever written, print a net-only summary at the end.
            printTypecadOutputSummary();
        });
    }
}

export function printTypecadOutputSummary(boardFilePath?: string): boolean {
    if (!pendingTypecadSummary || pendingTypecadSummary.printed) return false;

    if (pendingTypecadSummary.projectTree) {
        logger.log(pendingTypecadSummary.projectTree);
    }

    logger.log('🏁 ' + chalk.whiteBright.bold('type') + 'CAD finished');
    logger.log('└── 📝 Output');
    logger.log('    └── ' + chalk.green(pendingTypecadSummary.netPath));
    
    const finalBoardFilePath = boardFilePath || pendingTypecadSummary.boardFilePath;
    if (finalBoardFilePath) {
        logger.log('    └── ' + chalk.green(finalBoardFilePath));
    }
    if (pendingTypecadSummary.schPath) {
        logger.log('    └── ' + chalk.green(pendingTypecadSummary.schPath));
    }

    pendingTypecadSummary.printed = true;
    return true;
}

// Version reads dynamically from package.json via createRequire (was hardcoded "0.0.30").
let schematic_template = `(export (version "E")
  (design
    (tool "typeCAD ${pkg.version}"))
  (components
    {{#each components}}
    {{this}}
    {{/each}})
  (nets
  {{#each nets}}
    {{this}}
    {{/each}}
))
`;

// Field templates: added missing space between ) and value quote — was producing
// (field (name "Datasheet")"value") instead of (field (name "Datasheet") "value").
// Also normalized Voltage/Wattage/MPN from unescaped " to escaped \" for consistency.
let comp_template = `(comp
      (ref \"{{reference}}\")
        (value \"{{value}}\")
        (footprint \"{{footprint}}\")
        (fields
        {{#if footprint}}
          (field (name \"Footprint\") \"{{footprint}}\")
        {{/if}}
        {{#if datasheet}}
          (field (name \"Datasheet\") \"{{datasheet}}\")
        {{/if}}
        {{#if description}}
          (field (name \"Description\") \"{{description}}\")
        {{/if}}
        {{#if voltage}}
          (field (name \"Voltage\") \"{{voltage}}\")
        {{/if}}
        {{#if wattage}}
          (field (name \"Wattage\") \"{{wattage}}\")
        {{/if}}
        {{#if mpn}}
          (field (name \"MPN\") \"{{mpn}}\")
        {{/if}}
        )
    )`;

let nets_template = `{{#each nets}}
(net (code "{{code}}") (name "{{name}}")
{{#each nodes}}
        (node (ref "{{this.reference}}") (pin "{{this.number}}") (pintype "{{this.type}}"))
{{/each}}
)
{{/each}}`;



/**
 * Type representing available BOM fields.
 */
export type BomField = 
    | 'Reference'
    | 'Value'
    | 'Datasheet'
    | 'Footprint'
    | 'MPN'
    | 'Description'
    | 'Voltage'
    | 'Wattage';

/**
 * Interface representing Schematic options.
 * 
 * @interface ISchematicOptions
 * @property {string} net_prefix - Prefix for auto-generated net names. Defaults to 'net'.
 * @property {BomField[]} bom_fields - Fields to include in BOM. Defaults to ['Reference', 'Value', 'Datasheet', 'Footprint', 'MPN'].
 * @property {string} bom_separator - Separator for BOM CSV. Defaults to ','.
 */
export interface ISchematicOptions {
    net_prefix: string;
    bom_fields: BomField[];
    bom_separator: string;
}

/**
 * Simple description of a single pin connection on a net.
 */
export interface INetConnectionInfo {
    reference: string;
    pin: number | string;
    type: string;
}

/**
 * Metadata describing a schematic net so it can be reused elsewhere.
 */
export interface ISchematicNetDefinition {
    name: string;
    code: number;
    pins: Pin[];
    connections: INetConnectionInfo[];
}

/**
 * The main class for typeCAD. Holds all {@link Component} classes, creates work files, and creates nets.
 *
 * @export
 * @class Schematic
 * @typedef {Schematic}
 */
export class Schematic {
    components: Component[] = [];
    /** @deprecated Use `components` instead. Kept for backward compatibility. */
    get Components(): Component[] { return this.components; }
    /** @deprecated Use `components` instead. Kept for backward compatibility. */
    set Components(value: Component[]) { this.components = value; }
    Sheetname: string = '';
    uuid: UUID = randomUUID();
    private sxexp_components: string[] = [];
    private sxexp_nets: string[] = [];
    private code_counter = 0;
    Nodes: { name: string, code: number, nodes: Pin[], owner: Component | null }[] = [];
    merged_nets: { old_name: string, merged_to_number: number}[] = [];
    private _chained_name: string = '';
    #options: ISchematicOptions = {
        net_prefix: 'net',
        bom_fields: ['Reference', 'Value', 'Datasheet', 'Footprint', 'MPN'],
        bom_separator: ','
    };
    #groupedComponents: Map<string, Component[]> = new Map();

    /**
     * Getter for Schematic options.
     * 
     * @example
     * ```ts
     * let schematic = new Schematic('sheetname');
     * schematic.option.safe_write = false;
     * schematic.option.build_dir = './custom_build/';
     * ```
     */
    get option(): ISchematicOptions {
        return this.#options;
    }

    /**
     * Used internally
     * @ignore
     */
    private _storeNetParams(name: string, code: number, ...nodes: Pin[]) {
        this.Nodes.push({ name, code, nodes, owner: null });
    }

    /**
     * Builds a consumable representation of a schematic net.
     */
    private _buildNetDefinition(name: string, fallbackPins: Pin[]): ISchematicNetDefinition {
        const schematicNode = this.Nodes.find((node) => node.name === name);
        const pins = (schematicNode?.nodes ?? fallbackPins).filter((pin): pin is Pin => Boolean(pin));
        const definition: ISchematicNetDefinition = {
            name: schematicNode?.name ?? name,
            code: schematicNode?.code ?? this.code_counter,
            pins: [...pins],
            connections: pins.map((pin) => ({
                reference: pin.reference,
                pin: pin.number,
                type: pin.type || 'unspecified'
            }))
        };

        return definition;
    }

    bom(output_folder?: string): boolean {
        let bom: string = '';
        let _output_folder = output_folder || './build';

        // Create header from configured fields
        bom += this.#options.bom_fields.join(this.#options.bom_separator) + '\n';
        
        // Filter out VIA components (pattern: VIA followed by numbers, case insensitive)
        const viaPattern = /^VIA\d+$/i;
        
        this.components.forEach(component => {
            // Skip components with reference designators matching VIA pattern
            if (component.reference && viaPattern.test(component.reference)) {
                return; // Skip this component
            }
            
            const fields = this.#options.bom_fields.map(field => {
                switch(field.toLowerCase()) {
                    case 'reference': return component.reference;
                    case 'value': return component.value;
                    case 'datasheet': return component.datasheet;
                    case 'footprint': return component.footprint;
                    case 'mpn': return component.mpn;
                    case 'description': return component.description;
                    case 'voltage': return component.voltage;
                    case 'wattage': return component.wattage;
                    default: return '';
                }
            });
            bom += fields.join(this.#options.bom_separator) + '\n';
        });

        try {
            fs.writeFileSync(`${_output_folder}/${this.Sheetname}.csv`, bom);
            logger.log(chalk.cyan.bold(`${_output_folder}/${this.Sheetname}.csv`) + ` BOM written`);
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
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
        components.forEach(component => {
            if (component.dnp === true) {
                return;
            }
            this.components.push(component);
            let template = Handlebars.compile(comp_template);
            let comp_data: IComponent = { reference: component.reference, value: component.value, footprint: component.footprint };
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
            let _comp = template(comp_data);
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
     * @param {{pins: Pin[]}} pins: Pin[]}
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
        this._chained_name = name;
        return this;
    }

    /**
     * Connects a group of pins together.
     *
     * @param {...Pin[]} pins - Pins to connect.
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
    net(...pins: Pin[]): ISchematicNetDefinition {
        this.code_counter++;

        // make a net name using configured prefix
        let node_name = this._chained_name ? this._chained_name : `${this.#options.net_prefix}${this.code_counter}`;

        // check each pin in each node to see if a pin is connected somewhere else
        // if so, merge the nets by making their names the same
        pins.forEach((pin) => {
            if (!(pin instanceof Pin)) {
                this.error(`Invalid object passed to net(). Expected Pin, received ${typeof pin}`);
            }
            this.Nodes.forEach((netParam, index) => {
                netParam.nodes.forEach((netParamPin) => {
                    if (netParamPin.reference === pin.reference && netParamPin.number === pin.number) {
                        // Determine which name to keep - prefer named nets over auto-generated ones
                        const currentIsNamed = !node_name.startsWith('net');
                        const existingIsNamed = !netParam.name.startsWith('net');
                        
                        let finalNetName: string;
                        let mergedNetInfo: { old_name: string, merged_to_number: number };
                        
                        if (currentIsNamed && !existingIsNamed) {
                            // Current net has a name, existing is auto-generated - keep current name
                            finalNetName = node_name;
                            mergedNetInfo = { old_name: netParam.name, merged_to_number: this.code_counter };
                            
                            // Update the existing net's name to the meaningful one
                            this.Nodes[index].name = finalNetName;

                        } else if (!currentIsNamed && existingIsNamed) {
                            // Current net is auto-generated, existing has a name - keep existing name
                            finalNetName = netParam.name;
                            mergedNetInfo = { old_name: node_name, merged_to_number: this.Nodes[index].code };

                        } else {
                            // Both are named or both are auto-generated - use existing behavior
                            finalNetName = netParam.name;
                            mergedNetInfo = { old_name: node_name, merged_to_number: this.Nodes[index].code };

                        }
                        
                        this.merged_nets.push(mergedNetInfo);
                        node_name = finalNetName;
                    }
                });
            });
        });

        // store the node
        this._storeNetParams(node_name, this.code_counter, ...pins);

        // Check for duplicate node names and merge them
        let nodeMap: { [key: string]: { name: string, code: number, nodes: Pin[], owner: Component | null } } = {};
        this.Nodes.forEach((node) => {
            if (nodeMap[node.name]) {
                nodeMap[node.name].nodes.push(...node.nodes);
            } else {
                nodeMap[node.name] = { ...node, nodes: [...node.nodes] };
            }
        });

        // remove duplicate pins
        Object.values(nodeMap).forEach((node) => {
            node.nodes = node.nodes.filter((pin, index, self) =>
                index === self.findIndex((p) => (
                    p && pin && p.reference === pin.reference && p.number === pin.number
                ))
            );
        });

        const definition = this._buildNetDefinition(node_name, pins);
        return definition;
    }

    /**
     * Used internally
     * @ignore
    */
    private make_sexp_net() {
        // create the entire net list sexp from the netNodes array
        let template = Handlebars.compile(nets_template);
        let _nets = template({ nets: this.Nodes });

        this.sxexp_nets.push(_nets);
    }

    /**
     * Creates schematic files.
     *
     * @param {...Component[]} components - All the components to be included in the schematic.
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

        const projectTree = this.buildProjectTree();

        this.make_sexp_net();
        let template = Handlebars.compile(schematic_template, { noEscape: true });
        let schematic_data = { components: this.sxexp_components, nets: this.sxexp_nets };
        let _schematic = template(schematic_data);

        try {
            const netPath = `./build/${this.Sheetname}.net`;
            fs.mkdirSync('./build', { recursive: true });
            fs.writeFileSync(netPath, _schematic);
            setPendingTypecadOutputSummary(this.Sheetname, netPath, projectTree);
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

    private getComponentIcon(component: Component): string {
        if (component.via) return '🕳️ ';
        if (component.reference?.startsWith('C')) return '🪫 ';
        if (component.reference?.startsWith('R')) return '💈';
        if (component.reference?.startsWith('L')) return '🌀';
        if (component.reference?.startsWith('SW')) return '🔳 ';
        if (component.reference?.startsWith('LED')) return '🚨 ';
        if (component.reference?.startsWith('D')) return '🔺 ';
        if (component.reference?.startsWith('U')) return '칩';
        if (component.reference?.startsWith('F')) return '🔗 ';
        if (component.reference?.startsWith('J')) return '🔌 ';
        if (component.reference?.startsWith('TP')) return '🎯 ';
        if (component.reference?.startsWith('Y')) return '💎 ';
        return '◼️ ';
    }

    private formatComponentDisplay(component: Component): string {
        const icon = this.getComponentIcon(component);
        let display = `${icon} ${component.reference}`;
        
        if (component.value) {
            display += `: ${component.value}`;
        }
        
        if (component.description) {
            display += ` (${component.description})`;
        }

        if (component.via) {
            const netName = this.Nodes.find(net => 
                net.nodes.some(pin => pin.uuid === component.uuid)
            )?.name;
            if (netName) {
                display += ` (Net: '${netName}')`;
            }
        }

        return display;
    }

    private buildProjectTree(): string {
        const lines: string[] = [];
        lines.push(chalk.green.bold(' ╦ ') + chalk.whiteBright.bold('type') + 'CAD Project: ' + chalk.whiteBright.bold(this.Sheetname));
        lines.push('└── 📂 Groups');

        const sortedGroups = Array.from(this.#groupedComponents.keys()).sort();

        sortedGroups.forEach((group, groupIndex) => {
            const components = this.#groupedComponents.get(group) || [];
            const isLastGroup = groupIndex === sortedGroups.length - 1;
            const groupPrefix = isLastGroup ? '    └── ' : '    ├── ';

            lines.push(`${groupPrefix}📦 ${group}`);

            components.forEach((component, compIndex) => {
                const isLastComponent = compIndex === components.length - 1;
                const compPrefix = isLastGroup ? '        ' : '    │   ';
                const compConnector = isLastComponent ? '└── ' : '├── ';
                lines.push(`${compPrefix}${compConnector}${this.formatComponentDisplay(component)}`);
            });
        });

        return lines.join('\n') + '\n';
    }
}
