import type { Skill } from './types.js';

export const packageSkills: Skill[] = [
  {
    name: 'package-base',
    category: 'packages',
    description:
      'The Package abstract base class for creating reusable IC packages with their typical application circuits. Strongly recommended when an IC requires 3+ supporting components (decoupling caps, pull-ups, crystals, etc.)',
    package: '@typecad/pcb',
    import: "import { Package, PCB } from '@typecad/pcb';",
    usage: {
      signature: 'class MyPackage extends Package<TOptions>',
      parameters: [
        { name: 'pcb', type: 'PCB', required: true, description: 'PCB instance (passed via options)' },
        { name: 'x', type: 'number', required: true, description: 'X position offset in mm' },
        { name: 'y', type: 'number', required: true, description: 'Y position offset in mm' },
        { name: 'reference', type: 'string', required: false, description: 'Optional reference prefix' },
        { name: 'name', type: 'string', required: false, description: 'Optional package name' },
        {
          name: 'passives',
          type: 'PassiveFactory',
          required: false,
          description: 'Override default passive component classes',
        },
      ],
    },
    examples: [
      {
        title: 'Custom package class',
        code: `import { Package, PCB, Resistor, Capacitor } from '@typecad/pcb';
import { LM7805 } from './LM7805.js';

interface LM7805Options {
  pcb: PCB;
  x: number;
  y: number;
  outputCapacitor?: string;
}

export class Lm7805Package extends Package<LM7805Options> {
  U1: LM7805;
  C_IN: Capacitor;
  C_OUT: Capacitor;

  protected build(options: LM7805Options): void {
    this.U1 = new LM7805();
    this.C_IN = new Capacitor({ value: '1uF' });
    this.C_OUT = new Capacitor({ value: options.outputCapacitor || '10uF' });

    this.net(this.U1.VIN, this.C_IN.pin(1));
    this.net(this.U1.VOUT, this.C_OUT.pin(1));
    this.net(this.U1.GND, this.C_IN.pin(2), this.C_OUT.pin(2));

    this.add(this.U1, this.C_IN, this.C_OUT);
  }
}`,
      },
      {
        title: 'Using a package',
        code: `let typecad = new PCB('board');

let vreg = new Lm7805Package({
  pcb: typecad,
  x: 10,
  y: 10,
  outputCapacitor: '22uF',
});

// Connect external power to the package IC
typecad.net(battery.pin(1), vreg.U1.VIN);
typecad.net(battery.pin(2), vreg.U1.GND);

typecad.create(vreg);`,
      },
      {
        title: 'MCU minimum system package',
        code: `// An ESP32 dev board benefits greatly from package encapsulation.
// Instead of 12+ components in the entry file, wrap them:

export class ESP32System extends Package<ESP32Options> {
  MCU: ESP32_PICO_D4;
  C_BYPASS1: Capacitor;
  C_BYPASS2: Capacitor;
  C_BULK: Capacitor;
  R_EN_PULLUP: Resistor;
  R_BOOT_PULLUP: Resistor;
  SW_BOOT: SW_Push;
  SW_RESET: SW_Push;
  R_LED: Resistor;
  D_LED: LED;

  protected build(options: ESP32Options): void {
    this.MCU = new ESP32_PICO_D4();
    this.C_BYPASS1 = new Capacitor({ value: '100nF' });
    this.C_BYPASS2 = new Capacitor({ value: '100nF' });
    this.C_BULK = new Capacitor({ value: '10uF' });
    this.R_EN_PULLUP = new Resistor({ value: '10kOhm' });
    this.R_BOOT_PULLUP = new Resistor({ value: '10kOhm' });
    // ... add buttons, LED, connect everything internally ...
    this.add(this.MCU, this.C_BYPASS1, /* ... */);
  }
}

// Entry file is now clean and readable:
let esp32 = new ESP32System({ pcb: typecad, x: 0, y: 0 });
typecad.create(esp32, j_left, j_right);`,
      },
    ],
    notes: [
      'Extend Package<TOptions> and implement the abstract build() method',
      'Protected helpers: net(), via(), track(), add() — these use the PCB instance and offset',
      'this.components auto-collects everything added via add() for use in create()',
      'Passives factory can be overridden via options for different package sizes',
      'Create with: typecad-pcb add package --component=true',
      'WHEN TO USE PACKAGES: Any IC that needs 3+ supporting components (decoupling caps, pull resistors, crystals, LEDs, buttons) should be a package. This includes: MCU minimum systems, voltage regulator circuits, motor driver circuits, sensor modules with filtering, USB interfaces with ESD protection.',
      'BENEFITS: (1) Entry file stays readable. (2) Sub-circuit is tested and reusable. (3) Internal connections are hidden. (4) External interface is clear (access via package.property).',
    ],
    related: ['custom-component', 'pcb-structure', 'add-package', 'component', 'circuit-design'],
  },
  {
    name: 'custom-component',
    category: 'packages',
    description:
      'Create a custom component class with named pins and proper pin types for ERC and power validation. Use this when add-component fails or when you need to define a component manually',
    package: '@typecad/pcb',
    import: "import { Component } from '@typecad/pcb';",
    examples: [
      {
        title: 'Custom IC with named pins',
        code: `import { Component } from '@typecad/pcb';

export class ATmega328P extends Component {
  VCC = this.pin(7, { type: 'power_in', powerInfo: {
    minimum_voltage: -0.5,
    maximum_voltage: 5.5,
    current: 0.2,
  }});
  GND = this.pin(8, { type: 'power_in' });
  PB0 = this.pin(12, { type: 'bidirectional', powerInfo: {
    minimum_voltage: -0.5,
    maximum_voltage: 5.5,
    current: 0.04,
  }});
  PB1 = this.pin(13, { type: 'bidirectional' });
  RESET = this.pin(1, { type: 'input' });

  constructor(reference?: string) {
    super('Package_QFP:TQFP-32_7x7mm_P0.8mm');
    this.value = 'ATmega328P';
    this.datasheet = 'https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf';
    if (reference) this.reference = reference;
  }
}`,
      },
      {
        title: 'Using the custom component',
        code: `let mcu = new ATmega328P('U1');

// Named pin access
typecad.named('MOSI').net(mcu.PB0, spi_device.MOSI);
typecad.net(mcu.VCC, vcc_3v3);
typecad.net(mcu.GND, gnd);`,
      },
      {
        title: 'Manual component when add-component fails',
        code: `// When "typecad-pcb add component" fails with "Invalid KiCAD library symbol",
// create the component manually. You need:
// 1. The KiCad footprint string (library:footprint format)
// 2. The pin assignments (from the component datasheet)

import { Component } from '@typecad/pcb';

export class USB_B_Micro extends Component {
  VBUS = this.pin(1, { type: 'power_in' });
  D_MINUS = this.pin(2, { type: 'bidirectional' });
  D_PLUS = this.pin(3, { type: 'bidirectional' });
  ID = this.pin(4, { type: 'passive' });
  GND = this.pin(5, { type: 'power_in' });
  SHIELD = this.pin('SH', { type: 'passive' });

  constructor(reference?: string) {
    super('Connector_USB:USB_Micro-B_Amphenol_10118192-0001LF');
    this.value = 'USB_B_Micro';
    if (reference) this.reference = reference;
  }
}`,
      },
    ],
    notes: [
      'Use component.pin(number, { type, powerInfo }) to create and register pins',
      'Pin types: power_in, power_out, input, output, bidirectional, passive, open_collector, no_connect',
      'powerInfo: { minimum_voltage, maximum_voltage, current } for automatic validation',
      'Always pass reference through the constructor to support auto-numbering',
      'Use typecad-pcb add component to auto-generate component files from KiCad libraries',
      'PIN INFO SOURCE: Prefer using "typecad-pcb add component" to generate files automatically. The generated file contains all pin names and numbers. Only create components manually when add-component fails.',
      'MANUAL CREATION: When creating manually, you need the component datasheet for pin assignments. The footprint string must be a valid KiCad footprint in library:footprint format. Ask the user for the specific footprint if unsure.',
      'Pin numbers can be strings for non-numeric pins (e.g. "SH" for shield, "EP" for exposed pad)',
    ],
    related: ['component', 'pin', 'package-base', 'add-component', 'circuit-design'],
  },
];
