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
  /**
   * Path to a JSON design-constraints file (board rules, net classes, net
   * assignments, DRC severities), relative to this conf file. See
   * {@link TypeCADRulesFile}. This is the single constraint source for DRC —
   * both the native engine and kicad-cli read the values it produces.
   */
  rules?: string;
  [key: string]: unknown;
}

/**
 * Shape of the constraints JSON referenced by `rules` in the conf. All
 * lengths in millimeters. Precedence: JLCPCB standard defaults ← this file
 * ← `new PCB(name, { rules })` / `pcb.netClass()` calls in code (code wins
 * per key; a code-defined class replaces the file's class of the same name).
 */
export interface TypeCADRulesFile {
  /** Board-wide design rules — `IPcbRules` keys (min_clearance, …). */
  rules?: Record<string, number>;
  /** Net classes by name — `INetClassOptions` keys (track_width, …). */
  netClasses?: Record<string, Record<string, number>>;
  /** Net name → class name. Nets are matched by name at board creation. */
  assignments?: Record<string, string>;
  /** DRC check → severity. Keys are KiCad check ids (e.g. `silk_overlap`). */
  severities?: Record<string, 'error' | 'warning' | 'ignore'>;
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
  _cachedRulesPath = null;
  _cachedRulesMtimeMs = undefined;
  _cachedRules = null;
}

// ---------------------------------------------------------------------------
// constraints JSON (conf `rules` field)
// ---------------------------------------------------------------------------

let _cachedRules: TypeCADRulesFile | null = null;
let _cachedRulesPath: string | null = null;
let _cachedRulesMtimeMs: number | undefined;

const SEVERITY_VALUES = new Set(['error', 'warning', 'ignore']);

/**
 * Load and validate the constraints JSON referenced by `rules` in the conf.
 * Returns null when the conf carries no `rules` path. Malformed files throw
 * with the offending key named — a constraints file feeds fabrication
 * checks and must fail the build loudly, not silently.
 */
export function loadRulesConfig(): TypeCADRulesFile | null {
  const conf = loadConfig();
  const rel = conf.rules;
  if (rel === undefined || rel === null || rel === '') return null;
  if (typeof rel !== 'string') {
    throw new TypeError(`typecad.conf: "rules" must be a path string, got ${typeof rel}`);
  }
  const confDir = _cachedConfigPath ? path.dirname(_cachedConfigPath) : process.cwd();
  const rulesPath = path.isAbsolute(rel) ? rel : path.join(confDir, rel);

  const mtime = getMtimeMs(rulesPath);
  if (_cachedRules && _cachedRulesPath === rulesPath && mtime === _cachedRulesMtimeMs) {
    return _cachedRules;
  }

  if (!fs.existsSync(rulesPath)) {
    throw new Error(`rules file not found: ${rulesPath} (conf "rules": ${rel})`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`rules file ${rulesPath} is not valid JSON: ${msg}`);
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new Error(`rules file ${rulesPath}: top level must be an object`);
  }
  const file = doc as Record<string, unknown>;
  const out: TypeCADRulesFile = {};
  for (const key of Object.keys(file)) {
    const value = file[key];
    switch (key) {
      case 'rules':
      case 'netClasses':
      case 'assignments':
      case 'severities':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new Error(`rules file ${rulesPath}: "${key}" must be an object`);
        }
        break;
      default:
        throw new Error(
          `rules file ${rulesPath}: unknown key "${key}" (expected rules, netClasses, assignments, severities)`,
        );
    }
  }
  if (file.rules) {
    out.rules = {};
    for (const [rk, rv] of Object.entries(file.rules as Record<string, unknown>)) {
      if (typeof rv !== 'number' || !Number.isFinite(rv) || rv <= 0) {
        throw new Error(`rules file ${rulesPath}: rules."${rk}" must be a positive number (mm), got ${JSON.stringify(rv)}`);
      }
      out.rules[rk] = rv;
    }
  }
  if (file.netClasses) {
    out.netClasses = {};
    for (const [cn, cv] of Object.entries(file.netClasses as Record<string, unknown>)) {
      if (typeof cv !== 'object' || cv === null || Array.isArray(cv)) {
        throw new Error(`rules file ${rulesPath}: netClasses."${cn}" must be an object`);
      }
      const dims: Record<string, number> = {};
      for (const [dk, dv] of Object.entries(cv as Record<string, unknown>)) {
        if (typeof dv !== 'number' || !Number.isFinite(dv) || dv <= 0) {
          throw new Error(`rules file ${rulesPath}: netClasses."${cn}"."${dk}" must be a positive number (mm), got ${JSON.stringify(dv)}`);
        }
        dims[dk] = dv;
      }
      out.netClasses[cn] = dims;
    }
  }
  if (file.assignments) {
    out.assignments = {};
    for (const [net, cls] of Object.entries(file.assignments as Record<string, unknown>)) {
      if (typeof cls !== 'string' || cls === '') {
        throw new Error(`rules file ${rulesPath}: assignments."${net}" must be a net-class name string`);
      }
      out.assignments[net] = cls;
    }
  }
  if (file.severities) {
    out.severities = {};
    for (const [check, sev] of Object.entries(file.severities as Record<string, unknown>)) {
      if (typeof sev !== 'string' || !SEVERITY_VALUES.has(sev)) {
        throw new Error(
          `rules file ${rulesPath}: severities."${check}" must be one of error|warning|ignore, got ${JSON.stringify(sev)}`,
        );
      }
      out.severities[check as keyof typeof out.severities & string] = sev as 'error' | 'warning' | 'ignore';
    }
  }
  _cachedRules = out;
  _cachedRulesPath = rulesPath;
  _cachedRulesMtimeMs = mtime;
  return out;
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
