import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../../config.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { npxExec } from '../../../utils/process_exec.js';
import { buildDirPath } from '../pipeline.js';
import { collectLocalDependencies, startWatchLoop } from '../watch.js';

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
        out: typeof parsed.args['out'] === 'string' ? parsed.args['out'] : undefined,
      });
      logger.log('');
      logger.log(`  Diagnostics report: ${result.mdPath}`);
      logger.log(`  Diagnostics data:   ${result.jsonPath}`);
    } catch (error) {
      logger.log(chalk.yellow(`  ⚠ Diagnostics report generation failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const watch = parsed.args['watch'] === true || (parsed.args['w'] !== undefined && parsed.args['w'] !== false);
  let entry = parsed.positional[0] || detectEntryFile();
  // The parser consumes the token after `-w` as its value; recover it as the entry
  if (!parsed.positional[0] && typeof parsed.args['w'] === 'string') entry = parsed.args['w'];

  if (!entry) {
    throw new Error(
      'No entry file specified and none could be auto-detected.\n' +
        'Provide a file path: typecad-pcb build <entry.ts>\n' +
        'Or configure one in typecad.conf.ts: { entry: "./src/main.ts" }',
    );
  }

  if (!fs.existsSync(entry)) {
    throw new Error(`Entry file not found: ${entry}`);
  }

  if (watch) {
    // The keep-watching contract covers the first build too: a broken
    // initial build prints the error and watches for the fix instead of
    // exiting — the next save retries.
    try {
      await buildOnce(entry, parsed);
    } catch (error) {
      logger.log(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
    }
    const deps = collectLocalDependencies(entry);
    const outDir = buildDirPath();
    logger.log('');
    logger.log(
      chalk.cyan(`  watching ${deps.length} file${deps.length === 1 ? '' : 's'} for changes (output: ${outDir}) — Ctrl+C to exit`),
    );
    startWatchLoop(entry, (changed) => {
      const rel = path.relative(process.cwd(), changed) || path.basename(changed);
      logger.log('');
      logger.log(chalk.cyan(`  change: ${rel} — rebuilding`));
      // Fire-and-forget: a failed rebuild (or slow ERC/DRC report) must not
      // kill the watcher — the next save tries again.
      void buildOnce(entry, parsed).catch((error) => {
        logger.log(chalk.red(`  ${error instanceof Error ? error.message : String(error)}`));
      });
    });
  } else {
    await buildOnce(entry, parsed);
  }
}
