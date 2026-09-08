import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';
import type { ErcViolation } from '../../types.js';
import logger from '../../../utils/logging.js';

function findPcbFile(argPath?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  const buildDir = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildDir)) return null;

  const pcbFiles = fs.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_pcb'));
  if (pcbFiles.length === 1) return path.join(buildDir, pcbFiles[0]);
  if (pcbFiles.length > 1) return null;

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
  const pcbArg = parsed.positional[0];
  const pcbPath = findPcbFile(pcbArg);

  if (!pcbPath) {
    if (pcbArg) {
      throw new Error(`PCB file not found: ${pcbArg}`);
    }
    throw new Error(
      'No .kicad_pcb file found in ./build/.\n' +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb drc <path/to/board.kicad_pcb>',
    );
  }

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb drc') + ' - Design Rule Check\n');
    logger.log(`  PCB: ${pcbPath}\n`);
  }

  const reportName = path.basename(pcbPath, '.kicad_pcb') + '_drc.json';
  const reportPath = path.join(path.dirname(pcbPath), reportName);

  const args = ['drc', '--format', 'json', '--output', reportPath, ...parsed.passthrough, pcbPath];

  try {
    await executeKiCADCommand('pcb', args, { stdio: 'pipe' });
  } catch {
    logger.debug('DRC: kicad-cli exited non-zero (expected when violations found)');
  }

  let errors = 0;
  let warnings = 0;
  let unconnected = 0;
  let rawReport = '';
  const violationLines: string[] = [];

  if (fs.existsSync(reportPath)) {
    rawReport = fs.readFileSync(reportPath, 'utf8');

    try {
      const report = JSON.parse(rawReport);

      // DRC violations can be at top level or nested under sheets
      const allViolations: ErcViolation[] = report.violations ?? [];
      const sheets = report.sheets ?? [];
      for (const sheet of sheets) {
        allViolations.push(...(sheet.violations ?? []));
      }

      for (const v of allViolations) {
        const severity = v.severity ?? 'error';
        if (severity === 'error') errors++;
        else if (severity === 'warning') warnings++;
        violationLines.push(formatViolation(v));
      }

      const unconnectedItems = report.unconnected_items ?? [];
      unconnected += unconnectedItems.length;
      for (const item of unconnectedItems) {
        violationLines.push(`  ✖ [unconnected] ${item.description ?? ''}`);
      }
    } catch {
      const textMatch = rawReport.match(/Found\s+(\d+)\s+violation/i);
      if (textMatch) errors = parseInt(textMatch[1], 10);
      const unconnMatch = rawReport.match(/Found\s+(\d+)\s+unconnected/i);
      if (unconnMatch) unconnected = parseInt(unconnMatch[1], 10);
    }
  }

  const passed = errors === 0 && warnings === 0 && unconnected === 0;

  if (json) {
    logger.log(
      JSON.stringify(
        {
          pcb: pcbPath,
          passed,
          errors,
          warnings,
          unconnected,
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
        logger.log(chalk.red(`DRC found ${errors} error(s).`));
      }
      if (warnings > 0) {
        logger.log(chalk.yellow(`DRC found ${warnings} warning(s).`));
      }
      if (unconnected > 0) {
        logger.log(chalk.yellow(`DRC found ${unconnected} unconnected item(s).`));
      }
      logger.log(chalk.gray(`\nFull report saved to ${reportPath}`));
    } else {
      logger.log(chalk.green('DRC passed. No violations or unconnected items.'));
    }
  }

  if (!passed) {
    process.exit(1);
  }
}
