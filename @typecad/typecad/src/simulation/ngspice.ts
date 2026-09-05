import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import chalk from 'chalk';
import { platform } from 'node:os';
import type { Schematic } from '../schematic.js';
import type { Component } from '../component.js';
import type { Power } from '../buses.js';
import type { NgspiceResult, Variable } from './types.js';
import logger from '../utils/logging.js';
import { DEFAULT_BUILD_DIR } from '../utils/constants.js';
import { findExecutable } from '../kicad.js';

class NgspiceResultImpl implements NgspiceResult {
  title = '';
  date = '';
  command = '';
  plotname = '';
  flags: string[] = [];
  numVariables = 0;
  numPoints = 0;
  variables: Variable[] = [];
  values: Record<string, number[]> = {};

  get(variableName: string): number {
    const arr = this.values[variableName];
    if (!arr || arr.length === 0) {
      throw new Error(`Variable "${variableName}" not found in simulation results`);
    }
    return arr[0];
  }

  getVoltage(netName: string): number {
    return this.get(`v(${netName})`);
  }

  getCurrent(reference: string): number {
    return this.get(`i(${reference.toLowerCase()})`);
  }

  getPower(reference: string): number {
    return this.get(`${reference.toLowerCase()}:power`);
  }
}

export class SimulationContext {
  private schematic: Schematic;
  private powers: Power[];

  constructor(schematic: Schematic, powers: Power[]) {
    this.schematic = schematic;
    this.powers = powers;
  }

  public tran(tstep: string, tstop: string, tstart?: string, tmax?: string, uic?: boolean): void {
    const mode = `tran ${tstep} ${tstop} ${tstart || ''} ${tmax || ''} ${uic ? 'uic' : ''}`;
    this.run(mode);
  }

  public op(): NgspiceResult | null {
    return this.run();
  }

  private run(mode?: string): NgspiceResult | null {
    const components = this.schematic.components.filter((c: Component) => c.simulation?.include);
    const nodes = this.schematic.nodes;

    logger.log(chalk.bold('\u{1F336}\uFE0F Running ngspice'));

    const getNetName = (reference: string, pinNumber: number | string): string => {
      for (const node of nodes) {
        for (const pin of node.nodes) {
          if (pin.reference === reference && pin.number === String(pinNumber)) {
            return node.name;
          }
        }
      }
      return `${reference}_pin${pinNumber}`;
    };

    let netlist = `* Ngspice Netlist for ${this.schematic.sheetName}\n`;

    const models = new Set<string>();
    const connectedComponents: Component[] = [];

    for (const component of components) {
      const { reference, value, pins, simulation } = component;
      if (!pins?.length) {
        logger.log(chalk.yellow(`\u26A0 ${reference} has no pins, ignoring for simulation`));
        continue;
      }

      const pin1 = getNetName(reference, 1);
      const pin2 = getNetName(reference, 2);
      const hasNetConnection = pin1 !== `${reference}_pin1` || pin2 !== `${reference}_pin2`;

      if (!hasNetConnection) {
        logger.log(chalk.yellow(`\u26A0 ${reference} not connected, ignoring for simulation`));
        continue;
      }

      connectedComponents.push(component);

      if (simulation?.model) {
        const modelName = simulation.model.split(' ')[0];
        netlist += `${reference} ${pin1} ${pin2} ${value} ${modelName}\n`;
        if (!models.has(simulation.model)) {
          netlist += `.model ${simulation.model}\n`;
          models.add(simulation.model);
        }
      } else {
        netlist += `${reference} ${pin1} ${pin2} ${value}\n`;
      }
    }

    let voltageSourceIndex = 1;
    const usedNets = new Set<string>();

    for (const power of this.powers) {
      const { power: powerPin, gnd: gndPin, voltage } = power;
      const powerNet = getNetName(powerPin.reference, powerPin.number);
      const gndNet = getNetName(gndPin.reference, gndPin.number);
      const netPairKey = `${powerNet}-${gndNet}`;

      if (
        powerNet !== `${powerPin.reference}_pin${powerPin.number}` &&
        gndNet !== `${gndPin.reference}_pin${gndPin.number}` &&
        !usedNets.has(netPairKey)
      ) {
        netlist += `V${voltageSourceIndex} ${powerNet} ${gndNet} ${voltage}\n`;
        voltageSourceIndex++;
        usedNets.add(netPairKey);
      }
    }

    const controlSection = (mode?: string): string => {
      const probes = connectedComponents.map((c) => `.probe p(${c.reference}) i(${c.reference})`).join('\n');
      const plots = connectedComponents.map((c) => `plot @${c.reference}[p] @${c.reference}[i]`).join('\n');

      return `
.control
${mode || 'op'}
set wr_vecnames
set filetype=ascii
set keep#branch = 0
${mode ? plots : probes}
${mode ? 'plot all' : ''}
write ${this.schematic.sheetName}.out all
.endc
.end`;
    };

    netlist += controlSection(mode);

    fs.mkdirSync(DEFAULT_BUILD_DIR, { recursive: true });
    const safeName = this.schematic.sheetName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    fs.writeFileSync(`${DEFAULT_BUILD_DIR}/${safeName}.cir`, netlist);

    const ngspicePath = this.findNgspiceExecutable(mode);
    if (!ngspicePath) return null;

    const args = mode ? ['-i', `${DEFAULT_BUILD_DIR}/${safeName}.cir`] : ['-b', `${DEFAULT_BUILD_DIR}/${safeName}.cir`];
    logger.log(`${ngspicePath} ${args.join(' ')}`);
    try {
      execFileSync(ngspicePath, args);
      if (!mode) {
        const ngspiceData = this.parseNgspiceAscii(`${safeName}.out`);
        this.displayTable(ngspiceData);
        return ngspiceData;
      }
      return null;
    } catch (e) {
      logger.error(`Failed executing ${ngspicePath}`, e);
      return null;
    }
  }

  private findNgspiceExecutable(mode?: string): string | null {
    const isWindows = platform() === 'win32';
    const isDcAnalysis = mode === undefined;
    const executable = isWindows && isDcAnalysis ? 'ngspice_con' : 'ngspice';
    const resolvedPath = findExecutable(executable);

    if (!resolvedPath) {
      logger.error(`\`${executable}\` not found. Please ensure it's installed and in your PATH.`);
    }

    return resolvedPath ?? null;
  }

  private parseNgspiceAscii(filePath: string): NgspiceResult {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').map((line) => line.trim());
    const data = new NgspiceResultImpl();

    let currentSection: 'header' | 'variables' | 'values' = 'header';
    let valueIndex = 0;

    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('Title:')) data.title = line.split('Title:')[1].trim();
      else if (line.startsWith('Date:')) data.date = line.split('Date:')[1].trim();
      else if (line.startsWith('Command:')) data.command = line.split('Command:')[1].trim();
      else if (line.startsWith('Plotname:')) data.plotname = line.split('Plotname:')[1].trim();
      else if (line.startsWith('Flags:')) data.flags = line.split('Flags:')[1].trim().split(/\s+/);
      else if (line.startsWith('No. Variables:')) data.numVariables = parseInt(line.split(':')[1].trim(), 10);
      else if (line.startsWith('No. Points:')) data.numPoints = parseInt(line.split(':')[1].trim(), 10);
      else if (line.startsWith('Variables:')) currentSection = 'variables';
      else if (line.startsWith('Values:')) {
        currentSection = 'values';
        valueIndex = 0;
      } else if (currentSection === 'variables') {
        const [index, name, ...typeParts] = line.split(/\s+/);
        const type = typeParts.join(' ');
        data.variables.push({ index: parseInt(index, 10), name, type });
        data.values[name] = [];
      } else if (currentSection === 'values') {
        const parts = line.split(/\s+/);
        const value = parseFloat(parts.length === 2 ? parts[1] : parts[0]);
        const variable = data.variables[valueIndex];
        if (variable) {
          data.values[variable.name].push(value);
          valueIndex++;
        }
      }
    }

    return data;
  }

  private displayTable(data: NgspiceResult): void {
    const colWidths = [20, 15, 20];
    const separator = colWidths.map((w) => '\u2500'.repeat(w)).join('\u253C');

    const header = [
      chalk.bold.underline.gray('Variable').padEnd(colWidths[0]),
      chalk.bold.underline.gray('Type').padEnd(colWidths[1]),
      chalk.bold.underline.gray('Value').padEnd(colWidths[2]),
    ].join('\u2502');

    logger.log(header);
    logger.log(separator);

    for (const variable of data.variables) {
      for (const value of data.values[variable.name]) {
        const formattedValue =
          variable.type === 'power'
            ? chalk.red(`${(value * 1000).toFixed(4)} mW`)
            : variable.type === 'voltage'
              ? chalk.yellow(`${value.toFixed(4)} V`)
              : variable.type === 'current'
                ? chalk.cyan(`${(value * 1000).toFixed(4)} mA`)
                : `${value.toFixed(4)}`;

        const row = [
          variable.name.padEnd(colWidths[0]),
          variable.type.padEnd(colWidths[1]),
          formattedValue.padEnd(colWidths[2]),
        ].join('\u2502');
        logger.log(row);
      }
    }
  }
}
