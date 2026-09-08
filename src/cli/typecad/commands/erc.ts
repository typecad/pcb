import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';
import type { ErcViolation } from '../../types.js';
import logger from '../../../utils/logging.js';

function findSchFile(argPath?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  const buildDir = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildDir)) return null;

  const schFiles = fs.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_sch'));
  if (schFiles.length === 1) return path.join(buildDir, schFiles[0]);
  if (schFiles.length > 1) return null;

  return null;
}

function formatViolation(v: ErcViolation): string {
  const severity = v.severity ?? 'error';
  const icon = severity === 'error' ? '✖' : '⚠';
  const desc = v.description ?? '';
  const type = v.type ?? '';
  let line = `  ${icon} [${type}] ${desc}`;
  for (const item of v.items ?? []) {
    const itemDesc = item.description ?? '';
    const pos = item.pos ? ` @(${item.pos.x}, ${item.pos.y})` : '';
    line += `\n     ${itemDesc}${pos}`;
  }
  return line;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const schArg = parsed.positional[0];
  const schPath = findSchFile(schArg);

  if (!schPath) {
    if (schArg) {
      throw new Error(`Schematic file not found: ${schArg}`);
    }
    throw new Error(
      'No .kicad_sch file found in ./build/.\n' +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb erc <path/to/schematic.kicad_sch>',
    );
  }

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb erc') + ' - Electrical Rules Check\n');
    logger.log(`  Schematic: ${schPath}\n`);
  }

  const reportName = path.basename(schPath, '.kicad_sch') + '_erc.json';
  const reportPath = path.join(path.dirname(schPath), reportName);

  const args = ['erc', '--format', 'json', '--output', reportPath, ...parsed.passthrough, schPath];

  try {
    await executeKiCADCommand('sch', args, { stdio: 'pipe' });
  } catch {
    logger.debug('ERC: kicad-cli exited non-zero (expected when violations found)');
  }

  let errors = 0;
  let warnings = 0;
  let rawReport = '';
  const violationLines: string[] = [];

  if (fs.existsSync(reportPath)) {
    rawReport = fs.readFileSync(reportPath, 'utf8');

    try {
      const report = JSON.parse(rawReport);
      const sheets = report.sheets ?? [];
      for (const sheet of sheets) {
        for (const v of sheet.violations ?? []) {
          const severity = v.severity ?? 'error';
          if (severity === 'error') errors++;
          else if (severity === 'warning') warnings++;
          violationLines.push(formatViolation(v));
        }
      }
    } catch {
      const textMatch = rawReport.match(/Found\s+(\d+)\s+violation/i);
      if (textMatch) errors = parseInt(textMatch[1], 10);
    }
  }

  const passed = errors === 0 && warnings === 0;

  if (json) {
    logger.log(
      JSON.stringify(
        {
          schematic: schPath,
          passed,
          errors,
          warnings,
          output: rawReport,
        },
        null,
        2,
      ),
    );
  } else {
    if (!passed) {
      for (const line of violationLines) {
        const isWarn = line.includes('⚠');
        logger.log(isWarn ? chalk.yellow(line) : chalk.red(line));
      }
      if (violationLines.length > 0) logger.log('');
      if (errors > 0) {
        logger.log(chalk.red(`ERC found ${errors} error(s).`));
      }
      if (warnings > 0) {
        logger.log(chalk.yellow(`ERC found ${warnings} warning(s).`));
      }
      logger.log(chalk.gray(`\nFull report saved to ${reportPath}`));
    } else {
      logger.log(chalk.green('ERC passed. No errors or warnings.'));
    }
  }

  if (!passed) {
    process.exit(1);
  }
}
