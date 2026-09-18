import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { platform } from 'node:os';
import { relative, resolve } from 'node:path';
import chalk from 'chalk';
import type { Schematic } from '../schematic.js';
import type { Component } from '../component.js';
import type { Power } from '../buses.js';
import type { Pin } from '../pin.js';
import type { NgspiceResult, Variable } from './types.js';
import logger from '../utils/logging.js';
import { getBuildDir } from '../utils/constants.js';
import { findExecutable } from '../kicad.js';

/** Reference prefixes whose ngspice card type is implied (R/C/L/D = two-terminal passives). */
const SPICE_DEVICE_PREFIX = /^[RCLD]/i;

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
  imaginary: Record<string, number[]> = {};
  branches?: Record<string, Array<{ ref: string; pin: string; i: number }>>;

  get(variableName: string): number {
    return this.getAt(variableName, 0);
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

  getWaveform(variableName: string): number[] {
    const arr = this.values[variableName];
    if (!arr || arr.length === 0) {
      throw new Error(`Variable "${variableName}" not found in simulation results`);
    }
    return arr;
  }

  getAt(variableName: string, index: number): number {
    const arr = this.getWaveform(variableName);
    if (index < 0 || index >= arr.length) {
      throw new Error(`Point ${index} out of range for "${variableName}" (${arr.length} points)`);
    }
    return arr[index];
  }

  getMagnitude(variableName: string, index?: number): number {
    const re = this.getWaveform(variableName);
    const i = index ?? re.length - 1;
    const im = this.imaginary[variableName]?.[i] ?? 0;
    return Math.hypot(this.getAt(variableName, i), im);
  }

  getDb(variableName: string, index?: number): number {
    return 20 * Math.log10(this.getMagnitude(variableName, index));
  }

  getPhaseDeg(variableName: string, index?: number): number {
    const re = this.getWaveform(variableName);
    const i = index ?? re.length - 1;
    const im = this.imaginary[variableName]?.[i] ?? 0;
    return (Math.atan2(im, this.getAt(variableName, i)) * 180) / Math.PI;
  }
}

export class SimulationContext {
  private schematic: Schematic;
  private powers: Power[];

  constructor(schematic: Schematic, powers: Power[]) {
    this.schematic = schematic;
    this.powers = powers;
  }

  /**
   * DC operating point.
   */
  public op(): NgspiceResult | null {
    return this.run();
  }

  /**
   * Transient analysis. Runs headless (batch ngspice) and returns the parsed
   * waveform; pass `openPlots = true` for the classic interactive plot
   * windows.
   */
  public tran(
    tstep: string,
    tstop: string,
    tstart?: string,
    tmax?: string,
    uic?: boolean,
    openPlots = false,
  ): NgspiceResult | null {
    const tokens = ['tran', tstep, tstop];
    if (tstart) tokens.push(tstart);
    if (tmax) tokens.push(tmax);
    if (uic) tokens.push('uic');
    return this.run(tokens.join(' '), openPlots);
  }

  /**
   * DC transfer characteristic — sweeps a source over a range.
   * `source` is the ngspice designator of a voltage/current source: a named
   * `Power` (`name: 'VS'`) or the auto-assigned `V1`, `V2`, … in emission
   * order. The sweep axis is available as the `v(v-sweep)` variable.
   */
  public dc(source: string, start: number | string, stop: number | string, increment: number | string): NgspiceResult | null {
    return this.run(`dc ${source} ${start} ${stop} ${increment}`);
  }

  /**
   * Small-signal AC analysis over a frequency range. Sources need an AC
   * magnitude: `new Power({ …, ac: 1 })`. The frequency axis is the
   * `frequency` variable; use `getMagnitude`/`getDb`/`getPhaseDeg` on the
   * complex results.
   */
  public ac(
    sweep: 'dec' | 'oct' | 'lin',
    points: number,
    fstart: number | string,
    fstop: number | string,
  ): NgspiceResult | null {
    return this.run(`ac ${sweep} ${points} ${fstart} ${fstop}`);
  }

  private run(mode?: string, openPlots = false): NgspiceResult | null {
    const components = this.schematic.components.filter((c: Component) => this.isSimulatable(c));
    const nodes = this.schematic.nodes;

    logger.log(chalk.bold('\u{1F336}\uFE0F Running ngspice'));

    const getNetName = (reference: string, pinNumber: number | string): string => {
      for (const node of nodes) {
        for (const pin of node.nodes) {
          if (pin.reference === reference && pin.number === String(pinNumber)) {
            // ngspice aliases the literal node name `gnd` to ground (0)
            return /^gnd$/i.test(node.name) ? 'gnd' : node.name;
          }
        }
      }
      return `${reference}_pin${pinNumber}`;
    };

    let netlist = `* Ngspice Netlist for ${this.schematic.sheetName}\n`;

    const models = new Set<string>();
    const includes = new Set<string>();
    const connectedComponents: Component[] = [];
    // per-pad current bookkeeping for the flow visualization: which pad of a
    // two-terminal card sits on which node, in card order (ngspice positive
    // current enters a card at its first node)
    const branchEntries: Array<{ net: string; ref: string; pin: string; pos: 1 | 2 }> = [];

    for (const component of components) {
      const { reference, value, pins, simulation } = component;
      const explicit = Boolean(simulation?.include || simulation?.model || simulation?.subckt);

      if (!pins?.length) {
        if (explicit) logger.log(chalk.yellow(`\u26A0 ${reference} has no pins, ignoring for simulation`));
        continue;
      }

      // Terminal order: explicit pinOrder wins, otherwise numeric pin order
      // (insertion order as a fallback for non-numeric pin names).
      const pinNumbers = (simulation?.pinOrder ?? [...pins].map((p) => p.number)).map(String);
      if (!simulation?.pinOrder) {
        pinNumbers.sort((a, b) => {
          const na = parseInt(a, 10);
          const nb = parseInt(b, 10);
          if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
          return na - nb;
        });
      }

      const nets = pinNumbers.map((n) => getNetName(reference, n));
      const unconnected = pinNumbers.filter((_, i) => nets[i] === `${reference}_pin${pinNumbers[i]}`);
      if (unconnected.length > 0) {
        if (explicit)
          logger.log(chalk.yellow(`\u26A0 ${reference} pin(s) ${unconnected.join(', ')} not connected, ignoring for simulation`));
        continue;
      }
      // A two-terminal passive whose pins were only partially instantiated
      // (typeCAD creates pins lazily — `r1.pin(2)` is the only pin object a
      // lightly-wired board may hold) would emit a card with too few nodes
      // and abort the whole solve. Pad the missing terminals with isolated
      // nodes: the device solves, just contributes nothing.
      if (SPICE_DEVICE_PREFIX.test(reference) && nets.length === 1) {
        nets.push(`${reference}_open`);
      }
      // KiCad's Device library numbers diodes 1=K (cathode) and 2=A (anode),
      // while the ngspice D card lists anode first — flip the default numeric
      // order so a forward-biased symbol emits a forward-biased card. An
      // explicit pinOrder already names the card order and is left alone.
      // pinNumbers flips with the nets so per-pad bookkeeping stays paired.
      if (/^D/i.test(reference) && nets.length === 2 && !simulation?.pinOrder) {
        nets.reverse();
        pinNumbers.reverse();
      }

      const deviceName = simulation?.subckt ?? (simulation?.model ? simulation.model.split(' ')[0] : undefined);
      if (!deviceName && !value) {
        logger.log(chalk.yellow(`\u26A0 ${reference} has no value, ignoring for simulation`));
        continue;
      }
      if (value && /\s/.test(value)) {
        // ngspice (44+) strictly rejects extra tokens on device cards —
        // "10k ohm" or "100nF X7R" reads as two values
        logger.log(
          chalk.yellow(
            `\u26A0 ${reference} value "${value}" contains whitespace — device cards take a single value token, ignoring for simulation`,
          ),
        );
        continue;
      }

      connectedComponents.push(component);

      if (nets.length === 2) {
        branchEntries.push({ net: nets[0]!, ref: reference, pin: pinNumbers[0]!, pos: 1 });
        branchEntries.push({ net: nets[1]!, ref: reference, pin: pinNumbers[1]!, pos: 2 });
      }

      const tail = [deviceName ?? value, simulation?.params].filter(Boolean).join(' ');
      netlist += `${reference} ${nets.join(' ')} ${tail}\n`;

      if (simulation?.model && !models.has(simulation.model)) {
        netlist += `.model ${simulation.model}\n`;
        models.add(simulation.model);
      }
      if (simulation?.library) {
        // ngspice resolves .include relative to the netlist's directory
        // (build/), not the process working directory
        const includePath = relative(getBuildDir(), resolve(simulation.library)).replace(/\\/g, '/');
        if (!includes.has(includePath)) {
          netlist += `.include ${includePath}\n`;
          includes.add(includePath);
        }
      }
    }

    const sources: Array<{
      name: string;
      powerNet: string;
      gndNet: string;
      voltage?: number;
      ac?: number;
      waveform?: string;
      /** explicit Power objects know their terminal pads — anchor the flow data there */
      powerPad?: { ref: string; pin: string };
      gndPad?: { ref: string; pin: string };
    }> = [];
    const usedNames = new Set<string>();
    const usedNetPairs = new Set<string>();
    const addSource = (
      candidate: { name?: string; voltage?: number; ac?: number; waveform?: string; power?: Pin; gnd?: Pin },
      powerNet: string,
      gndNet: string,
    ) => {
      if (powerNet === gndNet) return;
      // one source per rail: parallel voltage sources won't converge
      const netPairKey = `${powerNet}-${gndNet}`;
      if (usedNetPairs.has(netPairKey)) return;
      // ngspice reads the card type from the first letter of the designator
      let name = (candidate.name ?? `V${sources.length + 1}`).replace(/[^a-zA-Z0-9_]/g, '');
      if (!/^[vV]/.test(name)) name = `V${name}`;
      while (usedNames.has(name)) name = `${name}_`;
      if (candidate.voltage === undefined && candidate.ac === undefined && !candidate.waveform) {
        logger.log(chalk.yellow(`\u26A0 Power source on ${powerNet} has no voltage, ac or waveform, ignoring`));
        return;
      }
      usedNetPairs.add(netPairKey);
      usedNames.add(name);
      sources.push({
        name,
        powerNet,
        gndNet,
        voltage: candidate.voltage,
        ac: candidate.ac,
        waveform: candidate.waveform,
        powerPad: candidate.power ? { ref: candidate.power.reference, pin: String(candidate.power.number) } : undefined,
        gndPad: candidate.gnd ? { ref: candidate.gnd.reference, pin: String(candidate.gnd.number) } : undefined,
      });
    };

    if (this.powers.length > 0) {
      for (const power of this.powers) {
        const powerNet = getNetName(power.power.reference, power.power.number);
        const gndNet = getNetName(power.gnd.reference, power.gnd.number);
        if (powerNet === `${power.power.reference}_pin${power.power.number}`) continue;
        if (gndNet === `${power.gnd.reference}_pin${power.gnd.number}`) continue;
        addSource(power, powerNet, gndNet);
      }
    } else {
      const discovered = this.discoverPowerSources();
      if (discovered.length === 0) {
        logger.log(
          chalk.yellow('\u26A0 no power sources found — attach Power objects to the circuit or pass them to simulate()'),
        );
      }
      for (const s of discovered) addSource(s, s.powerNet, s.gndNet);
    }

    for (const { name, powerNet, gndNet, voltage, ac, waveform } of sources) {
      const parts = [name, powerNet, gndNet];
      if (voltage !== undefined) parts.push(String(voltage));
      if (ac !== undefined) parts.push(`AC ${ac}`);
      if (waveform) parts.push(waveform);
      netlist += `${parts.join(' ')}\n`;
    }

    fs.mkdirSync(getBuildDir(), { recursive: true });
    const safeName = this.schematic.sheetName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

    netlist += this.controlSection(safeName, connectedComponents, mode, openPlots);
    fs.writeFileSync(`${getBuildDir()}/${safeName}.cir`, netlist);

    const ngspicePath = this.findNgspiceExecutable(Boolean(mode) && openPlots);
    if (!ngspicePath) return null;

    const args = mode && openPlots ? ['-i', `${getBuildDir()}/${safeName}.cir`] : ['-b', `${getBuildDir()}/${safeName}.cir`];
    logger.log(`${ngspicePath} ${args.join(' ')}`);
    try {
      execFileSync(ngspicePath, args);
      const ngspiceData = this.parseNgspiceAscii(`${safeName}.out`);
      ngspiceData.branches = this.buildBranches(branchEntries, sources, ngspiceData);
      if (mode) {
        this.displaySummary(ngspiceData);
      } else {
        this.displayTable(ngspiceData);
      }
      return ngspiceData;
    } catch (e) {
      logger.error(`Failed executing ${ngspicePath}`, e);
      return null;
    }
  }

  /**
   * Signed pad injections per net, conventional current: positive means the
   * current flows out of the pad into the net. Two-terminal devices follow
   * ngspice's card convention (positive current enters at the first node and
   * exits at the second); a source conducts node1→node2 internally when its
   * current is positive, so externally it injects at node1 and draws at
   * node2. Explicit Power objects carry their terminal pad identity; nets
   * only reachable through pad-less (discovered) sources get no anchor.
   */
  private buildBranches(
    entries: Array<{ net: string; ref: string; pin: string; pos: 1 | 2 }>,
    sources: Array<{ name: string; powerNet: string; gndNet: string; powerPad?: { ref: string; pin: string }; gndPad?: { ref: string; pin: string } }>,
    data: NgspiceResult,
  ): Record<string, Array<{ ref: string; pin: string; i: number }>> {
    const branches: Record<string, Array<{ ref: string; pin: string; i: number }>> = {};
    const add = (net: string, ref: string, pin: string, i: number) => {
      if (!Number.isFinite(i)) return;
      (branches[net] ??= []).push({ ref, pin, i });
    };
    for (const e of entries) {
      const iv = data.values[`i(${e.ref.toLowerCase()})`]?.[0] ?? 0;
      add(e.net, e.ref, e.pin, e.pos === 2 ? iv : -iv);
    }
    for (const s of sources) {
      const iv = data.values[`i(${s.name.toLowerCase()})`]?.[0] ?? 0;
      if (s.powerPad) add(s.powerNet, s.powerPad.ref, s.powerPad.pin, -iv);
      if (s.gndPad) add(s.gndNet, s.gndPad.ref, s.gndPad.pin, iv);
    }
    return branches;
  }

  private controlSection(safeName: string, connectedComponents: Component[], mode?: string, openPlots = false): string {
    const probes = connectedComponents.map((c) => `.probe p(${c.reference}) i(${c.reference})`).join('\n');
    const plots = openPlots
      ? `${connectedComponents.map((c) => `plot @${c.reference}[p] @${c.reference}[i]`).join('\n')}\nplot all`
      : '';

    return `
.control
${mode || 'op'}
set wr_vecnames
set filetype=ascii
${openPlots ? plots : probes}
write ${safeName}.out all
.endc
.end`;
  }

  /**
   * The whole circuit is simulated without per-component opt-in: two-terminal
   * passives whose reference prefix (R/C/L/D) already names their ngspice
   * card type are included automatically. Anything else (ICs, transistors,
   * subcircuits…) needs an explicit `simulation: { include: true }`, a
   * `model`, or a `subckt`, and `simulation: { exclude: true }` opts a
   * component out.
   */
  private isSimulatable(component: Component): boolean {
    if (component.simulation?.exclude) return false;
    if (component.simulation?.model || component.simulation?.subckt || component.simulation?.include) return true;
    return SPICE_DEVICE_PREFIX.test(component.reference) && (component.pins?.length ?? 0) <= 2;
  }

  /**
   * When simulate() is called without Power arguments, power rails are
   * discovered from the circuit itself: Power stamps voltage ratings onto the
   * pins it connects (`pin.powerInfo`), and its ground pin becomes `power_in`.
   * Ground is the net named `gnd`, or the unique net holding `power_in` pins
   * and no voltage rating.
   */
  private discoverPowerSources(): Array<{ powerNet: string; gndNet: string; voltage: number; power?: Pin; gnd?: Pin }> {
    const nodes = this.schematic.nodes;
    const normalize = (name: string) => (/^gnd$/i.test(name) ? 'gnd' : name);

    let gndNet: string | null = null;
    const ratedNets = new Set<string>();
    const powerInNets = new Set<string>();

    for (const node of nodes) {
      if (/^gnd$/i.test(node.name)) gndNet = 'gnd';
      for (const pin of node.nodes) {
        if (pin.powerInfo?.maximum_voltage !== undefined || pin.powerInfo?.minimum_voltage !== undefined) {
          ratedNets.add(normalize(node.name));
        }
        if (pin.type === 'power_in') powerInNets.add(normalize(node.name));
      }
    }

    if (!gndNet) {
      const candidates = [...powerInNets].filter((net) => !ratedNets.has(net));
      if (candidates.length === 1) gndNet = candidates[0]!;
    }

    if (!gndNet) {
      logger.log(chalk.yellow('\u26A0 no ground net found — name a net "gnd" or pass Power objects to simulate()'));
      return [];
    }

    // pad anchors for the flow data: Power stamps a voltage rating on its +
    // pin and marks its return pin power_in — carry both pin identities out
    let gndPin: Pin | undefined;
    for (const node of nodes) {
      if (normalize(node.name) !== gndNet) continue;
      for (const pin of node.nodes) {
        if (pin.type === 'power_in') {
          gndPin = pin;
          break;
        }
      }
      if (gndPin) break;
    }

    const sources: Array<{ powerNet: string; gndNet: string; voltage: number; power?: Pin; gnd?: Pin }> = [];
    const seenNets = new Set<string>();
    for (const node of nodes) {
      const net = normalize(node.name);
      if (net === gndNet || seenNets.has(net)) continue;
      for (const pin of node.nodes) {
        const voltage = pin.powerInfo?.maximum_voltage ?? pin.powerInfo?.minimum_voltage;
        if (voltage !== undefined) {
          sources.push({ powerNet: net, gndNet, voltage, power: pin, gnd: gndPin });
          seenNets.add(net);
          break;
        }
      }
    }
    return sources;
  }

  private findNgspiceExecutable(interactive: boolean): string | null {
    const isWindows = platform() === 'win32';
    const executable = isWindows && !interactive ? 'ngspice_con' : 'ngspice';
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
        data.imaginary[name] = [];
      } else if (currentSection === 'values') {
        // ascii raw format: "<point-index> <value>" starts a point, every
        // following variable gets its own line. Complex (ac) values are
        // written as "re,im" comma-joined tokens.
        const parts = line.split(/\s+/);
        const isPointStart = parts.length === 2 && /^\d+$/.test(parts[0]);
        if (isPointStart) valueIndex = 0;
        const raw = isPointStart ? parts[1] : parts[0];
        if (raw === undefined) continue;
        const [re, im] = raw.split(',');
        const value = parseFloat(re);
        const variable = data.variables[valueIndex];
        if (variable && !Number.isNaN(value)) {
          data.values[variable.name].push(value);
          data.imaginary[variable.name].push(im !== undefined ? parseFloat(im) : 0);
          valueIndex++;
        }
      }
    }

    return data;
  }

  private formatValue(type: string, value: number): string {
    if (type === 'power') return chalk.red(`${(value * 1000).toFixed(4)} mW`);
    if (type === 'voltage') return chalk.yellow(`${value.toFixed(4)} V`);
    if (type === 'current') return chalk.cyan(`${(value * 1000).toFixed(4)} mA`);
    return `${value.toFixed(4)}`;
  }

  private displaySummary(data: NgspiceResult): void {
    const isComplex = data.flags.includes('complex');
    const colWidths = [20, 15, 24];
    const header = [
      chalk.bold.underline.gray('Variable').padEnd(colWidths[0]),
      chalk.bold.underline.gray('Type').padEnd(colWidths[1]),
      chalk.bold.underline.gray(isComplex ? 'Value @ final (mag)' : 'Value @ t = final').padEnd(colWidths[2]),
    ].join('\u2502');
    const separator = colWidths.map((w) => '\u2500'.repeat(w)).join('\u253C');

    logger.log(`\u{1F4C8} ${data.plotname} \u2014 ${data.numPoints} points (final values)`);
    logger.log(header);
    logger.log(separator);

    for (const variable of data.variables) {
      const arr = data.values[variable.name];
      if (!arr || arr.length === 0) continue;
      const last = arr.length - 1;
      const shown = isComplex ? data.getMagnitude(variable.name, last) : arr[last];
      const row = [
        variable.name.padEnd(colWidths[0]),
        variable.type.padEnd(colWidths[1]),
        this.formatValue(variable.type, shown).padEnd(colWidths[2]),
      ].join('\u2502');
      logger.log(row);
    }
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
        const formattedValue = this.formatValue(variable.type, value);

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
