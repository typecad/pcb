import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import chalk from 'chalk';
import { Wiring } from '../wiring.js';
import { DiagramError, ValidationError } from '../errors.js';
import { planGraphvizOutputs } from '../graphviz.js';
import type { CliOptions } from './cli.js';

/**
 * Result of a successful CLI run
 */
export interface RunResult {
  entry: string;
  /** DOT files written (one per diagram page) */
  dot: string[];
  /** Rendered image files when --format svg|png|pdf was used */
  rendered?: string[];
  bom?: string;
  cutlist?: string;
  connectors: number;
  cables: number;
  nets: number;
}

/** Entry file candidates probed when no explicit entry is passed */
const DEFAULT_ENTRY_CANDIDATES = ['wiring.ts', 'src/wiring.ts', 'wiring.js', 'src/wiring.js'];

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

/** File extensions that trigger a regeneration in watch mode */
const WATCHED_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/i;

/**
 * Resolves the entry file: an explicit path must exist, otherwise the
 * default candidates are probed relative to the current working directory
 * @throws {ValidationError} If no usable entry file can be found
 */
export function resolveEntry(options: Pick<CliOptions, 'entry'>): string {
  if (options.entry) {
    const resolved = path.resolve(options.entry);
    if (!fs.existsSync(resolved)) {
      throw new ValidationError(`Entry file not found: ${options.entry}`);
    }
    return resolved;
  }

  for (const candidate of DEFAULT_ENTRY_CANDIDATES) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  throw new ValidationError(
    `No entry file found (looked for: ${DEFAULT_ENTRY_CANDIDATES.join(', ')}). ` +
    'Pass one explicitly: typecad-wiring <entry>'
  );
}

/**
 * Loads a wiring harness entry module and extracts the Wiring instance.
 * TypeScript entries are loaded through tsx; plain JavaScript uses a native import.
 * @throws {ValidationError} If the module does not export a Wiring instance
 */
export async function loadEntry(entryPath: string): Promise<Wiring> {
  const isTypescript = TYPESCRIPT_EXTENSIONS.has(path.extname(entryPath).toLowerCase());

  const mod: Record<string, unknown> = isTypescript
    ? await tsImport(pathToFileURL(entryPath).href, import.meta.url)
    : await import(pathToFileURL(entryPath).href);

  const candidate = mod.default ?? mod.wiring ?? mod.harness;

  if (!isWiringInstance(candidate)) {
    throw new ValidationError(
      `'${entryPath}' must default-export (or export as 'wiring'/'harness') a Wiring instance`
    );
  }

  return candidate;
}

/**
 * Structural check instead of instanceof: the entry file may import its own
 * copy of @typecad/wiring (e.g. the user's node_modules while the CLI runs
 * from an npx cache), which would break class identity across copies
 */
function isWiringInstance(value: unknown): value is Wiring {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const harness = value as Record<string, unknown>;
  return ['connectors', 'cables', 'create', 'bom', 'validate', 'getConnectors', 'getCables']
    .every(method => typeof harness[method] === 'function');
}

/**
 * Runs the full CLI pipeline: resolve entry, load the harness, optionally
 * validate it, and write the Graphviz DOT file (and optionally the BOM CSV)
 * @throws {ValidationError|DiagramError|BomError} On any failure
 */
export async function runWiring(options: CliOptions): Promise<RunResult> {
  const run = async (): Promise<RunResult> => {
    const entry = resolveEntry(options);
    const harness = await loadEntry(entry);

    // --strict: full validation plus DRC must be clean before generating
    if (options.strict) {
      assertCleanHarness(harness);
    }

    const stem = path.basename(entry, path.extname(entry));
    const outDir = options.out ? path.resolve(options.out) : process.cwd();

    // Create the output directory so --out works for paths that don't exist yet
    fs.mkdirSync(outDir, { recursive: true });

    const dot = path.join(outDir, `${stem}.dot`);
    const bom = options.bom
      ? typeof options.bom === 'string' ? path.resolve(options.bom) : path.join(outDir, `${stem}-bom.csv`)
      : undefined;
    const cutlist = options.cutlist
      ? typeof options.cutlist === 'string' ? path.resolve(options.cutlist) : path.join(outDir, `${stem}-cutlist.csv`)
      : undefined;

    harness.create(dot);
    if (bom) harness.bom(bom, { grouped: options.bomGrouped === true });
    if (cutlist) harness.cutlist(cutlist);

    // The plan mirrors what create() wrote (one entry per diagram page)
    const dotFiles = planGraphvizOutputs(harness.getConnectors(), harness.getCables(), dot)
      .map(page => page.file);

    const rendered = options.format && options.format !== 'dot'
      ? dotFiles.map(file => renderDotFile(file, options.format!))
      : undefined;

    return {
      ...summarize(entry, harness),
      dot: dotFiles,
      rendered,
      bom,
      cutlist
    };
  };

  // In JSON mode keep stdout clean (entry constructors and file messages
  // would pollute the machine-readable result) so the only output is the JSON
  return options.json ? withSuppressedStdout(run) : run();
}

/**
 * Validates a harness and fails when --strict is set: hard validation errors
 * throw, and any DRC warning is promoted to an error
 */
function assertCleanHarness(harness: Wiring): void {
  harness.validate();

  const warnings = harness.drc();
  if (warnings.length > 0) {
    const detail = warnings.length === 1
      ? warnings[0].message
      : `${warnings[0].message} (and ${warnings.length - 1} more warning(s))`;
    throw new ValidationError(`DRC warnings found: ${detail}`);
  }
}

/**
 * Renders a DOT file to an image format through the Graphviz `dot` executable
 * @throws {DiagramError} If Graphviz is not installed or rendering fails
 */
export function renderDotFile(dotFile: string, format: string): string {
  const outputFile = dotFile.replace(/\.dot$/i, `.${format}`);

  // A single command string (not an args array) keeps the shell happy on
  // Windows, where shell:true is needed to resolve dot.exe through PATHEXT
  const quote = (value: string): string => `"${value.replace(/"/g, '\\"')}"`;

  const check = spawnSync('dot -V', { shell: true, stdio: 'pipe' });
  if (check.error || check.status !== 0) {
    throw new DiagramError(
      `Graphviz 'dot' executable not found — install Graphviz (https://graphviz.org/download/) ` +
      `to use --format ${format}, or use --format dot`
    );
  }

  const result = spawnSync(`dot -T${format} ${quote(dotFile)} -o ${quote(outputFile)}`, {
    shell: true,
    stdio: 'pipe'
  });

  if (result.error || result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString().trim() : '';
    throw new DiagramError(`Failed to render ${format}: ${stderr || 'dot exited with an error'}`, outputFile);
  }

  return outputFile;
}

/**
 * Validates the harness of an entry file and reports DRC warnings
 * without generating any files. With --strict, warnings fail the run.
 * @throws {ValidationError} If the harness fails validation
 */
export async function runValidate(options: CliOptions): Promise<void> {
  const validate = async (): Promise<void> => {
    const entry = resolveEntry(options);
    const harness = await loadEntry(entry);

    harness.validate();

    const warnings = harness.drc();
    const counts = summarize(entry, harness);

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        entry: counts.entry,
        connectors: counts.connectors,
        cables: counts.cables,
        nets: counts.nets,
        warnings: warnings.map(warning => ({ code: warning.code, message: warning.message }))
      }, null, 2));
    } else {
      console.log(chalk.green.bold('Harness is valid'));
      console.log(`  entry:      ${counts.entry}`);
      console.log(`  connectors: ${counts.connectors}`);
      console.log(`  cables:     ${counts.cables} (${counts.nets} connections)`);

      if (warnings.length > 0) {
        console.log(chalk.yellow.bold(`Warnings (${warnings.length}):`));
        for (const warning of warnings) {
          console.log(chalk.yellow(`  ${warning.code}: ${warning.message}`));
        }
      }
    }

    if (options.strict && warnings.length > 0) {
      throw new ValidationError(`${warnings.length} DRC warning(s) found (--strict treats them as errors)`);
    }
  };

  return options.json ? withSuppressedStdout(validate) : validate();
}

/**
 * Generates only the BOM for an entry file (`typecad-wiring bom`)
 */
export async function runBom(options: CliOptions): Promise<void> {
  const generate = async (): Promise<void> => {
    const entry = resolveEntry(options);
    const harness = await loadEntry(entry);

    const stem = path.basename(entry, path.extname(entry));
    const outDir = options.out ? path.resolve(options.out) : process.cwd();
    fs.mkdirSync(outDir, { recursive: true });

    const bom = typeof options.bom === 'string'
      ? path.resolve(options.bom)
      : path.join(outDir, `${stem}-bom.csv`);

    harness.bom(bom, { grouped: options.bomGrouped === true });

    if (options.json) {
      console.log(JSON.stringify({ ok: true, entry, bom, grouped: options.bomGrouped === true }, null, 2));
    } else {
      console.log(chalk.green.bold('BOM written: ') + bom + (options.bomGrouped ? ' (grouped)' : ''));
    }
  };

  return options.json ? withSuppressedStdout(generate) : generate();
}

/** Template written by `typecad-wiring init` */
const INIT_TEMPLATE = `import { Connector, Cable, Wiring } from '@typecad/wiring';

// Describe your connectors (pins can be named or just numbered)
const left = new Connector({
  name: 'J1',
  type: 'JST',
  subtype: 'PH 2.0mm',
  mpn: 'S4B-PH-K-S',
  pins: ['VCC', 'GND', 'SDA', 'SCL'],
});

const right = new Connector({
  name: 'J2',
  type: 'Header',
  pins: ['VCC', 'GND', 'SDA', 'SCL'],
});

// Describe the cable and its connections.
// Colors use X11 names (or hex). For taps/splices, pass pin arrays:
//   cable.net({ color: 'red', left: [j1.pin(1), j1.pin(2)], right: j2.pin(1) });
const cable = new Cable({ name: 'MAIN', type: 'Ribbon', gauge: '28 AWG', length: '10cm' });

cable.net({ color: 'red', left: left.pin(1), right: right.pin(1) });
cable.net({ color: 'black', left: left.pin(2), right: right.pin(2) });
cable.net({ color: 'blue', left: left.pin(3), right: right.pin(3) });
cable.net({ color: 'yellow', left: left.pin(4), right: right.pin(4) });

// Build the harness and export it — the CLI does the rest
const harness = new Wiring();
harness.connectors(left, right);
harness.cables(cable);

export default harness;
`;

/**
 * Scaffolds a starter entry file
 * @throws {ValidationError} If the target exists and --force was not passed
 */
export function runInit(options: CliOptions): void {
  const target = path.resolve(options.entry || 'wiring.ts');

  if (fs.existsSync(target) && !options.force) {
    throw new ValidationError(`'${target}' already exists. Use --force to overwrite it.`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, INIT_TEMPLATE, 'utf8');

  console.log(chalk.green.bold('Entry file created: ') + target);
  console.log(`  Generate:  typecad-wiring ${path.relative(process.cwd(), target) || target} --bom`);
  console.log( '  Watch:     add --watch to regenerate on changes');
}

/**
 * Watch mode: runs the binary once, then re-spawns it whenever a watched
 * file type changes in the entry's directory. Each run is a fresh child
 * process so the entry module is re-evaluated from scratch.
 */
export async function runWatch(options: CliOptions, generateArgs: string[]): Promise<void> {
  const entry = resolveEntry(options);
  const watchDir = path.dirname(entry);
  const binPath = fileURLToPath(new URL('./bin.js', import.meta.url));

  const runOnce = (): void => {
    const result = spawnSync(process.execPath, [binPath, ...generateArgs], { stdio: 'inherit' });
    if (result.status) {
      process.exitCode = result.status;
    }
  };

  runOnce();

  console.log(chalk.cyan.bold(`\nWatching ${watchDir} for changes — press Ctrl-C to stop`));

  let timer: NodeJS.Timeout | undefined;
  fs.watch(watchDir, { recursive: true }, (_event, filename) => {
    const changed = String(filename ?? '');
    if (!WATCHED_EXTENSIONS.test(changed)) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    // Debounce: editors often fire several events per save
    timer = setTimeout(() => {
      console.log(chalk.cyan(`\nChange detected (${changed}) — regenerating...`));
      runOnce();
    }, 300);
  });
}

function summarize(entry: string, harness: Wiring): Omit<RunResult, 'dot' | 'rendered' | 'bom' | 'cutlist'> {
  const cables = harness.getCables();
  return {
    entry,
    connectors: harness.getConnectors().length,
    cables: cables.length,
    nets: cables.reduce((total, cable) => total + cable.nets.length, 0)
  };
}

/**
 * Temporarily replaces process.stdout.write so library chatter
 * (constructor/added messages) does not pollute JSON output
 */
async function withSuppressedStdout<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = original;
  }
}
