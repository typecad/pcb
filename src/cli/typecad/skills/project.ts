import type { Skill } from './types.js';

export const projectSkills: Skill[] = [
  {
    name: 'create-project',
    category: 'project',
    description: 'Create a new typeCAD project with KiCad project files, npm package structure, and optional firmware',
    examples: [
      {
        title: 'Interactive project creation',
        code: `typecad-pcb create`,
      },
      {
        title: 'Non-interactive project creation',
        code: `typecad-pcb create --name=my-board --pio=true --board=esp32dev`,
      },
      {
        title: 'Programmatic equivalent',
        code: `npx @typecad/pcb create --name=my-board --pio=false --git=true`,
      },
    ],
    notes: [
      'Creates: package.json, tsconfig.json, typecad.conf.ts, src/ directory, KiCad project files',
      '--pio=true creates a PlatformIO firmware project inside the typeCAD project',
      '--board specifies the PlatformIO board (default: esp32dev)',
      'Use `typecad-pcb package` to browse and install optional typeCAD packages after creation',
    ],
    related: ['build', 'add-component', 'add-package', 'config'],
  },
  {
    name: 'add-component',
    category: 'project',
    description:
      'Add a component to the current typeCAD project from KiCad libraries, local files, or JLCPCB/EasyEDA. Generates a .ts file with all pin names and numbers — this is the source of pin information',
    examples: [
      {
        title: 'Interactive component addition',
        code: `typecad-pcb add component`,
      },
      {
        title: 'From KiCad library',
        code: `typecad-pcb add component --symbol_source=kicad --symbol=MCU_Microchip_ATmega:ATmega328P-A --footprint_source=kicad --footprint=Package_QFP:TQFP-32_7x7mm_P0.8mm`,
      },
      {
        title: 'From JLCPCB',
        code: `typecad-pcb add component --symbol_source=jlcpcb --c=C8282`,
      },
      {
        title: 'From local files',
        code: `typecad-pcb add component --symbol_source=local --symbol=./symbols/my_ic.kicad_sym --footprint_source=local --footprint=./footprints/my_ic.kicad_mod`,
      },
      {
        title: 'Programmatic equivalent',
        code: `npx @typecad/add-component --kicad=true --symbol=MCU_Microchip_ATmega:ATmega328P-A --footprint=Package_QFP:TQFP-32_7x7mm_P0.8mm --folder=./src`,
      },
    ],
    notes: [
      'Creates a .ts component file with a class extending Component',
      'IMPORTANT: The generated .ts file contains ALL pin names and numbers. Read this file after creation to get pin mappings — do not parse raw .kicad_sym files.',
      'KiCad format: library:symbol_name (e.g. MCU_Microchip_ATmega:ATmega328P-A)',
      'JLCPCB format: C followed by digits (e.g. C8282)',
      'Use --folder to specify output directory (default: current directory)',
      'Run typecad-pcb search to find KiCad symbol names',
      'SYMBOL/FOOTPRINT MISMATCH: Some symbols found by search may fail in add-component with "Invalid KiCAD library symbol". This happens when the symbol has no default footprint association. Try specifying the footprint explicitly from a different library, or create the component manually.',
      'CLASS NAMING: If the generated class name contains dots or special characters (e.g. AP2112K_3.3), rename the class and file to use underscores (AP2112K_3_3) to produce valid TypeScript identifiers.',
      'FOLDER OUTPUT: When using --folder=./src, the file is created inside that directory. Verify the output path to avoid nested src/src/ structures.',
      'MANUAL FALLBACK: If add-component fails, create the component file manually following the custom-component skill pattern. You will need the footprint string (library:footprint format) and pin assignments.',
    ],
    related: ['create-project', 'component', 'custom-component', 'search', 'circuit-design'],
  },
  {
    name: 'add-package',
    category: 'project',
    description: 'Create a reusable component package (IC with supporting components) for use across projects',
    examples: [
      {
        title: 'Interactive package creation',
        code: `typecad-pcb add package`,
      },
      {
        title: 'Empty package template',
        code: `typecad-pcb add package --empty=true --name=my-package`,
      },
      {
        title: 'Component package from KiCad',
        code: `typecad-pcb add package --component=true --name=lm7805 --kicad=true --symbol=Regulator_Linear:LM7805_TO220 --footprint=Package_TO_SOT_SMD:TO-252-2`,
      },
      {
        title: 'Programmatic equivalent',
        code: `npx @typecad/add-package ./src`,
      },
    ],
    notes: [
      'Component packages include an IC component file + index.ts for supporting passives',
      'Empty packages create a template with Package base class',
      'The Package base class provides protected methods: net(), via(), track(), add()',
      'See the package-base skill for the Package class API',
    ],
    related: ['package-base', 'add-component', 'create-project'],
  },
  {
    name: 'build',
    category: 'project',
    description: 'Build KiCad output files (.kicad_pcb, .kicad_sch, .net, .kicad_pro) from typeCAD TypeScript source',
    examples: [
      {
        title: 'Build with auto-detected entry',
        code: `typecad-pcb build`,
      },
      {
        title: 'Build with explicit entry file',
        code: `typecad-pcb build ./src/my-board.ts`,
      },
      {
        title: 'Verbose build output',
        code: `typecad-pcb build --verbose`,
      },
    ],
    notes: [
      'Entry file is auto-detected from: typecad.conf.ts entry field, package.json build script, or ./src/*.ts',
      'Output goes to ./build/ directory',
      'Runs validation during build (see validation skill)',
      'Generates: .kicad_pcb, .kicad_sch, .net, .kicad_pro files',
      'Uses tsx to execute the TypeScript entry file',
    ],
    related: ['create-project', 'validation', 'erc', 'drc', 'config'],
  },
  {
    name: 'search',
    category: 'project',
    description:
      'Search KiCad schematic symbol libraries to find component symbols. Note: search finds symbols only — a matching KiCad footprint may not exist for every symbol',
    examples: [
      {
        title: 'Interactive search',
        code: `typecad-pcb search`,
      },
      {
        title: 'Search with query',
        code: `typecad-pcb search "op amp"
typecad-pcb search LM358
typecad-pcb search "voltage regulator" --format=json --limit=10`,
      },
    ],
    notes: [
      'Searches the KiCad symbol library installed on your system',
      'Output formats: detailed (default), compact, table, json',
      'Sort by: score (default), id, manufacturer, package',
      'Returns the library:symbol format needed for add-component',
      'IMPORTANT: Search finds schematic symbols only. Not all symbols have associated KiCad footprints. When add-component fails after a successful search, it usually means the symbol lacks a default footprint. In this case, ask the user for the correct footprint or try specifying --footprint explicitly.',
      'When searching for specific ICs (e.g. "AMS1117-3.3"), exact model numbers may not appear in results. Try searching for the base part number (e.g. "1117") or the manufacturer prefix.',
      'When multiple results match, ask the user which variant to use — different packages (SOIC, SOT-23, TO-220, etc.) have different footprints and thermal characteristics.',
    ],
    related: ['add-component', 'kicad-symbols', 'circuit-design'],
  },
  {
    name: 'import',
    category: 'project',
    description:
      'Convert an existing KiCad .kicad_pcb file into typeCAD TypeScript code for reverse engineering or migration',
    examples: [
      {
        title: 'Import a KiCad PCB',
        code: `typecad-pcb import ./board.kicad_pcb`,
      },
      {
        title: 'Import with apply mode',
        code: `typecad-pcb import ./board.kicad_pcb --apply`,
      },
    ],
    notes: [
      'Generates TypeScript code that recreates the PCB layout',
      'Variable names come from each footprint\'s "Code" property; falls back to KiCad reference (U1, R3)',
      '--apply mode interactively applies coordinate changes back to typeCAD source files',
    ],
    related: ['build', 'pcb-structure'],
  },
  {
    name: 'browse-packages',
    category: 'project',
    description:
      'Browse and install typeCAD-compatible packages from the npm registry using an interactive multi-select UI',
    examples: [
      {
        title: 'Browse and select packages interactively',
        code: `typecad-pcb package`,
      },
      {
        title: 'List available packages as JSON',
        code: `typecad-pcb package --json`,
      },
    ],
    notes: [
      'Searches npm for packages with the keyword "typecad-package"',
      'Already-installed packages are shown as disabled (cannot re-select)',
      'Packages with a newer version available are selectable and marked as updates',
      'Walks up from the current directory to find the nearest package.json',
      'Runs npm install for selected packages in the project directory',
      '--json outputs a structured list without interactive prompts',
    ],
    related: ['create-project', 'add-component', 'add-package'],
  },
];
