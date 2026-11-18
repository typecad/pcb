import chalk from 'chalk';
import { GROUP_ORDER, helpRows } from './registry.js';

/**
 * Usage and example lines tell the user to type a command; typeCAD is a
 * project dependency, not a global install, so those lines show the `npx`
 * form (the same rule command_hint.ts applies to error hints). Title lines
 * start with a color code and are left alone.
 */
function withNpx(text: string): string {
  return text.replace(/^(Usage: |[ \t]+)typecad-pcb(?=\s|$)/gm, '$1npx typecad-pcb');
}

function say(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args.map((a) => (typeof a === 'string' ? withNpx(a) : a)));
}

export function showTopLevelHelp(): void {
  say(chalk.white.bold('typeCAD') + ' - programmatically create hardware\n');
  say('Usage:');
  say('  typecad-pcb <command> [subcommand] [options]\n');
  for (const group of GROUP_ORDER) {
    say(chalk.bold(group));
    const rows = helpRows(group);
    rows.forEach(([label, summary], i) => {
      say(`  ${label.padEnd(20)}${summary}${i === rows.length - 1 ? '\n' : ''}`);
    });
  }
  say(chalk.bold('Typical workflow'));
  say('  typecad-pcb create             start a project');
  say('  typecad-pcb build --watch      rebuild on every save');
  say('  typecad-pcb check              build + ERC + DRC');
  say('  typecad-pcb export assembly    fabrication + assembly package\n');
  say('Global Options:');
  say('  --json              Output in machine-readable JSON');
  say('  --quiet, -q         Suppress non-error output');
  say('  --verbose, -v       Show debug output (-v alone is --version)');
  say('  --help, -h          Show help for a command');
  say('  --version           Show typecad-pcb version\n');
  say('Options take a value as --flag=value or --flag value.');
  say('A TypeScript file can be given bare: typecad-pcb main.ts is build main.ts.');
  say("The short alias 'pcb' runs the same CLI (npx pcb build).\n");
  say('Exit codes: 0 success, 1 failed checks or a runtime error, 2 usage error');
  say('(unknown command, subcommand or option).\n');
  say("Run 'typecad-pcb <command> --help' for details on a command.");
}

export function showCreateHelp(): void {
  say(chalk.white.bold('typecad-pcb create') + ' - Create a new typeCAD project\n');
  say('Create a new typeCAD project with KiCad project files, npm package,');
  say('and optional firmware.\n');
  say('Usage: typecad-pcb create [options]\n');
  say('Options:');
  say('  --name=<name>         Project name (hyphens/spaces normalized to underscores)');
  say('  --yes                 Use defaults without prompts (requires --name, git defaults to true)');
  say('  --hal, --no-hal       Add a typeCAD HAL firmware project in ./fw (default: no)');
  say('  --git, --no-git       Initialize a git repository (default: no; --yes turns it on)\n');
  say('The HAL setup asks for its board interactively.');
  say('Without options, runs interactively with prompts.');
}

export function showAddComponentHelp(): void {
  say(chalk.white.bold('typecad-pcb add component') + ' - Add a component to the current project\n');
  say('Usage: typecad-pcb add component [options]\n');
  say('Mixed Source Options:');
  say('  --symbol-source=<src>     Symbol source: kicad, local, or jlcpcb');
  say('  --footprint-source=<src>  Footprint source: kicad, local, or jlcpcb');
  say('  --symbol=<name>           Symbol (library:symbol or path to .kicad_sym)');
  say('  --footprint=<name>        Footprint (library:footprint or path to .kicad_mod)');
  say('  --c=<C-number>            JLCPCB component number (e.g. C3217148)\n');
  say('Legacy Source Options (choose one):');
  say('  --kicad=<value>           Use KiCad library');
  say('  --local=<value>           Use local files');
  say('  --jlcpcb=<value>          Use EasyEDA/JLCPCB\n');
  say('Other Options:');
  say('  --folder=<path>           Output folder (default: current directory)');
  say("  --value=<text>            Set the generated component's value (part number;");
  say('                            inferred from part-number-like symbol names)\n');
  say('Without options, runs interactively with prompts.');
}

export function showAddPackageHelp(): void {
  say(chalk.white.bold('typecad-pcb add package') + ' - Create a reusable component package\n');
  say('Usage: typecad-pcb add package [options]\n');
  say('Package Type (exactly one required):');
  say('  --empty                   Create an empty package template');
  say('  --component               Create a component package\n');
  say('Required:');
  say('  --name=<name>             Package name\n');
  say('Component Source (with --component, choose one):');
  say('  --kicad                   From KiCad library');
  say('  --local                   From local files');
  say('  --jlcpcb                  From EasyEDA/JLCPCB\n');
  say('Component Parameters:');
  say('  --symbol=<name>           Symbol (format: library:symbol_name)');
  say('  --footprint=<name>        Footprint (format: library:footprint_name)');
  say('  --c=<C-number>            JLCPCB component number (e.g. C3217148)\n');
  say('Other Options:');
  say('  --folder=<path>           Output folder (default: ./src)\n');
  say('Without options, runs interactively with prompts.');
}

export function showBuildHelp(): void {
  say(chalk.white.bold('typecad-pcb build') + ' - Build KiCad output from typeCAD source\n');
  say('Run the typeCAD entry point to generate KiCad schematic and PCB files.');
  say('\nUsage: typecad-pcb build [entry] [options]\n');
  say('Arguments:');
  say('  <entry>                   Path to .ts entry file (default: auto-detected');
  say('                            from typecad.conf.ts, package.json, or ./src/*.ts)\n');
  say('Options:');
  say('  --watch, -w             Watch the entry and its imports; rebuild on change');
  say('  --clear                 With --watch: clear the screen before each rebuild');
  say('  --outDir=<dir>, --out-dir=<dir>');
  say('                          Output directory for generated files (default: ./build/)');
  say('  --typecheck             Run tsc --noEmit before building (the default build');
  say('                          executes via tsx, which does not check types)');
  say('  --diagnostics           Generate diagnostics.md and diagnostics.json reports');
  say('                          BOM, nets, pin map, mermaid graphs, ERC/DRC, routing');
  say('  --skip-erc              With --diagnostics: skip the ERC step');
  say('  --skip-drc              With --diagnostics: skip the DRC step');
  say('  --out=<file.md>         With --diagnostics: markdown destination (JSON follows)');
  say('  --verbose, -v           Enable verbose logging output\n');
  say('A TypeScript file can also be given bare, without the subcommand:');
  say('typecad-pcb main.ts --watch is shorthand for build main.ts --watch.\n');
  say('The build command executes your typeCAD TypeScript source, which generates');
  say('KiCad .kicad_pcb, .kicad_pro, .net, and related files in the output directory.');
}

export function showCleanHelp(): void {
  say(chalk.white.bold('typecad-pcb clean') + ' - Remove the generated build directory\n');
  say('Escape hatch for a wedged build directory or stale boards left by');
  say('renamed sheets — the next build regenerates everything.\n');
  say('Usage: typecad-pcb clean [options]\n');
  say('Options:');
  say('  --force                Remove even if the directory has no KiCad');
  say('                        build artifacts (the safety check)');
  say('  --outDir=<dir>, --out-dir=<dir>');
  say('                        Clean a custom output directory');
  say('  --json                 Output results as JSON\n');
  say('Examples:');
  say('  typecad-pcb clean');
  say('  typecad-pcb clean --force');
  say('  typecad-pcb clean --outDir ./out');
}

export function showSearchHelp(): void {
  say(chalk.white.bold('typecad-pcb search') + ' - Search KiCad schematic symbols and footprints\n');
  say('Search for KiCad schematic symbols using fuzzy matching.');
  say('With --footprint, search installed footprint libraries instead — results include the pad numbers.\n');
  say('Usage: typecad-pcb search [options] <query>\n');
  say('Arguments:');
  say('  <query>                   Search terms (e.g. "op amp", "LM358")\n');
  say('Options:');
  say('  --footprint               Search footprint libraries instead of symbols');
  say('                            (results show library:footprint + pad numbers)');
  say('  --format=<fmt>            Output format: detailed, compact, table, json');
  say('                            (default: detailed)');
  say('  --sort=<field>            Sort by: score, id, manufacturer, package');
  say('                            (default: score)');
  say('  --limit=<n>               Maximum results (default: 5, footprints: 10)\n');
  say('Examples:');
  say('  typecad-pcb search LM358');
  say('  typecad-pcb search "SOIC-8" --footprint --json');
  say('\nWithout a query, prompts for search terms interactively.');
}

export function showImportHelp(): void {
  say(chalk.white.bold('typecad-pcb import') + ' - Convert KiCad PCB to typeCAD code\n');
  say('Convert a KiCad .kicad_pcb file into typeCAD TypeScript code.\n');
  say('Usage: typecad-pcb import <file_path> [options]\n');
  say('Arguments:');
  say('  <file_path>               Path to the .kicad_pcb file\n');
  say('Options:');
  say('  --apply                   Interactively apply coordinate changes back');
  say('                            to the typeCAD source files');
  say('  --auto                    Apply every detected change without prompting');
  say('                            (implies --apply)');
  say('  --watch                   Watch the board file and re-run on every save.');
  say('                            With --auto the source .ts is live-synced');
  say('                            while you edit in KiCad. Ctrl+C to stop.');
  say('  --dry-run                 Preview every pending change (with edit');
  say('                            diffs) without writing anything');
  say('  --restore                 Undo the last apply cycle: restores the');
  say('                            pre-apply snapshot of your sources');
  say('  (text layout positions are always imported)\n');
  say("Variable names are sourced from each footprint's 'Code' property.");
  say('If missing, the KiCad reference is used (e.g., U1, R3).');
}

export function showDiffHelp(): void {
  say(chalk.white.bold('typecad-pcb diff') + ' - Visual PCB Comparison Tool\n');
  say('Compare two KiCad PCB files and generate a visual diff report.\n');
  say('Usage:');
  say('  typecad-pcb diff [options] <original.kicad_pcb> <modified.kicad_pcb>');
  say('  typecad-pcb diff [options] <rev> <file.kicad_pcb>');
  say('  typecad-pcb diff [options] <rev1> <rev2> [--] <file.kicad_pcb>\n');
  say('Options:');
  say('  --full              Process all layers including User layers');
  say('  --theme=<name>      Theme for SVG export (e.g. "Monokai")');
  say('  --output=<path>     Output HTML file path\n');
  say('Git vs Working Tree:');
  say('  typecad-pcb diff HEAD~1 ./build/board.kicad_pcb');
  say('  typecad-pcb diff main ./build/board.kicad_pcb\n');
  say('Git Revision Comparison:');
  say('  typecad-pcb diff HEAD~1 HEAD -- board.kicad_pcb');
  say('  typecad-pcb diff main feature-branch -- board.kicad_pcb\n');
  say('Examples:');
  say('  typecad-pcb diff board_v1.kicad_pcb board_v2.kicad_pcb');
  say('  typecad-pcb diff HEAD~1 ./build/board.kicad_pcb');
  say('  typecad-pcb diff HEAD~1 HEAD -- board.kicad_pcb');
}

export function showDocHelp(): void {
  say(chalk.white.bold('typecad-pcb doc') + ' - Generate PCB documentation from Markdown\n');
  say('Generate a self-contained HTML document from a Markdown file and KiCad PCB file.');
  say('Layer, drill-map and stackup images are rendered natively (no KiCad install');
  say('needed); {Render/...} 3D images use kicad-cli when available and are skipped');
  say('with a warning otherwise.');
  say('\nUsage: typecad-pcb doc <markdown_file> <pcb_file> [options]\n');
  say('Arguments:');
  say('  <markdown_file>       Input Markdown file (.md)');
  say('  <pcb_file>            KiCad PCB file (.kicad_pcb)\n');
  say('Options:');
  say('  -o, --output=<file>   Output HTML file (default: input file with .html extension)');
  say('  -v, --verbose         Enable verbose logging');
  say('  -q, --quiet           Suppress non-error output');
  say('      --no-open         Do not automatically open the generated HTML file\n');
  say('Examples:');
  say('  typecad-pcb doc docs/board.md build/board.kicad_pcb');
  say('  typecad-pcb doc docs/board.md build/board.kicad_pcb -o output.html');
  say('  typecad-pcb doc docs/board.md build/board.kicad_pcb --verbose');
  say('  typecad-pcb doc docs/board.md build/board.kicad_pcb --quiet');
  say('  typecad-pcb doc docs/board.md build/board.kicad_pcb --no-open');
}

export function showLibHelp(): void {
  say(chalk.white.bold('typecad-pcb lib') + ' - Project-owned KiCad libraries, no install required\n');
  say(
    'Fetches libraries from the official KiCad library repos into the\n' +
      "project's build/lib/ (through a user-level cache). What lands in the\n" +
      'project is committable — the board builds offline on any machine.\n' +
      'Builds check install/conf paths, project files and bundled assets\n' +
      'before automatically fetching missing symbols and footprints.\n',
  );
  say('Usage:');
  say('  typecad-pcb lib add <library>... [--footprint Lib:Name]\n');
  say('Subcommands:');
  say('  add                 Fetch symbol libraries (e.g. Device, Connector_Generic)');
  say('  add Lib:Symbol      Fetch one symbol (e.g. Device:R_Small)');
  say('  add --footprint     Fetch a footprint + its 3D model(s) (references are');
  say('                      rewritten to ${KIPRJMOD}/lib/3dshapes so the KiCad GUI');
  say('                      and kicad-cli find them with no setup)');
  say('  list                Show active library sources and build/lib contents\n');
  say('Options:');
  say('  --footprint <Lib:Name>  A single footprint to fetch\n');
  say('Notes:');
  say('  `lib add power` copies the bundled power library offline (no network).');
  say('  Source: gitlab.com/kicad/libraries (master); successive adds accumulate');
  say('  symbols into the same project library file.');
  say('  Cache: ~/.typecad/cache/kicad-libs (TYPECAD_LIB_CACHE overrides).\n');
  say('Examples:');
  say('  typecad-pcb lib add Device Connector_Generic');
  say('  typecad-pcb lib add --footprint Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
  say('  typecad-pcb lib list');
}

export function showErcHelp(): void {
  say(chalk.white.bold('typecad-pcb erc') + ' - Run Electrical Rules Check on a typeCAD schematic\n');
  say(
    'Runs the native ERC engine: the build already checked the typeCAD object\n' +
      'model (components, nets, pin electrical types — no file parsing) for\n' +
      'unconnected pins and electrically incompatible pin connections.\n' +
      'This command reads and summarizes that report.\n' +
      'Use --kicad to run kicad-cli sch erc on the .kicad_sch instead (full\n' +
      'KiCad check set; the only route for arbitrary external schematics).\n',
  );
  say('Usage:');
  say('  typecad-pcb erc [path] [typecad-options] [--kicad --] [kicad-cli flags]\n');
  say('Arguments:');
  say(
    '  <path>             Path to .kicad_sch file (default: auto-detected from ./build/);\n' +
      '                     the native report <name>_erc.json must sit beside it\n',
  );
  say('typecad Options:');
  say('  --json             Output typecad results as JSON');
  say('  --kicad            Run kicad-cli sch erc instead of the native engine');
  say('  --help             Show this help\n');
  say('Passthrough (with --kicad):');
  say('  All flags after -- are forwarded directly to kicad-cli sch erc.');
  say('  See `kicad-cli sch erc --help` for the full list of available flags.\n');
  say('  Common kicad-cli flags:');
  say('    --severity-all              Report all violations');
  say('    --severity-error            Report error-level violations');
  say('    --severity-warning          Report warning-level violations');
  say('    --severity-exclusions       Report excluded violations');
  say('    --exit-code-violations      Non-zero exit on violations');
  say('    --format <report|json>      Report format (typecad always uses json internally)');
  say('    --units <mm|in|mils>        Report units');
  say('    -o, --output=<file>         Output file path\n');
  say('Output:');
  say('  Report saved to <name>_erc.json alongside the schematic file.\n');
  say('Examples:');
  say('  typecad-pcb erc');
  say('  typecad-pcb erc --json');
  say('  typecad-pcb erc --kicad -- --severity-all');
  say('  typecad-pcb erc ./build/board.kicad_sch --kicad -- --exit-code-violations');
}

export function showDrcHelp(): void {
  say(chalk.white.bold('typecad-pcb drc') + ' - Run Design Rule Check on a KiCad PCB file\n');
  say(
    'Runs the native DRC engine (copper core + DFM checks) on a .kicad_pcb file\n' +
      'and displays a summary of errors, warnings, and unconnected items.\n' +
      'Use --kicad to run kicad-cli pcb drc instead (full KiCad check set).\n',
  );
  say('Usage:');
  say('  typecad-pcb drc [path] [typecad-options] [--kicad --] [kicad-cli flags]\n');
  say('Arguments:');
  say('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  say('typecad Options:');
  say('  --json             Output typecad results as JSON');
  say('  --help             Show this help\n');
  say('Passthrough:');
  say('  All flags after -- are forwarded directly to kicad-cli pcb drc.');
  say('  See `kicad-cli pcb drc --help` for the full list of available flags.\n');
  say('  Common kicad-cli flags:');
  say('    --severity-all              Report all violations');
  say('    --severity-error            Report error-level violations');
  say('    --severity-warning          Report warning-level violations');
  say('    --severity-exclusions       Report excluded violations');
  say('    --schematic-parity          Test PCB vs schematic parity');
  say('    --all-track-errors          Report all errors per track');
  say('    --exit-code-violations      Non-zero exit on violations');
  say('    --refill-zones              Refill zones before DRC');
  say('    --save-board                Save board after DRC');
  say('    --units <mm|in|mils>        Report units');
  say('    -o, --output=<file>         Output file path\n');
  say('Output:');
  say('  Report saved to <name>_drc.json alongside the board file.\n');
  say('Examples:');
  say('  typecad-pcb drc');
  say('  typecad-pcb drc --json');
  say('  typecad-pcb drc -- --severity-all --schematic-parity');
  say('  typecad-pcb drc ./build/board.kicad_pcb -- --refill-zones');
}

export function showValidateHelp(): void {
  say(chalk.white.bold('typecad-pcb validate') + ' - Validate project source without full build\n');
  say(
    'Type-check and run your typeCAD entry file, reporting errors without\n' + 'producing verbose build output.\n',
  );
  say('Usage: typecad-pcb validate [entry] [options]\n');
  say('Arguments:');
  say('  <entry>                   Path to .ts entry file (default: auto-detected)\n');
  say('Options:');
  say('  --verbose, -v             Show full build output');
  say('  --json                    Output results as JSON\n');
  say('Checks performed:');
  say('  1. TypeScript type checking (if tsconfig.json exists)');
  say('  2. Runtime execution of the entry file');
}

export function showDoctorHelp(): void {
  say(chalk.white.bold('typecad-pcb doctor') + ' - Check your environment for common issues\n');
  say(
    'Diagnose your typeCAD environment by checking for required tools,\n' + 'dependencies, and configuration.\n',
  );
  say('Usage: typecad-pcb doctor [options]\n');
  say('Options:');
  say('  --fix               Attempt to automatically fix detected problems');
  say('  --json              Output results in JSON format\n');
  say('Checks performed:');
  say('  Node.js >= 18       npm & core dependencies');
  say('  package.json        node_modules integrity');
  say('  typecad config      entry file');
  say('  kicad-cli / PATH    KiCad symbol libraries');
  say('  Git');
  say('  build/ directory');
}

export function showSkillsHelp(): void {
  say(chalk.white.bold('typecad-pcb skills') + ' - Query typeCAD API patterns and design knowledge\n');
  say(
    'List and query skills that document typeCAD concepts, API patterns,\n' +
      'electrical design concepts, and KiCad-related information.\n',
  );
  say('Usage:');
  say('  typecad-pcb skills list              List all available skills');
  say('  typecad-pcb skills get <name>        Get details on a specific skill');
  say('  typecad-pcb skills search <query>    Fuzzy-find skills by keyword');
  say('  typecad-pcb skills export            Export skills as SKILL.md files\n');
  say('Options:');
  say('  --json              Output in machine-readable JSON');
  say('  --out=<dir>         Export target (default .claude/skills)');
  say('  --category=<name>   Export only one category\n');
  say('Examples:');
  say('  typecad-pcb skills list');
  say('  typecad-pcb skills list --json');
  say('  typecad-pcb skills search placement');
  say('  typecad-pcb skills get resistor');
  say('  typecad-pcb skills get power --json');
  say('  typecad-pcb skills export --out .claude/skills');
}

export function showPackageHelp(): void {
  say(chalk.white.bold('typecad-pcb package') + ' - Browse and install typeCAD packages\n');
  say('Searches the npm registry for typeCAD-compatible packages and presents');
  say('them for selection. Already-installed packages are indicated.\n');
  say('Usage: typecad-pcb package [options]\n');
  say('Options:');
  say('  --json    Output results in JSON format\n');
  say('Examples:');
  say('  typecad-pcb package');
  say('  typecad-pcb package --json');
}

export function showExportHelp(): void {
  say(chalk.white.bold('typecad-pcb export') + ' - Export PCB fabrication + assembly files\n');
  say('Usage:');
  say('  typecad-pcb export <subcommand> [path] [options]\n');
  say('Subcommands:');
  say('  gerbers             Export the full fab set (gerbers + drill + job) natively');
  say('  drill               Export drill files');
  say('  pos                 Export placement/centroid file (CPL, pick & place)');
  say('  bom                 Export bill of materials (CSV)');
  say('  assembly            One-shot provider package: gerbers + pos + bom, zipped\n');
  say('Options:');
  say('  -o, --out=<dir>     Output directory (gerbers: ./build/gerbers/, assembly: ./build/assembly/)');
  say('  --json              Output results as JSON');
  say('  --kicad             gerbers: use the legacy kicad-cli plotter');
  say('  --help              Show help for a subcommand\n');
  say("Run 'typecad-pcb export <subcommand> --help' for details.");
}

export function showExportGerbersHelp(): void {
  say(chalk.white.bold('typecad-pcb export gerbers') + ' - Export the full fabrication set from a PCB\n');
  say(
    'Plots copper, graphics, drill and job files from a .kicad_pcb with\n' +
      "typeCAD's own gerber writer — no kicad-cli required.\n",
  );
  say('Usage:');
  say('  typecad-pcb export gerbers [path] [options]\n');
  say('Arguments:');
  say('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  say('Options:');
  say('  -o, --out=<dir>    Output directory (default: ./build/gerbers/)');
  say('  --json             Output results as JSON');
  say('  --kicad            Use the legacy kicad-cli plotter (needs KiCad installed)');
  say('  --help             Show this help\n');
  say('Notes:');
  say('  Text renders with the public-domain Hershey stroke font; TTF texts');
  say('  plot from the board render_cache. Zones plot their SAVED fills —');
  say('  run `typecad-pcb check` first on boards with zones.');
  say('Examples:');
  say('  typecad-pcb export gerbers');
  say('  typecad-pcb export gerbers --out ./fab');
  say('  typecad-pcb export gerbers ./build/board.kicad_pcb');
}

export function showExportDrillHelp(): void {
  say(chalk.white.bold('typecad-pcb export drill') + ' - Export drill files from a PCB\n');
  say("Writes an Excellon drill file with typeCAD's own writer — no\n" + 'kicad-cli required.\n');
  say('Usage:');
  say('  typecad-pcb export drill [path] [options]\n');
  say('Arguments:');
  say('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  say('Options:');
  say('  -o, --out=<dir>    Output directory (default: ./build/gerbers/)');
  say('  --json             Output results as JSON');
  say('  --kicad            Use the legacy kicad-cli plotter (needs KiCad installed)');
  say('  --help             Show this help\n');
  say('Examples:');
  say('  typecad-pcb export drill');
  say('  typecad-pcb export drill --out ./fab');
  say('  typecad-pcb export drill ./build/board.kicad_pcb');
}

export function showExportPosHelp(): void {
  say(chalk.white.bold('typecad-pcb export pos') + ' - Export the placement (centroid) file\n');
  say("One CSV per provider profile — CPL for JLCPCB/PCBWay/Seeed,");
  say('placements for OpenPnP, kicad-cli-pos semantics, or generic.');
  say('Coordinates stay in the KiCad board frame (mm, Y-down) — the');
  say(' shops ingest that natively and prefer unmodified CAD data.');
  say('The openpnp profile also writes a native <board>.board.xml');
  say(" you can open straight from OpenPnP's Boards tab (bottom parts");
  say('already carry its KiCad transform: x negated, rotation mirrored),');
  say('plus packages.xml/parts.xml definitions for its parts library —');
  say(' pad footprints for bottom vision. FID* refs ship as fiducial');
  say(' placements the machine aligns on, and an Edge.Cuts outline');
  say(' rides along as the board profile.\n');
  say('Usage:');
  say('  typecad-pcb export pos [path] [options]\n');
  say('Arguments:');
  say('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  say('Options:');
  say('  --profile=<id>     kicad | jlcpcb | pcbway | seeed | openpnp | generic (default: generic)');
  say('  --side=<s>         front | back | both (default: both)');
  say('  --centroid=<m>     anchor | pads | body — which datum a row reports');
  say('                       (default: per profile — kicad uses the footprint anchor,');
  say('                       shops want the body center)');
  say('  --origin=<o>       board | aux — rebase onto the aux (drill/place) origin');
  say('  --units=<u>        mm | in | mils (default: mm)');
  say('  --exclude=<globs>  Comma-separated ref globs to drop (e.g. "FID*,MH*")');
  say('  --rotation-offset=<deg>   Rotation added to every part');
  say('  --bottom-rotation=<deg>   EXTRA rotation for bottom-side parts');
  say('  --include-dnp      Emit DNP footprints too (kicad profile always does)');
  say('  --fresh-board      openpnp: regenerate the .board.xml from scratch, discarding');
  say('                       edits made in OpenPnP (associations survive re-export otherwise)');
  say('  -o, --out=<dir>    Output directory (default: ./build/assembly/)');
  say('  --json             Output results as JSON');
  say('  --help             Show this help\n');
  say('Examples:');
  say('  typecad-pcb export pos --profile jlcpcb');
  say('  typecad-pcb export pos --profile kicad --centroid anchor');
  say('  typecad-pcb export pos --profile openpnp --side front');
}

export function showExportBomHelp(): void {
  say(chalk.white.bold('typecad-pcb export bom') + ' - Export the bill of materials\n');
  say('Board truth joined with the netlist beside it (MPN, datasheet)');
  say('— grouped rows by default; DNP parts and KiCad');
  say('exclude_from_bom footprints stay out.\n');
  say('Usage:');
  say('  typecad-pcb export bom [path] [options]\n');
  say('Arguments:');
  say('  <path>                 Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  say('Options:');
  say('  --bom-profile=<id>     jlcpcb (Comment,Designator,Footprint,LCSC Part #),');
  say('                           kicad (one row per ref), generic (full audit table)');
  say('  --profile=<id>         Placement profile whose BOM family to use (jlcpcb');
  say('                           --profile implies the jlcpcb BOM)');
  say('  --grouped              Collapse refs per unique value+footprint+mpn');
  say('  --ungrouped            One row per reference');
  say('  --exclude=<globs>      Comma-separated ref globs to drop');
  say('  -o, --out=<dir>        Output directory (default: ./build/assembly/)');
  say('  --json                 Output results as JSON');
  say('  --help                 Show this help\n');
  say('Examples:');
  say('  typecad-pcb export bom --profile jlcpcb');
  say('  typecad-pcb export bom --ungrouped');
}

export function showExportAssemblyHelp(): void {
  say(chalk.white.bold('typecad-pcb export assembly') + ' - Export the full provider package\n');
  say('Native gerbers + drill + job + placement + BOM in one staging');
  say('directory, zipped into the shop upload file. Everything the');
  say('pos/bom subcommands accept applies here too (same flags).\n');
  say('Usage:');
  say('  typecad-pcb export assembly [path] [options]\n');
  say('Arguments:');
  say('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  say('Options:');
  say('  --profile=<id>     Provider profile (default: generic)');
  say('  --bom-profile=<id> BOM shape (defaults to the profile family)');
  say('  --no-zip           Keep the staging directory only, skip the .zip');
  say('  --fresh-board      openpnp: regenerate the .board.xml from scratch, discarding');
  say('                       edits made in OpenPnP (associations survive re-export otherwise)');
  say('  ...                --side, --centroid, --origin, --units, --exclude,');
  say('                       --rotation-offset, --bottom-rotation, --include-dnp');
  say('  -o, --out=<dir>    Package root (default: ./build/assembly/ — zip at');
  say('                       <root>/<board>-<profile>.zip, files beside it)');
  say('  --json             Output results as JSON');
  say('  --help             Show this help\n');
  say('Examples:');
  say('  typecad-pcb export assembly --profile jlcpcb');
  say('  typecad-pcb export assembly --profile openpnp --side front --no-zip');
}

export function showQueryHelp(): void {
  say(chalk.white.bold('typecad-pcb query') + ' - Inspect the compiled board as data\n');
  say('Answers questions about the design graph by parsing the built');
  say('.kicad_pcb: what is connected to what, which pins are floating,');
  say('where every component sits. Agents should prefer this over');
  say('grepping source files.\n');
  say('Usage:');
  say('  typecad-pcb query summary            Board totals, bounds, unconnected count');
  say('  typecad-pcb query nets               Every net with its member pins');
  say('  typecad-pcb query net <name>         One net in detail (pins, vias, zones)');
  say('  typecad-pcb query components         All components: value, footprint, position');
  say('  typecad-pcb query component <ref>    One component, pad-by-pad with nets');
  say('  typecad-pcb query unconnected        Pads with no net; single-pin nets');
  say('  typecad-pcb query power              Power rails, stitching vias, pours\n');
  say('Options:');
  say('  --json              Output in machine-readable JSON\n');
  say('Examples:');
  say('  typecad-pcb query summary');
  say('  typecad-pcb query net GND --json');
  say('  typecad-pcb query component U1');
  say('  typecad-pcb query unconnected');
}

export function showCheckHelp(): void {
  say(chalk.white.bold('typecad-pcb check') + ' - Build, then verify, in one pass\n');
  say('Runs the full gauntlet and emits a single report:');
  say('  1. build   - compile typeCAD source to KiCad files');
  say('  2. typecheck - tsc --noEmit (the tsx build executes without');
  say('                  checking types; this is where type errors surface)');
  say('  3. unconnected - pads with no net, single-pin nets');
  say('  4. erc     - electrical rules check (native engine report from the build)');
  say('  5. drc     - design rules check (native engine by default)\n');
  say('Every violation maps back to designators and nets so an agent');
  say('can act on it directly. Exits non-zero when anything fails.\n');
  say('Usage: typecad-pcb check [entry.ts] [options]\n');
  say('Options:');
  say('  --json              Output the full report as JSON');
  say('  --skip-typecheck    Skip the typecheck step');
  say('  --skip-erc          Skip the ERC step');
  say('  --skip-drc          Skip the DRC step');
  say('  --kicad-erc         ERC through kicad-cli (native engine is the default)');
  say('  --kicad-drc         DRC through kicad-cli (native engine is the default)\n');
  say('Examples:');
  say('  typecad-pcb check');
  say('  typecad-pcb check --json');
  say('  typecad-pcb check ./src/board.ts --skip-drc');
}

export function showDiagnosticsHelp(): void {
  say(chalk.white.bold('typecad-pcb diagnostics') + ' - Full design diagnostics report\n');
  say('Builds (unless --skip-build), then writes a markdown + JSON report with:');
  say('  - BOM-style component listing');
  say('  - every net and every pin-to-net connection (incl. unconnected + DNC)');
  say('  - mermaid graphs: net connectivity, clusters, power distribution');
  say('  - electrical checks from pin types, plus native ERC and DRC');
  say('  - per-net routing status, zones, and board stats\n');
  say('The markdown renders in VSCode preview (mermaid included).');
  say('Informational: violations land in the report, not the exit code.\n');
  say('Usage: typecad-pcb diagnostics [entry.ts | board.kicad_pcb] [options]\n');
  say('Options:');
  say('  --out=<file.md>     Write the markdown elsewhere (JSON lands next to it)');
  say('  --skip-build        Reuse existing ./build artifacts');
  say('  --skip-erc          Skip the ERC step');
  say('  --skip-drc          Skip the DRC step');
  say('  --kicad             Run ERC/DRC through kicad-cli (native engines are the default)');
  say('  --json              Also print the full report JSON to stdout\n');
  say('Examples:');
  say('  typecad-pcb diagnostics');
  say('  typecad-pcb diagnostics --skip-build --skip-drc');
  say('  typecad-pcb diagnostics ./src/board.ts --out=report.md');
}

export function showEditHelp(): void {
  say(chalk.white.bold('typecad-pcb edit') + ' - Checked semantic edits\n');
  say('Rewrites typeCAD source through declarative, validated operations.');
  say('Pins, nets, and references are verified against the compiled board');
  say('BEFORE the file is touched, so invalid edits fail harmlessly.\n');
  say('Usage:');
  say('  typecad-pcb edit connect <a> <b> [...]   Join pins onto a net');
  say('        <a> = pin (R1.1), net (GND), or Power object');
  say('        connect R1.1 U1.3              join both onto an auto net');
  say('        connect VCC R1.1 R2.1          join onto named net VCC\n');
  say('  typecad-pcb edit move <ref> --to x,y [--rot deg]');
  say('  typecad-pcb edit move <ref> --left-of|--right-of|--above|--below <otherRef> [--gap mm]\n');
  say('  typecad-pcb edit route <from> <to>       Autoroute copper between two pins');
  say('        [--width mm] [--layers F.Cu,B.Cu]\n');
  say('Options:');
  say('  --file=<path>       Source file to edit (default: auto-detect entry)');
  say('  --dry-run           Show the planned edit without writing');
  say('  --json              Output result as JSON\n');
  say('Examples:');
  say('  typecad-pcb edit connect R1.1 U1.3');
  say('  typecad-pcb edit connect GND C1.2 C2.2 --json');
  say('  typecad-pcb edit move U1 --right-of C3 --gap 2.54');
  say('  typecad-pcb edit route U1.3 R1.1 --width 0.25');
}

export function showViewerHelp(): void {
  say(chalk.white.bold('typecad-pcb viewer') + ' - Build the interactive board viewer page\n');
  say(
    'Exports the full fab set (gerbers + drill + job, zones refilled) and\n' +
      'builds the self-contained viewer HTML in one pass — the same pipeline\n' +
      'the vscode extension runs on every board change, without the per-step\n' +
      'startup cost of separate commands.\n',
  );
  say('Usage:');
  say('  typecad-pcb viewer [board|path] [options]\n');
  say('Options:');
  say('  -o, --out=<file>    Output page (default: ./build/serve/viewer.html;');
  say('                      ./build/serve/<board>.html on multi-board projects)');
  say('  --netlist=<file>    KiCad .net netlist — pad→net (auto: build/<board>.net)');
  say('  --drc=<file>        typeCAD DRC report JSON — violation markers');
  say('  --stackup=<file>    stackup JSON — copper weights for the thermal view');
  say('  --rules=<file>      board rules JSON — layout-view width floors');
  say('  --saved-fills       Plot saved zone fills as-is (skip the in-memory refill)');
  say('  --lazy-views        Skip the pcba/blueprint/schematic/assembly renders — each loads');
  say('                      on first switch (host bridge or --view-part fragment)');
  say('  --view-part=<name>  Render ONE view (pcba|blueprint|schematic|assembly) as a');
  say('                      mountable fragment at <out-dir>/view-<name>.html');
  say('  --json              Output summary as JSON');
  say('  --help              Show this help\n');
  say('Examples:');
  say('  typecad-pcb viewer');
  say('  typecad-pcb viewer build/main.kicad_pcb --drc build/main_drc.json');
}

export function showAddHelp(): void {
  say(chalk.white.bold('typecad-pcb add') + ' - Add a component or a package to the project\n');
  say('Usage: typecad-pcb add <component|package> [options]\n');
  say('Subcommands:');
  say('  component             Add a component to the current project');
  say('  package               Create a reusable component package\n');
  say("Run 'typecad-pcb add component --help' or 'typecad-pcb add package --help' for options.");
}

export function showSimulateHelp(): void {
  say(chalk.white.bold('typecad-pcb simulate') + ' - Solve the DC operating point with ngspice\n');
  say('Re-runs the project entry like build, with the ngspice operating-point solve');
  say('enabled. Writes build/<board>_op.json, which the board viewer uses to show');
  say("each net's voltage and each device's current/power on trace hover.\n");
  say('Usage: typecad-pcb simulate [options]\n');
  say('Options:');
  say('  --entry <file.ts>       Entry file (default: auto-detected like build)\n');
  say('Only the DC operating point is supported for now.');
}

export function showCheckSyncHelp(): void {
  say(chalk.white.bold('typecad-pcb check-sync') + ' - Report board vs source drift\n');
  say('Compares a built .kicad_pcb against src/ and lists every change an import');
  say('would make. Drift means the board was edited outside typeCAD (for example in');
  say('KiCad) or the build does not reproduce the source.\n');
  say('Usage: typecad-pcb check-sync [board.kicad_pcb] [options]\n');
  say('Options:');
  say('  --board=<name>          Pick a board in a multi-board project');
  say('  --json                  Machine-readable result (always exits 0)\n');
  say('Exits 1 when drift is found (text mode). Nothing is changed; to reconcile run:');
  say('  typecad-pcb import <board> --watch --auto');
}

export function showCompletionHelp(): void {
  say(chalk.white.bold('typecad-pcb completion') + ' - Print a shell tab-completion script\n');
  say('Usage: typecad-pcb completion <bash|zsh|pwsh>\n');
  say('Install (the script completes commands, subcommands and each command\'s options):');
  say("  bash   typecad-pcb completion bash >> ~/.bashrc");
  say("  zsh    echo 'source <(typecad-pcb completion zsh)' >> ~/.zshrc");
  say('  pwsh   add this line to your $PROFILE:');
  say('           typecad-pcb completion pwsh | Out-String | Invoke-Expression\n');
  say("It completes the 'typecad-pcb' and 'pcb' binaries, so they must be on your PATH");
  say('(a global install, or node_modules/.bin).');
}
