import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { KiCAD } from './kicad.js';
import { KiCadNotFoundError } from './errors.js';

const execAsync = promisify(exec);

export interface KiCADCommandOptions {
    cwd?: string;
    stdio?: 'inherit' | 'pipe' | 'ignore';
    timeout?: number;
}

/**
 * Execute a KiCAD command with automatic flatpak wrapper detection
 */
export async function executeKiCADCommand(
    command: string,
    args: string[] = [],
    options: KiCADCommandOptions = {}
): Promise<string> {
    const fullCommand = buildKiCADCommand(command, args);
    try {
        if (options.stdio === 'inherit') {
            execSync(fullCommand, {
                cwd: options.cwd,
                stdio: 'inherit',
                timeout: options.timeout
            });
            return '';
        } else {
            const result = await execAsync(fullCommand, {
                cwd: options.cwd,
                timeout: options.timeout,
                encoding: 'utf8'
            });
            return result.stdout;
        }
    } catch (error) {
        throw new KiCadNotFoundError(`KiCAD command failed: ${fullCommand}\n${error}`);
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
    const fullCommand = buildKiCADCommand(command, args);

    try {
        if (options.stdio === 'inherit') {
            execSync(fullCommand, {
                cwd: options.cwd,
                stdio: 'inherit',
                timeout: options.timeout
            });
            return '';
        } else {
            return execSync(fullCommand, {
                cwd: options.cwd,
                encoding: 'utf8',
                timeout: options.timeout,
                stdio: ['pipe', 'pipe', 'pipe']  // Suppress stderr by default
            });
        }
    } catch (error) {
        throw new KiCadNotFoundError(`KiCAD command failed: ${fullCommand}\n${error}`);
    }
}

/**
 * Build the appropriate KiCAD command based on installation type
 */
function buildKiCADCommand(command: string, args: string[]): string {
    if (KiCAD.isFlatpak) {
        // Wrap in flatpak command
        const innerCommand = `kicad-cli ${command} ${args.join(' ')}`;
        return `flatpak run --command=sh org.kicad.kicad -c "${innerCommand}"`;
    } else {
        // Regular command execution - use the detected kicad_cli_path if available
        const cliExecutable = KiCAD.cliPath || 'kicad-cli';
        // Quote the executable if it contains spaces
        const quotedExecutable = cliExecutable.includes(' ') ? `"${cliExecutable}"` : cliExecutable;
        return `${quotedExecutable} ${command} ${args.join(' ')}`;
    }
}

/**
 * Run Design Rule Check on a PCB file
 */
export async function runDRC(pcbPath: string, options: KiCADCommandOptions = {}): Promise<string> {
    return executeKiCADCommand('drc', [pcbPath], options);
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
    const args = ['export', format, pcbPath, '-o', outputPath];
    return executeKiCADCommand('', args, options);
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
    const args = ['export', format, schPath, '-o', outputPath];
    return executeKiCADCommand('', args, options);
}
