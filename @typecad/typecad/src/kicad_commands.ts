import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { KiCAD } from './kicad.js';
import { KiCadNotFoundError, KiCadCommandError } from './errors.js';

const execFileAsync = promisify(execFile);

export interface KiCADCommandOptions {
    cwd?: string;
    stdio?: 'inherit' | 'pipe' | 'ignore';
    timeout?: number;
}

function buildKiCADArgs(command: string, args: string[]): { executable: string; execArgs: string[] } {
    if (KiCAD.isFlatpak) {
        const innerCommand = `kicad-cli ${command} ${args.map(a => shellEscape(a)).join(' ')}`;
        return {
            executable: 'flatpak',
            execArgs: ['run', '--command=sh', 'org.kicad.kicad', '-c', innerCommand]
        };
    } else {
        const cliExecutable = KiCAD.cliPath || 'kicad-cli';
        return {
            executable: cliExecutable,
            execArgs: [command, ...args]
        };
    }
}

function shellEscape(arg: string): string {
    if (/^[a-zA-Z0-9_\-./:=]+$/.test(arg)) return arg;
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Execute a KiCAD command with automatic flatpak wrapper detection
 */
export async function executeKiCADCommand(
    command: string,
    args: string[] = [],
    options: KiCADCommandOptions = {}
): Promise<string> {
    const { executable, execArgs } = buildKiCADArgs(command, args);
    try {
        if (options.stdio === 'inherit') {
            execFileSync(executable, execArgs, {
                cwd: options.cwd,
                stdio: 'inherit',
                timeout: options.timeout,
                shell: KiCAD.isFlatpak
            });
            return '';
        } else {
            const result = await execFileAsync(executable, execArgs, {
                cwd: options.cwd,
                timeout: options.timeout,
                encoding: 'utf8',
                shell: KiCAD.isFlatpak
            });
            return result.stdout;
        }
    } catch (error) {
        throw new KiCadCommandError(`KiCAD command failed: ${command} ${args.join(' ')}\n${error}`);
    }
}

/**
 * Execute a KiCAD command synchronously
 */
export function executeKiCADCommandSync(
    command: string,
    args: string[] = [],
    options: KiCADCommandOptions = {}
): string {
    const { executable, execArgs } = buildKiCADArgs(command, args);

    try {
        if (options.stdio === 'inherit') {
            execFileSync(executable, execArgs, {
                cwd: options.cwd,
                stdio: 'inherit',
                timeout: options.timeout,
                shell: KiCAD.isFlatpak
            });
            return '';
        } else {
            return execFileSync(executable, execArgs, {
                cwd: options.cwd,
                encoding: 'utf8',
                timeout: options.timeout,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: KiCAD.isFlatpak
            });
        }
    } catch (error) {
        throw new KiCadCommandError(`KiCAD command failed: ${command} ${args.join(' ')}\n${error}`);
    }
}

/**
 * Run Design Rule Check on a PCB file
 */
export async function runDRC(pcbPath: string, options: KiCADCommandOptions = {}): Promise<string> {
    return executeKiCADCommand('pcb', ['drc', pcbPath], options);
}

/**
 * Run Electrical Rule Check on a schematic file
 */
export async function runERC(schPath: string, options: KiCADCommandOptions = {}): Promise<string> {
    return executeKiCADCommand('sch', ['erc', schPath], options);
}

/**
 * Upgrade a footprint file to the latest format
 */
export async function upgradeFootprint(footprintPath: string, options: KiCADCommandOptions = {}): Promise<string> {
    return executeKiCADCommand('fp', ['upgrade', '--output', footprintPath, footprintPath], options);
}

/**
 * Export PCB to various formats
 */
export async function exportPCB(
    pcbPath: string,
    outputPath: string,
    format: 'gerber' | 'svg' | 'pdf' | 'step' | 'dxf',
    options: KiCADCommandOptions = {}
): Promise<string> {
    const cmdArgs = ['export', format, pcbPath, '-o', outputPath];
    return executeKiCADCommand('pcb', cmdArgs, options);
}

/**
 * Export schematic to various formats
 */
export async function exportSchematic(
    schPath: string,
    outputPath: string,
    format: 'pdf' | 'svg' | 'netlist',
    options: KiCADCommandOptions = {}
): Promise<string> {
    const cmdArgs = ['export', format, schPath, '-o', outputPath];
    return executeKiCADCommand('sch', cmdArgs, options);
}
