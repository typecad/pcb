import { ISourceInfo } from './pcb_interfaces.js';
import { encodeCodeMetadata, decodeCodeMetadata } from '../kicad2typecad/codec.js';
import type { CodeMetadata, LegacyCodeMetadata } from '../kicad2typecad/types.js';
import { designUUID } from '../utils/deterministic_id.js';

/**
 * Utility functions for PCB operations
 */

/**
 * Formats source information for property inclusion in KiCad files.
 * Uses the new stable base64url-encoded format (typecad:v1:...).
 *
 * @param info - Source information object
 * @param uuid - Component UUID (primary identity for round-trip matching)
 * @param footprintFingerprint - Footprint identity fingerprint (fallback for anonymous components)
 * @returns Encoded string safe for KiCad property values
 */
export function formatSourceInfoForProperty(
  info?: ISourceInfo,
  uuid?: string,
  footprintFingerprint?: string,
): string | undefined {
  if (!info) return undefined;

  const metadata: CodeMetadata = {
    v: 1,
    u: uuid || '',
    n: info.variable || undefined,
    t: info.isThis || undefined,
    h: footprintFingerprint || undefined,
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
export function parseSourceInfoFromProperty(
  rawValue: string | null | undefined,
): CodeMetadata | LegacyCodeMetadata | null {
  return decodeCodeMetadata(rawValue);
}

/**
 * Generates a UUID for design output. When identity parts are supplied the
 * UUID is derived deterministically (same design → same bytes); without
 * parts it falls back to a random UUID.
 */
export function generateUuid(...parts: (string | number | boolean | undefined | null)[]): string {
  return designUUID(...parts);
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

/**
 * Formats call site information into a human-readable string for error messages.
 * @param callSite - Call site info from getCallSite(), or undefined
 * @returns Formatted string like " (called from file.ts:42)" or empty string
 */
export function formatCallSite(
  callSite: { file: string; line: number; column: number; function?: string } | undefined | null,
): string {
  return callSite ? ` (called from ${callSite.file}:${callSite.line})` : '';
}

/**
 * Safely extracts an error message from an unknown caught value.
 * @param error - The caught value
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
