import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { findExecutable } from '../../../kicad.js';
import { KiCAD } from '../../../kicad.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';
import { coreDepsFix } from '../../create-typecad/core-deps.js';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  fixHint?: string;
  fixCommand?: string;
}

/**
 * Whether the running CLI's version sits on the same major line as a
 * package.json spec ('^1.0.0-alpha.2' / '~0.3.4' / '1.2.3' → major 1 / 0 / 1).
 * A cross-line CLI is not a dependency error — it is a COMMAND-SET mismatch:
 * the 0.x and 1.x lines register different commands (check/query/edit exist
 * only on 1.x), so a stale global `typecad` silently hides subcommands the
 * project's own installed copy has.
 *
 * Exported (pure) so the line-matching contract is unit-testable.
 */
export function cliLineMatches(cliVersion: string, spec: string): boolean {
  const cliMajor = parseInt(cliVersion.replace(/^v/, '').split('.')[0] ?? '', 10);
  const specMajor = parseInt((spec.match(/(\d+)/) ?? [])[1] ?? '', 10);
  if (Number.isNaN(cliMajor) || Number.isNaN(specMajor)) return true; // unparseable — don't guess a mismatch
  return cliMajor === specMajor;
}

/** The version of the @typecad/pcb package THIS CLI process runs from
 *  (walks up from this module to the enclosing package.json). */
function runningCliVersion(): string | null {
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === '@typecad/pcb' && typeof pkg.version === 'string') return pkg.version;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // fall through
  }
  return null;
}

function checkCliLine(): CheckResult {
  const declared = (() => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      return (
        (pkg.dependencies?.['@typecad/pcb'] as string | undefined) ??
        (pkg.devDependencies?.['@typecad/pcb'] as string | undefined)
      );
    } catch {
      return undefined;
    }
  })();
  const cliVersion = runningCliVersion();
  // Nothing to compare (no local declaration, or the version probe failed) —
  // the dep-presence checks above cover the install story.
  if (!declared || !cliVersion) {
    return { name: 'CLI line', passed: true, message: `v${cliVersion ?? 'unknown'}` };
  }
  if (cliLineMatches(cliVersion, declared)) {
    return { name: 'CLI line', passed: true, message: `v${cliVersion} matches the project (${declared})` };
  }
  // Print a `~` spec, not the declared `^` — the command is meant for the
  // user's shell, and cmd.exe (Windows) eats carets.
  const declaredVersion = declared.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/)?.[1] ?? '';
  return {
    name: 'CLI line',
    passed: false,
    message: `running v${cliVersion}, project declares ${declared} — different major lines register different commands`,
    fixHint:
      `The bare \`typecad\` command runs your GLOBAL CLI; the project's own (newer) copy is in node_modules.\n` +
      `Use \`npx typecad-pcb <command>\` to run the project's copy, or align the global:`,
    // A global install is the user's machine-wide state — show the command,
    // don't auto-run it from --fix (that stays project-local).
    fixCommand: declaredVersion ? `npm install -g @typecad/pcb@~${declaredVersion}` : undefined,
  };
}

function semverGte(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return true;
}

function runQuiet(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const ok = semverGte(version, '18.0.0');
  return {
    name: 'Node.js',
    passed: ok,
    message: ok ? `${version} (>= 18.0.0)` : `${version} is below the minimum 18.0.0`,
    fixHint: 'Install Node.js >= 18 from https://nodejs.org/',
  };
}

function checkNpm(): CheckResult {
  const version = runQuiet('npm --version');
  if (version) {
    return { name: 'npm', passed: true, message: version };
  }
  return {
    name: 'npm',
    passed: false,
    message: 'not found',
    fixHint: 'npm should come bundled with Node.js. Reinstall Node.js from https://nodejs.org/',
  };
}

function checkPackageJson(): CheckResult {
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {
      name: 'package.json',
      passed: false,
      message: 'not found in current directory',
      fixHint: 'Run this command from a typeCAD project directory, or create one with: typecad-pcb create',
    };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const isModule = pkg.type === 'module';
    return {
      name: 'package.json',
      passed: isModule,
      message: isModule ? 'found (type: module)' : 'found but "type" is not set to "module"',
      fixHint: isModule ? undefined : 'Add "type": "module" to your package.json',
      fixCommand: isModule ? undefined : 'npm pkg set type=module',
    };
  } catch {
    return {
      name: 'package.json',
      passed: false,
      message: 'found but could not be parsed (invalid JSON)',
      fixHint: 'Fix or delete package.json and regenerate it',
    };
  }
}

function checkNodeModules(fix: boolean): CheckResult {
  const nmPath = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nmPath)) {
    return { name: 'node_modules', passed: true, message: 'present' };
  }
  if (fix) {
    const result = runQuiet('npm install');
    if (result !== null || fs.existsSync(nmPath)) {
      return { name: 'node_modules', passed: true, message: 'installed via npm install' };
    }
  }
  return {
    name: 'node_modules',
    passed: false,
    message: 'not found',
    fixHint: 'Dependencies are not installed',
    fixCommand: 'npm install',
  };
}

function isPkgAvailable(dep: string): boolean {
  const nmDir = path.join(process.cwd(), 'node_modules');
  const parts = dep.split('/');
  const checkDir = parts[0].startsWith('@') ? path.join(nmDir, parts[0], parts[1]) : path.join(nmDir, parts[0]);
  if (!fs.existsSync(checkDir)) return false;
  const pkgJson = path.join(checkDir, 'package.json');
  if (!fs.existsSync(pkgJson)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  return !!pkg.name;
}

function checkCoreDeps(fix: boolean): CheckResult {
  const required = ['@typecad/pcb', 'tsx'];
  let missing = required.filter((dep) => !isPkgAvailable(dep));

  if (missing.length === 0) {
    return { name: 'Core dependencies', passed: true, message: required.join(', ') };
  }

  // The fix must respect create's pinned line, not `latest`: bare
  // `npm install @typecad/pcb` resolves to whatever `latest` is. See core-deps.ts.
  let pkg: unknown = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  } catch {
    // unparseable/absent package.json — coreDepsFix falls back to create's line
  }
  const fixInfo = coreDepsFix(missing, pkg);
  const fixCommand = `npm install ${fixInfo.args.join(' ')}`;

  if (fix) {
    runQuiet(fixCommand);
    missing = required.filter((dep) => !isPkgAvailable(dep));
    if (missing.length === 0) {
      return { name: 'Core dependencies', passed: true, message: `installed via ${fixCommand}` };
    }
  }

  const legacyHint = fixInfo.legacy.length
    ? `\n    package.json still depends on ${fixInfo.legacy.join(', ')} — these were renamed/merged into @typecad/pcb. Remove them and depend on @typecad/pcb instead.`
    : '';

  return {
    name: 'Core dependencies',
    passed: false,
    message: `missing: ${missing.join(', ')}`,
    fixHint: `Install missing dependencies${legacyHint}`,
    fixCommand,
  };
}

function checkConfig(): CheckResult {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'typecad.conf.ts'),
    path.join(cwd, 'typecad.conf.js'),
    path.join(cwd, 'typecad.json'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { name: 'Config file', passed: true, message: path.basename(c) };
    }
  }

  return {
    name: 'Config file',
    passed: false,
    message: 'no typecad.conf.ts, typecad.conf.js, or typecad.json found',
    fixHint:
      'Create a config file. Example:\n  typecad.conf.ts:\n    import { defineConfig } from "@typecad/pcb";\n    export default defineConfig({ entry: "./src/project.ts" });',
  };
}

function checkEntryFile(): CheckResult {
  const configPath = [
    path.join(process.cwd(), 'typecad.conf.ts'),
    path.join(process.cwd(), 'typecad.conf.js'),
    path.join(process.cwd(), 'typecad.json'),
  ].find(fs.existsSync);

  let entry: string | undefined;

  if (configPath) {
    try {
      if (configPath.endsWith('.json')) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        entry = cfg.entry;
      } else {
        const raw = fs.readFileSync(configPath, 'utf8');
        const m = raw.match(/entry\s*[:=]\s*['"](.+?)['"]/);
        if (m) entry = m[1];
      }
    } catch {
      logger.debug('Failed to parse config file for entry');
    }
  }

  if (!entry) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      const buildScript = pkg.scripts?.build || '';
      const m = buildScript.match(/tsx\s+(.+)$/);
      if (m) entry = m[1];
    } catch {
      logger.debug('Failed to parse package.json for entry');
    }
  }

  if (!entry) {
    try {
      const srcDir = path.join(process.cwd(), 'src');
      const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
      if (files.length === 1) entry = `./src/${files[0]}`;
    } catch {
      logger.debug('Failed to read src directory for entry');
    }
  }

  if (!entry) {
    return {
      name: 'Entry file',
      passed: false,
      message: 'could not detect an entry file',
      fixHint: 'Set "entry" in typecad.conf.ts (e.g. { entry: "./src/main.ts" })',
    };
  }

  const resolved = path.resolve(process.cwd(), entry);
  if (fs.existsSync(resolved)) {
    return { name: 'Entry file', passed: true, message: entry };
  }

  return {
    name: 'Entry file',
    passed: false,
    message: `${entry} not found`,
    fixHint: 'Make sure the entry path in your config points to an existing .ts file',
  };
}

function getKicadVersion(): string | null {
  try {
    const instance = KiCAD.instance;
    if (instance.isFlatpak) {
      const out = runQuiet('flatpak run --command=kicad-cli org.kicad.KiCad version');
      if (!out) return null;
      return out.match(/version\s+v?(\d+(?:\.\d+)*)/i)?.[1] ?? out.match(/v?(\d+(?:\.\d+)+)/)?.[1] ?? null;
    }
    const out = runQuiet(`"${instance.cliPath}" version`);
    if (!out) return null;
    const m = out.match(/version\s+v?(\d+(?:\.\d+)*)/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function checkKiCadCli(): CheckResult {
  try {
    const instance = KiCAD.instance;
    const ver = getKicadVersion();

    if (ver && !semverGte(ver, '10.0.0')) {
      return {
        name: 'kicad-cli',
        passed: false,
        message: `${instance.cliPath} (v${ver}) — version 10+ required`,
        fixHint: 'Upgrade KiCad to version 10 or later from https://www.kicad.org/download/',
      };
    }

    const label = instance.isFlatpak ? 'Flatpak installation detected' : instance.cliPath;

    return { name: 'kicad-cli', passed: true, message: label + (ver ? ` (v${ver})` : '') };
  } catch {
    return {
      name: 'kicad-cli',
      passed: false,
      message: 'not found',
      fixHint:
        'Install KiCad from https://www.kicad.org/download/\n' +
        '  Windows: winget install KiCad.KiCad\n' +
        '  macOS:   brew install --cask kicad\n' +
        '  Linux:   sudo apt install kicad  (or equivalent for your distro)\n' +
        '  Or set kicad_cli in typecad.conf.ts to the full path of kicad-cli',
    };
  }
}

function checkKiCadSymbols(): CheckResult {
  try {
    const instance = KiCAD.instance;
    const symbolsPath = instance.getSymbolsPath();
    if (!symbolsPath || !fs.existsSync(symbolsPath)) {
      return {
        name: 'KiCad symbol libraries',
        passed: false,
        message: 'symbol library directory not found',
        fixHint: 'Ensure KiCad is installed with symbol libraries. Reinstall KiCad if needed.',
      };
    }
    const files = fs.readdirSync(symbolsPath).filter((f) => f.endsWith('.kicad_sym'));
    return {
      name: 'KiCad symbol libraries',
      passed: files.length > 0,
      message:
        files.length > 0
          ? `${files.length} .kicad_sym files in ${symbolsPath}`
          : `no .kicad_sym files found in ${symbolsPath}`,
      fixHint: files.length > 0 ? undefined : 'KiCad symbol libraries appear empty. Reinstall KiCad.',
    };
  } catch {
    return {
      name: 'KiCad symbol libraries',
      passed: false,
      message: 'could not check (KiCad not detected)',
      fixHint: 'Fix the kicad-cli issue first',
    };
  }
}

function checkKiCadFootprints(): CheckResult {
  try {
    const instance = KiCAD.instance;
    const libPaths = instance.getLibraryPaths();
    const footprintsPath = libPaths.footprints;
    if (!footprintsPath || !fs.existsSync(footprintsPath)) {
      return {
        name: 'KiCad footprint libraries',
        passed: false,
        message: 'footprint library directory not found',
        fixHint: 'Ensure KiCad is installed with footprint libraries. Reinstall KiCad if needed.',
      };
    }
    const files = fs.readdirSync(footprintsPath).filter((f) => f.endsWith('.pretty') || f.endsWith('.kicad_mod'));
    return {
      name: 'KiCad footprint libraries',
      passed: files.length > 0,
      message:
        files.length > 0
          ? `${files.length} libraries in ${footprintsPath}`
          : `no footprint libraries found in ${footprintsPath}`,
      fixHint: files.length > 0 ? undefined : 'KiCad footprint libraries appear empty. Reinstall KiCad.',
    };
  } catch {
    return {
      name: 'KiCad footprint libraries',
      passed: false,
      message: 'could not check (KiCad not detected)',
      fixHint: 'Fix the kicad-cli issue first',
    };
  }
}

function checkNgspice(): CheckResult {
  const isWindows = platform() === 'win32';
  const foundNgspice = findExecutable('ngspice');
  const foundNgspiceCon = isWindows ? findExecutable('ngspice_con') : undefined;

  if (isWindows) {
    if (foundNgspice && foundNgspiceCon) {
      return { name: 'ngspice', passed: true, message: `ngspice: ${foundNgspice}, ngspice_con: ${foundNgspiceCon}` };
    }
    if (foundNgspice) {
      return {
        name: 'ngspice',
        passed: true,
        message: foundNgspice,
        fixHint: 'ngspice_con not found — DC analysis (.op) requires ngspice_con.exe in PATH',
      };
    }
    if (foundNgspiceCon) {
      return {
        name: 'ngspice',
        passed: true,
        message: `ngspice_con: ${foundNgspiceCon}`,
        fixHint: 'ngspice not found — transient analysis (.tran) requires ngspice.exe in PATH',
      };
    }
  } else {
    if (foundNgspice) {
      return { name: 'ngspice', passed: true, message: foundNgspice };
    }
  }

  return {
    name: 'ngspice',
    passed: true,
    message: 'not found (optional — needed for spice simulation)',
    fixHint:
      'Install ngspice from https://ngspice.org/\n' +
      '  Windows: winget install ngspice\n' +
      '  macOS:   brew install ngspice\n' +
      '  Linux:   sudo apt install ngspice  (or equivalent for your distro)',
  };
}

function checkGit(): CheckResult {
  const version = runQuiet('git --version');
  if (version) {
    return { name: 'Git', passed: true, message: version.replace('git version ', '') };
  }
  return {
    name: 'Git',
    passed: false,
    message: 'not found',
    fixHint:
      'Install Git from https://git-scm.com/downloads\n' +
      '  Windows: winget install Git.Git\n' +
      '  macOS:   brew install git\n' +
      '  Linux:   sudo apt install git  (or equivalent)',
  };
}

function checkBuildDir(): CheckResult {
  const buildPath = path.join(process.cwd(), 'build');
  if (!fs.existsSync(buildPath)) {
    return {
      name: 'build/ directory',
      passed: false,
      message: 'not found',
      fixHint: 'Run your project first to generate KiCad output files: typecad-pcb build',
    };
  }

  const kicadFiles = fs.readdirSync(buildPath).filter((f) => f.endsWith('.kicad_pcb') || f.endsWith('.kicad_pro'));

  if (kicadFiles.length > 0) {
    return { name: 'build/ directory', passed: true, message: `contains ${kicadFiles.join(', ')}` };
  }

  return {
    name: 'build/ directory',
    passed: false,
    message: 'exists but contains no .kicad_pcb or .kicad_pro files',
    fixHint: 'Run your project to generate KiCad output: typecad-pcb build',
  };
}

function printResults(results: CheckResult[]): void {
  logger.log(chalk.white.bold('typecad-pcb doctor') + ' - Checking your environment...\n');

  const failures: CheckResult[] = [];

  for (const r of results) {
    const icon = r.passed ? chalk.green('✔') : chalk.red('✖');
    logger.log(`  ${icon} ${chalk.bold(r.name)}: ${r.message}`);
    if (!r.passed && r.fixHint) {
      failures.push(r);
    }
  }

  logger.log('');

  if (failures.length > 0) {
    logger.log(chalk.yellow(`${failures.length} problem(s) found:\n`));
    for (const f of failures) {
      logger.log(chalk.bold(`  ${f.name}:`));
      for (const line of f.fixHint!.split('\n')) {
        logger.log(chalk.gray(`    ${line}`));
      }
      if (f.fixCommand) {
        logger.log(chalk.cyan(`    Fix: ${f.fixCommand}`));
      }
      logger.log('');
    }
    logger.log(chalk.gray("Run 'typecad-pcb doctor --fix' to attempt automatic fixes.\n"));
  } else {
    logger.log(chalk.green('All checks passed. Your environment looks good.\n'));
  }
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const fix = parsed.args['fix'] === true;
  const json = parsed.json;

  const results: CheckResult[] = [
    checkNodeVersion(),
    checkNpm(),
    checkPackageJson(),
    checkNodeModules(fix),
    checkCoreDeps(fix),
    checkCliLine(),
    checkConfig(),
    checkEntryFile(),
    checkKiCadCli(),
    checkKiCadSymbols(),
    checkKiCadFootprints(),

    checkNgspice(),
    checkGit(),
    checkBuildDir(),
  ];

  if (json) {
    logger.log(
      JSON.stringify(
        {
          checks: results,
          problems: results.filter((r) => !r.passed).length,
        },
        null,
        2,
      ),
    );
  } else {
    printResults(results);
  }

  if (results.some((r) => !r.passed)) {
    throw new Error('Environment check failed. See above for details.');
  }
}
