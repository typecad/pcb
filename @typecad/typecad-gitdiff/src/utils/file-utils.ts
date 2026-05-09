/**
 * File utilities for typecad-gitdiff
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'node:child_process';
import tempDir from 'temp-dir';

/**
 * Executes a command and returns a promise
 */
export function executeCommand(command: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        exec(command, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Exports a KiCAD PCB layer to SVG
 */
export async function exportLayerToSvg(kicadCliPath: string, layer: string, outputPath: string, pcbFile: string, theme?: string): Promise<void> {
    const themeArg = theme ? `--theme "${theme}"` : '';
    return executeCommand(`"${kicadCliPath}" pcb export svg ${themeArg} --exclude-drawing-sheet --page-size-mode 2 --layers "${layer}" --output "${outputPath}" ${pcbFile}`);
}

/**
 * Renders a KiCAD PCB to PNG
 */
// export async function renderPcbToPng(kicadCliPath: string, outputPath: string, pcbFile: string): Promise<void> {
//     return executeCommand(`"${kicadCliPath}" pcb render --output "${outputPath}" ${pcbFile}`);
// }

/**
 * Creates a temporary file path
 */
export function createTempFilePath(prefix: string, suffix: string): string {
    return path.join(tempDir, `${prefix}${suffix}`);
}

/**
 * Parses a hex color string and returns RGB values
 */
export function parseHexColor(hexColor: string): { r: number; g: number; b: number } {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    
    // Parse the hex values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return { r, g, b };
}

/**
 * Cleans up temporary files
 */
export function cleanupTempFiles(filePaths: string[]): number {
    let cleanedCount = 0;
    for (const filePath of filePaths) {
        try {
            // Safety check: only delete files in temp directory
            if (filePath.startsWith(tempDir) && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                cleanedCount++;
            }
        } catch (cleanupError) {
            console.error(`Failed to delete temporary file: ${filePath}`, cleanupError);
        }
    }
    return cleanedCount;
}