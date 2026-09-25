import type { Skill } from './types.js';
import logger from '../../../utils/logging.js';

export const validationSkills: Skill[] = [
  {
    name: 'erc',
    category: 'validation',
    description:
      'Electrical Rules Check runs via kicad-cli sch erc to validate pin type compatibility, power connections, floating pins, and short circuits',
    package: '@typecad/pcb',
    import: "import { Power } from '@typecad/pcb';",
    examples: [
      {
        title: 'ERC via Power objects',
        code: `// Power objects automatically set pin types for ERC:
let vout = new Power({
  power: regulator.pin(3),
  gnd: regulator.pin(2),
  voltage: 3.3,
  direction: 'output',  // sets pin to "power_out"
});

let vin = new Power({
  power: mcu.pin(8),
  gnd: mcu.pin(4),
  voltage: 3.3,
  direction: 'input',   // sets pin to "power_in"
});

// KiCad ERC checks (via kicad-cli sch erc):
// - power_out → power_in: OK
// - power_out → power_out: ERROR (conflict)
// - input → output: OK
// - output → output: WARNING`,
      },
      {
        title: 'CLI ERC',
        code: `# Run ERC on the built schematic
typecad-pcb erc

# With KiCad flags
typecad-pcb erc -- --severity-all

# Specific file
typecad-pcb erc ./build/board.kicad_sch -- --exit-code-violations`,
      },
    ],
    notes: [
      'ERC is run via CLI: typecad-pcb erc (uses kicad-cli sch erc)',
      'Use Power objects to automatically set correct pin types',
      'For shared pins (e.g. ground in regulators), set type to "passive" to avoid conflicts',
    ],
    related: ['drc', 'validation', 'power', 'pin', 'build'],
  },
  {
    name: 'drc',
    category: 'validation',
    description:
      "Design Rules Check validates PCB manufacturing constraints like clearance, trace width, and drill sizes using KiCad's kicad-cli",
    package: '@typecad/pcb',
    import: "import { runDRC } from '@typecad/pcb';",
    examples: [
      {
        title: 'Programmatic DRC',
        code: `import { runDRC } from '@typecad/pcb';

let report = await runDRC('./build/my-board.kicad_pcb');
logger.log(report);`,
      },
      {
        title: 'CLI DRC',
        code: `# Run DRC on the built PCB
typecad-pcb drc

# With KiCad flags
typecad-pcb drc -- --severity-all --schematic-parity

# Specific file
typecad-pcb drc ./build/board.kicad_pcb -- --refill-zones`,
      },
    ],
    notes: [
      'Requires KiCad to be installed (uses kicad-cli)',
      'CLI: typecad-pcb drc [path] [-- kicad-cli flags]',
      'All flags after -- are forwarded to kicad-cli pcb drc',
      'Output saved to <name>_drc.json alongside the PCB file',
    ],
    related: ['erc', 'validation', 'kicad-integration', 'build'],
  },
  {
    name: 'validation',
    category: 'validation',
    description:
      'Automatic validation that runs during build: power compatibility, current capacity, pin types, reference conflicts, and net merging',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'What validate checks',
        code: `// typecad.create() automatically runs:
// 1. Power compatibility: voltage levels match between connected pins
// 2. Current capacity: tracks and vias can handle specified current (IPC-2221)
// 3. Pin types: compatible pin types are connected (power_out → power_in)
// 4. Reference conflicts: no duplicate component references
// 5. Net merging: warns when named nets are merged

typecad.create(r1, c1, u1);`,
      },
      {
        title: 'Power validation example',
        code: `// This generates a warning: 5V output to 3.3V input
let v5 = new Power({ power: src.pin(1), voltage: 5.0, direction: 'output' });
let v33 = new Power({ power: load.pin(1), voltage: 3.3, direction: 'input' });

typecad.net(v5.power, v33.power);
// Build warns about voltage mismatch`,
      },
    ],
    notes: [
      'Validation runs automatically during typecad.create()',
      'Errors prevent KiCad file generation',
      'Warnings are logged but allow build to continue',
      'Use Power objects with powerInfo for comprehensive power validation',
      'CLI: typecad-pcb validate runs type-checking and the entry file without full build',
    ],
    related: ['erc', 'drc', 'power', 'build'],
  },
  {
    name: 'export-gerbers',
    category: 'validation',
    description: 'Export Gerber files from a KiCad PCB for fabrication using kicad-cli pcb export gerbers',
    package: '@typecad/pcb',
    import: "import { exportPCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'CLI export gerbers',
        code: `# Export Gerbers from auto-detected PCB in ./build/
typecad-pcb export gerbers

# Specify output directory
typecad-pcb export gerbers --output ./fab

# Specify PCB file
typecad-pcb export gerbers ./build/board.kicad_pcb

# Pass kicad-cli flags
typecad-pcb export gerbers -- --exclude-drawing-sheet`,
      },
      {
        title: 'Programmatic export',
        code: `import { exportPCB } from '@typecad/pcb';

await exportPCB('./build/board.kicad_pcb', './build/gerbers/', 'gerber');`,
      },
    ],
    notes: [
      'CLI: typecad-pcb export gerbers [path] [-o <dir>] [-- kicad-cli flags]',
      'Default output: ./build/gerbers/',
      'Uses kicad-cli pcb export gerbers under the hood',
      'All flags after -- are forwarded to kicad-cli pcb export gerbers',
      'Gerber files are the standard format for PCB fabrication',
    ],
    related: ['export-drill', 'drc', 'kicad-integration', 'build'],
  },
  {
    name: 'export-drill',
    category: 'validation',
    description: 'Export Excellon drill files from a KiCad PCB for fabrication using kicad-cli pcb export drill',
    package: '@typecad/pcb',
    import: "import { executeKiCADCommand } from '@typecad/pcb';",
    examples: [
      {
        title: 'CLI export drill',
        code: `# Export drill files from auto-detected PCB in ./build/
typecad-pcb export drill

# Specify output directory
typecad-pcb export drill --output ./fab

# Specify PCB file
typecad-pcb export drill ./build/board.kicad_pcb

# Pass kicad-cli flags
typecad-pcb export drill -- --use-drill-file-origin`,
      },
      {
        title: 'Programmatic drill export',
        code: `import { executeKiCADCommand } from '@typecad/pcb';

await executeKiCADCommand('pcb', [
  'export', 'drill',
  '--output', './build/gerbers/',
  './build/board.kicad_pcb',
]);`,
      },
    ],
    notes: [
      'CLI: typecad-pcb export drill [path] [-o <dir>] [-- kicad-cli flags]',
      'Default output: ./build/gerbers/',
      'Uses kicad-cli pcb export drill under the hood',
      'All flags after -- are forwarded to kicad-cli pcb export drill',
      'Drill files (.drl) define hole locations and sizes for the PCB manufacturer',
      'Common flags: --use-drill-file-origin, --generate-relational-board-origin',
    ],
    related: ['export-gerbers', 'drc', 'kicad-integration', 'build'],
  },
];
