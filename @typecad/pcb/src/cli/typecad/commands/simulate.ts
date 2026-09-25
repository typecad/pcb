// ---------------------------------------------------------------------------
// `typecad-pcb simulate` — solve the project with ngspice and leave the
// results for the board viewer's trace hover. Re-runs the project entry
// (exactly like `build`) with TYPECAD_SIMULATE=op set: create() then solves
// the DC operating point as part of its normal run and writes
// `build/<board>_op.json`. The viewer pipeline picks that file up like a DRC
// report — hover a trace in the ngspice view to see the net's voltage and
// the connected devices' current/power.
//
// Transient (and other analyses) come later; the command is op-only for now.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { npxExec } from '../../../utils/process_exec.js';
import { loadConfig } from '../../../config.js';

function detectEntryFile(): string | null {
  const config = loadConfig();
  if (config.entry) return config.entry;

  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const buildScript = pkg.scripts?.build || '';
    const match = buildScript.match(/tsx\s+(.+)$/);
    if (match) return match[1];
  } catch {
    /* no package.json */
  }
  try {
    const srcFiles = fs.readdirSync('./src').filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    if (srcFiles.length === 1) return `./src/${srcFiles[0]}`;
  } catch {
    /* no src/ */
  }
  return null;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const entry = (typeof parsed.args['entry'] === 'string' ? parsed.args['entry'] : null) ?? detectEntryFile();
  if (!entry) {
    throw new Error('no entry file found — run inside a typeCAD project (package.json build script or a single src/*.ts)');
  }

  logger.log(chalk.white.bold('typecad-pcb simulate') + ' - ngspice operating point\n');
  logger.log(`  entry: ${entry}`);
  logger.log('  solve: op (DC operating point)\n');

  const env: Record<string, string> = { ...(process.env as Record<string, string>), TYPECAD_SIMULATE: 'op' };
  try {
    npxExec(['tsx', entry], { stdio: 'inherit', env });
  } catch (error) {
    throw new Error(`simulation build failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const opFiles = fs.readdirSync('./build').filter((f) => f.endsWith('_op.json'));
  if (opFiles.length === 0) {
    logger.log(chalk.yellow('\nno _op.json written — the board viewer will show no electrical data on hover'));
    return;
  }
  for (const f of opFiles) {
    const summary = JSON.parse(fs.readFileSync(`./build/${f}`, 'utf8')) as { solved?: boolean; error?: string };
    if (summary.solved) {
      logger.log(chalk.green(`\n${f} written — hover a trace in the board viewer's ngspice view`));
    } else {
      logger.log(chalk.yellow(`\n${f} written but unsolved (${summary.error ?? 'unknown'})`));
    }
  }
}
