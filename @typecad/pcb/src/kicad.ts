import fs, { existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import { arch, platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import logger from './utils/logging.js';
import { Config } from './config.js';
import { execSync } from 'node:child_process';
import { KiCadNotFoundError } from './utils/errors.js';

let _conf: Config | null = null;
function getConfig(): Config {
  if (!_conf) _conf = new Config();
  return _conf;
}

export function findExecutable(name: string): string | undefined {
  const pathEnv = process.env.PATH?.split(platform() === 'win32' ? ';' : ':') ?? [];
  const exts = platform() === 'win32' ? (process.env.PATHEXT?.split(';') ?? ['.exe']) : [''];
  for (const dir of pathEnv) {
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

export interface KiCADDetection {
  path?: string;
  cliPath: string;
  isFlatpak: boolean;
}

function detectFlatpak(): boolean {
  if (
    fs.existsSync('/var/lib/flatpak/app/org.kicad.KiCad') ||
    fs.existsSync('/var/lib/flatpak/runtime/org.kicad.KiCad.Library.Symbols')
  ) {
    return true;
  }
  try {
    execSync('flatpak info org.kicad.KiCad', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function resolveFlatpakPath(): string | undefined {
  const candidates = [
    '/var/lib/flatpak/app/org.kicad.KiCad/current',
    ...globFlatpakActive('/var/lib/flatpak/app/org.kicad.KiCad'),
  ];

  const runtimeSymbols = resolveFlatpakLibraryPaths().symbols;
  if (runtimeSymbols) return runtimeSymbols;

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

function globFlatpakActive(base: string): string[] {
  try {
    if (!existsSync(base)) return [];
    const archDir = join(base, mapNodeArch());
    if (!existsSync(archDir)) return [];
    const results: string[] = [];
    for (const branch of readdirSync(archDir)) {
      const active = join(archDir, branch, 'active');
      if (existsSync(active)) results.push(active);
    }
    return results;
  } catch {
    return [];
  }
}

export function discoverKiCAD(): KiCADDetection {
  const configCli = getConfig().get('kicad_cli');
  const configPath = getConfig().get('kicad_path');

  if (configCli) {
    return { path: configPath, cliPath: configCli, isFlatpak: false };
  }

  let isFlatpak = getConfig().get('use_flatpak') === 'true' || getConfig().get('use_flatpak') === '1';

  let resolvedPath: string | undefined = configPath || undefined;

  if (isFlatpak || !resolvedPath) {
    isFlatpak = detectFlatpak() || isFlatpak;
  }

  if (isFlatpak && !resolvedPath) {
    resolvedPath = resolveFlatpakPath();
  }

  if (!resolvedPath) {
    const nativePaths = [
      'C:/Program Files/KiCad/10.0/',
      '/usr/share/kicad/',
      '/Applications/KiCAD/KiCad.app/Contents/ShareSupport/',
    ];
    if (configPath) nativePaths.push(configPath);

    for (const p of nativePaths) {
      if (p && existsSync(p)) {
        resolvedPath = p;
        break;
      }
    }
  }

  let cliPath: string | undefined;
  if (isFlatpak) {
    cliPath = 'flatpak run --command=kicad-cli org.kicad.KiCad';
  } else if (resolvedPath) {
    if (platform() === 'win32') {
      cliPath = resolvedPath + 'bin/kicad-cli.exe';
    } else {
      cliPath = findExecutable('kicad-cli');
    }
  }

  if (!cliPath) {
    throw new KiCadNotFoundError('KiCad CLI not found. Install KiCad or set kicad_cli in typecad.conf.ts.');
  }

  return { path: resolvedPath, cliPath, isFlatpak };
}

function mapNodeArch(): string {
  const a = arch();
  if (a === 'x64') return 'x86_64';
  if (a === 'arm64') return 'aarch64';
  return a;
}

function resolveFlatpakLibraryPaths(): { symbols: string; footprints: string } {
  const flatpakArch = mapNodeArch();
  const candidates = [
    { runtime: 'org.kicad.KiCad.Library.Symbols', sub: 'symbols' },
    { runtime: 'org.kicad.KiCad.Library.Footprints', sub: 'footprints' },
  ];

  const result: { symbols: string; footprints: string } = { symbols: '', footprints: '' };

  for (const { runtime, sub } of candidates) {
    const runtimeBase = `/var/lib/flatpak/runtime/${runtime}`;
    if (!existsSync(runtimeBase)) continue;

    try {
      const archDir = join(runtimeBase, flatpakArch);
      if (!existsSync(archDir)) continue;

      const branches = readdirSync(archDir);
      for (const branch of branches) {
        const activePath = join(archDir, branch, 'active', 'files', sub);
        if (existsSync(activePath)) {
          result[sub as 'symbols' | 'footprints'] = activePath;
          break;
        }
      }
    } catch {
      logger.debug(`kicad: failed to scan flatpak runtime ${runtime}`);
    }
  }

  return result;
}

export class KiCAD {
  readonly path?: string;
  readonly cliPath: string;
  readonly isFlatpak: boolean;

  private static _instance: KiCAD | null = null;

  constructor(detection: KiCADDetection) {
    this.path = detection.path;
    this.cliPath = detection.cliPath;
    this.isFlatpak = detection.isFlatpak;
  }

  static get instance(): KiCAD {
    if (!KiCAD._instance) {
      KiCAD._instance = new KiCAD(discoverKiCAD());
    }
    return KiCAD._instance;
  }

  static resetInstance(): void {
    KiCAD._instance = null;
  }

  static get path(): string | undefined {
    return KiCAD.instance.path;
  }

  static get cliPath(): string | undefined {
    return KiCAD.instance.cliPath;
  }

  static get isFlatpak(): boolean {
    return KiCAD.instance.isFlatpak;
  }

  isFlatpakInstallation(): boolean {
    return this.isFlatpak;
  }

  getLibraryPaths(): { symbols: string; footprints: string } {
    const result: { symbols: string; footprints: string } = { symbols: '', footprints: '' };

    if (this.isFlatpak) {
      const flatpakPaths = resolveFlatpakLibraryPaths();
      if (flatpakPaths.symbols) result.symbols = flatpakPaths.symbols;
      if (flatpakPaths.footprints) result.footprints = flatpakPaths.footprints;
      if (result.symbols && result.footprints) return result;
    }

    if (this.path) {
      const suffixes =
        platform() === 'win32'
          ? { symbols: 'share/kicad/symbols', footprints: 'share/kicad/footprints' }
          : { symbols: 'symbols', footprints: 'footprints' };
      if (!result.symbols) result.symbols = join(this.path, suffixes.symbols);
      if (!result.footprints) result.footprints = join(this.path, suffixes.footprints);
    }

    if (!result.symbols || !result.footprints) {
      const flatpakPaths = resolveFlatpakLibraryPaths();
      if (!result.symbols && flatpakPaths.symbols) result.symbols = flatpakPaths.symbols;
      if (!result.footprints && flatpakPaths.footprints) result.footprints = flatpakPaths.footprints;
    }

    return result;
  }

  private findSymbolsDirectory(): string | undefined {
    const subpaths = ['share/kicad/symbols', 'symbols', 'share/symbols'];
    for (const subpath of subpaths) {
      const symbolsPath = join(this.path ?? '', subpath);
      try {
        if (existsSync(symbolsPath) && statSync(symbolsPath).isDirectory()) {
          return symbolsPath;
        }
      } catch (err) {
        logger.debug('kicad: path stat failed for', symbolsPath, err);
      }
    }
    return undefined;
  }

  getSymbolsPath(): string | undefined {
    const libraryPaths = this.getLibraryPaths();
    if (libraryPaths.symbols && existsSync(libraryPaths.symbols)) {
      return libraryPaths.symbols;
    }
    return this.findSymbolsDirectory();
  }

  hasLocalSymbols(): boolean {
    const symbolsPath = this.getSymbolsPath();
    if (!symbolsPath) return false;
    try {
      const files = readdirSync(symbolsPath);
      return files.some((file) => file.endsWith('.kicad_sym'));
    } catch (err) {
      logger.debug('kicad: hasLocalSymbols failed for', symbolsPath, err);
      return false;
    }
  }
}

let _flatpakTempDir: string | undefined;

export function resetFlatpakTempDir(): void {
  _flatpakTempDir = undefined;
}

export function getFlatpakSafeTempDir(): string {
  if (!KiCAD.isFlatpak) return tmpdir();
  if (_flatpakTempDir) return _flatpakTempDir;
  const cacheDir = join(process.env.XDG_CACHE_HOME || join(process.env.HOME || tmpdir(), '.cache'), 'typecad', 'tmp');
  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
  } catch {
    return tmpdir();
  }
  _flatpakTempDir = cacheDir;
  return cacheDir;
}

/** Backward-compatible export. Prefer {@link KiCAD.cliPath} for new code. */
export let kicad_cli_path: string | undefined;

export function getKicadCliPath(): string | undefined {
  return KiCAD.cliPath;
}
