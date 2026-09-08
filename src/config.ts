import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import logger from './utils/logging.js';
import { parse } from 'acorn';
import { simple as walk } from 'acorn-walk';
import type {
  Node,
  ObjectExpression,
  Literal,
  TemplateLiteral,
  ExportDefaultDeclaration as ExportDefaultDeclarationNode,
} from 'acorn';

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
let _cachedConfigPath: string | null = null;
let _cachedMtimeMs: number | undefined;

function getMtimeMs(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (err) {
    logger.debug('config: failed to stat file:', filePath, err);
    return undefined;
  }
}

function findConfigPath(): string | null {
  const cwd = process.cwd();
  const candidates = [path.join(cwd, 'typecad.conf.ts'), path.join(cwd, 'typecad.conf.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function extractObjectValue(node: ObjectExpression): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue;
    const keyNode = prop.key;
    if (keyNode.type !== 'Identifier') continue;
    obj[keyNode.name] = extractValue(prop.value);
  }
  return obj;
}

function extractValue(node: Node): unknown {
  switch (node.type) {
    case 'Literal':
      return (node as Literal).value;
    case 'TemplateLiteral': {
      const tl = node as TemplateLiteral;
      if (tl.quasis.length === 1 && tl.expressions.length === 0) {
        return tl.quasis[0].value.cooked;
      }
      return undefined;
    }
    case 'ObjectExpression':
      return extractObjectValue(node as ObjectExpression);
    case 'Identifier':
      return undefined;
    default:
      return undefined;
  }
}

function loadTsConfig(configPath: string): TypeCADConfig {
  try {
    const source = fs.readFileSync(configPath, 'utf8');
    const ast = parse(source, {
      ecmaVersion: 2022,
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
    });

    let configObj: Record<string, unknown> | undefined;

    walk(ast, {
      ExportDefaultDeclaration(node: Node) {
        const decl = (node as ExportDefaultDeclarationNode).declaration;
        if (!decl) return;

        let arg: Node | undefined;
        if (decl.type === 'CallExpression' && decl.arguments.length > 0) {
          arg = decl.arguments[0] as Node;
        } else if (decl.type === 'ObjectExpression') {
          arg = decl;
        }

        if (arg && arg.type === 'ObjectExpression') {
          configObj = extractObjectValue(arg as ObjectExpression);
        }
      },
    });

    return configObj || {};
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot load ${path.basename(configPath)}: ${msg}. Fix or delete the file.`);
  }
}

function invalidateIfStale(): void {
  if (!_cachedConfig || !_cachedConfigPath) {
    return;
  }

  if (!fs.existsSync(_cachedConfigPath)) {
    _cachedConfig = null;
    _cachedConfigPath = null;
    _cachedMtimeMs = undefined;
    return;
  }

  const currentMtime = getMtimeMs(_cachedConfigPath);
  if (currentMtime !== _cachedMtimeMs) {
    _cachedConfig = null;
    _cachedConfigPath = null;
    _cachedMtimeMs = undefined;
  }
}

export function loadConfig(): TypeCADConfig {
  invalidateIfStale();
  if (_cachedConfig) return _cachedConfig;

  const confPath = findConfigPath();
  if (confPath) {
    _cachedConfigPath = confPath;
    _cachedMtimeMs = getMtimeMs(confPath);
    try {
      _cachedConfig = loadTsConfig(confPath);
    } catch (err) {
      logger.error(chalk.red.bold(err instanceof Error ? err.message : String(err)));
      throw err;
    }
    return _cachedConfig!;
  }

  const jsonPath = path.join(process.cwd(), 'typecad.json');
  if (fs.existsSync(jsonPath)) {
    _cachedConfigPath = jsonPath;
    _cachedMtimeMs = getMtimeMs(jsonPath);
    try {
      _cachedConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return _cachedConfig!;
    } catch (err) {
      logger.error(chalk.red.bold('ERROR: cannot read/process typecad.json. Try editing or deleting the file.'), err);
    }
  }

  _cachedConfig = {};
  return _cachedConfig!;
}

/**
 * Must be called between test cases that change the working directory or config file.
 */
export function clearConfigCache(): void {
  _cachedConfig = null;
  _cachedConfigPath = null;
  _cachedMtimeMs = undefined;
}

export class Config {
  get(key: string): string {
    const config = loadConfig();
    const value = (config as Record<string, unknown>)[key];
    if (value === undefined || value === null) return '';
    return String(value);
  }

  set(key: string, value: string): boolean {
    const tsPath = path.join(process.cwd(), 'typecad.conf.ts');
    if (fs.existsSync(tsPath)) {
      logger.warn(
        chalk.yellow(
          'WARNING: typecad.conf.ts exists and takes priority over typecad.json. ' +
            'Edit typecad.conf.ts directly, or delete it to use typecad.json.',
        ),
      );
    }

    const jsonPath = path.join(process.cwd(), 'typecad.json');

    let contents: Record<string, string> = {};
    if (fs.existsSync(jsonPath)) {
      try {
        contents = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } catch (err) {
        logger.debug('config: failed to parse typecad.json', err);
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
