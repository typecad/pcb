#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildViewerFromFiles } from './build.js';
import { startGerberViewerServer } from './serve.js';

interface CliArgs {
  inputs: string[];
  out: string;
  svgOut: string | null;
  open: boolean;
  help: boolean;
  version: boolean;
}

const USAGE = `gerber-viewer - render Gerber (RS-274X) + Excellon drill sets as an interactive HTML viewer

Usage:
  gerber-viewer <files... | directory> [options]   one-shot viewer HTML
  gerber-viewer serve [dir] [options]              dev server for a typeCAD project

serve options:
  [dir]               project root containing build/ (default: cwd)
  -p, --port <n>      first port to try (default: 4273; walks up if in use)
  --open              open the viewer in the default browser

Options:
  -o, --out <file>    output HTML path (default: gerber-viewer.html)
  --svg <file>        also write a standalone SVG of the board
  --open              open the viewer in the default browser
  -h, --help          show this help
  -v, --version       print version

Examples:
  gerber-viewer gerbers/ -o board-view.html --open
  gerber-viewer serve            # watch build/*.kicad_pcb, re-export + live-reload on each build
`;

function runServe(argv: string[]): number {
  let projectDir = process.cwd();
  let port = 4273;
  let open = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-p' || arg === '--port') port = Number(argv[++i] ?? 4273);
    else if (arg === '--open') open = true;
    else if (arg.startsWith('-')) throw new Error(`unknown serve option "${arg}"`);
    else projectDir = path.resolve(arg);
  }
  startGerberViewerServer({ projectDir, port, open });
  return 0; // the server keeps the process alive
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    inputs: [],
    out: 'gerber-viewer.html',
    svgOut: null,
    open: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '-v' || arg === '--version') args.version = true;
    else if (arg === '-o' || arg === '--out') args.out = argv[++i] ?? '';
    else if (arg === '--svg') args.svgOut = argv[++i] ?? '';
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
  if (argv[0] === 'serve') {
    try {
      return runServe(argv.slice(1));
    } catch (error) {
      process.stderr.write(`error: ${(error as Error).message}\n`);
      return 2;
    }
  }
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

  let result;
  try {
    result = buildViewerFromFiles(args.inputs);
  } catch (error) {
    process.stderr.write(`error: ${(error as Error).message}\n`);
    return 1;
  }

  try {
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
  // only force-exit on failure: `serve` must stay alive on the event loop
  // (the listening server holds it open), and one-shot mode exits naturally
  if (code !== 0) process.exit(code);
}
