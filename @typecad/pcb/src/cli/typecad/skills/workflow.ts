import type { Skill } from './types.js';

export const workflowSkills: Skill[] = [
  {
    name: 'circuit-design',
    category: 'workflow',
    description:
      'End-to-end workflow for designing a PCB in typeCAD: from requirements to generated KiCad files. Covers when to ask the user, how to structure components, common circuit patterns, and pitfalls to avoid',
    examples: [
      {
        title: 'Complete design workflow (MCU dev board example)',
        code: `// STEP 1: Plan the design
// - List required ICs and their supporting circuits
// - Identify which groups of components should be packages
// - Determine power architecture (voltage rails, regulators)
// - Identify connectors and mechanical requirements

// STEP 2: Add IC components from KiCad libraries
// Run: typecad-pcb search "ESP32-PICO"
// Run: typecad-pcb add component --symbol_source=kicad --symbol=MCU_Espressif:ESP32-PICO-D4 --footprint_source=kicad --footprint=Package_DFN_QFN:QFN-48-1EP_7x7mm_P0.5mm_EP5.3x5.3mm --folder=./src
// The generated .ts file contains ALL pin names and numbers — no need to parse KiCad files manually.

// STEP 3: Create packages for complex sub-circuits
// A package encapsulates an IC + its supporting passives (decoupling caps, pull-ups, etc.)
// See package-base skill for the Package class API.

// STEP 4: Build the board in your entry file
import { PCB, Power, Resistor, Capacitor, LED, Connector } from '@typecad/pcb';
import { ESP32_PICO_D4 } from './ESP32_PICO_D4.js';

let typecad = new PCB('esp32-devboard');
typecad.outline(0, 0, 51, 25);

// Create IC components
let mcu = new ESP32_PICO_D4();

// Add supporting passives
let c_bypass1 = new Capacitor({ value: '100nF' });
let c_bypass2 = new Capacitor({ value: '100nF' });
let r_pullup = new Resistor({ value: '10kOhm' });

// Define power architecture
let v3v3 = new Power({ power: mcu.pin(1), gnd: mcu.pin(49), voltage: 3.3, direction: 'input' });

// Make connections
typecad.named('VCC_3V3').net(mcu.pin(1), c_bypass1.pin(1), c_bypass2.pin(1));
typecad.named('GND').net(mcu.pin(49), c_bypass1.pin(2), c_bypass2.pin(2));

// Add GPIO headers
let j_left = new Connector({ number: 20 });
let j_right = new Connector({ number: 20 });

// Create all components
typecad.create(mcu, c_bypass1, c_bypass2, r_pullup, j_left, j_right);`,
      },
    ],
    notes: [
      'WORKFLOW ORDER: (1) Plan → (2) Search & add components → (3) Create packages → (4) Wire in entry file → (5) Build',
      'PIN INFORMATION: After running "typecad-pcb add component", the generated .ts file contains all pin names and numbers. Never parse raw .kicad_sym files for pin info — it is unnecessary and error-prone.',
      'SYMBOL EXTENDS: KiCad symbols may use inheritance internally, but the generated component file resolves all pins. Do not trace symbol extends chains.',
      'SEARCH LIMITATIONS: "typecad-pcb search" finds schematic symbols only. A symbol found by search may not have a matching KiCad footprint. When add-component fails with "Invalid KiCAD library symbol", the symbol exists but has no default footprint association. Ask the user for the correct footprint in this case.',
      'FOOTPRINT SELECTION: When multiple footprints match a component (different packages, sizes, or pin counts), ask the user which one to use. Do not guess footprints.',
      'WHEN TO ASK THE USER: (a) Multiple component options found by search — ask which variant to use. (b) Footprint is ambiguous or unknown — ask for the specific footprint. (c) Pin assignments are unclear from requirements — ask for a pinout. (d) Power architecture has multiple valid approaches — ask for voltage rails and current requirements.',
      'PACKAGE ENCAPSULATION: When an IC requires 3+ supporting components (decoupling caps, pull-up/down resistors, crystals, etc.), create a Package class. This keeps the entry file clean and makes the sub-circuit reusable.',
      'COMMON MCU SUPPORTING CIRCUITS: (a) Decoupling capacitors: 100nF per VCC pin + 10uF bulk. (b) Reset circuit: 10k pull-up on EN/RESET + button to GND. (c) Boot mode: pull-up/pull-down on boot pins + button. (d) Status LED: resistor (220-330 ohm) + LED on a GPIO. (e) Crystal/oscillator: if not built into the IC. (f) Voltage regulator: LDO or buck with input/output capacitors.',
      'POWER DESIGN PATTERN: (1) Define the input power source (USB, battery, barrel jack). (2) Add voltage regulator with input/output caps. (3) Create Power objects for each voltage rail. (4) Use named nets matching KiCad power symbols (VCC, GND, +3V3, +5V).',
      'BUILD VERIFICATION: After wiring, run "typecad-pcb check" — it builds, then reports unconnected pads, single-pin nets, ERC, and DRC in one pass (--json for machine output). Fix ERC errors by correcting pin types (use Power objects). Fix missing connections with "typecad-pcb edit connect" or by reviewing net definitions; verify the result with "typecad-pcb query nets".',
    ],
    related: ['pcb-structure', 'add-component', 'package-base', 'custom-component', 'power', 'search'],
  },
];
