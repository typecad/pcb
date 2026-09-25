import chalk from 'chalk';
import fs from 'node:fs';
import { runWiring, runValidate, runInit, runWatch, runBom } from './run.js';
import { setLogger } from '../logger.js';

/** Commands supported by the binary */
export type CliCommand = 'generate' | 'validate' | 'init' | 'bom';

const COMMANDS: readonly string[] = ['validate', 'init', 'bom'];

/** Output formats accepted by --format */
const FORMATS: readonly string[] = ['dot', 'svg', 'png', 'pdf'];

/**
 * Error thrown for invalid command line usage (unknown flags, missing values)
 */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/**
 * Parsed command line options for the typecad-wiring binary
 */
export interface CliOptions {
  /** Subcommand to run (default: generate) */
  command: CliCommand;
  /** Entry file path (generate/validate) or target file (init); undefined means "probe defaults" */
  entry?: string;
  /** Output directory; defaults to the current working directory */
  out?: string;
  /** true = write BOM with the default name; string = explicit BOM file path */
  bom?: string | true;
  /** Aggregate the BOM by MPN with summed quantities (--bom=grouped / --grouped) */
  bomGrouped?: boolean;
  /** true = write a wire cut list with the default name; string = explicit file path */
  cutlist?: string | true;
  /** Render the diagram to an image format via Graphviz (dot keeps only the DOT file) */
  format?: string;
  /** Silence library output (component created/added messages) */
  quiet?: boolean;
  /** Run harness validation before generating */
  strict?: boolean;
  /** Regenerate when the entry file (or siblings) change */
  watch?: boolean;
  /** With init: overwrite an existing file */
  force?: boolean;
  /** Machine-readable output */
  json: boolean;
  help: boolean;
  version: boolean;
}

/**
 * Parses raw argv into CliOptions
 * @throws {CliUsageError} If an unknown flag is passed or a value is missing
 */
export function parseArgv(argv: string[]): CliOptions {
  const options: CliOptions = { command: 'generate', json: false, help: false, version: false };
  const positional: string[] = [];

  const args = [...argv];

  // Leading subcommand: `typecad-wiring validate ...` / `typecad-wiring init ...`
  if (args.length > 0 && COMMANDS.includes(args[0])) {
    options.command = args.shift() as CliCommand;
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-v':
      case '--version':
        options.version = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--bom':
        options.bom = true;
        break;
      case '--grouped':
        options.bomGrouped = true;
        break;
      case '--cutlist':
        options.cutlist = true;
        break;
      case '-q':
      case '--quiet':
        options.quiet = true;
        break;
      case '-o':
      case '--out': {
        const value = args[++i];
        if (!value) {
          throw new CliUsageError(`Option ${arg} requires a directory value`);
        }
        options.out = value;
        break;
      }
      case '-f':
      case '--format': {
        const value = args[++i];
        if (!value) {
          throw new CliUsageError(`Option ${arg} requires a format value (${FORMATS.join(', ')})`);
        }
        options.format = validateFormat(value);
        break;
      }
      default: {
        if (arg.startsWith('--out=')) {
          options.out = arg.slice('--out='.length);
        } else if (arg.startsWith('--bom=')) {
          const value = arg.slice('--bom='.length);
          if (value.toLowerCase() === 'grouped') {
            options.bom = true;
            options.bomGrouped = true;
          } else {
            options.bom = value;
          }
        } else if (arg.startsWith('--cutlist=')) {
          options.cutlist = arg.slice('--cutlist='.length);
        } else if (arg.startsWith('--format=')) {
          options.format = validateFormat(arg.slice('--format='.length));
        } else if (arg.startsWith('-') && arg !== '-') {
          throw new CliUsageError(`Unknown option: ${arg}`);
        } else {
          positional.push(arg);
        }
      }
    }
  }

  if (positional.length > 1) {
    throw new CliUsageError(`Unexpected argument: ${positional[1]} (only one entry file is allowed)`);
  }

  if (positional.length === 1) {
    options.entry = positional[0];
  }

  return options;
}

function validateFormat(value: string): string {
  const format = value.toLowerCase();
  if (!FORMATS.includes(format)) {
    throw new CliUsageError(`Unsupported format '${value}'. Supported formats: ${FORMATS.join(', ')}`);
  }
  return format;
}

/**
 * Main CLI entry: parse arguments, handle help/version, dispatch to the
 * command implementation and report errors with the appropriate output
 * format and exit code
 */
export async function runCli(argv: string[]): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgv(argv);
  } catch (error) {
    emitError(error, { json: false });
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    showHelp();
    return;
  }

  if (options.version) {
    console.log(getVersion());
    return;
  }

  // --quiet silences the library's per-item output for every command. The
  // env var (not just setLogger) is required because TS entries loaded via
  // tsx get their own copy of the library modules.
  if (options.quiet) {
    process.env.TYPECAD_WIRING_QUIET = '1';
    setLogger(null);
  }

  try {
    if (options.command === 'init') {
      runInit(options);
      return;
    }

    if (options.command === 'validate') {
      await runValidate(options);
      return;
    }

    if (options.command === 'bom') {
      await runBom(options);
      return;
    }

    if (options.watch) {
      // Watch mode re-spawns the binary without --watch so every
      // regeneration gets a fresh module cache
      await runWatch(options, argv.filter(arg => arg !== '--watch' && arg !== '-w'));
      return;
    }

    const result = await runWiring(options);
    if (options.json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    } else {
      printSummary(result);
    }
  } catch (error) {
    emitError(error, options);
    process.exitCode = 1;
  }
}

function emitError(error: unknown, options: { json: boolean }): void {
  const message = error instanceof Error ? error.message : String(error);
  const isUsage = error instanceof CliUsageError;
  const hint = isUsage ? ` Run ${chalk.bold('typecad-wiring --help')} for usage.` : '';
  const text = message.endsWith('.') ? message + hint : message + '.' + hint;

  if (options.json) {
    console.log(JSON.stringify({
      ok: false,
      error: message,
      code: isUsage ? 'USAGE_ERROR' : 'RUN_ERROR'
    }, null, 2));
  } else {
    console.error(chalk.red.bold('error: ') + text);
  }
}

interface GenerationSummary {
  entry: string;
  dot: string[];
  rendered?: string[];
  bom?: string;
  cutlist?: string;
  connectors: number;
  cables: number;
  nets: number;
}

function printSummary(result: GenerationSummary): void {
  console.log(chalk.green.bold('Wiring diagram generated'));
  console.log(`  entry:      ${result.entry}`);
  console.log(`  diagram:    ${result.dot.join(', ')}`);
  if (result.rendered) {
    console.log(`  rendered:   ${result.rendered.join(', ')}`);
  }
  if (result.bom) {
    console.log(`  bom:        ${result.bom}`);
  }
  if (result.cutlist) {
    console.log(`  cutlist:    ${result.cutlist}`);
  }
  console.log(`  connectors: ${result.connectors}`);
  console.log(`  cables:     ${result.cables} (${result.nets} connections)`);
}

let cachedVersion: string | undefined;

export function getVersion(): string {
  if (!cachedVersion) {
    cachedVersion = 'unknown';
    try {
      // dist/cli/cli.js -> ../../package.json is the package root
      const pkgPath = new URL('../../package.json', import.meta.url);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
      cachedVersion = pkg.version ?? 'unknown';
    } catch {
      // keep 'unknown'
    }
  }
  return cachedVersion;
}

export function showHelp(): void {
  console.log(`${chalk.white.bold('typeCAD')} wiring — programmatically create wiring diagrams

${chalk.bold('Usage:')}
  typecad-wiring [entry] [options]   Generate the wiring diagram (default command)
  typecad-wiring validate [entry]    Validate the harness and run DRC checks
  typecad-wiring bom [entry]         Generate only the BOM CSV
  typecad-wiring init [path]         Scaffold a starter entry file (default: ./wiring.ts)

${chalk.bold('Arguments:')}
  entry                 Path to a TypeScript or JavaScript file that
                        default-exports a ${chalk.bold('Wiring')} instance
                        (default: ./wiring.ts, fallback ./src/wiring.ts)
  path                  Target file for init

${chalk.bold('Options:')}
  -o, --out <dir>       Directory to write generated files into (default: .)
  -f, --format <fmt>    Output format: dot (default), svg, png, pdf — rendered via Graphviz
      --bom [<file>]    Also generate a BOM CSV (default: <entry>-bom.csv)
      --bom=grouped     BOM aggregated by MPN with summed quantities (or --grouped)
      --cutlist [<f>]   Also generate a wire cut list CSV (default: <entry>-cutlist.csv)
      --strict          Validate the harness and treat DRC warnings as errors
  -w, --watch           Regenerate when the entry file (or its siblings) change
  -q, --quiet           Silence per-component library output
      --force           With init: overwrite an existing file
      --json            Machine-readable output
  -h, --help            Show this help
  -v, --version         Show version

${chalk.bold('Examples:')}
  typecad-wiring wiring.ts --out ./output --bom --cutlist
  typecad-wiring --format svg --strict
  typecad-wiring bom --grouped
  typecad-wiring validate wiring.ts

${chalk.bold('Entry file contract:')}
  import { Connector, Cable, Wiring } from '@typecad/wiring';
  // ...define connectors, cables and connections...
  const harness = new Wiring();
  harness.connectors(mcu, sensor);
  harness.cables(cable);
  export default harness;`);
}
