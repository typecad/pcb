import fs from 'node:fs';
import { KiCAD } from '../kicad.js';
import { ComponentError } from '../utils/errors.js';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatSourceError } from '../utils/error_reporter.js';
import { parseSymbolLibrary, referencePrefixOf, resolveExtends } from '../symbol_core.js';
import { getBuildDir } from '../utils/constants.js';
import type { SList } from '../sexpr/types.js';

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
      const kicadSymbols = KiCAD.instance.getLibraryPaths().symbols;

      const loadLibrary = (lib: string): SList | null => {
        const candidates = [
          kicadSymbols ? `${kicadSymbols}/${lib}.kicad_sym` : '',
          `${getBuildDir()}/lib/${lib}.kicad_sym`,
          `${getBuildDir()}/lib/symbols/${symbolName}.kicad_sym`,
        ].filter((candidate) => candidate !== '');
        for (const libPath of candidates) {
          if (fs.existsSync(libPath)) {
            return parseSymbolLibrary(fs.readFileSync(libPath, 'utf8'));
          }
        }
        return null;
      };

      const resolved = resolveExtends(libraryName, symbolName, loadLibrary);
      if (resolved) {
        prefix = referencePrefixOf(resolved.node);
      }
    }
  } catch {
    prefix = undefined;
  }

  referencePrefixCache.set(symbol, prefix);
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

  const kicad = KiCAD.instance;
  const libraryPaths = kicad.getLibraryPaths();
  const kicad_symbols = libraryPaths.symbols;

  try {
    if (kicad_symbols && fs.existsSync(`${kicad_symbols}/${library}.kicad_sym`)) {
      const loadLibrary = (lib: string) => {
        const libPath = `${kicad_symbols}/${lib}.kicad_sym`;
        if (!fs.existsSync(libPath)) return null;
        return parseSymbolLibrary(fs.readFileSync(libPath, 'utf8'));
      };

      const resolved = resolveExtends(library, symbol_name, loadLibrary);
      if (resolved) {
        symbol_file_contents = resolved.serialized;
      }
    }

    if (symbol_file_contents === '') {
      const buildSymbolPath = `${getBuildDir()}/lib/symbols/${symbol_name}.kicad_sym`;
      if (fs.existsSync(buildSymbolPath)) {
        symbol_file_contents = fs.readFileSync(buildSymbolPath, 'utf8');
      }
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
