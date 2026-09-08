import { Component, type ComponentInit } from './component.js';
import { Pin } from './pin.js';
import fs from 'node:fs';
import chalk from 'chalk';
import logger from './utils/logging.js';
import { UUID } from 'node:crypto';
import { TypeCadError } from './utils/errors.js';
import { ReferenceCounter } from './utils/reference_counter.js';
import { deterministicUUID } from './utils/deterministic_id.js';
import type { ISchematicNode } from './types/schematic_types.js';
import { buildProjectTree } from './cli/project_tree.js';
import { generateBom } from './renderers/bom-generator.js';
import { renderComp, renderNetlist } from './renderers/sexp_renderers.js';
import { NetManager } from './net_manager.js';
import type { ISchematicNetDefinition } from './net_manager.js';
import { setActiveSummaryHost, setupPendingSummary } from './cli/pending_summary.js';
import type { IPendingSummaryHost, PendingTypecadSummary } from './cli/pending_summary.js';
import type { Power } from './buses.js';
import { SimulationContext } from './simulation/ngspice.js';
import { DEFAULT_BUILD_DIR } from './utils/constants.js';

export type BomField =
  'Reference' | 'Value' | 'Datasheet' | 'Footprint' | 'MPN' | 'Description' | 'Voltage' | 'Wattage';

export interface ISchematicOptions {
  net_prefix: string;
  bom_fields: BomField[];
  bom_separator: string;
}

function validateSheetName(name: string): void {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new TypeCadError(`Invalid sheet name '${name}': must not contain path traversal characters (.., /, \\)`);
  }
  if (name.trim() !== name) {
    throw new TypeCadError(`Invalid sheet name '${name}': must not have leading/trailing whitespace`);
  }
}

export class Schematic {
  /** @internal */
  components: Component[] = [];
  sheetName: string;
  // Derived from the sheet name so identical designs render identically.
  #uuid: UUID;
  private sexpr_components: string[] = [];
  /** @internal */
  readonly referenceCounter = new ReferenceCounter();
  private netManager: NetManager;
  #options: ISchematicOptions = {
    net_prefix: 'net',
    bom_fields: ['Reference', 'Value', 'Datasheet', 'Footprint', 'MPN'],
    bom_separator: ',',
  };
  #groupedComponents: Map<string, Component[]> = new Map();
  #pendingSummary: PendingTypecadSummary | undefined;

  private pendingSummaryData() {
    return this.#pendingSummary;
  }
  private setPendingSummaryData(data: PendingTypecadSummary | undefined) {
    this.#pendingSummary = data;
  }

  /** @internal */
  get nodes(): ISchematicNode[] {
    return this.netManager.nodes;
  }

  /** @internal */
  get merged_nets() {
    return this.netManager.merged_nets;
  }

  get option(): Readonly<ISchematicOptions> {
    return this.#options;
  }

  bom(output_folder?: string): boolean {
    return generateBom(this.components, this.sheetName, this.#options, output_folder);
  }

  constructor(sheetName: string) {
    validateSheetName(sheetName);
    this.sheetName = sheetName;
    this.#uuid = deterministicUUID('schematic-sheet', sheetName) as UUID;
    this.netManager = new NetManager(this.#options.net_prefix);
  }

  add(...components: Component[]) {
    const addedComponents: Component[] = [];
    const addedSexpr: string[] = [];

    try {
      components.forEach((comp) => {
        if (comp.dnp === true) {
          return;
        }
        if (this.components.includes(comp)) {
          return;
        }
        comp.registerReference(this.referenceCounter);
        const comp_data: ComponentInit = { reference: comp.reference, value: comp.value, footprint: comp.footprint };
        if (comp.wattage) {
          comp_data.wattage = comp.wattage;
        }
        if (comp.voltage) {
          comp_data.voltage = comp.voltage;
        }
        if (comp.datasheet) {
          comp_data.datasheet = comp.datasheet;
        }
        if (comp.description) {
          comp_data.description = comp.description;
        }
        if (comp.mpn) {
          comp_data.mpn = comp.mpn;
        }
        const _comp = renderComp(comp_data);

        addedComponents.push(comp);
        addedSexpr.push(_comp);

        const groups = comp.getGroups();
        if (groups.length > 0) {
          groups.forEach((group) => {
            if (!this.#groupedComponents.has(group)) {
              this.#groupedComponents.set(group, []);
            }
            this.#groupedComponents.get(group)?.push(comp);
          });
        } else {
          if (!this.#groupedComponents.has('Project')) {
            this.#groupedComponents.set('Project', []);
          }
          this.#groupedComponents.get('Project')?.push(comp);
        }
      });
    } catch (err) {
      throw new TypeCadError(`Failed to add components: ${(err as Error).message}`, { cause: err });
    }

    this.components.push(...addedComponents);
    this.sexpr_components.push(...addedSexpr);
  }

  dnc(...pins: Pin[]) {
    pins.forEach((pin) => {
      pin.type = 'no_connect';
      this.net(pin);
    });
  }

  named(name: string) {
    return {
      net: (...pins: Pin[]): ISchematicNetDefinition => {
        this.netManager.setChainedName(name);
        return this.net(...pins);
      },
      dnc: (...pins: Pin[]): void => {
        this.netManager.setChainedName(name);
        return this.dnc(...pins);
      },
    };
  }

  net(...pins: Pin[]): ISchematicNetDefinition {
    return this.netManager.addNet(pins);
  }

  create(...component: Component[]) {
    component.forEach((comp) => {
      this.add(comp);
    });

    const projectTree = buildProjectTree(this.#groupedComponents, this.nodes, this.sheetName);

    const _nets = this.netManager.renderNets();
    const _schematic = renderNetlist({ components: this.sexpr_components, nets: [_nets] });

    try {
      const netPath = `${DEFAULT_BUILD_DIR}/${this.sheetName}.net`;
      fs.mkdirSync(DEFAULT_BUILD_DIR, { recursive: true });
      fs.writeFileSync(netPath, _schematic);
      const adapter: IPendingSummaryHost = {
        pendingSummaryData: () => this.pendingSummaryData(),
        setPendingSummaryData: (data) => this.setPendingSummaryData(data),
      };
      setActiveSummaryHost(adapter);
      setupPendingSummary(adapter, this.sheetName, netPath, projectTree);
    } catch (err) {
      throw new TypeCadError(`Failed to write schematic file: ${(err as Error).message}`, { cause: err });
    }
  }

  simulate(...powers: Power[]): SimulationContext {
    return new SimulationContext(this, powers);
  }

  error(error: string) {
    throw new TypeCadError(error);
  }

  warn(warning: string) {
    logger.log(chalk.bgYellow(`WARN:`) + chalk.bold(` ${warning}`));
  }
}
