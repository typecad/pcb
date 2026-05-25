import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import logger from './logging.js';

export interface TypeCADConfig {
  entry?: string;
  kicad_cli?: string;
  kicad_path?: string;
  use_flatpak?: boolean;
  verbose?: boolean;
  [key: string]: unknown;
}

export function defineConfig(config: TypeCADConfig): TypeCADConfig {
  return config;
}

let _cachedConfig: TypeCADConfig | null = null;

function findConfigPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'typecad.conf.ts'),
    path.join(cwd, 'typecad.conf.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadTsConfig(configPath: string): TypeCADConfig {
  const fileUrl = 'file:///' + configPath.replace(/\\/g, '/');
  const configDir = path.dirname(configPath);
  const loadCode = [
    `import('file://${configPath.replace(/\\/g, '/')}')`,
    `.then(m=>process.stdout.write(JSON.stringify(m.default??m)))`,
    `.catch(e=>{process.stderr.write(e.message||String(e));process.exit(1)})`,
  ].join('');

  try {
    const result = execSync(
      `npx tsx --conditions=import -e "${loadCode}"`,
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000, cwd: configDir }
    );
    const parsed = JSON.parse(result.toString());
    if (parsed && typeof parsed === 'object' && 'default' in parsed) {
      return parsed.default;
    }
    return parsed;
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error
      ? (error as { stderr: Buffer }).stderr?.toString().trim()
      : '';
    logger.error(
      chalk.red.bold(
        `ERROR: cannot load ${path.basename(configPath)}. ${stderr || 'Check for syntax errors.'}`
      )
    );
    return {};
  }
}

export function loadConfig(): TypeCADConfig {
  if (_cachedConfig) return _cachedConfig;

  const confPath = findConfigPath();
  if (confPath) {
    _cachedConfig = loadTsConfig(confPath);
    return _cachedConfig!;
  }

  const jsonPath = path.join(process.cwd(), 'typecad.json');
  if (fs.existsSync(jsonPath)) {
    try {
      _cachedConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return _cachedConfig!;
    } catch {
      logger.error(
        chalk.red.bold(
          'ERROR: cannot read/process typecad.json. Try editing or deleting the file.'
        )
      );
    }
  }

  _cachedConfig = {};
  return _cachedConfig!;
}

export function clearConfigCache(): void {
  _cachedConfig = null;
}

export class Config {
  get(key: string): string {
    const config = loadConfig();
    const value = (config as Record<string, unknown>)[key];
    if (value === undefined || value === null) return '';
    return String(value);
  }

  set(key: string, value: string): boolean {
    const jsonPath = path.join(process.cwd(), 'typecad.json');

    let contents: Record<string, string> = {};
    if (fs.existsSync(jsonPath)) {
      try {
        contents = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } catch {
        contents = {};
      }
    }

    contents[key] = value;

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(contents, null, 2));
    } catch (err) {
      logger.error(err);
      return false;
    }

    clearConfigCache();
    return true;
  }
}
