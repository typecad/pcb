import chalk from 'chalk';

export function showTopLevelHelp(): void {
  console.log(
    chalk.white.bold('typeCAD') + ' - programmatically create hardware\n'
  );
  console.log('Usage:');
  console.log('  typecad <command> [subcommand] [options]\n');
  console.log('Commands:');
  console.log('  create              Create a new typeCAD project');
  console.log('  add component       Add a component to the current project');
  console.log('  add package         Create a reusable component package');
  console.log('  build               Build KiCAD output from typeCAD source');
  console.log('  search              Search KiCad schematic symbols');
  console.log('  import              Convert a KiCad PCB file to typeCAD code');
  console.log('  diff                Compare two KiCad PCB files visually');
  console.log('  doc                 Generate PCB documentation from Markdown\n');
  console.log('Global Options:');
  console.log('  --json              Output in machine-readable JSON');
  console.log('  --help              Show help for a command');
  console.log('  --version           Show typecad version\n');
  console.log("Run 'typecad <command> --help' for details on a command.");
}

export function showCreateHelp(): void {
  console.log(
    chalk.white.bold('typecad create') +
      ' - Create a new typeCAD project\n'
  );
  console.log(
    'Create a new typeCAD project with KiCAD project files, npm package,'
  );
  console.log('and optional firmware.\n');
  console.log('Usage: typecad create [options]\n');
  console.log('Options:');
  console.log(
    '  --name=<name>         Project name (required for non-interactive mode)'
  );
  console.log(
    '  --pio=<true|false>    Create a PlatformIO firmware project (default: false)'
  );
  console.log(
    '  --git=<true|false>    Initialize a git repository (default: false)'
  );
  console.log(
    '  --board=<board>       PlatformIO board (required when --pio=true, default: esp32dev)'
  );
  console.log('  --packages=<list>     Comma-separated packages to install');
  console.log(
    '                        Available: @typecad/ngspice, @typecad/graphviz,'
  );
  console.log(
    '                        @typecad/jlcpcb-export, @typecad/typecad-prompt,'
  );
  console.log(
    '                        @typecad/wiring, @typecad/jlcpcb-parts,'
  );
  console.log(
    '                        @typecad/typecad-mcp\n'
  );
  console.log('Without options, runs interactively with prompts.');
}

export function showAddComponentHelp(): void {
  console.log(
    chalk.white.bold('typecad add component') +
      ' - Add a component to the current project\n'
  );
  console.log('Usage: typecad add component [options]\n');
  console.log('Mixed Source Options:');
  console.log(
    '  --symbol_source=<src>     Symbol source: kicad, local, or jlcpcb'
  );
  console.log(
    '  --footprint_source=<src>  Footprint source: kicad, local, or jlcpcb'
  );
  console.log(
    '  --symbol=<name>           Symbol (library:symbol or path to .kicad_sym)'
  );
  console.log(
    '  --footprint=<name>        Footprint (library:footprint or path to .kicad_mod)'
  );
  console.log(
    '  --c=<C-number>            JLCPCB component number (e.g. C3217148)\n'
  );
  console.log('Legacy Source Options (choose one):');
  console.log('  --kicad=<value>           Use KiCAD library');
  console.log('  --local=<value>           Use local files');
  console.log('  --jlcpcb=<value>          Use EasyEDA/JLCPCB\n');
  console.log('Other Options:');
  console.log('  --folder=<path>           Output folder (default: current directory)\n');
  console.log('Without options, runs interactively with prompts.');
}

export function showAddPackageHelp(): void {
  console.log(
    chalk.white.bold('typecad add package') +
      ' - Create a reusable component package\n'
  );
  console.log('Usage: typecad add package [options]\n');
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
  console.log(
    '  --symbol=<name>           Symbol (format: library:symbol_name)'
  );
  console.log(
    '  --footprint=<name>        Footprint (format: library:footprint_name)'
  );
  console.log(
    "  --c=<C-number>            JLCPCB component number (e.g. C3217148)\n"
  );
  console.log('Other Options:');
  console.log('  --folder=<path>           Output folder (default: ./src)\n');
  console.log('Without options, runs interactively with prompts.');
}

export function showBuildHelp(): void {
  console.log(
    chalk.white.bold('typecad build') +
      ' - Build KiCAD output from typeCAD source\n'
  );
  console.log(
    'Run the typeCAD entry point to generate KiCAD schematic and PCB files.'
  );
  console.log('\nUsage: typecad build [entry] [options]\n');
  console.log('Arguments:');
  console.log(
    '  <entry>                   Path to .ts entry file (default: auto-detected'
  );
  console.log(
    '                            from typecad.conf.ts, package.json, or ./src/*.ts)\n'
  );
  console.log('Options:');
  console.log('  --verbose                 Enable verbose logging output\n');
  console.log(
    'The build command executes your typeCAD TypeScript source, which generates'
  );
  console.log('KiCAD .kicad_pcb, .kicad_pro, .net, and related files in ./build/.');
}

export function showSearchHelp(): void {
  console.log(
    chalk.white.bold('typecad search') +
      ' - Search KiCad schematic symbols\n'
  );
  console.log(
    'Search for KiCad schematic symbols using fuzzy matching.\n'
  );
  console.log('Usage: typecad search [options] <query>\n');
  console.log('Arguments:');
  console.log('  <query>                   Search terms (e.g. "op amp", "LM358")\n');
  console.log('Options:');
  console.log(
    '  --format=<fmt>            Output format: detailed, compact, table, json'
  );
  console.log('                            (default: detailed)');
  console.log(
    '  --sort=<field>            Sort by: score, id, manufacturer, package'
  );
  console.log('                            (default: score)');
  console.log('  --limit=<n>               Maximum results (default: 5)\n');
  console.log('Without a query, prompts for search terms interactively.');
}

export function showImportHelp(): void {
  console.log(
    chalk.white.bold('typecad import') +
      ' - Convert KiCad PCB to typeCAD code\n'
  );
  console.log('Convert a KiCad .kicad_pcb file into typeCAD TypeScript code.\n');
  console.log('Usage: typecad import <file_path> [options]\n');
  console.log('Arguments:');
  console.log('  <file_path>               Path to the .kicad_pcb file\n');
  console.log('Options:');
  console.log(
    '  --apply                   Interactively apply coordinate changes back'
  );
  console.log('                            to the typeCAD source files\n');
  console.log(
    "Variable names are sourced from each footprint's 'Code' property."
  );
  console.log('If missing, the KiCad reference is used (e.g., U1, R3).');
}

export function showDiffHelp(): void {
  console.log(
    chalk.white.bold('typecad diff') +
      ' - Visual PCB Comparison Tool\n'
  );
  console.log('Compare two KiCad PCB files and generate a visual diff report.\n');
  console.log('Usage:');
  console.log('  typecad diff [options] <original.kicad_pcb> <modified.kicad_pcb>');
  console.log('  typecad diff [options] <rev> <file.kicad_pcb>');
  console.log('  typecad diff [options] <rev1> <rev2> [--] <file.kicad_pcb>\n');
  console.log('Options:');
  console.log('  --full              Process all layers including User layers');
  console.log('  --theme=<name>      Theme for SVG export (e.g. "Monokai")');
  console.log('  --output=<path>     Output HTML file path\n');
  console.log('Git vs Working Tree:');
  console.log('  typecad diff HEAD~1 ./build/board.kicad_pcb');
  console.log('  typecad diff main ./build/board.kicad_pcb\n');
  console.log('Git Revision Comparison:');
  console.log('  typecad diff HEAD~1 HEAD -- board.kicad_pcb');
  console.log('  typecad diff main feature-branch -- board.kicad_pcb\n');
  console.log('Examples:');
  console.log('  typecad diff board_v1.kicad_pcb board_v2.kicad_pcb');
  console.log('  typecad diff HEAD~1 ./build/board.kicad_pcb');
  console.log('  typecad diff HEAD~1 HEAD -- board.kicad_pcb');
}

export function showDocHelp(): void {
  console.log(
    chalk.white.bold('typecad doc') +
      ' - Generate PCB documentation from Markdown\n'
  );
  console.log(
    'Generate a self-contained HTML document from a Markdown file and KiCad PCB file.'
  );
  console.log('\nUsage: typecad doc <markdown_file> <pcb_file> [options]\n');
  console.log('Arguments:');
  console.log('  <markdown_file>       Input Markdown file (.md)');
  console.log('  <pcb_file>            KiCad PCB file (.kicad_pcb)\n');
  console.log('Options:');
  console.log('  -o, --output <file>   Output HTML file (default: input file with .html extension)');
  console.log('  -v, --verbose         Enable verbose logging');
  console.log('  -q, --quiet           Suppress non-error output');
  console.log('      --no-open         Do not automatically open the generated HTML file\n');
  console.log('Examples:');
  console.log('  typecad doc docs/board.md build/board.kicad_pcb');
  console.log('  typecad doc docs/board.md build/board.kicad_pcb -o output.html');
  console.log('  typecad doc docs/board.md build/board.kicad_pcb --verbose');
  console.log('  typecad doc docs/board.md build/board.kicad_pcb --quiet');
  console.log('  typecad doc docs/board.md build/board.kicad_pcb --no-open');
}
