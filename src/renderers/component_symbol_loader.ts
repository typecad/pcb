import fs from 'node:fs';
import { parseAsList, serialize, Sym } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import { KiCAD } from '../kicad.js';
import { ComponentError } from '../utils/errors.js';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import { getCallSite } from '../utils/stack_trace.js';
import { formatSourceError } from '../utils/error_reporter.js';

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
      const library_content = fs.readFileSync(`${kicad_symbols}/${library}.kicad_sym`, 'utf8');

      const parsed = parseAsList(library_content);
      for (const item of parsed) {
        if (Array.isArray(item) && Sym.isSym(item[0]) && item[0].name === 'symbol' && item[1] === symbol_name) {
          symbol_file_contents = serialize(item);
          break;
        }
      }
    }

    if (symbol_file_contents === '') {
      const buildSymbolPath = `./build/lib/symbols/${symbol_name}.kicad_sym`;
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
