import fs from 'node:fs';
import process from 'node:process';
import { platform } from 'node:os';
import { lookpathSync } from 'find-bin';
import chalk from 'chalk';
import { Config } from './config.js'
import { execSync } from 'node:child_process';
import { KiCadNotFoundError } from './errors.js';

let conf = new Config();

/** @deprecated Use KiCAD.path instead */
export let kicad_path: string | undefined;
/** @deprecated Use KiCAD.cliPath instead */
export let kicad_cli_path: string | undefined;
/** @deprecated Use KiCAD.isFlatpak instead */
export let is_flatpak: boolean = false;

let isInitialized = false;

function initializeKiCAD() {
    if (isInitialized) return;
    
    // Check config overrides first — if valid, use them and skip discovery
    const configCli = conf.get("kicad_cli");
    const configPath = conf.get("kicad_path");
    if (configCli) {
        kicad_cli_path = configCli;
    }
    if (configPath) {
        kicad_path = configPath;
    }
    if (kicad_cli_path) {
        isInitialized = true;
        return;
    }

    // Check for explicit flatpak configuration
    const useFlatpakConfig = conf.get("use_flatpak");
    let localIsFlatpak = false;
    if (useFlatpakConfig === "true" || useFlatpakConfig === "1") {
        localIsFlatpak = true;
    }

    const possible_paths: string[] = [
        'C:/Program Files/KiCad/10.0/',
        'C:/Program Files/KiCad/9.0/',
        'C:/Program Files/KiCad/7.0/',                                  // windows
        'C:/Program Files/KiCad/8.0/',
        '/usr/share/kicad/',                                            // linux
        '/var/lib/flatpak/app/org.kicad.KiCad/current/',                // linux flatpak
        '/Applications/KiCAD/KiCad.app/Contents/ShareSupport/'          // mac?
    ];

    const flatpak_paths: string[] = [
        '/var/lib/flatpak/app/org.kicad.KiCad/',
        '/var/lib/flatpak/app/org.kicad.KiCad/*/active/',
        '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/'
    ];

    // push typecad.json#kicad_path into the list to check
    if (configPath) {
        possible_paths.push(configPath);
    }

    // First, try to detect flatpak installation
    if (localIsFlatpak || !kicad_path) {
        if (detectFlatpak(flatpak_paths)) {
            localIsFlatpak = true;
        }
    }

    // If not flatpak or flatpak detection failed, try regular paths
    if (!kicad_path) {
        for (const path of possible_paths) {
            if (path && fs.existsSync(path)) {
                kicad_path = path;
                if (path.includes('flatpak')) {
                    localIsFlatpak = true;
                }
                break;
            }
        }
    }

    // if it found a path, figure out where 'kicad-cli' is
    if (kicad_path) {
        if (localIsFlatpak) {
            kicad_cli_path = 'flatpak run --command=sh org.kicad.kicad -c "kicad-cli"';
        } else if (platform() == 'win32') {
            kicad_cli_path = kicad_path + 'bin/kicad-cli.exe';
        } else {
            kicad_cli_path = lookpathSync('kicad-cli');
        }
    }

    if (!kicad_cli_path) {
        throw new KiCadNotFoundError('KiCad CLI not found. Install KiCad or set kicad_cli in typecad.json.');
    }

    is_flatpak = localIsFlatpak;
    isInitialized = true;
}

function detectFlatpak(flatpak_paths: string[]): boolean {
    // First check if flatpak directories exist (primary detection method)
    if (fs.existsSync('/var/lib/flatpak/app/org.kicad.kicad') ||
        fs.existsSync('/var/lib/flatpak/runtime/org.kicad.kicad.Library')) {

        // Try to find the library path
        for (const path of flatpak_paths) {
            const expandedPath = path.replace('*/', '*').replace('*', 'active');
            if (fs.existsSync(expandedPath)) {
                kicad_path = expandedPath;
                return true;
            }
        }

        // Check for current symlink path
        const currentPath = '/var/lib/flatpak/app/org.kicad.kicad/current';
        if (fs.existsSync(currentPath)) {
            kicad_path = currentPath;
            return true;
        }

        // If we can't find the exact path but flatpak directories exist, still mark as flatpak
        return true;
    }

    // As a fallback, try to run flatpak command if it exists
    try {
        execSync('flatpak info org.kicad.KiCad', { stdio: 'ignore' });
        return true;
    } catch (error) {
        // flatpak command failed, not a flatpak installation
        return false;
    }
}

export class KiCAD {
    constructor() {
        initializeKiCAD();
    }

    /** Ensure KiCAD is initialized (idempotent). */
    private static ensureInit(): void {
        initializeKiCAD();
    }

    /** Detected KiCAD installation path. */
    static get path(): string | undefined {
        KiCAD.ensureInit();
        return kicad_path;
    }

    /** Detected kicad-cli executable path. */
    static get cliPath(): string | undefined {
        KiCAD.ensureInit();
        return kicad_cli_path;
    }

    /** Whether the detected installation is a Flatpak. */
    static get isFlatpak(): boolean {
        KiCAD.ensureInit();
        return is_flatpak;
    }

    isFlatpakInstallation(): boolean {
        return is_flatpak;
    }

    getLibraryPaths(): { symbols: string, footprints: string } {
        if (is_flatpak) {
            return {
                symbols: '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/symbols',
                footprints: '/var/lib/flatpak/runtime/org.kicad.kicad.Library/x86_64/stable/active/files/footprints'
            };
        } else {
            // Regular installation paths
            if (platform() === 'win32') {
                return {
                    symbols: kicad_path ? kicad_path + 'share/kicad/symbols' : '',
                    footprints: kicad_path ? kicad_path + 'share/kicad/footprints' : ''
                };
            } else {
                return {
                    symbols: kicad_path ? kicad_path + 'symbols' : '',
                    footprints: kicad_path ? kicad_path + 'footprints' : ''
                };
            }
        }
    }
}