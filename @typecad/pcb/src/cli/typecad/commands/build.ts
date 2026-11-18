import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../../config.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { noEntryMessage } from '../../../utils/command_hint.js';
import { npxExec } from '../../../utils/process_exec.js';
import { boardStemFromArgs, buildDirPath } from '../pipeline.js';
import { createRebuildQueue, startWatchLoop, watchDeps } from '../watch.js';
import { formatDuration, sym, timestamp } from '../ui.js';

function detectEntryFile(): string | null {
  const config = loadConfig();
  if (config.entry) return config.entry;

  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const buildScript = pkg.scripts?.build || '';
    const match = buildScript.match(/tsx\s+(.+)$/);
    if (match) return match[1];
  } catch {
    logger.debug('Failed to read or parse package.json');
  }

  try {
    const srcFiles = fs.readdirSync('./src').filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    if (srcFiles.length === 1) return `./src/${srcFiles[0]}`;
  } catch {
    logger.debug('Failed to read src directory');
  }

  return null;
}

async function buildOnce(entry: string, parsed: ParsedArgs): Promise<void> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };

  if (parsed.args['verbose'] === true) {
    env.TYPECAD_DEBUG = '1';
  }

  // --typecheck: run tsc --noEmit before executing the entry. The default
  // build path runs tsx, which strips types without checking them — opting
  // in catches API mistakes (calling a method that doesn't exist) at the
  // compiler instead of as a runtime TypeError mid-build.
  if (parsed.args['typecheck'] === true) {
    if (fs.existsSync('tsconfig.json')) {
      try {
        npxExec(['tsc', '--noEmit'], { stdio: 'inherit', timeout: 120000 });
      } catch {
        throw new Error('Typecheck failed: fix the type errors above (or build without --typecheck).');
      }
    } else {
      logger.log(chalk.yellow(`  ${sym.warn} --typecheck requested but no tsconfig.json found — skipped`));
    }
  }

  try {
    npxExec(['tsx', entry], {
      stdio: 'inherit',
      env,
    });
  } catch (error) {
    throw new Error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // --diagnostics: same flag typeCAD HAL exposes on its build command —
  // after a successful build, also write the diagnostics.md/.json reports.
  // Best-effort like HAL: a report failure warns, it never fails the build.
  if (parsed.args['diagnostics'] === true) {
    try {
      const { generateDiagnosticsReport } = await import('./diagnostics.js');
      const result = await generateDiagnosticsReport({
        entry,
        skipErc: parsed.args['skip-erc'] === true,
        skipDrc: parsed.args['skip-drc'] === true,
        kicad: parsed.args['kicad'] === true,
        out: typeof parsed.args['out'] === 'string' ? parsed.args['out'] : undefined,
      });
      logger.log('');
      logger.log(`  Diagnostics report: ${result.mdPath}`);
      logger.log(`  Diagnostics data:   ${result.jsonPath}`);
    } catch (error) {
      logger.log(
        chalk.yellow(
          `  ${sym.warn} Diagnostics report generation failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}

interface BuildTarget {
  /** Board name for multi-board projects (`boards: { stem: entry }`). */
  name?: string;
  entry: string;
}

/** The closing line of a build: `✔ built src/main.ts → build/ (1.4s)`. */
function builtLine(target: BuildTarget, ms: number, stamp: boolean): string {
  const label = target.name ?? (path.relative(process.cwd(), target.entry) || target.entry);
  const outDir = path.relative(process.cwd(), buildDirPath()) || '.';
  const prefix = stamp ? chalk.gray(`[${timestamp()}] `) : '';
  return `${prefix}${chalk.green(sym.ok)} built ${label} ${sym.arrow} ${outDir}/ ${chalk.gray(`(${formatDuration(ms)})`)}`;
}

/**
 * Multi-board projects: typecad.conf.ts declares `boards: { stem: entry }`
 * and one build runs EVERY entry (or just --board <stem>), each writing
 * its own build/<stem>.kicad_pcb. An explicit positional entry keeps the
 * single-board behavior.
 */
function resolveTargets(parsed: ParsedArgs, entry: string): BuildTarget[] {
  const configBoards = loadConfig().boards;
  const stem = boardStemFromArgs(parsed);
  if (!parsed.positional[0] && configBoards && Object.keys(configBoards).length > 0) {
    const selected = stem
      ? Object.entries(configBoards).filter(([name]) => name === stem)
      : Object.entries(configBoards);
    if (selected.length === 0) {
      throw new Error(`No board '${stem}' in typecad.conf.ts boards — known boards: ${Object.keys(configBoards).join(', ')}`);
    }
    for (const [, e] of selected) {
      if (!fs.existsSync(e)) throw new Error(`Entry file not found: ${e}`);
    }
    return selected.map(([name, e]) => ({ name, entry: e }));
  }
  return [{ entry }];
}

function clearScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const watch = parsed.args['watch'] === true || (parsed.args['w'] !== undefined && parsed.args['w'] !== false);
  let entry = parsed.positional[0] || detectEntryFile();
  // The parser consumes the token after `-w` as its value; recover it as the entry
  if (!parsed.positional[0] && typeof parsed.args['w'] === 'string') entry = parsed.args['w'];

  if (!entry) {
    throw new Error(noEntryMessage('build'));
  }

  if (!fs.existsSync(entry)) {
    throw new Error(`Entry file not found: ${entry}`);
  }

  const targets = resolveTargets(parsed, entry);

  /** Build every target in order; the first failure throws. */
  const buildAll = async (stamp: boolean): Promise<void> => {
    for (const target of targets) {
      if (targets.length > 1) logger.log(chalk.cyan(`  board: ${target.name} (${target.entry})`));
      const startedAt = Date.now();
      await buildOnce(target.entry, parsed);
      logger.log(builtLine(target, Date.now() - startedAt, stamp));
    }
  };

  if (!watch) {
    await buildAll(false);
    return;
  }

  // Watch mode. The keep-watching contract covers the first build too: a
  // broken initial build prints the error and watches for the fix instead
  // of exiting — the next save retries. Rebuilds run one at a time (the
  // queue), each stamped, so overlapping saves never interleave output.
  const entries = targets.map((t) => t.entry);
  const clear = parsed.args['clear'] === true;
  let runs = 0;
  let watchedCount = -1;
  let lastChange: string | undefined;

  const queue = createRebuildQueue(async () => {
    runs++;
    const n = runs;
    const reason = lastChange;
    lastChange = undefined;
    if (clear) clearScreen();
    else if (n > 1) logger.log('');
    logger.log(
      chalk.gray(`[${timestamp()}] `) +
        chalk.cyan(reason ? `change: ${reason} — rebuilding (#${n})` : `building (#${n})`),
    );

    const startedAt = Date.now();
    try {
      await buildAll(true);
    } catch (error) {
      logger.log(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
      logger.log(
        chalk.gray(`[${timestamp()}] `) + chalk.red(`${sym.fail} build #${n} failed `) +
          chalk.gray(`(${formatDuration(Date.now() - startedAt)})`),
      );
    }

    // The import graph can change with an edit; keep the count honest.
    const count = watchDeps(entries).length;
    if (count !== watchedCount) {
      const files = `${count} file${count === 1 ? '' : 's'}`;
      logger.log('');
      logger.log(
        chalk.cyan(
          watchedCount === -1
            ? `  watching ${files} for changes (output: ${buildDirPath()}) — Ctrl+C to exit`
            : `  now watching ${files}`,
        ),
      );
      watchedCount = count;
    }
  });

  await queue.request();

  startWatchLoop(entries.length === 1 ? entries[0]! : entries, (changed) => {
    lastChange = path.relative(process.cwd(), changed) || path.basename(changed);
    void queue.request();
  });
}
