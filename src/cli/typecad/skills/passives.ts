import type { Skill } from './types.js';

export const passiveSkills: Skill[] = [
  {
    name: 'resistor',
    category: 'passive-components',
    description: 'Add a resistor with a specified SMD package size',
    package: '@typecad/pcb',
    import: "import { Resistor } from '@typecad/pcb';",
    usage: {
      signature: 'new Resistor(options?: PassiveInit)',
      parameters: [
        {
          name: 'reference',
          type: 'string',
          required: false,
          description: 'Reference designator. Auto-assigned as R1, R2, etc. if omitted',
        },
        { name: 'value', type: 'string', required: false, description: 'Resistance value (e.g. "4.7kOhm", "10kOhm")' },
        {
          name: 'size',
          type: "'0201' | '0402' | '0603' | '0805' | '1206' | '1210'",
          required: false,
          description: 'SMD package size. Default: 0603',
          default: '0603',
        },
        { name: 'wattage', type: 'string', required: false, description: 'Power rating (e.g. "0.25W", "0.125W")' },
        { name: 'voltage', type: 'string', required: false, description: 'Voltage rating' },
        { name: 'datasheet', type: 'string', required: false, description: 'URL or path to datasheet' },
        { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
        { name: 'mpn', type: 'string', required: false, description: 'Manufacturer Part Number' },
        { name: 'pcb', type: '{ x, y, rotation?, side? }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Basic resistor',
        code: `import { Resistor } from '@typecad/pcb';

let r1 = new Resistor({ value: '10kOhm' });
let r2 = new Resistor({ value: '4.7kOhm', wattage: '0.25W' });
let r3 = new Resistor({ value: '330 ohm', size: '0805' });`,
      },
      {
        title: 'Resistor with placement',
        code: `let r1 = new Resistor({
  value: '330 ohm',
  wattage: '0.125W',
  size: '0603',
  pcb: { x: 10, y: 20, rotation: 90 },
});

// Connect in circuit
typecad.net(r1.pin(1), led.pin(1));
typecad.net(r1.pin(2), vcc);`,
      },
    ],
    notes: [
      'Available in sizes: 0201, 0402, 0603 (default), 0805, 1206, 1210',
      'Default footprint varies by size (e.g. 0603 = Resistor_SMD:R_0603_1608Metric)',
      'KiCad symbol: Device:R_Small',
      'Auto-numbered with prefix R (R1, R2, R3...)',
      'Passives are built into @typecad/pcb — do not use raw Component for resistors',
    ],
    related: ['capacitor', 'inductor', 'passive-sizes', 'net'],
  },
  {
    name: 'capacitor',
    category: 'passive-components',
    description: 'Add a capacitor with a specified SMD package size',
    package: '@typecad/pcb',
    import: "import { Capacitor } from '@typecad/pcb';",
    usage: {
      signature: 'new Capacitor(options?: PassiveInit)',
      parameters: [
        { name: 'reference', type: 'string', required: false, description: 'Auto-assigned as C1, C2, etc. if omitted' },
        { name: 'value', type: 'string', required: false, description: 'Capacitance value (e.g. "100nF", "10uF")' },
        {
          name: 'size',
          type: "'0201' | '0402' | '0603' | '0805' | '1206' | '1210'",
          required: false,
          description: 'SMD package size. Default: 0603',
          default: '0603',
        },
        { name: 'voltage', type: 'string', required: false, description: 'Voltage rating (e.g. "6.3V", "16V")' },
        { name: 'datasheet', type: 'string', required: false, description: 'URL or path to datasheet' },
        { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
        { name: 'mpn', type: 'string', required: false, description: 'Manufacturer Part Number' },
        { name: 'pcb', type: '{ x, y, rotation?, side? }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Decoupling capacitor',
        code: `import { Capacitor } from '@typecad/pcb';

let c1 = new Capacitor({ value: '100nF', voltage: '6.3V' });
let c2 = new Capacitor({ value: '10uF', voltage: '10V', size: '0805' });`,
      },
      {
        title: 'Bulk and bypass caps for an IC',
        code: `let bypass = new Capacitor({ value: '100nF', voltage: '6.3V' });
let bulk = new Capacitor({ value: '10uF', voltage: '10V' });

typecad.named('VCC_3V3').net(bypass.pin(1), bulk.pin(1), mcu.VCC);
typecad.named('GND').net(bypass.pin(2), bulk.pin(2), mcu.GND);`,
      },
    ],
    notes: [
      'Available in sizes: 0201, 0402, 0603 (default), 0805, 1206, 1210',
      'KiCad symbol: Device:C_Small',
      'Auto-numbered with prefix C',
      'Always specify voltage rating for capacitors — it determines the physical size needed',
      'Common values: 100nF (bypass), 10uF (bulk), 1uF (LDO output)',
    ],
    related: ['resistor', 'inductor', 'passive-sizes', 'net'],
  },
  {
    name: 'inductor',
    category: 'passive-components',
    description: 'Add an inductor with a specified SMD package size',
    package: '@typecad/pcb',
    import: "import { Inductor } from '@typecad/pcb';",
    usage: {
      signature: 'new Inductor(options?: PassiveInit)',
      parameters: [
        { name: 'reference', type: 'string', required: false, description: 'Auto-assigned as L1, L2, etc. if omitted' },
        { name: 'value', type: 'string', required: false, description: 'Inductance value (e.g. "2.2uH", "10uH")' },
        {
          name: 'size',
          type: "'0201' | '0402' | '0603' | '0805' | '1206' | '1210'",
          required: false,
          description: 'SMD package size. Default: 0603',
          default: '0603',
        },
        { name: 'datasheet', type: 'string', required: false, description: 'URL or path to datasheet' },
        { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
        { name: 'mpn', type: 'string', required: false, description: 'Manufacturer Part Number' },
        { name: 'pcb', type: '{ x, y, rotation?, side? }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Inductor for buck converter',
        code: `import { Inductor } from '@typecad/pcb';

let l1 = new Inductor({ value: '2.2uH', size: '0805' });

typecad.net(l1.pin(1), regulator.SW);
typecad.net(l1.pin(2), reg_output.power);`,
      },
    ],
    notes: [
      'Available in sizes: 0201, 0402, 0603 (default), 0805, 1206, 1210',
      'KiCad symbol: Device:L_Small',
      'Auto-numbered with prefix L',
      'Commonly used in switching power supply filters and RF matching networks',
    ],
    related: ['resistor', 'capacitor', 'passive-sizes', 'net'],
  },
  {
    name: 'diode',
    category: 'passive-components',
    description: 'Add a diode with a specified SMD package size',
    package: '@typecad/pcb',
    import: "import { Diode } from '@typecad/pcb';",
    usage: {
      signature: 'new Diode(options?: PassiveInit)',
      parameters: [
        { name: 'reference', type: 'string', required: false, description: 'Auto-assigned as D1, D2, etc. if omitted' },
        {
          name: 'size',
          type: "'0201' | '0402' | '0603' | '0805' | '1206' | '1210'",
          required: false,
          description: 'SMD package size. Default: 0603',
          default: '0603',
        },
        { name: 'voltage', type: 'string', required: false, description: 'Voltage rating' },
        { name: 'datasheet', type: 'string', required: false, description: 'URL or path to datasheet' },
        { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
        { name: 'mpn', type: 'string', required: false, description: 'Manufacturer Part Number' },
        { name: 'pcb', type: '{ x, y, rotation?, side? }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Protection diode',
        code: `import { Diode } from '@typecad/pcb';

let d1 = new Diode({ voltage: '75V', description: 'ESD protection diode' });

typecad.net(d1.pin(1), input_signal);
typecad.net(d1.pin(2), mcu.GPIO);`,
      },
    ],
    notes: [
      'Available in sizes: 0201, 0402, 0603 (default), 0805, 1206, 1210',
      'KiCad symbol: Device:D_Small',
      'Auto-numbered with prefix D (shares with LED)',
      'Common uses: reverse polarity protection, ESD protection, flyback diodes',
    ],
    related: ['led', 'fuse', 'passive-sizes', 'net'],
  },
  {
    name: 'led',
    category: 'passive-components',
    description: 'Add an LED with a specified SMD package size',
    package: '@typecad/pcb',
    import: "import { LED } from '@typecad/pcb';",
    usage: {
      signature: 'new LED(options?: PassiveInit)',
      parameters: [
        { name: 'reference', type: 'string', required: false, description: 'Auto-assigned as D1, D2, etc. if omitted' },
        {
          name: 'size',
          type: "'0201' | '0402' | '0603' | '0805' | '1206' | '1210'",
          required: false,
          description: 'SMD package size. Default: 0603',
          default: '0603',
        },
        { name: 'datasheet', type: 'string', required: false, description: 'URL or path to datasheet' },
        { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
        { name: 'mpn', type: 'string', required: false, description: 'Manufacturer Part Number' },
        { name: 'pcb', type: '{ x, y, rotation?, side? }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Status LED with current-limiting resistor',
        code: `import { LED, Resistor } from '@typecad/pcb';

let led = new LED({ description: 'Power indicator' });
let r_led = new Resistor({ value: '330 ohm' });

typecad.named('LED_ANODE').net(r_led.pin(1), led.pin(1));
typecad.net(r_led.pin(2), mcu.GPIO_STATUS);
typecad.net(led.pin(2), gnd);`,
      },
    ],
    notes: [
      'Available in sizes: 0201, 0402, 0603 (default), 0805, 1206, 1210',
      'KiCad symbol: Device:LED_Small',
      'Always use a current-limiting resistor in series with an LED',
      'Typical forward current: 5-20mA for standard indicators',
    ],
    related: ['diode', 'resistor', 'passive-sizes', 'net'],
  },
  {
    name: 'fuse',
    category: 'passive-components',
    description: 'Add a fuse. Available in 0603, 0805, 1206, and 1210 sizes only',
    package: '@typecad/pcb',
    import: "import { Fuse } from '@typecad/pcb';",
    usage: {
      signature: 'new Fuse(options?: FuseInit)',
      parameters: [
        { name: 'reference', type: 'string', required: false, description: 'Auto-assigned as F1, F2, etc. if omitted' },
        {
          name: 'size',
          type: "'0603' | '0805' | '1206' | '1210'",
          required: false,
          description: 'SMD package size. Default: 0603',
          default: '0603',
        },
        { name: 'voltage', type: 'string', required: false, description: 'Voltage rating' },
        { name: 'datasheet', type: 'string', required: false, description: 'URL or path to datasheet' },
        { name: 'description', type: 'string', required: false, description: 'Human-readable description' },
        { name: 'mpn', type: 'string', required: false, description: 'Manufacturer Part Number' },
        { name: 'pcb', type: '{ x, y, rotation?, side? }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Power input fuse',
        code: `import { Fuse } from '@typecad/pcb';

let f1 = new Fuse({ voltage: '32V', description: 'Overcurrent protection', size: '0805' });

typecad.net(f1.pin(1), barrel_jack.pin(1));
typecad.net(f1.pin(2), regulator.VIN);`,
      },
    ],
    notes: [
      'Only available in sizes: 0603 (default), 0805, 1206, 1210 (NOT available in 0201 or 0402)',
      'KiCad symbol: Device:Fuse_Small',
      'Auto-numbered with prefix F',
    ],
    related: ['diode', 'passive-sizes', 'power', 'net'],
  },
  {
    name: 'connector',
    category: 'passive-components',
    description: 'Add a connector with a specified number of pins and a series preset or custom footprint',
    package: '@typecad/pcb',
    import: "import { Connector } from '@typecad/pcb';",
    usage: {
      signature:
        "new Connector(options?: { number?: number, series?: 'pin-header' | 'JST-SH', reference?, footprint?, pcb?, sch? })",
      parameters: [
        { name: 'number', type: 'number', required: false, description: 'Number of pins', default: '1' },
        {
          name: 'series',
          type: "'pin-header' | 'JST-SH'",
          required: false,
          description: 'Connector series preset. The symbol and footprint are templated from the pin count',
          default: 'pin-header',
        },
        { name: 'reference', type: 'string', required: false, description: 'Auto-assigned as J1, J2, etc. if omitted' },
        {
          name: 'footprint',
          type: 'string',
          required: false,
          description: 'Custom KiCad footprint. Overrides the series preset',
        },
        { name: 'pcb', type: '{ x, y, rotation }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Pin header connector',
        code: `import { Connector } from '@typecad/pcb';

let j1 = new Connector({ number: 10 });
// Default series: Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical

typecad.net(j1.pin(1), vcc);
typecad.net(j1.pin(10), gnd);`,
      },
      {
        title: 'JST-SH connector',
        code: `let j1 = new Connector({ number: 4, series: 'JST-SH' });
// Footprint templated from the pin count:
// Connector_JST:JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal`,
      },
      {
        title: 'Custom footprint',
        code: `let j1 = new Connector({
  number: 4,
  footprint: 'Connector_JST:JST_PH_S4B-PH-SM4-TB_1x04_P2.00mm_Horizontal',
});`,
      },
    ],
    notes: [
      "Prefer `series` over a hand-written footprint — the pin count lives in `number` only, so symbol and footprint can't disagree",
      'Default series is a 2.54mm vertical pin header',
      'KiCad symbol auto-set to Connector:Conn_01x{NN}_Pin',
      'Auto-numbered with prefix J',
      'Access individual pins with j1.pin(1), j1.pin(2), etc.',
    ],
    related: ['testpoint', 'net', 'component'],
  },
  {
    name: 'testpoint',
    category: 'passive-components',
    description: 'Add a testpoint for debugging and measurement access on the PCB',
    package: '@typecad/pcb',
    import: "import { TestPoint } from '@typecad/pcb';",
    usage: {
      signature: 'new TestPoint(options?: ComponentInit)',
      parameters: [
        {
          name: 'reference',
          type: 'string',
          required: false,
          description: 'Auto-assigned as TP1, TP2, etc. if omitted',
        },
        {
          name: 'footprint',
          type: 'string',
          required: false,
          description: 'Custom footprint. Default: TestPoint:TestPoint_Pad_D1.0mm',
        },
        { name: 'pcb', type: '{ x, y, rotation }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Signal testpoints',
        code: `import { TestPoint } from '@typecad/pcb';

let tp_vcc = new TestPoint();
let tp_gnd = new TestPoint();

typecad.named('TP_VCC').net(tp_vcc.pin(1), vcc_net);
typecad.named('TP_GND').net(tp_gnd.pin(1), gnd_net);`,
      },
    ],
    notes: [
      'Default footprint: TestPoint:TestPoint_Pad_D1.0mm',
      'KiCad symbol: Connector:TestPoint',
      'Auto-numbered with prefix TP',
      'Connect using tp.pin(1)',
    ],
    related: ['connector', 'mounting-hole', 'net'],
  },
  {
    name: 'mounting-hole',
    category: 'passive-components',
    description: 'Add a mounting hole to the PCB for mechanical attachment',
    package: '@typecad/pcb',
    import: "import { MountingHole } from '@typecad/pcb';",
    usage: {
      signature:
        "new MountingHole(options?: { reference?: string, footprint?: string, size?: 'M2'|'M2.5'|'M3'|'M4'|'M5'|'M6'|'M8', pcb? })",
      parameters: [
        {
          name: 'reference',
          type: 'string',
          required: false,
          description: 'Auto-assigned as MH1, MH2, etc. if omitted',
        },
        {
          name: 'size',
          type: 'string',
          required: false,
          description: 'Metric bolt size: M2, M2.5, M3, M4, M5, M6, M8',
          default: 'M2',
        },
        {
          name: 'footprint',
          type: 'string',
          required: false,
          description: 'Custom footprint. Overrides size-derived default',
        },
        { name: 'pcb', type: '{ x, y, rotation }', required: false, description: 'PCB placement' },
      ],
    },
    examples: [
      {
        title: 'Board corner mounting holes',
        code: `import { MountingHole } from '@typecad/pcb';

let mh1 = new MountingHole({ size: 'M3', pcb: { x: 5, y: 5 } });
let mh2 = new MountingHole({ size: 'M3', pcb: { x: 45, y: 5 } });
let mh3 = new MountingHole({ size: 'M3', pcb: { x: 5, y: 35 } });
let mh4 = new MountingHole({ size: 'M3', pcb: { x: 45, y: 35 } });

typecad.create(mh1, mh2, mh3, mh4);`,
      },
    ],
    notes: [
      'KiCad symbol: Mechanical:MountingHole_Pad',
      'Auto-numbered with prefix MH',
      'M3 is the most common mounting hole size for PCBs',
    ],
    related: ['testpoint', 'outline', 'pcb-structure'],
  },
  {
    name: 'net-tie',
    category: 'passive-components',
    description:
      'Net ties connect 2-4 nets together on the PCB without adding a visible component. Used for shorting nets or splitting ground planes',
    package: '@typecad/pcb',
    import: "import { NetTie } from '@typecad/pcb';",
    usage: {
      signature: 'new NetTie(options?: { reference?, schematic?, net1?, net2?, net3?, net4?, footprint?, pcb?, sch? })',
      parameters: [
        { name: 'net1', type: 'Pin', required: false, description: 'First net pin' },
        { name: 'net2', type: 'Pin', required: false, description: 'Second net pin' },
        { name: 'net3', type: 'Pin', required: false, description: 'Third net pin (3-way tie)' },
        { name: 'net4', type: 'Pin', required: false, description: 'Fourth net pin (4-way tie)' },
        { name: 'schematic', type: 'Schematic', required: false, description: 'Schematic instance for auto-wiring' },
      ],
    },
    examples: [
      {
        title: '2-pin net tie',
        code: `import { NetTie } from '@typecad/pcb';

let tie = new NetTie({ schematic: typecad.schematic, net1: pinA, net2: pinB });`,
      },
      {
        title: '3-pin net tie',
        code: `let tie = new NetTie({
  schematic: typecad.schematic,
  net1: analog_gnd,
  net2: digital_gnd,
  net3: power_gnd,
});`,
      },
    ],
    notes: [
      'Number of provided net pins determines the tie type (2, 3, or 4)',
      'If schematic, net1, and net2 are all provided, auto-wires the nets',
      'Symbol: Device:NetTie_2, Device:NetTie_3, or Device:NetTie_4',
    ],
    related: ['net', 'pcb-structure'],
  },
  {
    name: 'passive-sizes',
    category: 'passive-components',
    description: 'SMD passive component package sizes and when to use each',
    package: '@typecad/pcb',
    examples: [
      {
        title: 'Sizes are a constructor option — one import covers them all',
        code: `import { Resistor, Capacitor, Inductor, Diode, LED, Fuse, Connector, TestPoint, MountingHole, NetTie } from '@typecad/pcb';

let r1 = new Resistor({ value: '10k' });                 // 0603 (default)
let r2 = new Resistor({ value: '10k', size: '0805' });   // explicit size
let f1 = new Fuse({ size: '1210' });                     // Fuse: 0603/0805/1206/1210 only`,
      },
    ],
    notes: [
      'All sizes come from the `size` option — there are no per-size import paths',
      'An explicit `footprint` always wins over the size preset',
      '0603 is the default/recommended size for most designs — good balance of size and hand-solderability',
      '0201: 0.6x0.3mm — very small, hard to hand-solder, for dense designs only',
      '0402: 1.0x0.5mm — small, common in compact designs',
      '0603: 1.6x0.8mm — most common, good for most applications',
      '0805: 2.0x1.25mm — easier hand-soldering, higher power rating',
      '1206: 3.2x1.6mm — high power, easy hand-soldering',
      '1210: 3.2x2.5mm — high power and capacitance values',
      'Fuse is only available in 0603, 0805, 1206, 1210 (not 0201 or 0402)',
      'Each size auto-sets the correct KiCad footprint (e.g. 0603 = *_0603_1608Metric)',
      "Inside a Package, `this.passives.*` factories default to 0603; shift a whole package with { passiveSize: '0805' }",
    ],
    related: ['resistor', 'capacitor', 'inductor', 'diode', 'led', 'fuse'],
  },
];
