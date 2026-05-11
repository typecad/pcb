import { randomUUID } from "node:crypto";
import { ISourceInfo } from './pcb_interfaces.js';

/**
 * Utility functions for PCB operations
 */

/**
 * Formats source information for property inclusion in KiCad files
 * @param info - Source information object
 * @returns Formatted string safe for KiCad files
 */
export function formatSourceInfoForProperty(info?: ISourceInfo): string | undefined {
    if (!info) return undefined;
    const payload: Record<string, unknown> = {
        file: info.file,
        line: info.line
    };
    if (info.column !== undefined) payload.column = info.column;
    if (info.variable !== undefined) payload.variable = info.variable;
    if (info.isThis !== undefined) payload.isThis = info.isThis;
    if (info.params !== undefined) payload.params = info.params;
    try {
        let json = JSON.stringify(payload);
        // Make it safe for KiCad string: avoid double quotes/backticks
        json = json.replace(/`/g, '');
        json = json.replace(/\"/g, "'");
        return json;
    } catch (e) {
        // Fallback minimal string
        const safeFile = String(info.file || '').replace(/[`\"\\]/g, '');
        return `{file:'${safeFile}',line:${info.line}}`;
    }
}

/**
 * Generates a unique UUID using crypto module
 * @returns Random UUID string
 */
export function generateUuid(): string {
    return randomUUID();
}

export function normalizeNetName(name?: string): string | undefined {
    if (typeof name !== 'string') {
        return undefined;
    }

    let normalized = name.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }

    if (normalized.startsWith('/')) {
        normalized = normalized.substring(1);
    }

    return normalized;
}
