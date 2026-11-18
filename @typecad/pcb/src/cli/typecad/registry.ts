/**
 * The CLI's command table: the one place that says which commands exist,
 * how they group on the top-level help screen, which subcommands and flags
 * each accepts, and which help screen belongs to them. The top-level help,
 * help dispatch, per-command flag validation, subcommand "did you mean"
 * and shell completion are all generated from it.
 *
 * Adding a flag to a command means adding it to that command's `flags`
 * here — an unlisted flag is rejected (the registry test also fails if a
 * command's source reads a flag that is not listed).
 */

export type CommandGroup =
  | 'Project'
  | 'Build & verify'
  | 'Inspect & edit'
  | 'Fabrication & viewing'
  | 'Libraries & reference';

export const GROUP_ORDER: CommandGroup[] = [
  'Project',
  'Build & verify',
  'Inspect & edit',
  'Fabrication & viewing',
  'Libraries & reference',
];

export interface SubcommandSpec {
  name: string;
  summary: string;
  /** Name of the `show…Help` function in help.ts (defaults to the command's). */
  help?: string;
}

export interface CommandSpec {
  name: string;
  group: CommandGroup;
  summary: string;
  /** `show…Help` function name in help.ts. */
  help?: string;
  /** The closed set of subcommands, when the command has one. */
  subcommands?: SubcommandSpec[];
  /** Top-level help prints one row per subcommand (`add component`, …). */
  expandInHelp?: boolean;
  /** Overrides the top-level help label (`lib add/list`). */
  helpLabel?: string;
  /** Flags this command reads, besides the global ones. Hyphenated spelling. */
  flags: string[];
}

/** Accepted by every command (`--outDir` is applied before dispatch). */
export const GLOBAL_FLAGS = ['json', 'help', 'version', 'quiet', 'verbose', 'board', 'outDir', 'out-dir', 'outdir'];

const EXPORT_FLAGS = [
  'kicad', 'out', 'o', 'output', 'fresh-board', 'grouped', 'ungrouped', 'include-dnp', 'saved-fills', 'zip',
  'bottom-rotation', 'bom-profile', 'centroid', 'exclude', 'origin', 'profile', 'rotation-offset', 'side',
  'units', 'decimals', 'rotation-decimals',
];

export const COMMANDS: CommandSpec[] = [
  // ── Project ──────────────────────────────────────────────────────────────
  {
    name: 'create',
    group: 'Project',
    summary: 'Create a new typeCAD project',
    help: 'showCreateHelp',
    flags: ['name', 'yes', 'hal', 'git'],
  },
  {
    name: 'add',
    group: 'Project',
    summary: 'Add a component or package to the project',
    help: 'showAddHelp',
    expandInHelp: true,
    subcommands: [
      { name: 'component', summary: 'Add a component to the current project', help: 'showAddComponentHelp' },
      { name: 'package', summary: 'Create a reusable component package', help: 'showAddPackageHelp' },
    ],
    flags: [
      'c', 'folder', 'footprint', 'footprint-source', 'jlcpcb', 'kicad', 'local', 'symbol', 'symbol-source',
      'value', 'component', 'empty', 'name',
    ],
  },
  {
    name: 'package',
    group: 'Project',
    summary: 'Browse and install typeCAD packages from npm',
    help: 'showPackageHelp',
    flags: [],
  },

  // ── Build & verify ───────────────────────────────────────────────────────
  {
    name: 'build',
    group: 'Build & verify',
    summary: 'Build KiCad output from typeCAD source',
    help: 'showBuildHelp',
    flags: ['watch', 'w', 'clear', 'typecheck', 'diagnostics', 'skip-erc', 'skip-drc', 'out', 'kicad'],
  },
  {
    name: 'clean',
    group: 'Build & verify',
    summary: 'Remove the generated build directory',
    help: 'showCleanHelp',
    flags: ['force'],
  },
  {
    name: 'validate',
    group: 'Build & verify',
    summary: 'Validate project source without full build',
    help: 'showValidateHelp',
    flags: [],
  },
  {
    name: 'check',
    group: 'Build & verify',
    summary: 'Build + ERC + DRC in one pass, one report',
    help: 'showCheckHelp',
    flags: ['kicad-erc', 'kicad-drc', 'skip-erc', 'skip-drc', 'skip-typecheck'],
  },
  {
    name: 'erc',
    group: 'Build & verify',
    summary: 'Run Electrical Rules Check on a KiCad schematic',
    help: 'showErcHelp',
    flags: ['kicad'],
  },
  {
    name: 'drc',
    group: 'Build & verify',
    summary: 'Run Design Rule Check on a KiCad PCB file',
    help: 'showDrcHelp',
    flags: ['kicad'],
  },
  {
    name: 'simulate',
    group: 'Build & verify',
    summary: 'Solve the DC operating point with ngspice',
    help: 'showSimulateHelp',
    flags: ['entry'],
  },
  {
    name: 'check-sync',
    group: 'Build & verify',
    summary: 'Report board vs source drift (the import oracle)',
    help: 'showCheckSyncHelp',
    flags: ['auto', 'watch'],
  },
  {
    name: 'diagnostics',
    group: 'Build & verify',
    summary: 'Full design report: BOM, nets, graphs, ERC/DRC (markdown)',
    help: 'showDiagnosticsHelp',
    flags: ['kicad', 'out', 'skip-build', 'skip-erc', 'skip-drc'],
  },
  {
    name: 'doctor',
    group: 'Build & verify',
    summary: 'Check your environment for common issues',
    help: 'showDoctorHelp',
    flags: ['fix'],
  },

  // ── Inspect & edit ───────────────────────────────────────────────────────
  {
    name: 'query',
    group: 'Inspect & edit',
    summary: 'Inspect the compiled board (nets, pins, placement)',
    help: 'showQueryHelp',
    subcommands: [
      { name: 'summary', summary: 'board totals and bounds' },
      { name: 'nets', summary: 'every net with its members' },
      { name: 'net', summary: 'one net in detail' },
      { name: 'components', summary: 'reference, value, footprint, position' },
      { name: 'component', summary: 'one component, pad-by-pad' },
      { name: 'unconnected', summary: 'pads with no net; single-pin nets' },
      { name: 'power', summary: 'power rails, stitching vias, zones' },
      { name: 'routes', summary: 'copper status per net' },
      { name: 'zones', summary: 'copper zones' },
      { name: 'help', summary: 'list the query subjects' },
    ],
    flags: [],
  },
  {
    name: 'edit',
    group: 'Inspect & edit',
    summary: 'Checked semantic edits (connect, move)',
    help: 'showEditHelp',
    subcommands: [
      { name: 'connect', summary: 'connect pins and nets' },
      { name: 'move', summary: 'move a component' },
      { name: 'route', summary: 'route two pins' },
    ],
    flags: ['above', 'below', 'left-of', 'right-of', 'dry-run', 'file', 'gap', 'layers', 'rot', 'to', 'width'],
  },
  {
    name: 'import',
    group: 'Inspect & edit',
    summary: 'Convert a KiCad PCB file to typeCAD code',
    help: 'showImportHelp',
    flags: ['apply', 'auto', 'dry-run', 'restore', 'watch'],
  },
  {
    name: 'diff',
    group: 'Inspect & edit',
    summary: 'Compare two KiCad PCB files visually',
    help: 'showDiffHelp',
    flags: ['full', 'open', 'output', 'theme'],
  },
  {
    name: 'doc',
    group: 'Inspect & edit',
    summary: 'Generate PCB documentation from Markdown',
    help: 'showDocHelp',
    flags: ['o', 'open', 'output'],
  },

  // ── Fabrication & viewing ────────────────────────────────────────────────
  {
    name: 'export',
    group: 'Fabrication & viewing',
    summary: 'Export fabrication and assembly files',
    help: 'showExportHelp',
    expandInHelp: true,
    subcommands: [
      { name: 'gerbers', summary: 'Export Gerber files from a KiCad PCB', help: 'showExportGerbersHelp' },
      { name: 'drill', summary: 'Export drill files from a KiCad PCB', help: 'showExportDrillHelp' },
      { name: 'pos', summary: 'Export placement/centroid (pick & place) file', help: 'showExportPosHelp' },
      { name: 'bom', summary: 'Export bill of materials (CSV)', help: 'showExportBomHelp' },
      {
        name: 'assembly',
        summary: 'One-shot provider package: gerbers + pos + bom, zipped',
        help: 'showExportAssemblyHelp',
      },
      { name: 'help', summary: 'Show the export overview' },
    ],
    flags: EXPORT_FLAGS,
  },
  {
    name: 'viewer',
    group: 'Fabrication & viewing',
    summary: 'Build the interactive board viewer page (gerbers + drill + page in one pass)',
    help: 'showViewerHelp',
    flags: ['drc', 'lazy-views', 'netlist', 'out', 'o', 'rules', 'saved-fills', 'stackup', 'view-part'],
  },

  // ── Libraries & reference ────────────────────────────────────────────────
  {
    name: 'search',
    group: 'Libraries & reference',
    summary: 'Search KiCad symbols and footprints',
    help: 'showSearchHelp',
    flags: ['footprint', 'format', 'limit', 'sort'],
  },
  {
    name: 'lib',
    group: 'Libraries & reference',
    summary: 'Fetch/list KiCad libraries into build/lib (no install needed)',
    help: 'showLibHelp',
    helpLabel: 'lib add/list',
    subcommands: [
      { name: 'add', summary: 'fetch KiCad libraries into build/lib' },
      { name: 'list', summary: 'list the fetched libraries' },
    ],
    flags: ['footprint'],
  },
  {
    name: 'skills',
    group: 'Libraries & reference',
    summary: 'List and query typeCAD skills and API patterns',
    help: 'showSkillsHelp',
    subcommands: [
      { name: 'list', summary: 'list the skills' },
      { name: 'get', summary: 'print one skill' },
      { name: 'search', summary: 'search the skills' },
      { name: 'export', summary: 'export the skills' },
    ],
    flags: ['category', 'out'],
  },
  {
    name: 'completion',
    group: 'Libraries & reference',
    summary: 'Print a shell tab-completion script (bash, zsh, pwsh)',
    help: 'showCompletionHelp',
    flags: [],
  },
];

/** `help` is handled before dispatch, so it is a name but not a table entry. */
export const COMMAND_NAMES: string[] = [...COMMANDS.map((c) => c.name), 'help'];

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name);
}

/** The help-screen function name for `command [subcommand]`. */
export function helpFunctionFor(command: string, subcommand: string): string | undefined {
  const spec = findCommand(command);
  if (!spec) return undefined;
  const sub = spec.subcommands?.find((s) => s.name === subcommand);
  return sub?.help ?? spec.help;
}

/** The rows of the top-level help screen: [label, summary] per group. */
export function helpRows(group: CommandGroup): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const spec of COMMANDS.filter((c) => c.group === group)) {
    if (spec.expandInHelp && spec.subcommands) {
      for (const sub of spec.subcommands) {
        if (sub.name === 'help') continue;
        rows.push([`${spec.name} ${sub.name}`, sub.summary]);
      }
    } else {
      rows.push([spec.helpLabel ?? spec.name, spec.summary]);
    }
  }
  return rows;
}

/** The common flags written the way `--help` and completion show them. */
export function displayFlag(flag: string): string {
  return flag.length === 1 ? `-${flag}` : `--${flag}`;
}
