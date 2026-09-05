#!/usr/bin/env node
import chalk from 'chalk';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { platform } from 'node:os';
import { replaceInFileSync } from 'replace-in-file';
import { fileURLToPath } from 'node:url';
import { zip } from 'zip-a-folder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;

const IS_WIN = platform() === 'win32';

const KICAD_SEARCH_PATHS = IS_WIN
  ? ['C:/Program Files/KiCad/10.0/', 'C:/Program Files/KiCad/9.0/', 'C:/Program Files/KiCad/8.0/']
  : ['/usr/share/kicad/', '/Applications/KiCAD/KiCad.app/Contents/ShareSupport/'];

export function discoverKiCADCli(): string | null {
  for (const searchPath of KICAD_SEARCH_PATHS) {
    const cliPath = IS_WIN ? path.join(searchPath, 'bin', 'kicad-cli.exe') : path.join(searchPath, 'bin', 'kicad-cli');
    if (fs.existsSync(cliPath)) return cliPath;
  }
  return null;
}

export interface CliArgs {
  boardName: string | null;
  ignore: boolean;
  inputPath: string;
  outputPath: string | null;
  kicadCli: string;
  help: boolean;
  version: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    boardName: null,
    ignore: false,
    inputPath: './build',
    outputPath: null,
    kicadCli: 'kicad-cli',
    help: false,
    version: false,
  };

  const tokens = argv.slice(2);
  let i = 0;
  const positional: string[] = [];

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--version' || token === '-v') {
      args.version = true;
    } else if (token === '--ignore' || token === '-i') {
      args.ignore = true;
    } else if (token === '--input') {
      const val = tokens[++i];
      if (val !== undefined) args.inputPath = val;
    } else if (token === '--output') {
      const val = tokens[++i];
      if (val !== undefined) args.outputPath = val;
    } else if (token === '--kicad-cli') {
      const val = tokens[++i];
      if (val !== undefined) args.kicadCli = val;
    } else if (!token.startsWith('-')) {
      positional.push(token);
    }
    i++;
  }

  if (positional.length > 0) {
    args.boardName = positional[0];
  }

  return args;
}

function printHelp(): void {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  console.log(`
${chalk.bgBlue.white.bold(' JLCPCB Export ')} v${pkg.version}

Export all files needed for JLCPCB assembly from a typeCAD project.

${chalk.bold('Usage:')}
  jlcpcb-export [board-name] [options]

${chalk.bold('Arguments:')}
  board-name              Board name (auto-detected from typecad.conf.ts if omitted)

${chalk.bold('Options:')}
  -i, --ignore            Ignore DRC failures and dirty git repo
  --input <path>          Input build directory (default: ./build)
  --output <path>         Output directory (default: ./build/jlcpcb-{version})
  --kicad-cli <path>      Path to kicad-cli binary (default: kicad-cli)
  -v, --version           Print version
  -h, --help              Print this help message

The board name is auto-detected from the entry field in typecad.conf.ts.

${chalk.bold('Examples:')}
  jlcpcb-export
  jlcpcb-export --ignore
  jlcpcb-export --input ./output --kicad-cli "/path/to/kicad-cli"
`);
}

function printVersion(): void {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  console.log(pkg.version);
}

export function findConfigPath(): string | null {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, 'typecad.conf.ts'), path.join(cwd, 'typecad.conf.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function parseEntryFromConfig(configPath: string): string | null {
  try {
    const source = fs.readFileSync(configPath, 'utf8');
    const match = source.match(/entry\s*:\s*['"](.+?)['"]/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function parseKicadCliFromConfig(configPath: string): string | null {
  try {
    const source = fs.readFileSync(configPath, 'utf8');
    const match = source.match(/kicad_cli\s*:\s*['"](.+?)['"]/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function findProjectPackageJson(): { name: string; version: string } | null {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name && pkg.version) return pkg;
      } catch {
        // ignore parse errors
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function runKiCADCommand(kicadCli: string, commandArgs: string[]): boolean {
  try {
    execFileSync(kicadCli, commandArgs, { stdio: 'ignore' });
  } catch {
    return false;
  }
  return true;
}

export function runGitCommand(args: string[]): string | null {
  const gitCmd = IS_WIN ? 'git.exe' : 'git';
  try {
    return execFileSync(gitCmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    printVersion();
    return;
  }

  const configPath = findConfigPath();
  if (!configPath) {
    throw new Error(
      'Not a typeCAD project. Could not find typecad.conf.ts or typecad.conf.js in the current directory.',
    );
  }

  let boardName = args.boardName;
  if (!boardName) {
    const entry = parseEntryFromConfig(configPath);
    if (!entry) {
      throw new Error('Could not find "entry" field in typecad.conf.');
    }
    boardName = path.basename(entry, path.extname(entry));
  }

  if (boardName.endsWith('.kicad_pcb')) {
    boardName = boardName.replace(/\.kicad_pcb$/, '');
  }
  boardName = path.basename(boardName);

  const configKicadCli = parseKicadCliFromConfig(configPath);
  let kicadCli: string;
  if (args.kicadCli !== 'kicad-cli') {
    kicadCli = args.kicadCli;
  } else if (configKicadCli) {
    kicadCli = configKicadCli;
  } else {
    const discovered = discoverKiCADCli();
    if (!discovered) {
      throw new Error(
        'Could not find kicad-cli. Install KiCad or specify the path via --kicad-cli or kicad_cli in typecad.conf.',
      );
    }
    kicadCli = discovered;
  }

  const projectPkg = findProjectPackageJson();
  if (!projectPkg) {
    throw new Error('Could not find a package.json with a name and version in the current directory or any parent.');
  }

  const pkgSlug = projectPkg.name.replace(/^@/, '').replace(/\//, '-');
  const inputPath = args.inputPath;
  const outputPath = args.outputPath || `./build/jlcpcb-export/${pkgSlug}-${projectPkg.version}`;
  const ignore = args.ignore;

  process.stdout.write(chalk.bgBlue.white.bold(`JLCPCB`) + ' Assembly Processor starting...\n');

  const pcbFile = path.resolve(inputPath, `${boardName}.kicad_pcb`);
  if (!fs.existsSync(pcbFile)) {
    throw new Error(`PCB file not found: ${pcbFile}`);
  }

  // run DRC on the board
  try {
    execFileSync(
      kicadCli,
      ['pcb', 'drc', '--exit-code-violations', '--all-track-errors', '--format', 'json', pcbFile],
      { stdio: 'pipe' },
    );
  } catch {
    if (!ignore) {
      throw new Error('DRC failed');
    } else {
      console.log(chalk.yellow('DRC failed. Continuing due to --ignore flag.'));
    }
  }

  // check the git repo
  const gitStatus = runGitCommand(['rev-parse', '--is-inside-work-tree']);
  if (gitStatus !== null && gitStatus.trim() === 'true') {
    const porcelain = runGitCommand(['status', '--porcelain']);
    if (porcelain !== null && porcelain.trim() !== '') {
      if (!ignore) {
        throw new Error('The repository is dirty. Please commit or stash changes before running this command.');
      } else {
        console.log(chalk.yellow('The repository is dirty. Continuing due to --ignore flag.'));
      }
    }
  }

  // make folder
  fs.mkdirSync(outputPath, { recursive: true });
  process.stdout.write(chalk.blue.bold(outputPath) + ' folder created\n');

  // make position file and edit fields
  const cplFile = path.join(outputPath, `${boardName}_cpl.csv`);
  if (
    runKiCADCommand(kicadCli, [
      'pcb',
      'export',
      'pos',
      '--exclude-dnp',
      '--units=mm',
      '--format=csv',
      '--output',
      cplFile,
      pcbFile,
    ])
  ) {
    replaceInFileSync({ files: cplFile, from: /^Ref/g, to: 'Designator' });
    replaceInFileSync({ files: cplFile, from: /^PosX/g, to: 'Mid X' });
    replaceInFileSync({ files: cplFile, from: /^PosY/g, to: 'Mid Y' });
    replaceInFileSync({ files: cplFile, from: /^Rot/g, to: 'Rotation' });
    replaceInFileSync({ files: cplFile, from: /^Side/g, to: 'Layer' });
    process.stdout.write(chalk.blue.bold(cplFile) + ' Position/PnP file written\n');
  } else {
    console.error(chalk.red(`Failed to generate position file`));
    if (!ignore) throw new Error('Failed to generate position file');
  }

  // gerbers
  const gerbersDir = path.join(outputPath, 'gerbers');
  fs.mkdirSync(gerbersDir, { recursive: true });
  const gerbersOk = runKiCADCommand(kicadCli, ['pcb', 'export', 'gerbers', '--output', gerbersDir, pcbFile]);
  if (gerbersOk) {
    process.stdout.write(chalk.blue.bold(gerbersDir + '/') + ' Gerber files written\n');
  } else {
    console.error(chalk.red('Failed to generate gerber files'));
    if (!ignore) throw new Error('Failed to generate gerber files');
  }

  // make drill files
  const drillOk = runKiCADCommand(kicadCli, ['pcb', 'export', 'drill', '--output', gerbersDir, pcbFile]);
  if (drillOk) {
    process.stdout.write(chalk.blue.bold(path.join(gerbersDir, `${boardName}.drl`)) + ' Drill file written\n');
  } else {
    console.error(chalk.red('Failed to generate drill file'));
    if (!ignore) throw new Error('Failed to generate drill file');
  }

  // zip them
  if (gerbersOk && drillOk) {
    const gerbersZip = path.join(outputPath, 'gerbers.zip');
    process.stdout.write(chalk.blue.bold(gerbersZip) + ' zipping Gerbers and drill file\n');
    await zip(gerbersDir, gerbersZip);
  }

  // bom file - copy from build directory if it exists
  const bomSource = path.join(inputPath, `${boardName}.csv`);
  const bomDest = path.join(outputPath, `${boardName}.csv`);
  if (fs.existsSync(bomSource)) {
    fs.copyFileSync(bomSource, bomDest);
    replaceInFileSync({ files: bomDest, from: /^MPN/g, to: 'JLCPCB Part#' });
    process.stdout.write(chalk.blue.bold(bomDest) + ' BOM file written\n');
  } else {
    process.stdout.write(chalk.yellow(`BOM file not found at ${bomSource}. Skipping BOM generation.\n`));
  }

  process.stdout.write(
    chalk.blue.italic.underline(`https://jlcpcb.com/`) + ` to order. All files are in ${outputPath}\n`,
  );
}

if (isMainModule) {
  run().catch((err) => {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  });
}
