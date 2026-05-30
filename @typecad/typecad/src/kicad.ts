import fs, { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import process from 'node:process';
import { platform } from 'node:os';
import { join } from 'node:path';

import chalk from 'chalk';
import logger from './logging.js';
import { Config } from './config.js'
import { execSync } from 'node:child_process';
import { KiCadNotFoundError } from './errors.js';

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

function detectFlatpak(flatpak_paths: string[]): { detected: boolean; path?: string } {
    if (fs.existsSync('/var/lib/flatpak/app/org.kicad.kicad') ||
        fs.existsSync('/var/lib/flatpak/runtime/org.kicad.kicad.Library')) {

        for (const path of flatpak_paths) {
            const expandedPath = path.replace('*/', '*').replace('*', 'active');
            if (fs.existsSync(expandedPath)) {
                return { detected: true, path: expandedPath };
            }
        }

        const currentPath = '/var/lib/flatpak/app/org.kicad.kicad/current';
        if (fs.existsSync(currentPath)) {
            return { detected: true, path: currentPath };
        }

        return { detected: true };
    }

    try {
        execSync('flatpak info org.kicad.KiCad', { stdio: 'ignore' });
        return { detected: true };
    } catch (e: unknown) {
        logger.debug('kicad: flatpak not detected:', String(e));
        return { detected: false };
    }
}

export function discoverKiCAD(): KiCADDetection {
    const configCli = getConfig().get("kicad_cli");
    const configPath = getConfig().get("kicad_path");

    let cliPath: string | undefined = configCli;
    let path: string | undefined = configPath;

    if (cliPath) {
        return { path, cliPath, isFlatpak: false };
    }

    const useFlatpakConfig = getConfig().get("use_flatpak");
    let isFlatpak = false;
    if (useFlatpakConfig === "true" || useFlatpakConfig === "1") {
        isFlatpak = true;
    }

    const supported_paths: string[] = [
        'C:/Program Files/KiCad/10.0/',
        '/usr/share/kicad/',
        '/var/lib/flatpak/app/org.kicad.KiCad/current/',
        '/Applications/KiCAD/KiCad.app/Contents/ShareSupport/'
    ];

    const unsupported_paths: string[] = [
        'C:/Program Files/KiCad/9.0/',
        'C:/Program Files/KiCad/8.0/',
        'C:/Program Files/KiCad/7.0/',
    ];

    const flatpak_paths: string[] = [
        '/var/lib/flatpak/app/org.kicad.KiCad/',
        '/var/lib/flatpak/app/org.kicad.KiCad/*/active/',
        '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/'
    ];

    if (configPath) {
        supported_paths.push(configPath);
    }

    if (isFlatpak || !path) {
        const flatpakResult = detectFlatpak(flatpak_paths);
        if (flatpakResult.detected) {
            isFlatpak = true;
            if (flatpakResult.path) {
                path = flatpakResult.path;
            }
        }
    }

    if (!path) {
        for (const p of unsupported_paths) {
            if (p && fs.existsSync(p)) {
                logger.warn(chalk.yellow(`Warning: KiCad version at ${p} is unsupported. Only KiCad 10.x is supported.`));
                break;
            }
        }

        for (const p of supported_paths) {
            if (p && fs.existsSync(p)) {
                path = p;
                if (p.includes('flatpak')) {
                    isFlatpak = true;
                }
                break;
            }
        }
    }

    if (path) {
        if (isFlatpak) {
            cliPath = 'flatpak run --command=sh org.kicad.kicad -c "kicad-cli"';
        } else if (platform() == 'win32') {
            cliPath = path + 'bin/kicad-cli.exe';
        } else {
            cliPath = findExecutable('kicad-cli');
        }
    }

    if (!cliPath) {
        throw new KiCadNotFoundError('KiCad CLI not found. Install KiCad or set kicad_cli in typecad.conf.ts.');
    }

    return { path, cliPath, isFlatpak };
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

    getLibraryPaths(): { symbols: string, footprints: string } {
        if (this.isFlatpak) {
            return {
                symbols: '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/symbols',
                footprints: '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/footprints'
            };
        } else {
            if (platform() === 'win32') {
                return {
                    symbols: this.path ? this.path + 'share/kicad/symbols' : '',
                    footprints: this.path ? this.path + 'share/kicad/footprints' : ''
                };
            } else {
                return {
                    symbols: this.path ? this.path + 'symbols' : '',
                    footprints: this.path ? this.path + 'footprints' : ''
                };
            }
        }
    }

    private findSymbolsDirectory(): string | undefined {
        const subpaths = ['share/kicad/symbols', 'symbols', 'share/symbols'];
        for (const subpath of subpaths) {
            const symbolsPath = join(this.path ?? '', subpath);
            try {
                if (existsSync(symbolsPath) && statSync(symbolsPath).isDirectory()) {
                    return symbolsPath;
                }
            } catch (err) { logger.debug('kicad: path stat failed for', symbolsPath, err); }
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

    async hasLocalSymbols(): Promise<boolean> {
        const symbolsPath = this.getSymbolsPath();
        if (!symbolsPath) return false;
        try {
            const files = await readdir(symbolsPath);
            return files.some(file => file.endsWith('.kicad_sym'));
        } catch (err) {
            logger.debug('kicad: hasLocalSymbols failed for', symbolsPath, err);
            return false;
        }
    }
}

/** Backward-compatible export. Prefer {@link KiCAD.cliPath} for new code. */
export let kicad_cli_path: string | undefined;

export function getKicadCliPath(): string | undefined {
    return KiCAD.cliPath;
}
