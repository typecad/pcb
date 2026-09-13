import fs from 'node:fs';
import path from 'node:path';
import { executeKiCADCommand } from '../../kicad_commands.js';
import { npxExec } from '../../utils/process_exec.js';
import { loadConfig } from '../../config.js';
import { getBuildDir } from '../../utils/constants.js';

/**
 * Shared steps for the check/diagnostics pipelines: entry detection, build
 * artifact discovery, and the kicad-cli ERC/DRC report steps.
 */

export interface KiCadViolation {
  type?: string;
  severity?: string;
  description?: string;
  items?: { description?: string; pos?: { x: number; y: number } }[];
}

export interface KiCadCheckResult {
  ran: boolean;
  passed: boolean;
  reason?: string;
  errors: number;
  warnings: number;
  violations: KiCadViolation[];
  /** DRC only: unrouted items kicad-cli reports separately from violations. */
  unconnectedItems?: number;
  reportPath?: string;
}

/** Absolute build output dir, honoring --outDir via TYPECAD_BUILD_DIR. */
export function buildDirPath(): string {
  return path.resolve(getBuildDir());
}

/**
 * Applies `--outDir/--out-dir` (any command) by setting TYPECAD_BUILD_DIR,
 * which both the CLI's artifact discovery and the library's writes follow.
 * Called once at dispatch, before any command runs.
 */
export function applyOutDirFlag(args: Record<string, string | boolean>): void {
  const raw = args['outDir'] ?? args['out-dir'];
  if (typeof raw === 'string' && raw.trim() !== '') {
    process.env.TYPECAD_BUILD_DIR = path.resolve(raw.trim());
  }
}

export function detectEntryFile(): string | null {
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

export function findBuildFiles(extension: string): string[] {
  const buildDir = buildDirPath();
  if (!fs.existsSync(buildDir)) return [];
  return fs
    .readdirSync(buildDir)
    .filter((f) => f.endsWith(extension))
    .map((f) => path.join(buildDir, f));
}

export function findBuildFile(extension: string): string | null {
  const files = findBuildFiles(extension);
  return files.length === 1 ? files[0]! : null;
}

/**
 * The project's compiled board — the newest .kicad_pcb in the build dir.
 * build/ picks up stray boards (fp upgrade tests, imports) that would make
 * a single-file check refuse forever; the board a build wrote last is the
 * project's, so newest wins.
 */
export function findBoardFile(): string | null {
  const files = findBuildFiles('.kicad_pcb');
  if (files.length === 0) return null;
  return files.map((f) => ({ f, m: fs.statSync(f).mtimeMs })).sort((a, b) => b.m - a.m)[0]!.f;
}

export function parseKiCadReport(reportPath: string): { violations: KiCadViolation[]; unconnectedItems: number } {
  if (!fs.existsSync(reportPath)) return { violations: [], unconnectedItems: 0 };
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const violations: KiCadViolation[] = [...(report.violations ?? [])];
    for (const sheet of report.sheets ?? []) {
      violations.push(...(sheet.violations ?? []));
    }
    return { violations, unconnectedItems: (report.unconnected_items ?? []).length };
  } catch {
    return { violations: [], unconnectedItems: 0 };
  }
}

export function countSeverity(violations: KiCadViolation[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const v of violations) {
    const severity = v.severity ?? 'error';
    if (severity === 'error') errors++;
    else if (severity === 'warning') warnings++;
  }
  return { errors, warnings };
}

export interface BuildStepResult {
  passed: boolean;
  reason?: string;
  outputs: string[];
}

/** Runs the project entry via tsx; in JSON mode child output is piped so stdout stays parseable. */
export async function runBuildStep(
  entry: string,
  opts: { json: boolean; verbose?: boolean },
): Promise<BuildStepResult> {
  try {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    if (opts.verbose) env.TYPECAD_DEBUG = '1';
    npxExec(['tsx', entry], { stdio: opts.json ? 'pipe' : 'inherit', env });
    const outputs: string[] = [];
    const buildDir = buildDirPath();
    if (fs.existsSync(buildDir)) {
      outputs.push(...fs.readdirSync(buildDir).filter((f) => f.startsWith(path.basename(entry, '.ts'))));
    }
    return { passed: true, outputs };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    const reason = err.stderr?.toString().trim() || (error instanceof Error ? error.message : String(error));
    if (opts.json && reason) {
      // keep stdout clean; failure detail goes to stderr for humans
      process.stderr.write(reason + '\n');
    }
    return { passed: false, reason, outputs: [] };
  }
}

/** kicad-cli schematic ERC; a missing kicad-cli degrades to `ran: false`. */
export async function runErcStep(schPath: string): Promise<KiCadCheckResult> {
  const reportPath = path.join(path.dirname(schPath), path.basename(schPath, '.kicad_sch') + '_erc.json');
  // A report left by a previous run must never be read as this run's result
  // (e.g. kicad-cli missing now) — remove it before attempting ERC.
  fs.rmSync(reportPath, { force: true });
  try {
    await executeKiCADCommand('sch', ['erc', '--format', 'json', '--output', reportPath, schPath], { stdio: 'pipe' });
  } catch {
    // non-zero exit is expected when violations exist; missing kicad-cli throws
  }
  if (fs.existsSync(reportPath)) {
    const { violations } = parseKiCadReport(reportPath);
    const { errors, warnings } = countSeverity(violations);
    return { ran: true, passed: errors === 0 && warnings === 0, errors, warnings, violations, reportPath };
  }
  return {
    ran: false,
    passed: false,
    reason: 'kicad-cli unavailable or ERC failed to run',
    errors: 0,
    warnings: 0,
    violations: [],
  };
}

/** kicad-cli board DRC with zone refill (--save-board keeps the fill, matching what build materializes). */
export async function runDrcStep(pcbPath: string): Promise<KiCadCheckResult> {
  const reportPath = path.join(path.dirname(pcbPath), path.basename(pcbPath, '.kicad_pcb') + '_drc.json');
  // Same stale-report guard as ERC: only a report this run wrote is trusted.
  fs.rmSync(reportPath, { force: true });
  try {
    await executeKiCADCommand(
      'pcb',
      ['drc', '--refill-zones', '--save-board', '--format', 'json', '--output', reportPath, pcbPath],
      { stdio: 'pipe' },
    );
  } catch {
    // non-zero exit is expected when violations exist — the board is still
    // refilled and saved by kicad-cli
  }
  if (fs.existsSync(reportPath)) {
    const { violations, unconnectedItems } = parseKiCadReport(reportPath);
    const { errors, warnings } = countSeverity(violations);
    return {
      ran: true,
      passed: errors === 0 && warnings === 0 && unconnectedItems === 0,
      errors,
      warnings,
      violations,
      unconnectedItems,
      reportPath,
    };
  }
  return {
    ran: false,
    passed: false,
    reason: 'kicad-cli unavailable or DRC failed to run',
    errors: 0,
    warnings: 0,
    violations: [],
  };
}
