import type { Skill } from './types.js';

export const advancedSkills: Skill[] = [
  {
    name: 'contract',
    category: 'advanced',
    description:
      'Export a hardware contract JSON file that describes the MCU pin assignments, peripherals, and connections for firmware integration (TypeHAL)',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Export hardware contract',
        code: `pcb.contract({
  mcu,
  outputPath: './hw-contract.json',
});`,
      },
    ],
    notes: [
      'Generates a JSON file describing MCU connections for firmware tooling',
      'Auto-detects connected peripherals (I2C, SPI, UART)',
    ],
    related: ['pcb-structure', 'buses'],
  },
  {
    name: 'bom',
    category: 'advanced',
    description: 'Generate a Bill of Materials (BOM) CSV file from the design',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Generate BOM',
        code: `pcb.bom('./output/');`,
      },
    ],
    notes: [
      'BOM includes: Reference, Value, Datasheet, Footprint, MPN, Description, Voltage, Wattage',
      'DNP components are excluded from the BOM',
      'Output folder is optional (defaults to build directory)',
    ],
    related: ['pcb-structure', 'component', 'build'],
  },
  {
    name: 'simulation',
    category: 'advanced',
    description:
      'Run ngspice SPICE simulations directly from your typeCAD code. Use the fluent simulate() method on PCB to run DC operating point (.op) or transient (.tran) analysis and get programmatic access to results for testing',
    package: '@typecad/pcb',
    import: "import { PCB, Power } from '@typecad/pcb';",
    usage: {
      signature: 'pcb.simulate(...powers: Power[]): SimulationContext',
      parameters: [
        {
          name: 'powers',
          type: 'Power[]',
          required: true,
          description: 'One or more Power objects defining voltage sources for the simulation',
        },
      ],
    },
    examples: [
      {
        title: 'DC operating point analysis (voltage divider)',
        code: `import { PCB, Power, Resistor } from '@typecad/pcb';

let pcb = new PCB('vdiv');
let r1 = new Resistor({ value: '10k', simulation: { include: true } });
let r2 = new Resistor({ value: '10k', simulation: { include: true } });

pcb.named('in').net(r1.pin(1));
pcb.named('vdiv').net(r1.pin(2), r2.pin(1));
pcb.named('gnd').net(r2.pin(2));
pcb.add(r1, r2);

let vin = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 5.0 });
const result = pcb.simulate(vin).op();

// result.getVoltage('vdiv')  → 2.5
// result.getCurrent(r1.reference)  → 0.00025
// result.getPower(r1.reference)    → 0.000625`,
      },
      {
        title: 'Transient analysis',
        code: `// Same setup as above, then:
pcb.simulate(vin).tran('1us', '100ms');

// Opens ngspice plot windows for each component`,
      },
      {
        title: 'Multiple power sources',
        code: `let battery = new Power({ power: r1.pin(1), gnd: r3.pin(2), voltage: 9.0 });
let regulated = new Power({ power: r2.pin(1), gnd: r4.pin(2), voltage: 3.3 });

const result = pcb.simulate(battery, regulated).op();`,
      },
      {
        title: 'Test assertions with vitest',
        code: `import { describe, it, expect } from 'vitest';

it('should split 5V across equal resistors', () => {
  // ... create schematic and add components ...

  const result = typecad.simulate(vin).op();

  expect(result).not.toBeNull();
  expect(result!.getVoltage('vdiv')).toBeCloseTo(2.5, 2);
  expect(result!.getCurrent(r1.reference)).toBeCloseTo(0.00025, 4);
  expect(result!.getPower(r1.reference)).toBeCloseTo(0.000625, 4);
});`,
      },
      {
        title: 'Add simulation model to a component',
        code: `let d1 = new Component('Diode_SMD:D_0603_1608Metric');
d1.value = '1N4148';
d1.simulation = {
  include: true,
  model: 'D 1N4148',
};`,
      },
    ],
    notes: [
      'Components need simulation: { include: true } to participate in simulation',
      'op() returns NgspiceResult | null — null if ngspice is not installed',
      'tran() returns void — opens interactive ngspice plot windows',
      'Only named nets are included in the simulation (gnd maps to ngspice node 0)',
      'Netlist and output files are written to ./build/',
      'NgspiceResult helpers: getVoltage(net), getCurrent(ref), getPower(ref), get(rawName)',
      'Reference designators are case-insensitive in helpers (pass r1.reference directly)',
      'Requires ngspice installed and in PATH (ngspice on Linux/Mac, ngspice_con on Windows for DC)',
    ],
    related: ['component', 'power', 'pcb-structure', 'net'],
  },
];
