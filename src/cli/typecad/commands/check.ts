import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { executeKiCADCommand } from '../../../kicad_commands.js';
import { npxExec } from '../../../utils/process_exec.js';
import { loadConfig } from '../../../config.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { buildBoardModel, singlePinNets, unconnectedPads } from '../board_model.js';

interface CheckViolation {
  type?: string;
  severity?: string;
  description?: string;
  items?: { description?: string; pos?: { x: number; y: number } }[];
}

interface StepResult {
  ran: boolean;
  passed: boolean;
  reason?: string;
  errors?: number;
  warnings?: number;
  violations?: CheckViolation[];
}

interface CheckReport {
  ok: boolean;
  build: { ran: boolean; passed: boolean; entry?: string; outputs: string[]; reason?: string };
  unconnected: {
    ran: boolean;
    passed: boolean;
    reason?: string;
    pads: { reference: string; pad: string; type: string }[];
    singlePinNets: string[];
  };
  erc: StepResult;
  drc: StepResult & { unconnectedItems?: number };
}

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
    /* no src dir */
  }
  return null;
}

function findBuildFile(extension: string): string | null {
  const buildDir = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildDir)) return null;
  const files = fs.readdirSync(buildDir).filter((f) => f.endsWith(extension));
  return files.length === 1 ? path.join(buildDir, files[0]) : null;
}

function parseKiCadReport(reportPath: string): { violations: CheckViolation[]; unconnectedItems: number } {
  if (!fs.existsSync(reportPath)) return { violations: [], unconnectedItems: 0 };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const violations: CheckViolation[] = [...(report.violations ?? [])];
    for (const sheet of report.sheets ?? []) {
      violations.push(...(sheet.violations ?? []));
    }
    return { violations, unconnectedItems: (report.unconnected_items ?? []).length };
  } catch {
    return { violations: [], unconnectedItems: 0 };
  }
}

function countSeverity(violations: CheckViolation[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const v of violations) {
    const severity = v.severity ?? 'error';
    if (severity === 'error') errors++;
    else if (severity === 'warning') warnings++;
  }
  return { errors, warnings };
}

function printViolations(violations: CheckViolation[]): void {
  for (const v of violations.slice(0, 25)) {
    const icon = (v.severity ?? 'error') === 'warning' ? chalk.yellow('⚠') : chalk.red('✖');
    logger.log(`  ${icon} [${v.type ?? 'unknown'}] ${v.description ?? ''}`);
    for (const item of (v.items ?? []).slice(0, 3)) {
      const pos = item.pos ? ` @(${item.pos.x}, ${item.pos.y})` : '';
      logger.log(chalk.gray(`       ${item.description ?? ''}${pos}`));
    }
  }
  if (violations.length > 25) logger.log(chalk.gray(`  ... and ${violations.length - 25} more`));
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const json = parsed.json;
  const skipErc = parsed.args['skip-erc'] === true;
  const skipDrc = parsed.args['skip-drc'] === true;

  // ── Step 1: build ────────────────────────────────────────────────────────
  const entry = parsed.positional.find((p) => p.endsWith('.ts')) || detectEntryFile();
  const report: CheckReport = {
    ok: false,
    build: { ran: false, passed: false, outputs: [] },
    unconnected: { ran: false, passed: false, pads: [], singlePinNets: [] },
    erc: { ran: false, passed: false },
    drc: { ran: false, passed: false },
  };

  if (!entry) {
    report.build.reason = 'No entry file found';
  } else if (!fs.existsSync(entry)) {
    report.build.reason = `Entry file not found: ${entry}`;
  } else {
    report.build.ran = true;
    report.build.entry = entry;
    if (!json) logger.log(chalk.white.bold('typecad-pcb check') + '\n');
    try {
      const env: Record<string, string> = { ...(process.env as Record<string, string>) };
      if (parsed.args['verbose'] === true) env.TYPECAD_DEBUG = '1';
      // In JSON mode capture the child output so stdout stays parseable;
      // surface it only when the build fails.
      npxExec(['tsx', entry], { stdio: json ? 'pipe' : 'inherit', env });
      report.build.passed = true;
      const buildDir = path.join(process.cwd(), 'build');
      if (fs.existsSync(buildDir)) {
        report.build.outputs = fs.readdirSync(buildDir).filter((f) => f.startsWith(path.basename(entry, '.ts')));
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string };
      report.build.reason = err.stderr?.toString().trim() || (error instanceof Error ? error.message : String(error));
      if (json && report.build.reason) {
        // keep stdout clean; failure detail goes to stderr for humans
        process.stderr.write(report.build.reason + '\n');
      }
    }
  }

  // ── Step 2: unconnected analysis (needs built pcb) ───────────────────────
  const pcbPath = findBuildFile('.kicad_pcb');
  const schPath = findBuildFile('.kicad_sch');

  if (report.build.passed && pcbPath) {
    const model = buildBoardModel(pcbPath);
    report.unconnected.ran = true;
    report.unconnected.pads = unconnectedPads(model);
    report.unconnected.singlePinNets = singlePinNets(model).map((n) => n.name);
    report.unconnected.passed = report.unconnected.pads.length === 0 && report.unconnected.singlePinNets.length === 0;
  } else if (report.build.passed) {
    report.unconnected.reason = 'No .kicad_pcb found in ./build/';
  }

  // ── Step 3: ERC ──────────────────────────────────────────────────────────
  if (!skipErc && report.build.passed && schPath) {
    const reportPath = path.join(path.dirname(schPath), path.basename(schPath, '.kicad_sch') + '_erc.json');
    try {
      await executeKiCADCommand('sch', ['erc', '--format', 'json', '--output', reportPath, schPath], { stdio: 'pipe' });
    } catch {
      // non-zero exit is expected when violations exist; missing kicad-cli throws
    }
    if (fs.existsSync(reportPath)) {
      const { violations } = parseKiCadReport(reportPath);
      const { errors, warnings } = countSeverity(violations);
      report.erc = { ran: true, passed: errors === 0 && warnings === 0, errors, warnings, violations };
    } else {
      report.erc = { ran: false, passed: false, reason: 'kicad-cli unavailable or ERC failed to run' };
    }
  } else if (!skipErc && report.build.passed) {
    report.erc = { ran: false, passed: false, reason: 'No .kicad_sch found in ./build/' };
  } else if (skipErc) {
    report.erc = { ran: false, passed: true, reason: 'skipped' };
  }

  // ── Step 4: DRC ──────────────────────────────────────────────────────────
  if (!skipDrc && report.build.passed && pcbPath) {
    const reportPath = path.join(path.dirname(pcbPath), path.basename(pcbPath, '.kicad_pcb') + '_drc.json');
    try {
      // --refill-zones: DRC judges real pour copper (and --save-board keeps
      // the fill in the file, matching what build materializes).
      await executeKiCADCommand(
        'pcb',
        ['drc', '--refill-zones', '--save-board', '--format', 'json', '--output', reportPath, pcbPath],
        { stdio: 'pipe' },
      );
    } catch {
      // non-zero exit is expected when violations exist
    }
    if (fs.existsSync(reportPath)) {
      const { violations, unconnectedItems } = parseKiCadReport(reportPath);
      const { errors, warnings } = countSeverity(violations);
      report.drc = {
        ran: true,
        passed: errors === 0 && warnings === 0 && unconnectedItems === 0,
        errors,
        warnings,
        violations,
        unconnectedItems,
      };
    } else {
      report.drc = { ran: false, passed: false, reason: 'kicad-cli unavailable or DRC failed to run' };
    }
  } else if (!skipDrc && report.build.passed) {
    report.drc = { ran: false, passed: false, reason: 'No .kicad_pcb found in ./build/' };
  } else if (skipDrc) {
    report.drc = { ran: false, passed: true, reason: 'skipped' };
  }

  report.ok =
    report.build.passed &&
    (report.unconnected.passed || !report.unconnected.ran) &&
    (report.erc.passed || !report.erc.ran) &&
    (report.drc.passed || !report.drc.ran);

  // ── Output ────────────────────────────────────────────────────────────────
  if (json) {
    logger.log(JSON.stringify(report, null, 2));
  } else {
    const stepIcon = (ok: boolean, ran: boolean) => (ran ? (ok ? chalk.green('✓') : chalk.red('✖')) : chalk.gray('–'));
    logger.log(`  ${stepIcon(report.build.passed, report.build.ran)} build`);
    if (!report.build.passed && report.build.reason) logger.log(chalk.red(`      ${report.build.reason}`));
    logger.log(`  ${stepIcon(report.unconnected.passed, report.unconnected.ran)} unconnected`);
    if (report.unconnected.ran && !report.unconnected.passed) {
      for (const p of report.unconnected.pads) logger.log(chalk.yellow(`      ${p.reference}.${p.pad} has no net`));
      for (const n of report.unconnected.singlePinNets) logger.log(chalk.yellow(`      net ${n} has a single pin`));
    } else if (report.unconnected.reason) {
      logger.log(chalk.gray(`      ${report.unconnected.reason}`));
    }
    logger.log(`  ${stepIcon(report.erc.passed, report.erc.ran)} erc`);
    if (report.erc.ran && !report.erc.passed) printViolations(report.erc.violations ?? []);
    else if (report.erc.reason) logger.log(chalk.gray(`      ${report.erc.reason}`));
    logger.log(`  ${stepIcon(report.drc.passed, report.drc.ran)} drc`);
    if (report.drc.ran && !report.drc.passed) {
      printViolations(report.drc.violations ?? []);
      if ((report.drc.unconnectedItems ?? 0) > 0)
        logger.log(chalk.yellow(`      ${report.drc.unconnectedItems} unconnected item(s)`));
    } else if (report.drc.reason) {
      logger.log(chalk.gray(`      ${report.drc.reason}`));
    }
    logger.log('');
    if (report.ok) {
      logger.log(chalk.green('Check passed.'));
    } else {
      logger.log(chalk.red('Check failed.'));
    }
  }

  if (!report.ok) process.exit(1);
}
