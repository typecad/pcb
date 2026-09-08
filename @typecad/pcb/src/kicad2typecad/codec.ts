import type { CodeMetadata, LegacyCodeMetadata } from './types.js';
import logger from '../utils/logging.js';

/** Prefix identifying the new stable codec format */
const PREFIX = 'typecad:v1:';

/**
 * Encodes structured component metadata into a stable, base64url-safe string
 * suitable for embedding in a KiCad "Code" property.
 *
 * The encoded string contains only [A-Za-z0-9_-] characters plus the "typecad:v1:" prefix,
 * which means it survives KiCad's string handling without any quoting issues.
 */
export function encodeCodeMetadata(metadata: CodeMetadata): string {
  const cleaned = cleanUndefined(metadata);
  const json = JSON.stringify(cleaned);
  const base64 = Buffer.from(json, 'utf-8').toString('base64url');
  return PREFIX + base64;
}

/**
 * Decodes a KiCad Code property value into structured metadata.
 * Tries the new format first, then falls back to the legacy single-quote format.
 *
 * Returns null if the value is empty or cannot be parsed in any format.
 */
export function decodeCodeMetadata(rawValue: string | null | undefined): CodeMetadata | LegacyCodeMetadata | null {
  if (!rawValue) return null;

  // Strip surrounding backticks/quotes that KiCad may add
  const cleaned = rawValue.replace(/[`'"]/g, '').trim();
  if (!cleaned) return null;

  // 1. Try new format: "typecad:v1:<base64url>"
  if (cleaned.startsWith(PREFIX)) {
    try {
      const base64 = cleaned.slice(PREFIX.length);
      const json = Buffer.from(base64, 'base64url').toString('utf-8');
      const parsed = JSON.parse(json);
      if (parsed && parsed.v === 1 && parsed.u !== undefined) {
        return parsed as CodeMetadata;
      }
    } catch {
      logger.debug('codec: JSON parse failed, falling through to legacy parser');
    }
  }

  // 2. Fall back to legacy format: {'variable':'...','file':'...','isThis':true,'line':24}
  return decodeLegacyCodeMetadata(cleaned);
}

/**
 * Parses the legacy single-quote pseudo-JSON Code property format.
 * Example: {'variable':'outputCap','file':'/path/to/index.ts','isThis':true,'line':54}
 */
function decodeLegacyCodeMetadata(raw: string): LegacyCodeMetadata | null {
  const varMatch = raw.match(/'variable'\s*:\s*'([^']+)'/);
  const fileMatch = raw.match(/'file'\s*:\s*'([^']+)'/);
  const isThisMatch = raw.match(/'isThis'\s*:\s*(true|false)/);
  const lineMatch = raw.match(/'line'\s*:\s*(\d+)/);

  if (!varMatch && !fileMatch) return null;

  return {
    v: 0, // legacy indicator
    u: '', // no UUID in legacy format
    n: varMatch?.[1],
    t: isThisMatch?.[1] === 'true' ? true : undefined,
    f: fileMatch?.[1],
    l: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
  };
}

/**
 * Removes undefined values from an object (for compact serialization).
 * Returns a new object with only defined values.
 */
function cleanUndefined<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}
