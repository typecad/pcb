import fs from 'node:fs';
import chalk from 'chalk';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { noEntryMessage } from '../../../utils/command_hint.js';
import { sym, resultLine } from '../ui.js';
import { buildBoardModel, singlePinNets, unconnectedPads } from '../board_model.js';
import {
  buildDirPath,
  detectEntryFile,
  findBoardFile,
  boardStemFromArgs,
  findBuildFiles,
  findSchematicFile,
  knownBoardsHint,
  runBuildStep,
  runDrcStep,
  runErcStep,
  type KiCadCheckResult,
  type KiCadViolation,
} from '../pipeline.js';
import { nativeDrcStep, nativeErcStep } from '../native_checks.js';
import { npxExec } from '../../../utils/process_exec.js';

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
  typecheck: StepResult & { firstErrors?: string[] };
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

/**
 * Typecheck step — `tsc --noEmit` when the project has a tsconfig (every
 * scaffold does). The build itself executes via tsx, which strips types
 * without checking them, so a type-level mistake (calling a method that
 * doesn't exist) otherwise surfaces as a raw runtime TypeError instead of
 * a compiler diagnostic with a file:line.
 */
function typecheckStep(): StepResult & { firstErrors?: string[] } {
  if (!fs.existsSync('tsconfig.json')) {
    return { ran: false, passed: true, reason: 'skipped (no tsconfig.json)' };
  }
  try {
    npxExec(['tsc', '--noEmit'], { stdio: 'pipe', timeout: 120000 });
    return { ran: true, passed: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const firstErrors = message.split('\n').filter((l) => l.trim().startsWith('src/') || l.includes('error TS')).slice(0, 8);
    return { ran: true, passed: false, reason: message || 'type errors found', firstErrors };
  }
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
    const icon = (v.severity ?? 'error') === 'warning' ? chalk.yellow(sym.warn) : chalk.red(sym.fail);
    logger.log(`  ${icon} [${v.type ?? 'unknown'}] ${v.description ?? ''}`);
    for (const item of (v.items ?? []).slice(0, 3)) {
      const pos = item.pos ? ` @(${item.pos.x}, ${item.pos.y})` : '';
      logger.log(chalk.gray(`       ${item.description ?? ''}${pos}`));
    }
  }
  if (violations.length > 25) logger.log(chalk.gray(`  ... and ${violations.length - 25} more`));
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const startedAt = Date.now();
  const json = parsed.json;
  const skipErc = parsed.args['skip-erc'] === true;
  const skipDrc = parsed.args['skip-drc'] === true;
  const skipTypecheck = parsed.args['skip-typecheck'] === true;

  // ── Step 1: build ────────────────────────────────────────────────────────
  const entry = parsed.positional.find((p) => p.endsWith('.ts')) || detectEntryFile();
  const report: CheckReport = {
    ok: false,
    build: { ran: false, passed: false, outputs: [] },
    typecheck: { ran: false, passed: false },
    unconnected: { ran: false, passed: false, pads: [], singlePinNets: [] },
    erc: { ran: false, passed: false },
    drc: { ran: false, passed: false },
  };

  if (!entry) {
    report.build.reason = 'No entry file found';
    if (!json) {
      logger.error(
        chalk.red(
          noEntryMessage('build'),
        ),
      );
      process.exit(1);
    }
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

  // ── Step 2: typecheck (tsc --noEmit; the tsx build executes without
  // checking types, so the check run is where type errors get caught) ──────
  if (!skipTypecheck) {
    report.typecheck = typecheckStep();
  } else {
    report.typecheck = { ran: false, passed: true, reason: 'skipped' };
  }

  // ── Step 3: unconnected analysis (needs built pcb) ───────────────────────
  const stem = boardStemFromArgs(parsed);
  const pcbPath = findBoardFile(stem);
  if (!pcbPath && stem) {
    logger.warn(chalk.yellow(`No board '${stem}' in build/ — ${knownBoardsHint()}`));
  }
  const schPath = pcbPath ? pcbPath.slice(0, -'.kicad_pcb'.length) + '.kicad_sch' : findSchematicFile();

  if (report.build.passed && pcbPath) {
    const model = buildBoardModel(pcbPath);
    report.unconnected.ran = true;
    report.unconnected.pads = unconnectedPads(model);
    report.unconnected.singlePinNets = singlePinNets(model).map((n) => n.name);
    report.unconnected.passed = report.unconnected.pads.length === 0 && report.unconnected.singlePinNets.length === 0;
  } else if (report.build.passed) {
    report.unconnected.reason = `No .kicad_pcb found in ${buildDirPath()}`;
  }

  // ── Step 3: ERC (native engine report from the build; --kicad-erc for kicad-cli) ──
  if (!skipErc && report.build.passed && schPath) {
    if (parsed.args['kicad-erc'] === true) {
      report.erc = stepFromKiCadResult(await runErcStep(schPath));
    } else {
      report.erc = nativeErcStep(schPath);
    }
  } else if (!skipErc && report.build.passed) {
    const strays = findBuildFiles('.kicad_sch').length;
    report.erc = {
      ran: false,
      passed: false,
      reason:
        strays > 1
          ? `Multiple .kicad_sch files in ${buildDirPath()} — can't tell which one to check`
          : `No .kicad_sch found in ${buildDirPath()}`,
    };
  } else if (skipErc) {
    report.erc = { ran: false, passed: true, reason: 'skipped' };
  }

  // ── Step 4: DRC (native engine by default; --kicad-drc for kicad-cli) ──
  if (!skipDrc && report.build.passed && pcbPath) {
    if (parsed.args['kicad-drc'] === true) {
      report.drc = stepFromKiCadResult(await runDrcStep(pcbPath));
    } else {
      report.drc = await nativeDrcStep(pcbPath);
    }
  } else if (!skipDrc && report.build.passed) {
    report.drc = { ran: false, passed: false, reason: `No .kicad_pcb found in ${buildDirPath()}` };
  } else if (skipDrc) {
    report.drc = { ran: false, passed: true, reason: 'skipped' };
  }

  report.ok =
    report.build.passed &&
    (report.typecheck.passed || !report.typecheck.ran) &&
    (report.unconnected.passed || !report.unconnected.ran) &&
    (report.erc.passed || !report.erc.ran) &&
    (report.drc.passed || !report.drc.ran);

  // ── Output ────────────────────────────────────────────────────────────────
  // Pins ERC already reports as `pin_not_connected` are the same physical
  // fact as the board-side "pad has no net" — list each pin once by letting
  // the ERC step own them when it ran.
  const ercReportedPins = new Set<string>();
  if (report.erc.ran) {
    for (const v of report.erc.violations ?? []) {
      if (v.type !== 'pin_not_connected') continue;
      for (const item of v.items ?? []) {
        const m = /Symbol (\S+) Pin (\S+) /.exec(item.description ?? '');
        if (m) ercReportedPins.add(`${m[1]!.toUpperCase()}.${m[2]}`);
      }
    }
  }

  if (json) {
    logger.out(JSON.stringify(report, null, 2));
  } else {
    const stepIcon = (ok: boolean, ran: boolean) => (ran ? (ok ? chalk.green(sym.ok) : chalk.red(sym.fail)) : chalk.gray(sym.skip));
    logger.log(`  ${stepIcon(report.build.passed, report.build.ran)} build`);
    if (!report.build.passed && report.build.reason) logger.log(chalk.red(`      ${report.build.reason}`));
    logger.log(`  ${stepIcon(report.typecheck.passed, report.typecheck.ran)} typecheck`);
    if (report.typecheck.ran && !report.typecheck.passed) {
      for (const line of report.typecheck.firstErrors ?? []) logger.log(chalk.red(`      ${line}`));
      if ((report.typecheck.firstErrors ?? []).length === 0 && report.typecheck.reason) {
        logger.log(chalk.red(`      ${report.typecheck.reason.split('\n')[0]}`));
      }
    } else if (report.typecheck.reason) {
      logger.log(chalk.gray(`      ${report.typecheck.reason}`));
    }
    logger.log(`  ${stepIcon(report.unconnected.passed, report.unconnected.ran)} unconnected`);
    if (report.unconnected.ran && !report.unconnected.passed) {
      let suppressed = 0;
      for (const p of report.unconnected.pads) {
        if (ercReportedPins.has(`${p.reference.toUpperCase()}.${p.pad}`)) {
          suppressed++;
          continue;
        }
        logger.log(chalk.yellow(`      ${p.reference}.${p.pad} has no net`));
      }
      if (suppressed > 0) {
        logger.log(chalk.gray(`      (${suppressed} no-net pin${suppressed === 1 ? '' : 's'} already listed under erc)`));
      }
      for (const n of report.unconnected.singlePinNets) logger.log(chalk.yellow(`      net ${n} has a single pin`));
    } else if (report.unconnected.reason) {
      logger.log(chalk.gray(`      ${report.unconnected.reason}`));
    }
    logger.log(`  ${stepIcon(report.erc.passed, report.erc.ran)} erc`);
    if (report.erc.ran && !report.erc.passed) {
      printViolations(report.erc.violations ?? []);
      if ((report.erc.violations ?? []).some((v) => v.type === 'pin_not_connected')) {
        logger.log(
          chalk.gray('      hint: mark intentionally unused pins with pcb.dnc(...) — see the Connections docs'),
        );
      }
    } else if (report.erc.reason) logger.log(chalk.gray(`      ${report.erc.reason}`));
    logger.log(`  ${stepIcon(report.drc.passed, report.drc.ran)} drc`);
    if (report.drc.ran && !report.drc.passed) {
      printViolations(report.drc.violations ?? []);
      if ((report.drc.unconnectedItems ?? 0) > 0)
        logger.log(chalk.yellow(`      ${report.drc.unconnectedItems} unconnected item(s)`));
    } else if (report.drc.reason) {
      logger.log(chalk.gray(`      ${report.drc.reason}`));
    }
    logger.log('');
    const elapsedMs = Date.now() - startedAt;
    if (report.ok) {
      logger.log(resultLine('ok', 'check', 'all steps passed', elapsedMs));
    } else {
      const failedSteps = (['build', 'typecheck', 'unconnected', 'erc', 'drc'] as const).filter(
        (step) => report[step].ran && !report[step].passed,
      );
      if (failedSteps.length === 0) failedSteps.push('build');
      logger.log(resultLine('fail', 'check', `failed — ${failedSteps.join(', ')}`, elapsedMs));
    }
  }

  if (!report.ok) process.exit(1);
}
