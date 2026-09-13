#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildViewerFromFiles } from './build.js';
import { loadPcbaTheme, pcbaThemeNames, renderPcbaFromFiles } from './pcba.js';

interface CliArgs {
  inputs: string[];
  out: string;
  outIsDefault: boolean;
  svgOut: string | null;
  netlistPath: string | null;
  noNetlist: boolean;
  drcReportPath: string | null;
  render: 'viewer' | 'pcba';
  theme: string | null;
  side: 'auto' | 'front' | 'back';
  /** null = auto (labels off when silkscreen carries the refdes) */
  labels: boolean | null;
  open: boolean;
  help: boolean;
  version: boolean;
}

const USAGE = `gerber-viewer - render Gerber (RS-274X) + Excellon drill sets as an interactive HTML viewer

Usage:
  gerber-viewer <files... | directory> [options]   one-shot viewer HTML

Options:
  -o, --out <file>    output path (viewer: HTML, default gerber-viewer.html;
                      pcba: SVG, default board-pcba.svg)
  --render <mode>     viewer (default) or pcba — a flat 2D assembled-board
                      image: themed substrate/mask/pads/silk + stylized
                      components from X2 attributes (no lighting/perspective)
  --theme <name>      pcba theme: ${pcbaThemeNames().join(', ')} or a .json path
  --side <side>       pcba side: auto (default), front or back
  --labels            pcba: force component refdes labels on/off (default:
  --no-labels         auto — off when the silkscreen already has them)
  --svg <file>        viewer mode: also write a standalone SVG of the board
  --netlist <file>    KiCad .net netlist — viewer: fills pad→net so clicking
                      a pad highlights its whole net; pcba: ref→footprint
                      names size the component bodies from the package
                      (0603_1608, 4x4mm, ...). pcba auto-discovers a sibling
                      *.net next to the input dir (build/<board>.net)
  --no-netlist        pcba: skip netlist discovery
  --drc <file>        typecad DRC report JSON: renders violation markers
  --open              open the viewer in the default browser
  -h, --help          show this help
  -v, --version       print version

Examples:
  gerber-viewer gerbers/ -o board-view.html --open
  gerber-viewer gerbers/ --render pcba --theme purple-enig -o board.svg
`;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    inputs: [],
    out: 'gerber-viewer.html',
    outIsDefault: true,
    svgOut: null,
    netlistPath: null,
    noNetlist: false,
    drcReportPath: null,
    render: 'viewer',
    theme: null,
    side: 'auto',
    labels: null,
    open: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '-v' || arg === '--version') args.version = true;
    else if (arg === '-o' || arg === '--out') {
      args.out = argv[++i] ?? '';
      args.outIsDefault = false;
    } else if (arg === '--svg') args.svgOut = argv[++i] ?? '';
    else if (arg === '--netlist') args.netlistPath = argv[++i] ?? '';
    else if (arg === '--no-netlist') args.noNetlist = true;
    else if (arg === '--drc') args.drcReportPath = argv[++i] ?? '';
    else if (arg === '--render') {
      const mode = argv[++i];
      if (mode !== 'viewer' && mode !== 'pcba') throw new Error(`unknown --render mode "${mode}" (viewer or pcba)`);
      args.render = mode;
    } else if (arg === '--theme') args.theme = argv[++i] ?? null;
    else if (arg === '--side') {
      const side = argv[++i];
      if (side !== 'auto' && side !== 'front' && side !== 'back') {
        throw new Error(`unknown --side "${side}" (auto, front or back)`);
      }
      args.side = side;
    } else if (arg === '--labels') args.labels = true;
    else if (arg === '--no-labels') args.labels = false;
    else if (arg === '--open') args.open = true;
    else if (arg.startsWith('-')) throw new Error(`unknown option "${arg}"`);
    else args.inputs.push(arg);
  }
  return args;
}

function readVersion(): string {
  // dist/gerber_viewer/cli.js -> package root is two levels up
  const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function openInBrowser(file: string): void {
  try {
    if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'start', '', path.resolve(file)], { stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      execFileSync('open', [path.resolve(file)], { stdio: 'ignore' });
    } else {
      execFileSync('xdg-open', [path.resolve(file)], { stdio: 'ignore' });
    }
  } catch {
    console.error(`could not open a browser; open ${path.resolve(file)} manually`);
  }
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  let entry: string;
  let self: string;
  try {
    // the bin is usually reached through the node_modules symlink (npm
    // scripts, npx), while import.meta.url is always the real path
    entry = realpathSync(path.resolve(process.argv[1]));
    self = realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
  // drive-letter casing varies across npm shims on Windows
  return process.platform === 'win32' ? entry.toLowerCase() === self.toLowerCase() : entry === self;
}

export function run(argv: string[]): number {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${(error as Error).message}\n`);
    process.stdout.write(USAGE);
    return 2;
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (args.inputs.length === 0) {
    process.stderr.write('error: no input files or directory given\n\n');
    process.stdout.write(USAGE);
    return 2;
  }

  if (args.render === 'pcba') {
    const out = args.outIsDefault ? 'board-pcba.svg' : args.out;
    let result;
    try {
      loadPcbaTheme(args.theme ?? undefined); // fail fast on a bad theme before parsing
      result = renderPcbaFromFiles(args.inputs, {
        theme: args.theme ?? undefined,
        side: args.side,
        labels: args.labels ?? undefined,
        netlistPath: args.netlistPath ?? undefined,
        discoverNetlist: !args.noNetlist,
      });
    } catch (error) {
      process.stderr.write(`error: ${(error as Error).message}\n`);
      return 1;
    }
    try {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, result.svg);
    } catch (error) {
      process.stderr.write(`error: could not write ${out}: ${(error as Error).message}\n`);
      return 1;
    }
    process.stdout.write(
      `${out}  pcba image written (${result.side} side, theme ${result.themeName}, ${result.components} component(s))\n`,
    );
    for (const warning of result.warnings.slice(0, 10)) process.stdout.write(`  warning: ${warning}\n`);
    if (result.warnings.length > 10) process.stdout.write(`  ... and ${result.warnings.length - 10} more\n`);
    if (args.open) openInBrowser(out);
    return 0;
  }

  let result;
  try {
    result = buildViewerFromFiles(args.inputs, {
      netlistPath: args.netlistPath ?? undefined,
      drcReportPath: args.drcReportPath ?? undefined,
    });
  } catch (error) {
    process.stderr.write(`error: ${(error as Error).message}\n`);
    return 1;
  }

  try {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, result.html);
  } catch (error) {
    process.stderr.write(`error: could not write ${args.out}: ${(error as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`${args.out}  viewer written (${result.layers.length} layers)\n`);
  if (args.svgOut) {
    fs.writeFileSync(args.svgOut, result.svg);
    process.stdout.write(`${args.svgOut}  svg written\n`);
  }
  if (result.warnings.length > 0) {
    const shown = result.warnings.slice(0, 10);
    process.stdout.write(`\n${result.warnings.length} parser warning(s):\n`);
    for (const w of shown) process.stdout.write(`  - ${w}\n`);
    if (result.warnings.length > shown.length) {
      process.stdout.write(`  ... and ${result.warnings.length - shown.length} more\n`);
    }
  }
  if (args.open) openInBrowser(args.out);
  return 0;
}

if (isMainModule()) {
  const code = run(process.argv.slice(2));
  if (code !== 0) process.exit(code);
}
