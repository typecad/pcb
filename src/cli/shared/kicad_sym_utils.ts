import fs from 'node:fs';
import { join } from 'node:path';
import { parse, nameOf } from '../../sexpr/index.js';
import { KiCAD } from '../../kicad.js';
import type { CliPinInfo } from '../types.js';
import logger from '../../utils/logging.js';
import { sanitize_name as sharedSanitizeName, sanitize_number as sharedSanitizeNumber } from './cli_utils.js';
import {
  extractPins,
  findSymbolNode,
  footprintOf,
  listSymbolNames,
  normalizeFootprintRef,
  parseSymbolLibrary,
  resolveExtends,
} from '../../symbol_core.js';
import type { SList } from '../../sexpr/types.js';

export const sanitize_name = sharedSanitizeName;

/** Result of resolving a symbol: its footprint (raw or "lib:"-normalized) and its pins. */
export interface SymbolLookup {
  footprint: string;
  pins: CliPinInfo[];
}

/** Shape raw core pins into CLI form: sanitized names/numbers, duplicate names suffixed with their number. */
function toCliPins(symbolNode: SList): CliPinInfo[] {
  const pins: CliPinInfo[] = extractPins(symbolNode).map((pin) => ({
    type: pin.type,
    name: sanitize_name(pin.name),
    number: sharedSanitizeNumber(pin.number),
  }));

  for (let i = 0; i <= pins.length - 1; i++) {
    let cnt = 0;
    for (let ii = 0; ii <= pins.length - 1; ii++) {
      if (pins[i].name === pins[ii].name) {
        cnt++;
        if (cnt > 1) {
          pins[ii].name = pins[ii].name + '_' + pins[ii].number;
        }
      }
    }
  }
  return pins;
}

/** Library loader for "lib:symbol" lookups: global KiCAD symbols dir first, then <folder>/build/lib. */
function libraryLoader(folder: string) {
  const kicadSymbolsPath = KiCAD.instance.getSymbolsPath();
  return (libraryName: string): SList | null => {
    try {
      const globalPath = `${kicadSymbolsPath}/${libraryName}.kicad_sym`;
      if (fs.existsSync(globalPath)) {
        return parseSymbolLibrary(fs.readFileSync(globalPath, 'utf8'));
      }
      return parseSymbolLibrary(fs.readFileSync(join(folder, 'build', 'lib', `${libraryName}.kicad_sym`), 'utf8'));
    } catch {
      return null;
    }
  };
}

/**
 * Resolve a "library:symbol" reference. Returns null when the symbol (or its
 * extends chain) cannot be resolved in the global KiCAD libraries or under
 * <folder>/build/lib. The footprint is the raw property value (e.g.
 * "Resistor_SMD:R_0603_1608Metric"), '' when the symbol has none.
 */
export function readSymbol(symbol: string, folder = './'): SymbolLookup | null {
  const parts = symbol.split(':');
  if (parts.length !== 2) return null;

  try {
    const resolved = resolveExtends(parts[0], parts[1], libraryLoader(folder));
    if (!resolved) return null;
    const footprintProperty = footprintOf(resolved.node);
    return {
      footprint: footprintProperty || '',
      pins: toCliPins(resolved.node),
    };
  } catch (err) {
    logger.error(err);
    return null;
  }
}

/**
 * Read a symbol from a .kicad_sym file path. When symbolName is omitted the
 * first symbol in the file is used. The footprint is normalized to the
 * "lib:Name" form used by the add flows; '' when the symbol has none.
 * Returns null when the file is unreadable or the symbol is absent.
 */
export function readSymbolFile(symbolPath: string, symbolName?: string): SymbolLookup | null {
  try {
    const nodes = parseSymbolLibrary(fs.readFileSync(symbolPath, 'utf8'));
    const name = symbolName !== undefined ? symbolName : listSymbolNames(nodes)[0];
    if (name === undefined) return null;
    const target = findSymbolNode(nodes, name);
    if (!target) return null;
    const footprintProperty = footprintOf(target);
    return {
      footprint: footprintProperty !== undefined ? normalizeFootprintRef(footprintProperty) : '',
      pins: toCliPins(target),
    };
  } catch (err) {
    logger.error(err);
    return null;
  }
}

export function return_list_of_symbols(symbol_path: string): { value: string }[] {
  try {
    const nodes = parseSymbolLibrary(fs.readFileSync(symbol_path, 'utf8'));
    return listSymbolNames(nodes).map((value) => ({ value }));
  } catch (err) {
    logger.error(err);
    return [];
  }
}

export function return_list_of_footprints(footprint_path: string): { value: string }[] {
  const found_footprints: { value: string }[] = [];

  try {
    const footprint_file_contents = fs.readFileSync(footprint_path, 'utf8');
    const l = parse(footprint_file_contents);

    if (Array.isArray(l) && (nameOf(l[0]) === 'module' || nameOf(l[0]) === 'footprint')) {
      const footprintName = String(l[1] || '');
      found_footprints.push({ value: footprintName });
    }
  } catch (err) {
    logger.error(err);
  }

  return found_footprints;
}
