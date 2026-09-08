import type { Skill } from './types.js';

export const coreSkills: Skill[] = [
  {
    name: 'pcb-structure',
    category: 'core',
    description:
      'How a typeCAD program is structured: PCB instance, component creation, net connections, and the create() call that generates KiCad files (.kicad_pcb, .kicad_sch, .net)',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Minimal typeCAD program',
        code: `import { PCB, Power, Resistor, Capacitor, LED } from '@typecad/pcb';

let typecad = new PCB('my-board');

let r1 = new Resistor({ value: '330 ohm' });
let c1 = new Capacitor({ value: '100 nF' });
let led = new LED();

typecad.net(r1.pin(1), led.pin(1));
typecad.net(c1.pin(1), r1.pin(2));

typecad.create(r1, c1, led);`,
      },
      {
        title: 'With power management',
        code: `import { PCB, Power, Component } from '@typecad/pcb';

let typecad = new PCB('power-board');

let battery = new Component('Battery:BatteryHolder_Keystone_3008_1x2450');
let vout = new Power({ power: battery.pin(1), gnd: battery.pin(2), voltage: 3.7, direction: 'output' });

typecad.create(battery);`,
      },
    ],
    notes: [
      'PCB constructor takes the board name used for generated .kicad_pcb, .kicad_sch, and .net files',
      'All output goes to ./build/ directory',
      'create() must be called last — it generates the KiCad files (.kicad_pcb, .kicad_sch, .net)',
      'Components must be passed to create() to appear on the board',
      'Use group() to organize components into named groups on the PCB',
      'Auto-numbering: if reference is omitted, typeCAD assigns R1, R2, C1, etc.',
      'For complex designs with many ICs and supporting components, use Package classes to encapsulate sub-circuits. This keeps the entry file clean and makes sub-circuits reusable. See package-base skill.',
    ],
    related: ['component', 'net', 'power', 'build', 'package-base', 'circuit-design'],
  },
  {
    name: 'component',
    category: 'core',
    description:
      'The Component class is the base building block for all parts in a typeCAD design. It holds reference, value, footprint, pins, and PCB placement',
    package: '@typecad/pcb',
    import: "import { Component } from '@typecad/pcb';",
    usage: {
      signature: 'new Component(footprint: string)',
      parameters: [
        {
          name: 'footprint',
          type: 'string',
          required: true,
          description: 'KiCad footprint in library:name format (e.g. "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm")',
        },
        {
          name: 'reference',
          type: 'string',
          required: false,
          description: 'Set reference designator via property assignment. Auto-assigned if omitted',
        },
        { name: 'value', type: 'string', required: false, description: 'Set component value via property assignment' },
        {
          name: 'referenceLayout',
          type: 'ITextPositioning',
          required: false,
          description:
            'Position and styling for the reference text (F.SilkS layer). All fields optional; omitted fields keep the footprint layout. Fields: x?, y?, rotation?, layer?, width?, height?, thickness?, show? (false hides the designator)',
        },
        {
          name: 'valueLayout',
          type: 'ITextPositioning',
          required: false,
          description:
            'Position and styling for the value text (F.Fab layer). All fields optional; omitted fields keep the footprint layout. Fields: x?, y?, rotation?, layer?, width?, height?, thickness?, show?',
        },
        {
          name: 'fabLayout',
          type: 'ITextPositioning & { text?: string }',
          required: false,
          description:
            'Position and styling for the FAB text (F.Fab layer). Optionally set text (defaults to ${REFERENCE}). All fields optional. Fields: x?, y?, rotation?, layer?, width?, height?, thickness?, text?, show?',
        },
      ],
    },
    examples: [
      {
        title: 'Basic component',
        code: `import { Component } from '@typecad/pcb';

let u1 = new Component('Package_TO_SOT_SMD:TO-252-2');
u1.reference = 'U1';
u1.value = 'LM7805';
u1.datasheet = 'https://www.ti.com/lit/ds/symlink/lm7805.pdf';
u1.description = '5V voltage regulator';`,
      },
      {
        title: 'Accessing pins',
        code: `let u1 = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');

u1.pin(1)  // Pin 1
u1.pin(8)  // Pin 8`,
      },
      {
        title: 'Setting properties after creation',
        code: `let r1 = new Component('Resistor_SMD:R_0603_1608Metric');
r1.reference = 'R1';
r1.value = '10kOhm';
r1.description = 'Pull-up resistor';
r1.pcb = { x: 10, y: 20, rotation: 90 };`,
      },
      {
        title: 'Customizing text layout',
        code: `let r1 = new Component('Resistor_SMD:R_0603_1608Metric', {
  reference: 'R1',
  referenceLayout: { x: 0, y: -1.5, rotation: 90, width: 0.8, height: 0.8 },
  valueLayout: { x: 0, y: 1.5, width: 0.6, height: 0.6 },
  fabLayout: { x: 0, y: 0, text: 'R1' },
});`,
      },
    ],
    notes: [
      'footprint format: LibraryName:FootprintName (e.g. Package_SO:SOIC-8_3.9x4.9mm_P1.27mm)',
      'Use .reference = "R1" to set reference, or omit for auto-numbering',
      'Use .value = "10k" to set component value',
      'Pin access is by number: component.pin(1), component.pin(2), etc.',
      'For passives (resistors, capacitors, etc.), use the built-in factories (Resistor, Capacitor, ...) instead of raw Component',
      'Set dnp = true for components that should appear in schematic but not in assembly/BOM',
      'pcb coordinates are in mm, rotation in degrees, side defaults to "front"',
      'referenceLayout controls reference text (F.SilkS): position, rotation, font size, thickness, layer',
      'valueLayout controls value text (F.Fab): same fields as referenceLayout',
      'fabLayout controls FAB user text (F.Fab): same fields plus optional text override',
      'Layout properties can be set at construction or after: r1.referenceLayout = { x: 1, y: 2 }',
      'During kicad2typecad --apply roundtrip, layouts are only updated if already in source; use --capture-layouts to import all',
    ],
    related: ['pin', 'custom-component', 'pcb-structure'],
  },
  {
    name: 'pin',
    category: 'core',
    description:
      'Pins represent the electrical connections on a component. Each pin has a number, type, and optional power info for validation',
    package: '@typecad/pcb',
    import: "import { Pin } from '@typecad/pcb';",
    usage: {
      signature: 'component.pin(number: number|string, config?: { type?: TPinType, powerInfo?: IPinPowerInfo }): Pin',
      parameters: [
        { name: 'number', type: 'number | string', required: true, description: 'Pin number on the component package' },
        {
          name: 'config.type',
          type: 'TPinType',
          required: false,
          description: 'Electrical pin type for ERC',
          default: '"passive"',
        },
        {
          name: 'config.powerInfo',
          type: 'IPinPowerInfo',
          required: false,
          description: 'Voltage/current ratings for power validation',
        },
      ],
    },
    examples: [
      {
        title: 'Pin types for ERC',
        code: `// Pin types determine ERC compatibility:
// "power_in"    - Receives power (VCC pin on an IC)
// "power_out"   - Supplies power (output of a regulator)
// "input"       - Signal input
// "output"      - Signal output
// "bidirectional" - Can be input or output (MCU GPIO)
// "passive"     - No drive capability (resistors, capacitors)
// "open_collector" - Open collector output
// "no_connect"  - Intentionally unconnected

let pin = u1.pin(8, {
  type: 'power_in',
  powerInfo: {
    minimum_voltage: -0.5,
    maximum_voltage: 6.0,
    current: 0.2,
  },
});`,
      },
      {
        title: 'Accessing pins from a component',
        code: `let u1 = new Component('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
u1.reference = 'U1';

// Access by pin number
let pin8 = u1.pin(8);

// Connect pins
typecad.net(u1.pin(8), r1.pin(1));`,
      },
      {
        title: 'Setting pin type for ERC',
        code: `// Power objects set pin types automatically:
let vout = new Power({ power: regulator.pin(1), gnd: regulator.pin(2), voltage: 3.3, direction: 'output' });
// regulator.pin(1).type is now "power_out"

// Set manually for custom components:
u1.pin(1).type = 'bidirectional';
u1.pin(4).type = 'passive'; // shared ground in regulators`,
      },
    ],
    notes: [
      'Pin types are critical for ERC — connecting power_out to power_out causes an error',
      'Power objects automatically set pin types to power_in or power_out',
      'powerInfo enables voltage/current validation during build',
      'For shared pins (e.g. ground in voltage regulators), set type to "passive" to avoid ERC conflicts',
    ],
    related: ['component', 'net', 'power', 'custom-component'],
  },
  {
    name: 'net',
    category: 'core',
    description:
      'Nets connect pins together to form electrical circuits. Use net() for unnamed connections or named().net() for named nets that appear in KiCad',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Unnamed nets',
        code: `let typecad = new PCB('board');

// Connect two pins — net is auto-named (net1, net2, etc.)
typecad.net(u1.pin(1), r1.pin(1));

// Connect multiple pins in one net
typecad.net(u1.VCC, c1.pin(1), r1.pin(1));`,
      },
      {
        title: 'Named nets',
        code: `// Named nets appear with meaningful names in KiCad schematic and PCB
typecad.named('VCC_3V3').net(regulator.VOUT, mcu.VCC, c1.pin(1));
typecad.named('GND').net(regulator.GND, mcu.GND, c1.pin(2));
typecad.named('SDA').net(mcu.GPIO4, sensor.SDA);
typecad.named('SCL').net(mcu.GPIO5, sensor.SCL);`,
      },
      {
        title: 'Named property access',
        code: `// Custom components with named pins use property access:
typecad.net(u1.VCC, power_source.power);
typecad.net(u1.GND, power_source.gnd);

// Passives use pin() method:
typecad.net(r1.pin(1), u1.pin(3));
typecad.net(r1.pin(2), u1.pin(4));`,
      },
    ],
    notes: [
      'net() returns an ISchematicNetDefinition with the net name and connected pins',
      'Named nets make PCB layout easier — you see signal names instead of auto-generated net#',
      'If named nets get merged during build, a warning is logged',
      'All pins in a single net() call are electrically connected',
      'named() is chainable: typecad.named("name").net(pin1, pin2)',
    ],
    related: ['pcb-structure', 'component', 'pin', 'power'],
  },
  {
    name: 'power',
    category: 'core',
    description:
      'The Power class defines power sources and sinks. It automatically sets pin types for ERC, generates KiCad power symbols (VCC, GND, +3V3, etc.) and PWR_FLAG symbols in the schematic, and enables voltage validation between connected power domains',
    package: '@typecad/pcb',
    import: "import { Power } from '@typecad/pcb';",
    usage: {
      signature:
        'new Power(options: { power?: Pin, gnd?: Pin, voltage?: number, current?: number, direction?: "input"|"output" })',
      parameters: [
        { name: 'power', type: 'Pin', required: false, description: 'Pin that supplies or receives power' },
        { name: 'gnd', type: 'Pin', required: false, description: 'Pin that supplies or receives ground' },
        { name: 'voltage', type: 'number', required: false, description: 'Nominal voltage (e.g. 3.3, 5.0, 12)' },
        { name: 'current', type: 'number', required: false, description: 'Current draw or supply capability in amps' },
        {
          name: 'direction',
          type: '"input" | "output"',
          required: false,
          description: '"output" for power sources, "input" for power consumers',
          default: '"output"',
        },
      ],
    },
    examples: [
      {
        title: 'Power source (battery, regulator output)',
        code: `import { Component, Power } from '@typecad/pcb';

let battery = new Component('Battery:BatteryHolder_Keystone_3008_1x2450');

let vin = new Power({
  power: battery.pin(1),
  gnd: battery.pin(2),
  voltage: 3.7,
  direction: 'output',  // This supplies power
});
// battery.pin(1).type is now "power_out"
// battery.pin(2).type is now "power_in"`,
      },
      {
        title: 'Auto-generated power symbols and PWR_FLAGs',
        code: `import { PCB, Power, Resistor } from '@typecad/pcb';

let typecad = new PCB('voltage-divider');

let r1 = new Resistor({ value: '1kohm' });
let r2 = new Resistor({ value: '10kohm' });

// Power pins are automatically typed
let power = new Power({ power: r1.pin(1), gnd: r2.pin(2) });

// Named nets matching KiCad power symbol names trigger auto-generation
typecad.named('VCC').net(power.power);   // Generates power:VCC + PWR_FLAG
typecad.named('GND').net(power.gnd);     // Generates power:GND + PWR_FLAG

typecad.named('vdiv').net(r1.pin(2), r2.pin(1));
typecad.create(r1, r2);

// The schematic will contain:
// - power:VCC (#PWR01) connected to r1 pin 1
// - power:PWR_FLAG (#FLG01) connected to VCC net
// - power:GND (#PWR02) connected to r2 pin 2
// - power:PWR_FLAG (#FLG02) connected to GND net`,
      },
      {
        title: 'Multiple power domains',
        code: `let r1 = new Resistor({ value: '1kohm' });
let r3 = new Resistor({ value: '4.7kohm' });

let vcc_power = new Power({ power: r1.pin(1), gnd: r1.pin(2) });
let v3_power = new Power({ power: r3.pin(1), gnd: r3.pin(2) });

// Each unique power net name gets its own symbol + PWR_FLAG
typecad.named('VCC').net(vcc_power.power);
typecad.named('GND').net(vcc_power.gnd);
typecad.named('+3V3').net(v3_power.power);    // power:+3V3 + PWR_FLAG
typecad.named('GND').net(v3_power.gnd);        // GND already has symbols, no duplicate

// Net name must match an existing KiCad power symbol:
// VCC, GND, +3V3, +5V, +BAT, VDD, VSS, etc.`,
      },
      {
        title: 'Voltage regulator chain',
        code: `let regulator = new Component('Package_TO_SOT_SMD:SOT-23-5');

let reg_input = new Power({
  power: regulator.pin(1),
  gnd: regulator.pin(2),
  voltage: 5.0,
  direction: 'input',
});

let reg_output = new Power({
  power: regulator.pin(3),
  gnd: regulator.pin(2),
  voltage: 3.3,
  direction: 'output',
});

// For shared ground pins in regulators, set to passive to avoid ERC conflicts:
regulator.pin(2).type = 'passive';`,
      },
    ],
    notes: [
      'direction: "output" sets power pin to "power_out" and gnd to "power_in"',
      'direction: "input" sets both power and gnd pins to "power_in"',
      'Voltage validation runs automatically during build — connecting 5V output to 3.3V input generates a warning',
      'For voltage regulators with shared ground pins, manually set the ground pin type to "passive"',
      'Power objects are required for proper ERC — they define the power topology of your circuit',
      'Power symbols (VCC, GND, +3V3, etc.) and PWR_FLAGs are auto-generated when Power pins are placed in named nets matching KiCad power symbol names',
      'The net name must exactly match a symbol in the KiCad power library (e.g. "VCC", "GND", "+3V3", "+5V")',
      'Each unique power net name gets one power symbol and one PWR_FLAG — shared nets (e.g. multiple GND connections) are deduplicated',
      'GND-type symbols are auto-detected by the symbol pin direction (270 = ground, 90 = power rail)',
    ],
    related: ['pin', 'net', 'pcb-structure'],
  },
  {
    name: 'buses',
    category: 'core',
    description: 'Bus classes (I2C, UART, USB) group related signal pins together for cleaner connection management',
    package: '@typecad/pcb',
    import: "import { I2C, UART, USB } from '@typecad/pcb';",
    examples: [
      {
        title: 'I2C bus',
        code: `import { I2C } from '@typecad/pcb';

// Define I2C bus from MCU pins
let i2c = new I2C(mcu.pin(4), mcu.pin(5));

// Connect to sensor
typecad.named('I2C_SDA').net(i2c.sda, sensor.SDA);
typecad.named('I2C_SCL').net(i2c.scl, sensor.SCL);`,
      },
      {
        title: 'UART bus',
        code: `import { UART } from '@typecad/pcb';

// Full UART with flow control
let uart = new UART(mcu.pin(10), mcu.pin(11), mcu.pin(12), mcu.pin(13));

// TX/RX only
let serial = new UART(mcu.pin(10), mcu.pin(11));

typecad.named('UART_TX').net(serial.tx, usb_bridge.TX);
typecad.named('UART_RX').net(serial.rx, usb_bridge.RX);`,
      },
      {
        title: 'USB bus',
        code: `import { USB } from '@typecad/pcb';

let usb = new USB(connector.pin(2), connector.pin(3));

typecad.named('USB_DP').net(usb.dp, esd_protector.DP);
typecad.named('USB_DN').net(usb.dn, esd_protector.DN);`,
      },
    ],
    notes: [
      'I2C constructor: new I2C(sda: Pin, scl: Pin)',
      'UART constructor: new UART(rx: Pin, tx: Pin, rts?: Pin, cts?: Pin)',
      'USB constructor: new USB(dp: Pin, dn: Pin)',
      'Bus classes are organizational — they group pins but do not auto-connect',
      'Use named nets with bus signal names for clarity in KiCad',
    ],
    related: ['pin', 'net', 'component'],
  },
];
