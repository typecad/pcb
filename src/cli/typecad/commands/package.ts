import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { execFileSync } from 'node:child_process';
import { findExecutable } from '../../../kicad.js';
import logger from '../../../utils/logging.js';
import type { ParsedArgs } from '../parser.js';

interface NpmPackage {
  name: string;
  version: string;
  description?: string;
}

interface NpmSearchResponse {
  objects: Array<{ package: NpmPackage }>;
  total: number;
}

const IS_WIN = process.platform === 'win32';
const IS_CMD_EXT = /\.(?:cmd|bat)$/i;

function runSync(command: string, args: string[], cwd?: string): void {
  const resolved = findExecutable(command);
  if (IS_WIN && (!resolved || IS_CMD_EXT.test(resolved))) {
    execFileSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
      cwd,
      stdio: 'pipe',
      timeout: 120_000,
    });
  } else {
    execFileSync(resolved ?? command, args, {
      cwd,
      stdio: 'pipe',
      timeout: 120_000,
    });
  }
}

function findProjectPackageJson(): string | null {
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

function getInstalledDeps(pkgPath: string): Map<string, string> {
  const result = new Map<string, string>();
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      const deps = pkg[section];
      if (deps && typeof deps === 'object') {
        for (const [name, version] of Object.entries(deps)) {
          if (typeof version === 'string') {
            result.set(name, version);
          }
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return result;
}

async function fetchTypecadPackages(): Promise<NpmPackage[]> {
  const url = 'https://registry.npmjs.org/-/v1/search?text=scope:typecad+keywords:typecad-package&size=250';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as NpmSearchResponse;
  return data.objects.map((o) => o.package);
}

function stripVersionPrefix(v: string): string {
  return v.replace(/^[^0-9]*/, '');
}

async function runInteractive(packages: NpmPackage[], installed: Map<string, string>, pkgDir: string): Promise<void> {
  const { checkbox } = await import('@inquirer/prompts');

  const choices = packages.map((pkg) => {
    const installedVersion = installed.get(pkg.name);
    if (installedVersion) {
      const installedClean = stripVersionPrefix(installedVersion);
      if (installedClean === pkg.version) {
        return {
          value: pkg.name,
          name: chalk.gray(`${pkg.name} - ${pkg.description ?? 'No description'} (installed)`),
          disabled: 'already installed',
        };
      }
      return {
        value: pkg.name,
        name: `${pkg.name} - ${pkg.description ?? 'No description'} (installed v${installedClean}, latest v${pkg.version} → update)`,
        checked: false,
      };
    }
    return {
      value: pkg.name,
      name: `${pkg.name} - ${pkg.description ?? 'No description'} (${pkg.version})`,
      checked: false,
    };
  });

  const selected = await checkbox({
    message: 'Select packages to install:',
    choices,
  });

  if (selected.length === 0) {
    logger.log(chalk.yellow('No packages selected.'));
    return;
  }

  installPackages(selected, pkgDir);
}

function installPackages(names: string[], cwd: string): void {
  logger.log(chalk.green('+'), `Installing ${names.join(', ')}...`);
  try {
    runSync('npm', ['i', ...names], cwd);
  } catch (e: unknown) {
    const err = e as { stderr?: { toString(): string } };
    const detail = err.stderr?.toString().trim() || (e instanceof Error ? e.message : String(e));
    throw new Error(`Failed to install packages: ${detail}`);
  }
  for (const name of names) {
    logger.log(chalk.green('+'), `${name}`);
    logger.log(chalk.gray(`  https://www.npmjs.com/package/${name}`));
  }
  logger.log(chalk.green('✔'), 'Done');
}

export async function run(parsed: ParsedArgs): Promise<void> {
  logger.log(chalk.green('+') + ' ' + chalk.white.bold('typecad-pcb package') + ' - Browse and install typeCAD packages\n');

  const pkgPath = findProjectPackageJson();
  const pkgDir = pkgPath ? path.dirname(pkgPath) : process.cwd();
  const installed = pkgPath ? getInstalledDeps(pkgPath) : new Map<string, string>();

  if (parsed.json) {
    const packages = await fetchTypecadPackages();
    const result = packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description ?? null,
      installed: installed.has(pkg.name),
      installedVersion: installed.get(pkg.name) ?? null,
    }));
    logger.log(JSON.stringify(result, null, 2));
    return;
  }

  let packages: NpmPackage[];
  try {
    packages = await fetchTypecadPackages();
  } catch (e) {
    throw new Error(`Failed to fetch packages from npm: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (packages.length === 0) {
    logger.log(chalk.yellow('No typeCAD packages found on npm.'));
    return;
  }

  await runInteractive(packages, installed, pkgDir);
}
