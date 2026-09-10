import fs from 'node:fs';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { buildBoardModel, singlePinNets, unconnectedPads } from '../board_model.js';
import {
  buildDirPath,
  detectEntryFile,
  findBuildFile,
  runBuildStep,
  runDrcStep,
  runErcStep,
  type KiCadCheckResult,
  type KiCadViolation,
} from '../pipeline.js';

interface StepResult {
  ran: boolean;
  passed: boolean;
  reason?: string;
  errors?: number;
  warnings?: number;
  violations?: KiCadViolation[];
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

function stepFromKiCadResult(result: KiCadCheckResult): StepResult & { unconnectedItems?: number } {
  const step: StepResult & { unconnectedItems?: number } = {
    ran: result.ran,
    passed: result.passed,
    errors: result.errors,
    warnings: result.warnings,
    violations: result.violations,
  };
  if (result.reason) step.reason = result.reason;
  if (result.unconnectedItems !== undefined) step.unconnectedItems = result.unconnectedItems;
  return step;
}

function printViolations(violations: KiCadViolation[]): void {
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
    const built = await runBuildStep(entry, { json, verbose: parsed.args['verbose'] === true });
    report.build.passed = built.passed;
    report.build.outputs = built.outputs;
    if (!built.passed) report.build.reason = built.reason;
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
    report.unconnected.reason = `No .kicad_pcb found in ${buildDirPath()}`;
  }

  // ── Step 3: ERC ──────────────────────────────────────────────────────────
  if (!skipErc && report.build.passed && schPath) {
    report.erc = stepFromKiCadResult(await runErcStep(schPath));
  } else if (!skipErc && report.build.passed) {
    report.erc = { ran: false, passed: false, reason: `No .kicad_sch found in ${buildDirPath()}` };
  } else if (skipErc) {
    report.erc = { ran: false, passed: true, reason: 'skipped' };
  }

  // ── Step 4: DRC ──────────────────────────────────────────────────────────
  if (!skipDrc && report.build.passed && pcbPath) {
    report.drc = stepFromKiCadResult(await runDrcStep(pcbPath));
  } else if (!skipDrc && report.build.passed) {
    report.drc = { ran: false, passed: false, reason: `No .kicad_pcb found in ${buildDirPath()}` };
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
