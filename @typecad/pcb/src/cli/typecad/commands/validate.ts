import fs from 'node:fs';
import { loadConfig } from '../../../config.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import chalk from 'chalk';
import { npxExec } from '../../../utils/process_exec.js';

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

export async function run(parsed: ParsedArgs): Promise<void> {
  const entry = parsed.positional[0] || detectEntryFile();
  const verbose = parsed.args['verbose'] === true;
  const json = parsed.json;
  let hasErrors = false;

  const results: { step: string; passed: boolean; message: string }[] = [];

  if (!entry) {
    throw new Error(
      'No entry file specified and none could be auto-detected.\n' +
        'Provide a file path: typecad-pcb validate <entry.ts>\n' +
        'Or configure one in typecad.conf.ts: { entry: "./src/main.ts" }',
    );
  }

  if (!fs.existsSync(entry)) {
    throw new Error(`Entry file not found: ${entry}`);
  }

  results.push({ step: 'Entry file', passed: true, message: entry });

  if (fs.existsSync('tsconfig.json')) {
    try {
      npxExec(['tsc', '--noEmit'], {
        stdio: verbose ? 'inherit' : 'pipe',
        timeout: 30000,
      });
      results.push({ step: 'TypeScript', passed: true, message: 'no type errors' });
    } catch (error: unknown) {
      hasErrors = true;
      const message = error instanceof Error ? error.message : String(error);
      results.push({ step: 'TypeScript', passed: false, message: message || 'type errors found' });
    }
  } else {
    results.push({ step: 'TypeScript', passed: true, message: 'skipped (no tsconfig.json)' });
  }

  try {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    env.TYPECAD_SILENT = '1';
    if (verbose) {
      env.TYPECAD_SILENT = '0';
      env.TYPECAD_DEBUG = '1';
    }

    npxExec(['tsx', entry], {
      stdio: verbose ? 'inherit' : 'pipe',
      env,
      timeout: 60000,
    });
    results.push({ step: 'Runtime', passed: true, message: 'entry file executed successfully' });
  } catch (error: unknown) {
    hasErrors = true;
    const err = error as { stderr?: { toString(): string }; message?: string };
    const stderr = err.stderr?.toString().trim() || err.message || 'runtime error';
    results.push({ step: 'Runtime', passed: false, message: stderr });
  }

  if (json) {
    logger.log(JSON.stringify({ valid: !hasErrors, results }, null, 2));
  } else {
    for (const r of results) {
      const icon = r.passed ? chalk.green('  \u2714') : chalk.red('  \u2716');
      logger.log(`${icon} ${r.step}: ${r.passed ? r.message : ''}`);
      if (!r.passed && r.message) {
        for (const line of r.message.split('\n').slice(0, 10)) {
          logger.log(`    ${line}`);
        }
      }
    }

    logger.log('');
    if (hasErrors) {
      logger.log(chalk.red('Validation failed.'));
    } else {
      logger.log(chalk.green('Validation passed.'));
    }
  }

  if (hasErrors) {
    throw new Error('Validation failed. See above for details.');
  }
}
