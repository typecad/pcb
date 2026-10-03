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
 * The project's schematic. The build manifest names the project's board and
 * the schematic shares its stem, so stray schematics left in build/ by other
 * projects can't hide it — a bare directory scan finds several and picks
 * nothing. Without a manifest-anchored board, the lone .kicad_sch wins;
 * ambiguity stays null.
 */
export function findSchematicFile(): string | null {
  const board = findBoardFile();
  if (board) {
    const sch = board.slice(0, -'.kicad_pcb'.length) + '.kicad_sch';
    if (fs.existsSync(sch)) return sch;
  }
  const files = findBuildFiles('.kicad_sch');
  return files.length === 1 ? files[0]! : null;
}

/**
 * The `--board <stem>` selector's value from parsed CLI args — the stem of
 * one of a multi-board project's boards ("daughter" → build/daughter.kicad_pcb).
 * Undefined when the flag is absent (commands then use the active board).
 */
export function boardStemFromArgs(parsed: { args: Record<string, unknown> }): string | undefined {
  const v = parsed.args['board'];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** The `--board` hint for a failed resolution: what the project does offer. */
export function knownBoardsHint(): string {
  const boards = listBoardFiles().map((f) => path.basename(f, '.kicad_pcb'));
  return boards.length > 0 ? `known boards: ${boards.join(', ')}` : 'the build manifest lists no boards — run npm run build first';
}

/**
 * The project's compiled boards, from the build manifest (.typecad-board.json):
 * `boards` lists every board the project's create() calls produce (multi-board
 * projects — mother/daughter, board/jig — write one each), `board` names the
 * most recent one (the active default). Empty when there is no manifest or it
 * predates multi-board support.
 */
export function listBoardFiles(dir: string = buildDirPath()): string[] {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.typecad-board.json'), 'utf8')) as {
      boards?: unknown;
    };
    if (!Array.isArray(manifest.boards)) return [];
    return manifest.boards
      .filter((b): b is string => typeof b === 'string' && b.endsWith('.kicad_pcb'))
      .map((b) => path.join(dir, b))
      .filter((b) => fs.existsSync(b));
  } catch {
    return [];
  }
}

/**
 * The project's compiled board. The build's own manifest (.typecad-board.json,
 * written beside the board) is the truth — a renamed board is found at once
 * and a leftover under the previous name can never shadow it. `stem` selects
 * one board of a multi-board project ("--board daughter"); the manifest's
 * `boards` list is matched case/underscore-insensitively, and an unknown stem
 * resolves to null (callers report it). Without a
 * manifest, build/ picks up stray boards (fp upgrade tests, imports, scratch
 * files); the project's own board matches the hw package name
 * (rd-skeleton-hw → rd_skeleton) and wins over whatever stray was touched
 * last — newest is the fallback when no name matches.
 */
export function findBoardFile(stem?: string): string | null {
  if (stem) {
    const norm = stem.replace(/[.-]/g, '_').toLowerCase();
    const hit = listBoardFiles().find(
      (f) => path.basename(f, '.kicad_pcb').replace(/[.-]/g, '_').toLowerCase() === norm,
    );
    if (hit) return hit;
    // no manifest hit: a stray board named for the stem still wins over null
    const stray = findBuildFiles('.kicad_pcb').find(
      (f) => path.basename(f, '.kicad_pcb').replace(/[.-]/g, '_').toLowerCase() === norm,
    );
    return stray ?? null;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(buildDirPath(), '.typecad-board.json'), 'utf8')) as {
      board?: unknown;
    };
    if (typeof manifest.board === 'string' && manifest.board.endsWith('.kicad_pcb')) {
      const manifestBoard = path.join(buildDirPath(), manifest.board);
      if (fs.existsSync(manifestBoard)) return manifestBoard;
    }
  } catch {
    /* no/invalid manifest: the heuristics below */
  }
  const files = findBuildFiles('.kicad_pcb');
  if (files.length === 0) return null;
  const byNewest = files.map((f) => ({ f, m: fs.statSync(f).mtimeMs })).sort((a, b) => b.m - a.m);
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { name?: string };
    const stem = String(pkg.name ?? '')
      .replace(/-hw$/, '')
      .replace(/[.-]/g, '_')
      .toLowerCase();
    const own = byNewest.find((e) => path.basename(e.f, '.kicad_pcb').toLowerCase() === stem);
    if (own) return own.f;
  } catch {
    // no/read-failed package.json: newest-wins stands
  }
  return byNewest[0]!.f;
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
