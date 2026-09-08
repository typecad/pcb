import chalk from 'chalk';

export function showTopLevelHelp(): void {
  console.log(chalk.white.bold('typeCAD') + ' - programmatically create hardware\n');
  console.log('Usage:');
  console.log('  typecad-pcb <command> [subcommand] [options]\n');
  console.log('Commands:');
  console.log('  create              Create a new typeCAD project');
  console.log('  add component       Add a component to the current project');
  console.log('  add package         Create a reusable component package');
  console.log('  build               Build KiCAD output from typeCAD source');
  console.log('  check               Build + ERC + DRC in one pass, one report');
  console.log('  query               Inspect the compiled board (nets, pins, placement)');
  console.log('  edit                Checked semantic edits (connect, move)');
  console.log('  search              Search KiCad schematic symbols');
  console.log('  import              Convert a KiCad PCB file to typeCAD code');
  console.log('  diff                Compare two KiCad PCB files visually');
  console.log('  doc                 Generate PCB documentation from Markdown');
  console.log('  doctor              Check your environment for common issues');
  console.log('  validate            Validate project source without full build');
  console.log('  drc                 Run Design Rule Check on a KiCad PCB file');
  console.log('  erc                 Run Electrical Rules Check on a KiCad schematic');
  console.log('  export gerbers      Export Gerber files from a KiCad PCB');
  console.log('  export drill        Export drill files from a KiCad PCB');
  console.log('  skills              List and query typeCAD skills and API patterns');
  console.log('  package             Browse and install typeCAD packages from npm\n');
  console.log('Global Options:');
  console.log('  --json              Output in machine-readable JSON');
  console.log('  --help              Show help for a command');
  console.log('  --version           Show typecad-pcb version\n');
  console.log("Run 'typecad-pcb <command> --help' for details on a command.");
}

export function showCreateHelp(): void {
  console.log(chalk.white.bold('typecad-pcb create') + ' - Create a new typeCAD project\n');
  console.log('Create a new typeCAD project with KiCAD project files, npm package,');
  console.log('and optional firmware.\n');
  console.log('Usage: typecad-pcb create [options]\n');
  console.log('Options:');
  console.log('  --name=<name>         Project name (required for non-interactive mode)');
  console.log('  --pio=<true|false>    Create a PlatformIO firmware project (default: false)');
  console.log('  --git=<true|false>    Initialize a git repository (default: false)');
  console.log('  --board=<board>       PlatformIO board (required when --pio=true, default: esp32dev)\n');
  console.log('Without options, runs interactively with prompts.');
}

export function showAddComponentHelp(): void {
  console.log(chalk.white.bold('typecad-pcb add component') + ' - Add a component to the current project\n');
  console.log('Usage: typecad-pcb add component [options]\n');
  console.log('Mixed Source Options:');
  console.log('  --symbol_source=<src>     Symbol source: kicad, local, or jlcpcb');
  console.log('  --footprint_source=<src>  Footprint source: kicad, local, or jlcpcb');
  console.log('  --symbol=<name>           Symbol (library:symbol or path to .kicad_sym)');
  console.log('  --footprint=<name>        Footprint (library:footprint or path to .kicad_mod)');
  console.log('  --c=<C-number>            JLCPCB component number (e.g. C3217148)\n');
  console.log('Legacy Source Options (choose one):');
  console.log('  --kicad=<value>           Use KiCAD library');
  console.log('  --local=<value>           Use local files');
  console.log('  --jlcpcb=<value>          Use EasyEDA/JLCPCB\n');
  console.log('Other Options:');
  console.log('  --folder=<path>           Output folder (default: current directory)\n');
  console.log('Without options, runs interactively with prompts.');
}

export function showAddPackageHelp(): void {
  console.log(chalk.white.bold('typecad-pcb add package') + ' - Create a reusable component package\n');
  console.log('Usage: typecad-pcb add package [options]\n');
  console.log('Package Type (exactly one required):');
  console.log('  --empty=true              Create an empty package template');
  console.log('  --component=true          Create a component package\n');
  console.log('Required:');
  console.log('  --name=<name>             Package name\n');
  console.log('Component Source (when --component=true, choose one):');
  console.log('  --kicad=true              From KiCAD library');
  console.log('  --local=true              From local files');
  console.log('  --jlcpcb=true             From EasyEDA/JLCPCB\n');
  console.log('Component Parameters:');
  console.log('  --symbol=<name>           Symbol (format: library:symbol_name)');
  console.log('  --footprint=<name>        Footprint (format: library:footprint_name)');
  console.log('  --c=<C-number>            JLCPCB component number (e.g. C3217148)\n');
  console.log('Other Options:');
  console.log('  --folder=<path>           Output folder (default: ./src)\n');
  console.log('Without options, runs interactively with prompts.');
}

export function showBuildHelp(): void {
  console.log(chalk.white.bold('typecad-pcb build') + ' - Build KiCAD output from typeCAD source\n');
  console.log('Run the typeCAD entry point to generate KiCAD schematic and PCB files.');
  console.log('\nUsage: typecad-pcb build [entry] [options]\n');
  console.log('Arguments:');
  console.log('  <entry>                   Path to .ts entry file (default: auto-detected');
  console.log('                            from typecad.conf.ts, package.json, or ./src/*.ts)\n');
  console.log('Options:');
  console.log('  --verbose                 Enable verbose logging output\n');
  console.log('The build command executes your typeCAD TypeScript source, which generates');
  console.log('KiCAD .kicad_pcb, .kicad_pro, .net, and related files in ./build/.');
}

export function showSearchHelp(): void {
  console.log(chalk.white.bold('typecad-pcb search') + ' - Search KiCad schematic symbols\n');
  console.log('Search for KiCad schematic symbols using fuzzy matching.\n');
  console.log('Usage: typecad-pcb search [options] <query>\n');
  console.log('Arguments:');
  console.log('  <query>                   Search terms (e.g. "op amp", "LM358")\n');
  console.log('Options:');
  console.log('  --format=<fmt>            Output format: detailed, compact, table, json');
  console.log('                            (default: detailed)');
  console.log('  --sort=<field>            Sort by: score, id, manufacturer, package');
  console.log('                            (default: score)');
  console.log('  --limit=<n>               Maximum results (default: 5)\n');
  console.log('Without a query, prompts for search terms interactively.');
}

export function showImportHelp(): void {
  console.log(chalk.white.bold('typecad-pcb import') + ' - Convert KiCad PCB to typeCAD code\n');
  console.log('Convert a KiCad .kicad_pcb file into typeCAD TypeScript code.\n');
  console.log('Usage: typecad-pcb import <file_path> [options]\n');
  console.log('Arguments:');
  console.log('  <file_path>               Path to the .kicad_pcb file\n');
  console.log('Options:');
  console.log('  --apply                   Interactively apply coordinate changes back');
  console.log('                            to the typeCAD source files');
  console.log('  --capture-layouts         Also import text layout positions');
  console.log('                            (referenceLayout, valueLayout, fabLayout)\n');
  console.log('                            to the typeCAD source files\n');
  console.log("Variable names are sourced from each footprint's 'Code' property.");
  console.log('If missing, the KiCad reference is used (e.g., U1, R3).');
}

export function showDiffHelp(): void {
  console.log(chalk.white.bold('typecad-pcb diff') + ' - Visual PCB Comparison Tool\n');
  console.log('Compare two KiCad PCB files and generate a visual diff report.\n');
  console.log('Usage:');
  console.log('  typecad-pcb diff [options] <original.kicad_pcb> <modified.kicad_pcb>');
  console.log('  typecad-pcb diff [options] <rev> <file.kicad_pcb>');
  console.log('  typecad-pcb diff [options] <rev1> <rev2> [--] <file.kicad_pcb>\n');
  console.log('Options:');
  console.log('  --full              Process all layers including User layers');
  console.log('  --theme=<name>      Theme for SVG export (e.g. "Monokai")');
  console.log('  --output=<path>     Output HTML file path\n');
  console.log('Git vs Working Tree:');
  console.log('  typecad-pcb diff HEAD~1 ./build/board.kicad_pcb');
  console.log('  typecad-pcb diff main ./build/board.kicad_pcb\n');
  console.log('Git Revision Comparison:');
  console.log('  typecad-pcb diff HEAD~1 HEAD -- board.kicad_pcb');
  console.log('  typecad-pcb diff main feature-branch -- board.kicad_pcb\n');
  console.log('Examples:');
  console.log('  typecad-pcb diff board_v1.kicad_pcb board_v2.kicad_pcb');
  console.log('  typecad-pcb diff HEAD~1 ./build/board.kicad_pcb');
  console.log('  typecad-pcb diff HEAD~1 HEAD -- board.kicad_pcb');
}

export function showDocHelp(): void {
  console.log(chalk.white.bold('typecad-pcb doc') + ' - Generate PCB documentation from Markdown\n');
  console.log('Generate a self-contained HTML document from a Markdown file and KiCad PCB file.');
  console.log('\nUsage: typecad-pcb doc <markdown_file> <pcb_file> [options]\n');
  console.log('Arguments:');
  console.log('  <markdown_file>       Input Markdown file (.md)');
  console.log('  <pcb_file>            KiCad PCB file (.kicad_pcb)\n');
  console.log('Options:');
  console.log('  -o, --output <file>   Output HTML file (default: input file with .html extension)');
  console.log('  -v, --verbose         Enable verbose logging');
  console.log('  -q, --quiet           Suppress non-error output');
  console.log('      --no-open         Do not automatically open the generated HTML file\n');
  console.log('Examples:');
  console.log('  typecad-pcb doc docs/board.md build/board.kicad_pcb');
  console.log('  typecad-pcb doc docs/board.md build/board.kicad_pcb -o output.html');
  console.log('  typecad-pcb doc docs/board.md build/board.kicad_pcb --verbose');
  console.log('  typecad-pcb doc docs/board.md build/board.kicad_pcb --quiet');
  console.log('  typecad-pcb doc docs/board.md build/board.kicad_pcb --no-open');
}

export function showErcHelp(): void {
  console.log(chalk.white.bold('typecad-pcb erc') + ' - Run Electrical Rules Check on a KiCad schematic\n');
  console.log(
    'Runs kicad-cli sch erc on a .kicad_sch file, parses the JSON report,\n' +
      'and displays a summary of errors and warnings.\n',
  );
  console.log('Usage:');
  console.log('  typecad-pcb erc [path] [typecad-options] -- [kicad-cli flags]\n');
  console.log('Arguments:');
  console.log('  <path>             Path to .kicad_sch file (default: auto-detected from ./build/)\n');
  console.log('typecad Options:');
  console.log('  --json             Output typecad results as JSON');
  console.log('  --help             Show this help\n');
  console.log('Passthrough:');
  console.log('  All flags after -- are forwarded directly to kicad-cli sch erc.');
  console.log('  See `kicad-cli sch erc --help` for the full list of available flags.\n');
  console.log('  Common kicad-cli flags:');
  console.log('    --severity-all              Report all violations');
  console.log('    --severity-error            Report error-level violations');
  console.log('    --severity-warning          Report warning-level violations');
  console.log('    --severity-exclusions       Report excluded violations');
  console.log('    --exit-code-violations      Non-zero exit on violations');
  console.log('    --format <report|json>      Report format (typecad always uses json internally)');
  console.log('    --units <mm|in|mils>        Report units');
  console.log('    -o, --output <file>         Output file path\n');
  console.log('Output:');
  console.log('  Report saved to <name>_erc.json alongside the schematic file.\n');
  console.log('Examples:');
  console.log('  typecad-pcb erc');
  console.log('  typecad-pcb erc --json');
  console.log('  typecad-pcb erc -- --severity-all');
  console.log('  typecad-pcb erc ./build/board.kicad_sch -- --exit-code-violations');
}

export function showDrcHelp(): void {
  console.log(chalk.white.bold('typecad-pcb drc') + ' - Run Design Rule Check on a KiCad PCB file\n');
  console.log(
    'Runs kicad-cli pcb drc on a .kicad_pcb file, parses the JSON report,\n' +
      'and displays a summary of errors, warnings, and unconnected items.\n',
  );
  console.log('Usage:');
  console.log('  typecad-pcb drc [path] [typecad-options] -- [kicad-cli flags]\n');
  console.log('Arguments:');
  console.log('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  console.log('typecad Options:');
  console.log('  --json             Output typecad results as JSON');
  console.log('  --help             Show this help\n');
  console.log('Passthrough:');
  console.log('  All flags after -- are forwarded directly to kicad-cli pcb drc.');
  console.log('  See `kicad-cli pcb drc --help` for the full list of available flags.\n');
  console.log('  Common kicad-cli flags:');
  console.log('    --severity-all              Report all violations');
  console.log('    --severity-error            Report error-level violations');
  console.log('    --severity-warning          Report warning-level violations');
  console.log('    --severity-exclusions       Report excluded violations');
  console.log('    --schematic-parity          Test PCB vs schematic parity');
  console.log('    --all-track-errors          Report all errors per track');
  console.log('    --exit-code-violations      Non-zero exit on violations');
  console.log('    --refill-zones              Refill zones before DRC');
  console.log('    --save-board                Save board after DRC');
  console.log('    --units <mm|in|mils>        Report units');
  console.log('    -o, --output <file>         Output file path\n');
  console.log('Output:');
  console.log('  Report saved to <name>_drc.json alongside the board file.\n');
  console.log('Examples:');
  console.log('  typecad-pcb drc');
  console.log('  typecad-pcb drc --json');
  console.log('  typecad-pcb drc -- --severity-all --schematic-parity');
  console.log('  typecad-pcb drc ./build/board.kicad_pcb -- --refill-zones');
}

export function showValidateHelp(): void {
  console.log(chalk.white.bold('typecad-pcb validate') + ' - Validate project source without full build\n');
  console.log(
    'Type-check and run your typeCAD entry file, reporting errors without\n' + 'producing verbose build output.\n',
  );
  console.log('Usage: typecad-pcb validate [entry] [options]\n');
  console.log('Arguments:');
  console.log('  <entry>                   Path to .ts entry file (default: auto-detected)\n');
  console.log('Options:');
  console.log('  --verbose                 Show full build output');
  console.log('  --json                    Output results as JSON\n');
  console.log('Checks performed:');
  console.log('  1. TypeScript type checking (if tsconfig.json exists)');
  console.log('  2. Runtime execution of the entry file');
}

export function showDoctorHelp(): void {
  console.log(chalk.white.bold('typecad-pcb doctor') + ' - Check your environment for common issues\n');
  console.log(
    'Diagnose your typeCAD environment by checking for required tools,\n' + 'dependencies, and configuration.\n',
  );
  console.log('Usage: typecad-pcb doctor [options]\n');
  console.log('Options:');
  console.log('  --fix               Attempt to automatically fix detected problems');
  console.log('  --json              Output results in JSON format\n');
  console.log('Checks performed:');
  console.log('  Node.js >= 18       npm & core dependencies');
  console.log('  package.json        node_modules integrity');
  console.log('  typecad config      entry file');
  console.log('  kicad-cli / PATH    KiCad symbol libraries');
  console.log('  Git');
  console.log('  build/ directory');
}

export function showSkillsHelp(): void {
  console.log(chalk.white.bold('typecad-pcb skills') + ' - Query typeCAD API patterns and design knowledge\n');
  console.log(
    'List and query skills that document typeCAD concepts, API patterns,\n' +
      'electrical design concepts, and KiCad-related information.\n',
  );
  console.log('Usage:');
  console.log('  typecad-pcb skills list              List all available skills');
  console.log('  typecad-pcb skills get <name>        Get details on a specific skill');
  console.log('  typecad-pcb skills search <query>    Fuzzy-find skills by keyword');
  console.log('  typecad-pcb skills export            Export skills as SKILL.md files\n');
  console.log('Options:');
  console.log('  --json              Output in machine-readable JSON');
  console.log('  --out=<dir>         Export target (default .claude/skills)');
  console.log('  --category=<name>   Export only one category\n');
  console.log('Examples:');
  console.log('  typecad-pcb skills list');
  console.log('  typecad-pcb skills list --json');
  console.log('  typecad-pcb skills search placement');
  console.log('  typecad-pcb skills get resistor');
  console.log('  typecad-pcb skills get power --json');
  console.log('  typecad-pcb skills export --out .claude/skills');
}

export function showPackageHelp(): void {
  console.log(chalk.white.bold('typecad-pcb package') + ' - Browse and install typeCAD packages\n');
  console.log('Searches the npm registry for typeCAD-compatible packages and presents');
  console.log('them for selection. Already-installed packages are indicated.\n');
  console.log('Usage: typecad-pcb package [options]\n');
  console.log('Options:');
  console.log('  --json    Output results in JSON format\n');
  console.log('Examples:');
  console.log('  typecad-pcb package');
  console.log('  typecad-pcb package --json');
}

export function showExportHelp(): void {
  console.log(chalk.white.bold('typecad-pcb export') + ' - Export KiCad PCB fabrication files\n');
  console.log('Usage:');
  console.log('  typecad-pcb export <subcommand> [path] [options] [-- kicad-cli flags]\n');
  console.log('Subcommands:');
  console.log('  gerbers             Export Gerber files');
  console.log('  drill               Export drill files\n');
  console.log('Options:');
  console.log('  -o, --output=<dir>  Output directory (default: ./build/gerbers/)');
  console.log('  --json              Output results as JSON');
  console.log('  --help              Show help for a subcommand\n');
  console.log("Run 'typecad-pcb export <subcommand> --help' for details.");
}

export function showExportGerbersHelp(): void {
  console.log(chalk.white.bold('typecad-pcb export gerbers') + ' - Export Gerber files from a KiCad PCB\n');
  console.log(
    'Runs kicad-cli pcb export gerbers on a .kicad_pcb file,\n' + 'generating fabrication-ready Gerber output.\n',
  );
  console.log('Usage:');
  console.log('  typecad-pcb export gerbers [path] [typecad-options] [-- kicad-cli flags]\n');
  console.log('Arguments:');
  console.log('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  console.log('typecad Options:');
  console.log('  -o, --output=<dir> Output directory (default: ./build/gerbers/)');
  console.log('  --json             Output results as JSON');
  console.log('  --help             Show this help\n');
  console.log('Passthrough:');
  console.log('  All flags after -- are forwarded directly to kicad-cli pcb export gerbers.');
  console.log('  See `kicad-cli pcb export gerbers --help` for the full list of flags.\n');
  console.log('Examples:');
  console.log('  typecad-pcb export gerbers');
  console.log('  typecad-pcb export gerbers --output ./fab');
  console.log('  typecad-pcb export gerbers ./build/board.kicad_pcb');
  console.log('  typecad-pcb export gerbers -- --exclude-drawing-sheet');
}

export function showExportDrillHelp(): void {
  console.log(chalk.white.bold('typecad-pcb export drill') + ' - Export drill files from a KiCad PCB\n');
  console.log('Runs kicad-cli pcb export drill on a .kicad_pcb file,\n' + 'generating Excellon drill output.\n');
  console.log('Usage:');
  console.log('  typecad-pcb export drill [path] [typecad-options] [-- kicad-cli flags]\n');
  console.log('Arguments:');
  console.log('  <path>             Path to .kicad_pcb file (default: auto-detected from ./build/)\n');
  console.log('typecad Options:');
  console.log('  -o, --output=<dir> Output directory (default: ./build/gerbers/)');
  console.log('  --json             Output results as JSON');
  console.log('  --help             Show this help\n');
  console.log('Passthrough:');
  console.log('  All flags after -- are forwarded directly to kicad-cli pcb export drill.');
  console.log('  See `kicad-cli pcb export drill --help` for the full list of flags.\n');
  console.log('Examples:');
  console.log('  typecad-pcb export drill');
  console.log('  typecad-pcb export drill --output ./fab');
  console.log('  typecad-pcb export drill ./build/board.kicad_pcb');
  console.log('  typecad-pcb export drill -- --use-drill-file-origin');
}

export function showQueryHelp(): void {
  console.log(chalk.white.bold('typecad-pcb query') + ' - Inspect the compiled board as data\n');
  console.log('Answers questions about the design graph by parsing the built');
  console.log('.kicad_pcb: what is connected to what, which pins are floating,');
  console.log('where every component sits. Agents should prefer this over');
  console.log('grepping source files.\n');
  console.log('Usage:');
  console.log('  typecad-pcb query summary            Board totals, bounds, unconnected count');
  console.log('  typecad-pcb query nets               Every net with its member pins');
  console.log('  typecad-pcb query net <name>         One net in detail (pins, vias, zones)');
  console.log('  typecad-pcb query components         All components: value, footprint, position');
  console.log('  typecad-pcb query component <ref>    One component, pad-by-pad with nets');
  console.log('  typecad-pcb query unconnected        Pads with no net; single-pin nets');
  console.log('  typecad-pcb query power              Power rails, stitching vias, pours\n');
  console.log('Options:');
  console.log('  --json              Output in machine-readable JSON\n');
  console.log('Examples:');
  console.log('  typecad-pcb query summary');
  console.log('  typecad-pcb query net GND --json');
  console.log('  typecad-pcb query component U1');
  console.log('  typecad-pcb query unconnected');
}

export function showCheckHelp(): void {
  console.log(chalk.white.bold('typecad-pcb check') + ' - Build, then verify, in one pass\n');
  console.log('Runs the full gauntlet and emits a single report:');
  console.log('  1. build   - compile typeCAD source to KiCad files');
  console.log('  2. unconnected - pads with no net, single-pin nets');
  console.log('  3. erc     - electrical rules check (needs kicad-cli)');
  console.log('  4. drc     - design rules check (needs kicad-cli)\n');
  console.log('Every violation maps back to designators and nets so an agent');
  console.log('can act on it directly. Exits non-zero when anything fails.\n');
  console.log('Usage: typecad-pcb check [entry.ts] [options]\n');
  console.log('Options:');
  console.log('  --json              Output the full report as JSON');
  console.log('  --skip-erc          Skip the ERC step');
  console.log('  --skip-drc          Skip the DRC step\n');
  console.log('Examples:');
  console.log('  typecad-pcb check');
  console.log('  typecad-pcb check --json');
  console.log('  typecad-pcb check ./src/board.ts --skip-drc');
}

export function showEditHelp(): void {
  console.log(chalk.white.bold('typecad-pcb edit') + ' - Checked semantic edits\n');
  console.log('Rewrites typeCAD source through declarative, validated operations.');
  console.log('Pins, nets, and references are verified against the compiled board');
  console.log('BEFORE the file is touched, so invalid edits fail harmlessly.\n');
  console.log('Usage:');
  console.log('  typecad-pcb edit connect <a> <b> [...]   Join pins onto a net');
  console.log('        <a> = pin (R1.1), net (GND), or Power object');
  console.log('        connect R1.1 U1.3              join both onto an auto net');
  console.log('        connect VCC R1.1 R2.1          join onto named net VCC\n');
  console.log('  typecad-pcb edit move <ref> --to x,y [--rot deg]');
  console.log('  typecad-pcb edit move <ref> --left-of|--right-of|--above|--below <otherRef> [--gap mm]\n');
  console.log('  typecad-pcb edit route <from> <to>       Autoroute copper between two pins');
  console.log('        [--width mm] [--layers F.Cu,B.Cu]\n');
  console.log('Options:');
  console.log('  --file <path>       Source file to edit (default: auto-detect entry)');
  console.log('  --dry-run           Show the planned edit without writing');
  console.log('  --json              Output result as JSON\n');
  console.log('Examples:');
  console.log('  typecad-pcb edit connect R1.1 U1.3');
  console.log('  typecad-pcb edit connect GND C1.2 C2.2 --json');
  console.log('  typecad-pcb edit move U1 --right-of C3 --gap 2.54');
  console.log('  typecad-pcb edit route U1.3 R1.1 --width 0.25');
}
