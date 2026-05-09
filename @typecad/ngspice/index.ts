import { execSync } from "node:child_process";
import fs from "node:fs";
import which from "which";
import Table from "cli-table3";
import chalk from "chalk";
import { platform } from "node:os";

interface Pin {
    number: number | string;
    reference: string;
    type: string;
}

interface NodeConnection {
    number: number | string;
    reference: string;
    type: string;
}

interface Node {
    name: string;
    code: number;
    nodes: NodeConnection[];
}

interface Simulation {
    include: boolean;
    model?: string;
}

interface Pcb {
    x: number;
    y: number;
    rotation?: number | undefined;
}

interface Component {
    reference: string;
    value: string;
    footprint: string;
    datasheet: string;
    description: string;
    voltage: string;
    wattage: string;
    mpn: string;
    pcb: Pcb;
    dnp: boolean;
    uuid: string;
    pins: Pin[];
    via: boolean;
    simulation: Simulation;
}

interface Schematic {
    Components: Component[];
    Sheetname: string;
    Nodes: Node[];
}

interface Power {
    power: Pin;
    gnd: Pin;
    voltage?: number;
}

interface Variable {
    index: number;
    name: string;
    type: string;
}

interface NgspiceData {
    title: string;
    date: string;
    command: string;
    plotname: string;
    flags: string[];
    numVariables: number;
    numPoints: number;
    variables: Variable[];
    values: { [key: string]: number[] };
}

export class ngspiceSimulator {
    private schematic: Schematic;
    private powers: Power[];
    private sheetName: string;

    constructor(schematic: Schematic, ...powers: Power[]) {
        this.schematic = schematic;
        this.powers = powers;
        this.sheetName = schematic.Sheetname;
    }

    public tran(tstep: string, tstop: string, tstart?: string, tmax?: string, uic?: boolean): void {
        const mode = `tran ${tstep} ${tstop} ${tstart || ""} ${tmax || ""} ${uic ? "uic" : ""}`;
        this.run(mode);
    }

    public op(): void {
        this.run();
    }

    private run(mode?: string): void {
        const components = this.schematic.Components.filter((c) => c.simulation?.include);
        const nodes = this.schematic.Nodes;

        console.log(chalk.bold("🌶️ Running ngspice"));

        const getNetName = (reference: string, pinNumber: number): string => {
            for (const node of nodes) {
                for (const pin of node.nodes) {
                    if (pin.reference === reference && pin.number === pinNumber) {
                        return node.name;
                    }
                }
            }
            return `${reference}_pin${pinNumber}`;
        };

        let netlist = `* Ngspice Netlist for ${this.sheetName}\n`;

        const models = new Set<string>();
        const connectedComponents: Component[] = [];

        for (const component of components) {
            const { reference, value, pins, simulation } = component;
            if (!pins?.length) {
                console.log(chalk.yellow(`⚠ ${reference} has no pins, ignoring for simulation`));
                continue;
            }

            const pin1 = getNetName(reference, 1);
            const pin2 = getNetName(reference, 2);
            const hasNetConnection =
                pin1 !== `${reference}_pin1` || pin2 !== `${reference}_pin2`;

            if (!hasNetConnection) {
                console.log(chalk.yellow(`⚠ ${reference} not connected, ignoring for simulation`));
                continue;
            }

            connectedComponents.push(component);

            if (simulation?.model) {
                const modelName = simulation.model.split(" ")[0];
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
            const powerNet = getNetName(powerPin.reference, powerPin.number as number);
            const gndNet = getNetName(gndPin.reference, gndPin.number as number);
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
            const probes = connectedComponents.map((c) => `.probe p(${c.reference}) i(${c.reference})`).join("\n");
            const plots = connectedComponents.map((c) => `plot @${c.reference}[p] @${c.reference}[i]`).join("\n");

            return `
.control
${mode || "op"}
set wr_vecnames
set filetype=ascii
set keep#branch = 0
${mode ? plots : probes}
${mode ? 'plot all' : ''}
write ${this.sheetName}.out all
.endc
.end`;
        };

        netlist += controlSection(mode);

        fs.mkdirSync("./ngspice", { recursive: true });
        fs.writeFileSync(`./ngspice/${this.sheetName}.cir`, netlist);

        const ngspicePath = this.findNgspiceExecutable(mode);
        if (!ngspicePath) return;

        const command = `${ngspicePath} ${mode ? "-i" : "-b"} ./ngspice/${this.sheetName}.cir`;
        console.log(command);
        try {
            execSync(command);
            if (!mode) {
                const ngspiceData = this.parseNgspiceAscii(`${this.sheetName}.out`);
                this.displayTable(ngspiceData);
            }
        } catch (e) {
            console.error(`Failed executing ${command}`, e);
        }
    }

    private findNgspiceExecutable(mode?: string): string | null {
        const isWindows = platform() === "win32";
        const isDcAnalysis = mode === undefined;
    
        // Use ngspice_con only for DC analysis on Windows
        const executable = isWindows && isDcAnalysis ? "ngspice_con" : "ngspice";
        const path = which.sync(executable, { nothrow: true });
    
        if (!path) {
            console.error(`\`${executable}\` not found. Please ensure it's installed and in your PATH.`);
        }
    
        return path;
    }

    private parseNgspiceAscii(filePath: string): NgspiceData {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const lines = fileContent.split("\n").map((line) => line.trim());
        const data: NgspiceData = {
            title: "",
            date: "",
            command: "",
            plotname: "",
            flags: [],
            numVariables: 0,
            numPoints: 0,
            variables: [],
            values: {},
        };

        let currentSection: "header" | "variables" | "values" = "header";
        let valueIndex = 0;

        for (const line of lines) {
            if (!line) continue;

            if (line.startsWith("Title:")) data.title = line.split("Title:")[1].trim();
            else if (line.startsWith("Date:")) data.date = line.split("Date:")[1].trim();
            else if (line.startsWith("Command:")) data.command = line.split("Command:")[1].trim();
            else if (line.startsWith("Plotname:")) data.plotname = line.split("Plotname:")[1].trim();
            else if (line.startsWith("Flags:")) data.flags = line.split("Flags:")[1].trim().split(/\s+/);
            else if (line.startsWith("No. Variables:")) data.numVariables = parseInt(line.split(":")[1].trim(), 10);
            else if (line.startsWith("No. Points:")) data.numPoints = parseInt(line.split(":")[1].trim(), 10);
            else if (line.startsWith("Variables:")) currentSection = "variables";
            else if (line.startsWith("Values:")) {
                currentSection = "values";
                valueIndex = 0;
            } else if (currentSection === "variables") {
                const [index, name, ...typeParts] = line.split(/\s+/);
                const type = typeParts.join(" ");
                data.variables.push({ index: parseInt(index, 10), name, type });
                data.values[name] = [];
            } else if (currentSection === "values") {
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

    private displayTable(data: NgspiceData): void {
        const table = new Table({
            head: [chalk.bold.underline.gray("Variable"), chalk.bold.underline.gray("Type"), chalk.bold.underline.gray("Value")],
            colWidths: [20, 15, 20],
        });

        for (const variable of data.variables) {
            for (const value of data.values[variable.name]) {
                const formattedValue =
                    variable.type === "power"
                        ? chalk.red(`${(value * 1000).toFixed(4)} mW`)
                        : variable.type === "voltage"
                        ? chalk.yellow(`${value.toFixed(4)} V`)
                        : variable.type === "current"
                        ? chalk.cyan(`${(value * 1000).toFixed(4)} mA`)
                        : `${value.toFixed(4)}`;

                table.push([variable.name, variable.type, formattedValue]);
            }
        }

        console.log(table.toString());
    }
}