import type { Skill } from './types.js';

export const kicadSkills: Skill[] = [
  {
    name: 'kicad-integration',
    category: 'kicad',
    description: 'How typeCAD integrates with KiCad: generating files, running commands, and library paths',
    package: '@typecad/pcb',
    import: "import { KiCAD, runDRC, exportPCB, exportSchematic } from '@typecad/pcb';",
    examples: [
      {
        title: 'KiCad detection and paths',
        code: `import { KiCAD } from '@typecad/pcb';

// KiCad auto-detection
let kicad = KiCAD.instance;
let paths = kicad.getLibraryPaths();
// paths.symbols -> path to symbol libraries
// paths.footprints -> path to footprint libraries

// Check installation
let cliPath = KiCAD.cliPath;   // path to kicad-cli
let isInstalled = KiCAD.path !== undefined;`,
      },
      {
        title: 'Running KiCad commands',
        code: `import { executeKiCADCommand, runDRC, exportPCB } from '@typecad/pcb';

// Run arbitrary kicad-cli command
let output = await executeKiCADCommand('pcb', ['drc', './build/board.kicad_pcb']);

// DRC
let report = await runDRC('./build/board.kicad_pcb');

// Export to Gerber
await exportPCB('./build/board.kicad_pcb', './gerber/', 'gerber');

// Export schematic to PDF
await exportSchematic('./build/board.kicad_sch', './board.pdf', 'pdf');`,
      },
    ],
    notes: [
      'KiCad is auto-detected from PATH, common install locations, and Flatpak',
      'Set kicad_cli in typecad.conf.ts if auto-detection fails',
      'exportPCB formats: gerber, svg, pdf, step, dxf',
      'exportSchematic formats: pdf, svg, netlist',
      'CLI: typecad-pcb doctor checks KiCad installation status',
    ],
    related: ['drc', 'erc', 'build', 'config'],
  },
  {
    name: 'kicad-symbols',
    category: 'kicad',
    description: 'KiCad symbol library format and how to find symbols for typeCAD components',
    examples: [
      {
        title: 'Symbol format',
        code: `// KiCad symbol format: LibraryName:SymbolName
// Examples:
'MCU_Microchip_ATmega:ATmega328P-A'
'Regulator_Linear:LM7805_TO220'
'Device:R_Small'
'Device:C_Small'
'Device:LED_Small'
'Connector:Conn_01x10_Pin'
'Mechanical:MountingHole_Pad'

// Use in Component:
let u1 = new Component('Package_QFP:TQFP-32_7x7mm_P0.8mm')
  .symbol('MCU_Microchip_ATmega:ATmega328P-A');`,
      },
      {
        title: 'Finding symbols',
        code: `# Search for symbols using the CLI
typecad-pcb search "voltage regulator"
typecad-pcb search LM358
typecad-pcb search "op amp" --format=json`,
      },
    ],
    notes: [
      'Format: LibraryName:SymbolName (colon-separated)',
      'Passive symbols (Device:R_Small, Device:C_Small) are auto-set by the built-in passives factories',
      'For ICs, use typecad-pcb search or typecad-pcb add component to find the correct symbol',
      'Symbol names often include the package type (e.g. ATmega328P-AU for TQFP)',
      'A symbol existing in the KiCad library does not guarantee a matching footprint exists. When add-component fails, the symbol may lack a default footprint association. Specify the footprint explicitly or ask the user.',
    ],
    related: ['kicad-footprints', 'add-component', 'search', 'component', 'circuit-design'],
  },
  {
    name: 'kicad-footprints',
    category: 'kicad',
    description: 'KiCad footprint library format and common footprints used in typeCAD designs',
    examples: [
      {
        title: 'Footprint format',
        code: `// KiCad footprint format: LibraryName:FootprintName
// Common IC packages:
'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
'Package_QFP:TQFP-32_7x7mm_P0.8mm'
'Package_QFP:LQFP-48_7x7mm_P0.5mm'
'Package_TO_SOT_SMD:SOT-23-5'
'Package_TO_SOT_SMD:TO-252-2'
'Package_BGA:BGA-48_6.0x6.0mm_Layout6x8'

// Passive footprints (auto-set by the built-in passives factories):
'Resistor_SMD:R_0603_1608Metric'
'Capacitor_SMD:C_0603_1608Metric'
'Inductor_SMD:L_0603_1608Metric'
'Diode_SMD:D_0603_1608Metric'
'LED_SMD:LED_0603_1608Metric'
'Fuse:Fuse_0603_1608Metric'

// Connectors:
'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical'
'Connector_JST:JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal'

// Mechanical:
'MountingHole:MountingHole_3.2mm_M3'
'TestPoint:TestPoint_Pad_D1.0mm'`,
      },
    ],
    notes: [
      'Format: LibraryName:FootprintName (colon-separated)',
      'Footprint name includes physical dimensions (e.g. 3.9x4.9mm) and pitch (e.g. P1.27mm)',
      'Passive footprints are auto-set by the built-in passives — specify the `size` option instead',
      'SOIC = Small Outline IC, QFP = Quad Flat Package, BGA = Ball Grid Array',
      'SOT-23 is common for small regulators and transistors',
    ],
    related: ['kicad-symbols', 'add-component', 'passive-sizes', 'component'],
  },
  {
    name: 'roundtrip',
    category: 'kicad',
    description:
      'Round-trip workflow: edit in KiCad, sync changes back to typeCAD source using kicad2typecad --apply. Controls how component positions and text layouts are synchronized',
    examples: [
      {
        title: 'Apply component position changes',
        code: `# After editing in KiCad, sync positions back:
npx kicad2typecad build/board.kicad_pcb --apply`,
      },
      {
        title: 'Capture all text layout positions',
        code: `# Import reference/value/fab text positions from KiCad:
npx kicad2typecad build/board.kicad_pcb --apply --capture-layouts`,
      },
    ],
    notes: [
      '--apply interactively syncs KiCad changes back to your TypeScript source files',
      'Component positions (x, y, rotation, side) are always synced',
      'Text layouts (referenceLayout, valueLayout, fabLayout) are only updated if already present in source',
      'Use --capture-layouts to import all text layout positions, even for components without layout assignments',
      'Display mode (without --apply) shows all layout code for reference',
    ],
    related: ['pcb-placement', 'component', 'kicad-integration'],
  },
];
