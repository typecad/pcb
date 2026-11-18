import fs from 'node:fs';
import { libraryRoots } from '../kicad.js';
import { ComponentError } from '../utils/errors.js';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatSourceError } from '../utils/error_reporter.js';
import { referencePrefixOf, resolveExtends } from '../symbol_core.js';
import { getBuildDir } from '../utils/constants.js';
import { symbolLibraryFor } from '../symbol_library_source.js';
import { validLibraryPart } from '../library_asset.js';

const referencePrefixCache = new Map<string, string | undefined>();

/**
 * Reference-designator prefix carried by a symbol ("lib:name"), read from the
 * symbol's `(property "Reference" "U")` — the same property KiCad editors use.
 * Resolves extends ancestry, so derived symbols inherit the base's prefix.
 * Returns undefined when the symbol (or its Reference property) can't be found.
 */
export function getSymbolReferencePrefix(symbol: string): string | undefined {
  if (referencePrefixCache.has(symbol)) {
    return referencePrefixCache.get(symbol);
  }

  let prefix: string | undefined;
  try {
    const separatorIndex = symbol.indexOf(LIBRARY_SEPARATOR);
    if (separatorIndex > 0) {
      const libraryName = symbol.slice(0, separatorIndex);
      const symbolName = symbol.slice(separatorIndex + 1);
      const kicadSymbols = libraryRoots().symbols;

      const resolved = resolveExtends(libraryName, symbolName, (lib, name) =>
        symbolLibraryFor(kicadSymbols, lib, name, true),
      );
      if (resolved) {
        prefix = referencePrefixOf(resolved.node);
      }
    }
  } catch {
    prefix = undefined;
  }

  if (prefix !== undefined) referencePrefixCache.set(symbol, prefix);
  return prefix;
}

export function loadSymbolLib(
  symbol: string,
  reference: string,
  value: string,
  cachedContent: string | undefined,
): string {
  if (cachedContent && cachedContent !== '') return cachedContent;

  const symbol_parts = symbol.split(LIBRARY_SEPARATOR);
  if (symbol_parts.length !== 2) {
    const site = getCallSite();
    const err = new ComponentError(
      formatSourceError(
        `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${symbol}] Invalid symbol format. Expected "library:symbol" (e.g., "Device:R")`,
        site,
      ),
    );
    err.stack = err.message;
    throw err;
  }

  const [library, symbol_name] = symbol_parts;
  let symbol_file_contents = '';

  const kicad_symbols = libraryRoots().symbols;

  try {
    // Project-generated symbols may already be serialized embedding entries.
    const legacyFile = `${getBuildDir()}/lib/symbols/${symbol_name}.kicad_sym`;
    const resolve = (allowFetch: boolean) =>
      resolveExtends(library, symbol_name, (lib, name) => symbolLibraryFor(kicad_symbols, lib, name, allowFetch));
    const legacy =
      validLibraryPart(symbol_name) && fs.existsSync(legacyFile) ? fs.readFileSync(legacyFile, 'utf8') : '';
    if (/^\s*\(symbol\b/.test(legacy)) {
      symbol_file_contents = resolve(false)?.serialized || legacy;
    } else {
      symbol_file_contents = resolve(true)?.serialized || '';
    }
  } catch (err: unknown) {
    if (err instanceof ComponentError) throw err;
    const site = getCallSite();
    const error = new ComponentError(
      formatSourceError(
        `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${symbol}] Failed to load symbol: ${err instanceof Error ? err.message : String(err)}`,
        site,
      ),
    );
    error.stack = error.message;
    throw error;
  }

  if (symbol_file_contents === '') {
    const site = getCallSite();
    const err = new ComponentError(
      formatSourceError(
        `[${reference || 'Unknown'}, ${value || 'Unknown'}, ${symbol}] Symbol not found in library "${library}" or build/lib/symbols/`,
        site,
      ),
    );
    err.stack = err.message;
    throw err;
  }

  return symbol_file_contents;
}
