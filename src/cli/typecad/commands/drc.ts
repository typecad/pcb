import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import type { ParsedArgs } from '../parser.js';
import type { ErcViolation } from '../../types.js';
import logger from '../../../utils/logging.js';
import { buildDirPath, findBoardFile } from '../pipeline.js';
import { kicadMajorVersion, refillZoneFills } from './export.js';
import { runDrc } from '../../../pcb/pcb_drc_engine.js';

function findPcbFile(argPath?: string): string | null {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }

  return findBoardFile();
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
      `No .kicad_pcb file found in ${buildDirPath()}.\n` +
        'Run `typecad-pcb build` first, or specify a path: typecad-pcb drc <path/to/board.kicad_pcb>',
    );
  }

  if (!json) {
    logger.log(chalk.white.bold('typecad-pcb drc') + ' - Design Rule Check\n');
    logger.log(`  PCB:    ${pcbPath}`);
    logger.log(chalk.gray('  Engine: native (copper core; --kicad for the legacy kicad-cli check)\n'));
  }

  if (parsed.args['kicad'] === true) {
    return runKicadDrc(parsed, pcbPath, json);
  }
  return runNativeDrc(pcbPath, json);
}

/**
 * Native DRC: constraints come from the `.kicad_pro` the build wrote (the
 * merged defaults ← conf constraints file ← constructor chain), zone fills
 * are computed in-memory by the native fill engine, and the report uses
 * KiCad's JSON schema so consumers don't care which engine produced it.
 */
export async function runNativeDrc(pcbPath: string, json: boolean): Promise<void> {
  const { report, reportPath } = await computeNativeDrc(pcbPath);
  reportViolations(report, reportPath, json);
}

/**
 * Native DRC core: refill zones in-memory, run the engine with constraints
 * from the board's .kicad_pro, and persist the KiCad-schema report JSON.
 * Shared by the `drc` command and `check`'s DRC step.
 */
export async function computeNativeDrc(
  pcbPath: string,
): Promise<{ report: ReturnType<typeof runDrc>; reportPath: string }> {
  const reportName = path.basename(pcbPath, '.kicad_pcb') + '_drc.json';
  const reportPath = path.join(path.dirname(pcbPath), reportName);

  const source = fs.readFileSync(pcbPath, 'utf8');
  const constraints = constraintsFromProject(pcbPath);
  const filled = refillZoneFills(source);
  const report = runDrc(filled ?? source, constraints);

  const doc = {
    coordinate_units: 'mm',
    date: new Date().toISOString(),
    engine: 'typecad-native',
    source: path.basename(pcbPath),
    violations: report.violations,
    unconnected_items: report.unconnected_items,
  };
  fs.writeFileSync(reportPath, JSON.stringify(doc, null, 2));
  return { report, reportPath };
}

/** Read design rules + DRC severities from the board's .kicad_pro. */
export function constraintsFromProject(pcbPath: string): Partial<import('../../../pcb/pcb_drc_engine.js').DrcConstraints> {
  const proPath = pcbPath.replace(/\.kicad_pcb$/, '.kicad_pro');
  try {
    const pro = JSON.parse(fs.readFileSync(proPath, 'utf8')) as {
      board?: { design_settings?: { rules?: Record<string, unknown>; rule_severities?: Record<string, string> } };
      net_settings?: {
        classes?: Array<{ name?: string; clearance?: unknown }>;
        netclass_patterns?: Array<{ netclass?: string; pattern?: string }>;
      };
    };
    const rules = pro.board?.design_settings?.rules ?? {};
    const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
    // ONLY set keys — explicit undefineds would clobber the engine defaults
    const out: Partial<import('../../../pcb/pcb_drc_engine.js').DrcConstraints> = {};
    const numericKeys = [
      'min_clearance',
      'min_track_width',
      'min_via_diameter',
      'min_through_hole_diameter',
      'min_via_annular_width',
      'min_copper_edge_clearance',
      'min_hole_to_hole',
      'min_hole_to_copper',
    ] as const;
    for (const k of numericKeys) {
      const v = num(rules[k]);
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    const severities = pro.board?.design_settings?.rule_severities;
    if (severities) out.severities = severities as Record<string, 'error' | 'warning' | 'ignore'>;
    const classes = pro.net_settings?.classes ?? [];
    const classClearance: Record<string, number> = {};
    for (const cls of classes) {
      const c = cls as { name?: string; clearance?: unknown };
      const v = num(c.clearance);
      if (c.name && v !== undefined) classClearance[c.name] = v;
    }
    if (Object.keys(classClearance).length > 0) out.netClassClearance = classClearance;
    const patterns = pro.net_settings?.netclass_patterns ?? [];
    const netPatterns: Array<{ pattern: string; className: string }> = [];
    for (const pat of patterns as Array<{ netclass?: string; pattern?: string }>) {
      if (pat.netclass && pat.pattern) netPatterns.push({ pattern: pat.pattern, className: pat.netclass });
    }
    if (netPatterns.length > 0) out.netClassPatterns = netPatterns;
    return out;
  } catch {
    return {}; // no/invalid project file: engine defaults apply
  }
}

/** Shared report rendering + exit code for both engines. */
function reportViolations(
  report: {
    violations: Array<{ severity?: string; type?: string; description?: string; items?: ErcViolation['items'] }>;
    unconnected_items?: Array<{ description?: string; severity?: string; items?: ErcViolation['items'] }>;
  },
  reportPath: string,
  json: boolean,
  elapsedMs?: number,
): void {
  let errors = 0;
  let warnings = 0;
  let unconnected = 0;
  const violationLines: string[] = [];

  for (const v of report.violations ?? []) {
    const severity = v.severity ?? 'error';
    if (severity === 'error') errors++;
    else if (severity === 'warning') warnings++;
    violationLines.push(formatViolation(v as ErcViolation));
  }
  for (const u of report.unconnected_items ?? []) {
    const severity = u.severity ?? 'error';
    if (severity === 'error') errors++;
    else if (severity === 'warning') warnings++;
    else unconnected++;
    violationLines.push(`  ✖ [unconnected${severity === 'warning' ? ' (hatch-phase caveat)' : ''}] ${u.description ?? ''}`);
    for (const item of u.items ?? []) {
      violationLines.push(`     ${item.description ?? ''} @(${item.pos?.x}, ${item.pos?.y})`);
    }
  }

  const passed = errors === 0 && warnings === 0 && unconnected === 0;

  if (json) {
    logger.log(
      JSON.stringify({ passed, errors, warnings, unconnected, output: JSON.stringify(report) }, null, 2),
    );
  } else {
    if (!passed) {
      for (const line of violationLines) {
        const isWarn = line.includes('⚠');
        logger.log(isWarn ? chalk.yellow(line) : chalk.red(line));
      }
      if (violationLines.length > 0) logger.log('');
      if (errors > 0) logger.log(chalk.red(`DRC found ${errors} error(s).`));
      if (warnings > 0) logger.log(chalk.yellow(`DRC found ${warnings} warning(s).`));
      if (unconnected > 0) logger.log(chalk.yellow(`DRC found ${unconnected} unconnected item(s).`));
      logger.log(chalk.gray(`\nFull report saved to ${reportPath}`));
    } else {
      const time = elapsedMs !== undefined ? chalk.gray(` (${(elapsedMs / 1000).toFixed(1)}s)`) : '';
      logger.log(chalk.green(`DRC passed. No violations or unconnected items.${time}`));
    }
  }

  if (!passed) {
    process.exit(1);
  }
}

/** Legacy kicad-cli DRC (--kicad). */
async function runKicadDrc(parsed: ParsedArgs, pcbPath: string, json: boolean): Promise<void> {
  const reportName = path.basename(pcbPath, '.kicad_pcb') + '_drc.json';
  const reportPath = path.join(path.dirname(pcbPath), reportName);

  // Refill zones in memory before checking (KiCad >= 9): typeCAD builds ship
  // zone DECLARATIONS without fill geometry — fills are computed by the
  // consumer — so a plain check validates a board that will never be
  // fabricated. Without the refill every via tying into a pour reads
  // dangling and the report fills with phantom violations; KiCad's GUI DRC
  // refills by default, and this matches it. Power users can append their
  // own kicad-cli flags after `--` (parsed.passthrough).
  const refillZones = (await kicadMajorVersion()) >= 9;
  const args = [
    'drc',
    ...(refillZones ? ['--refill-zones'] : []),
    '--format',
    'json',
    '--output',
    reportPath,
    ...parsed.passthrough,
    pcbPath,
  ];

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
