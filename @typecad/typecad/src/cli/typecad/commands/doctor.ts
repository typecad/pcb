import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { findExecutable } from '../../../kicad.js';
import { KiCAD } from '../../../kicad.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../logging.js';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  fixHint?: string;
  fixCommand?: string;
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
    message: ok
      ? `${version} (>= 18.0.0)`
      : `${version} is below the minimum 18.0.0`,
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
      fixHint: 'Run this command from a typeCAD project directory, or create one with: typecad create',
    };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const isModule = pkg.type === 'module';
    return {
      name: 'package.json',
      passed: isModule,
      message: isModule
        ? 'found (type: module)'
        : 'found but "type" is not set to "module"',
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

function checkCoreDeps(): CheckResult {
  const required = ['@typecad/typecad', '@typecad/passives', 'tsx'];
  const missing: string[] = [];

  for (const dep of required) {
    try {
      const resolved = require.resolve(dep, { paths: [process.cwd()] });
      if (!fs.existsSync(resolved)) missing.push(dep);
    } catch {
      missing.push(dep);
    }
  }

  if (missing.length === 0) {
    return { name: 'Core dependencies', passed: true, message: required.join(', ') };
  }

  return {
    name: 'Core dependencies',
    passed: false,
    message: `missing: ${missing.join(', ')}`,
    fixHint: `Install missing dependencies`,
    fixCommand: `npm install ${missing.join(' ')}`,
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
    fixHint: 'Create a config file. Example:\n  typecad.conf.ts:\n    import { defineConfig } from "@typecad/typecad";\n    export default defineConfig({ entry: "./src/project.ts" });',
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
    } catch { logger.debug('Failed to parse config file for entry'); }
  }

  if (!entry) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      const buildScript = pkg.scripts?.build || '';
      const m = buildScript.match(/tsx\s+(.+)$/);
      if (m) entry = m[1];
    } catch { logger.debug('Failed to parse package.json for entry'); }
  }

  if (!entry) {
    try {
      const srcDir = path.join(process.cwd(), 'src');
      const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
      if (files.length === 1) entry = `./src/${files[0]}`;
    } catch { logger.debug('Failed to read src directory for entry'); }
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

function checkKiCadCli(): CheckResult {
  const configCli = runQuiet('node -e "try{const c=new(require(\'@typecad/typecad/dist/config.js\').Config)();logger.log(c.get(\'kicad_cli\'))}catch{}"');
  if (configCli && fs.existsSync(configCli)) {
    return { name: 'kicad-cli', passed: true, message: configCli };
  }

  const found = findExecutable('kicad-cli');
  if (found) {
    return { name: 'kicad-cli', passed: true, message: found };
  }

  const possiblePaths = [
    'C:/Program Files/KiCad/10.0/bin/kicad-cli.exe',
    'C:/Program Files/KiCad/9.0/bin/kicad-cli.exe',
    'C:/Program Files/KiCad/8.0/bin/kicad-cli.exe',
    'C:/Program Files/KiCad/7.0/bin/kicad-cli.exe',
    '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli',
    '/usr/local/bin/kicad-cli',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
    return {
      name: 'kicad-cli',
      passed: true,
      message: `found at ${p} but not in PATH — consider adding "${path.dirname(p)}" to PATH or setting kicad_cli in typecad.conf.ts`,
    };
    }
  }

  const isFlatpak = fs.existsSync('/var/lib/flatpak/app/org.kicad.kicad');
  if (isFlatpak) {
    const flatpakCheck = runQuiet('flatpak info org.kicad.KiCad');
    if (flatpakCheck !== null) {
      return { name: 'kicad-cli', passed: true, message: 'Flatpak installation detected' };
    }
  }

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
    const files = fs.readdirSync(symbolsPath).filter(f => f.endsWith('.kicad_sym'));
    return {
      name: 'KiCad symbol libraries',
      passed: files.length > 0,
      message: files.length > 0 ? `${files.length} .kicad_sym files in ${symbolsPath}` : `no .kicad_sym files found in ${symbolsPath}`,
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
    const files = fs.readdirSync(footprintsPath).filter(f => f.endsWith('.pretty') || f.endsWith('.kicad_mod'));
    return {
      name: 'KiCad footprint libraries',
      passed: files.length > 0,
      message: files.length > 0 ? `${files.length} libraries in ${footprintsPath}` : `no footprint libraries found in ${footprintsPath}`,
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

function checkArduinoCli(): CheckResult {
  const found = findExecutable('arduino-cli');
  if (found) {
    return { name: 'arduino-cli', passed: true, message: found };
  }

  const version = runQuiet('arduino-cli version');
  if (version) {
    return { name: 'arduino-cli', passed: true, message: 'detected' };
  }

  return {
    name: 'arduino-cli',
    passed: false,
    message: 'not found',
    fixHint:
      'Install arduino-cli from https://arduino.github.io/arduino-cli/latest/installation/\n' +
      '  Windows: winget install Arduino.ArduinoCLI\n' +
      '  macOS:   brew install arduino-cli\n' +
      '  Linux:   curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh',
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
      fixHint: 'Run your project first to generate KiCad output files: typecad build',
    };
  }

  const kicadFiles = fs.readdirSync(buildPath).filter(f =>
    f.endsWith('.kicad_pcb') || f.endsWith('.kicad_pro')
  );

  if (kicadFiles.length > 0) {
    return { name: 'build/ directory', passed: true, message: `contains ${kicadFiles.join(', ')}` };
  }

  return {
    name: 'build/ directory',
    passed: false,
    message: 'exists but contains no .kicad_pcb or .kicad_pro files',
    fixHint: 'Run your project to generate KiCad output: typecad build',
  };
}

function printResults(results: CheckResult[]): void {
  logger.log(chalk.white.bold('typecad doctor') + ' - Checking your environment...\n');

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
    logger.log(chalk.gray("Run 'typecad doctor --fix' to attempt automatic fixes.\n"));
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
    checkCoreDeps(),
    checkConfig(),
    checkEntryFile(),
    checkKiCadCli(),
    checkKiCadSymbols(),
    checkKiCadFootprints(),
    checkArduinoCli(),
    checkGit(),
    checkBuildDir(),
  ];

  if (json) {
    logger.log(JSON.stringify({
      checks: results,
      problems: results.filter(r => !r.passed).length,
    }, null, 2));
  } else {
    printResults(results);
  }

  if (results.some(r => !r.passed)) {
    throw new Error('Environment check failed. See above for details.');
  }
}
