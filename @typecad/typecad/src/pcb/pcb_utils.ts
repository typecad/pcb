import { randomUUID } from "node:crypto";
import { ISourceInfo } from './pcb_interfaces.js';
import { encodeCodeMetadata, decodeCodeMetadata } from '../kicad2typecad/codec.js';
import type { CodeMetadata, LegacyCodeMetadata } from '../kicad2typecad/types.js';

/**
 * Utility functions for PCB operations
 */

/**
 * Formats source information for property inclusion in KiCad files.
 * Uses the new stable base64url-encoded format (typecad:v1:...).
 *
 * @param info - Source information object
 * @param uuid - Component UUID (primary identity for round-trip matching)
 * @param footprintHash - Footprint identity hash (fallback for anonymous components)
 * @returns Encoded string safe for KiCad property values
 */
export function formatSourceInfoForProperty(
    info?: ISourceInfo,
    uuid?: string,
    footprintHash?: string
): string | undefined {
    if (!info) return undefined;

    const metadata: CodeMetadata = {
        v: 1,
        u: uuid || '',
        n: info.variable || undefined,
        t: info.isThis || undefined,
        h: footprintHash || undefined,
    };

    // Include file/line only as fallback (when no variable name — anonymous components)
    if (!info.variable) {
        metadata.f = info.file;
        metadata.l = info.line;
    }

    try {
        return encodeCodeMetadata(metadata);
    } catch {
        // Fallback: encode just the essential info
        const minimal: CodeMetadata = {
            v: 1,
            u: uuid || '',
            f: String(info.file || '').replace(/[`\"\\]/g, ''),
            l: info.line,
        };
        return encodeCodeMetadata(minimal);
    }
}

/**
 * Decodes a Code property value back into structured metadata.
 * Tries new format first, falls back to legacy format.
 * @param rawValue - Raw Code property string from a KiCad file
 * @returns Decoded metadata or null
 */
export function parseSourceInfoFromProperty(rawValue: string | null | undefined): CodeMetadata | LegacyCodeMetadata | null {
    return decodeCodeMetadata(rawValue);
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
