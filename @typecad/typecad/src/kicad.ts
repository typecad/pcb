import fs, { existsSync, statSync, readdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import process from 'node:process';
import { platform } from 'node:os';
import { join } from 'node:path';

import chalk from 'chalk';
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

export class KiCAD {
    private static _instance: KiCAD | null = null;
    private static _path: string | undefined;
    private static _cliPath: string | undefined;
    private static _isFlatpak: boolean = false;
    private static _initialized: boolean = false;

    static get instance(): KiCAD {
        if (!KiCAD._instance) {
            KiCAD._instance = new KiCAD();
        }
        return KiCAD._instance;
    }

    constructor() {
        KiCAD.initialize();
    }

    private static initialize(): void {
        if (KiCAD._initialized) return;

        const configCli = getConfig().get("kicad_cli");
        const configPath = getConfig().get("kicad_path");
        if (configCli) {
            KiCAD._cliPath = configCli;
        }
        if (configPath) {
            KiCAD._path = configPath;
        }
        if (KiCAD._cliPath) {
            KiCAD._initialized = true;
            kicad_cli_path = KiCAD._cliPath;
            return;
        }

        const useFlatpakConfig = getConfig().get("use_flatpak");
        let localIsFlatpak = false;
        if (useFlatpakConfig === "true" || useFlatpakConfig === "1") {
            localIsFlatpak = true;
        }

        const possible_paths: string[] = [
            'C:/Program Files/KiCad/10.0/',
            'C:/Program Files/KiCad/9.0/',
            'C:/Program Files/KiCad/7.0/',
            'C:/Program Files/KiCad/8.0/',
            '/usr/share/kicad/',
            '/var/lib/flatpak/app/org.kicad.KiCad/current/',
            '/Applications/KiCAD/KiCad.app/Contents/ShareSupport/'
        ];

        const flatpak_paths: string[] = [
            '/var/lib/flatpak/app/org.kicad.KiCad/',
            '/var/lib/flatpak/app/org.kicad.KiCad/*/active/',
            '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/'
        ];

        if (configPath) {
            possible_paths.push(configPath);
        }

        if (localIsFlatpak || !KiCAD._path) {
            if (KiCAD.detectFlatpak(flatpak_paths)) {
                localIsFlatpak = true;
            }
        }

        if (!KiCAD._path) {
            for (const path of possible_paths) {
                if (path && fs.existsSync(path)) {
                    KiCAD._path = path;
                    if (path.includes('flatpak')) {
                        localIsFlatpak = true;
                    }
                    break;
                }
            }
        }

        if (KiCAD._path) {
            if (localIsFlatpak) {
                KiCAD._cliPath = 'flatpak run --command=sh org.kicad.kicad -c "kicad-cli"';
            } else if (platform() == 'win32') {
                KiCAD._cliPath = KiCAD._path + 'bin/kicad-cli.exe';
            } else {
                KiCAD._cliPath = findExecutable('kicad-cli');
            }
        }

        if (!KiCAD._cliPath) {
            throw new KiCadNotFoundError('KiCad CLI not found. Install KiCad or set kicad_cli in typecad.json.');
        }

        KiCAD._isFlatpak = localIsFlatpak;
        KiCAD._initialized = true;
        kicad_cli_path = KiCAD._cliPath;
    }

    private static detectFlatpak(flatpak_paths: string[]): boolean {
        if (fs.existsSync('/var/lib/flatpak/app/org.kicad.kicad') ||
            fs.existsSync('/var/lib/flatpak/runtime/org.kicad.kicad.Library')) {

            for (const path of flatpak_paths) {
                const expandedPath = path.replace('*/', '*').replace('*', 'active');
                if (fs.existsSync(expandedPath)) {
                    KiCAD._path = expandedPath;
                    return true;
                }
            }

            const currentPath = '/var/lib/flatpak/app/org.kicad.kicad/current';
            if (fs.existsSync(currentPath)) {
                KiCAD._path = currentPath;
                return true;
            }

            return true;
        }

        try {
            execSync('flatpak info org.kicad.KiCad', { stdio: 'ignore' });
            return true;
        } catch (error) {
            return false;
        }
    }

    /** Ensure KiCAD is initialized (idempotent). */
    private static ensureInit(): void {
        KiCAD.initialize();
    }

    /** Detected KiCAD installation path. */
    static get path(): string | undefined {
        KiCAD.ensureInit();
        return KiCAD._path;
    }

    /** Detected kicad-cli executable path. */
    static get cliPath(): string | undefined {
        KiCAD.ensureInit();
        return KiCAD._cliPath;
    }

    /** Whether the detected installation is a Flatpak. */
    static get isFlatpak(): boolean {
        KiCAD.ensureInit();
        return KiCAD._isFlatpak;
    }

    isFlatpakInstallation(): boolean {
        return KiCAD.isFlatpak;
    }

    getLibraryPaths(): { symbols: string, footprints: string } {
        if (KiCAD._isFlatpak) {
            return {
                symbols: '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/symbols',
                footprints: '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/footprints'
            };
        } else {
            if (platform() === 'win32') {
                return {
                    symbols: KiCAD._path ? KiCAD._path + 'share/kicad/symbols' : '',
                    footprints: KiCAD._path ? KiCAD._path + 'share/kicad/footprints' : ''
                };
            } else {
                return {
                    symbols: KiCAD._path ? KiCAD._path + 'symbols' : '',
                    footprints: KiCAD._path ? KiCAD._path + 'footprints' : ''
                };
            }
        }
    }

    private findSymbolsDirectory(): string | undefined {
        const subpaths = ['share/kicad/symbols', 'symbols', 'share/symbols'];
        for (const subpath of subpaths) {
            const symbolsPath = join(KiCAD._path ?? '', subpath);
            try {
                if (existsSync(symbolsPath) && statSync(symbolsPath).isDirectory()) {
                    return symbolsPath;
                }
            } catch { /* path stat failed, try next */ }
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
        } catch {
            return false;
        }
    }
}

/** @deprecated Use `KiCAD.cliPath` instead. Kept for backward compatibility with external packages. */
export let kicad_cli_path: string | undefined;

/** Backward-compatible export. Prefer {@link KiCAD.cliPath} for new code. */
export function getKicadCliPath(): string | undefined {
    return KiCAD.cliPath;
}
