import { parseAsList, serialize, Sym } from './sexpr/index.js';
import type { SExpr, SList } from './sexpr/types.js';

/**
 * Pure KiCad symbol-library reading primitives shared by every `.kicad_sym`
 * consumer (CLI add flows, schematic renderer, symbol embedding). No file
 * system, no logging, no global state — callers own I/O and path resolution
 * and pass content in through a {@link LibraryLoader}.
 */

/** A raw pin extracted from a symbol node, before any CLI-side sanitization. */
export interface SymbolPin {
  type: string;
  name: string;
  number: string;
  hidden: boolean;
  /** `(at x y angle)` of the pin within its unit, when present. */
  at: { x: number; y: number; angle: number } | null;
}

/** Returns a library's parsed top-level nodes, or null/undefined when unavailable. */
export type LibraryLoader = (libraryName: string) => SList | null | undefined;

/** A symbol resolved against its library, with `extends` ancestry flattened. */
export interface ResolvedSymbol {
  /** Library of the symbol that was requested. */
  libraryName: string;
  /** Name of the symbol that was requested — not its extends base. */
  symbolName: string;
  /**
   * The flattened symbol node: graphics and pins come from the base of the
   * extends chain, properties from each derived level override the base's,
   * and the node is named after the requested `library:symbol`. A
   * schematic's `lib_symbols` entry must carry exactly that name to match
   * the placed symbol's `lib_id` — otherwise KiCad drops the component
   * silently (netlists and ERC omit it entirely).
   */
  node: SList;
  serialized: string;
}

const MAX_EXTENDS_DEPTH = 10;

function isSymbolNode(el: SExpr): el is SList {
  return Array.isArray(el) && el.length > 1 && Sym.isSym(el[0]) && el[0].name === 'symbol';
}

export function parseSymbolLibrary(content: string): SList {
  return parseAsList(content);
}

export function listSymbolNames(nodes: SList): string[] {
  const names: string[] = [];
  for (const el of nodes) {
    if (isSymbolNode(el)) names.push(String(el[1]));
  }
  return names;
}

export function findSymbolNode(nodes: SList, symbolName: string): SList | undefined {
  for (const el of nodes) {
    if (isSymbolNode(el) && String(el[1]) === symbolName) return el;
  }
  return undefined;
}

/**
 * Value of `(property "Name" "Value" ...)` on a symbol node.
 * Returns undefined when the property is absent and '' when present but empty,
 * so callers can distinguish the two.
 */
export function getSymbolProperty(symbol: SList, propertyName: string): string | undefined {
  for (const el of symbol) {
    if (Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'property' && String(el[1]) === propertyName) {
      return el[2] === undefined ? '' : String(el[2]);
    }
  }
  return undefined;
}

/** Footprint property value as written (e.g. "Resistor_SMD:R_0603_1608Metric"), or undefined. */
export function footprintOf(symbol: SList): string | undefined {
  return getSymbolProperty(symbol, 'Footprint');
}

/**
 * Reference-designator prefix carried by the symbol's `(property "Reference" ...)`
 * (e.g. "U" for ICs, "RV" for pots), uppercased; undefined when absent.
 */
export function referencePrefixOf(symbol: SList): string | undefined {
  const reference = getSymbolProperty(symbol, 'Reference');
  const match = reference?.match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : undefined;
}

/** "lib:FootprintName" form used by the add flows: strips any library prefix and re-prefixes "lib:". */
export function normalizeFootprintRef(footprint: string): string {
  const parts = footprint.split(':');
  return parts[1] !== undefined ? `lib:${parts[1]}` : `lib:${footprint}`;
}

function parsePinNode(pin: SList): SymbolPin | null {
  const type = String(pin[1] ?? '');
  let name = '';
  let number = '';
  let hidden = false;
  let at: SymbolPin['at'] = null;

  for (const child of pin) {
    if (!Array.isArray(child)) {
      if (Sym.isSym(child) && child.name === 'hide') hidden = true;
      continue;
    }
    const childName = Sym.isSym(child[0]) ? child[0].name : undefined;
    if (childName === 'name') name = String(child[1] ?? '');
    else if (childName === 'number') number = String(child[1] ?? '');
    else if (childName === 'hide') hidden = String(child[1] ?? 'yes') !== 'no';
    else if (childName === 'at' && child.length > 3) {
      const x = parseFloat(String(child[1]));
      const y = parseFloat(String(child[2]));
      const angle = parseFloat(String(child[3]));
      if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(angle)) at = { x, y, angle };
    }
  }

  if (number.trim() === '') return null;
  return { type, name, number, hidden, at };
}

/**
 * All pins of a symbol, recursively — direct children and pins inside unit
 * sub-symbols (`(symbol "X_1_1" (pin ...))`) at any nesting depth, in document
 * order. Pins without a number are skipped, matching KiCad's format rules.
 */
export function extractPins(symbol: SList): SymbolPin[] {
  const pins: SymbolPin[] = [];

  function walk(node: SList): void {
    for (const el of node) {
      if (!Array.isArray(el)) continue;
      if (Sym.isSym(el[0]) && el[0].name === 'pin') {
        const pin = parsePinNode(el);
        if (pin) pins.push(pin);
      } else {
        walk(el);
      }
    }
  }

  walk(symbol);
  return pins;
}

function extendsParentOf(symbol: SList): string | undefined {
  for (const el of symbol) {
    if (Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'extends' && el.length > 1) {
      return String(el[1]);
    }
  }
  return undefined;
}

/**
 * Flatten one extends level onto an already-flattened parent node: the
 * derived symbol's top-level properties replace the parent's same-named
 * properties (or are appended when the parent lacks them); graphics, pins,
 * and units stay inherited from the parent. Non-property children such as
 * `(extends ...)` are dropped, keeping the result self-contained. Returns a
 * new list — inputs are never mutated, so cached library nodes stay pristine.
 */
function mergePropertiesOver(parent: SList, derived: SList): SList {
  const overrides = new Map<string, SList>();
  for (const el of derived) {
    if (Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'property' && el.length > 2) {
      overrides.set(String(el[1]), el);
    }
  }

  const merged: SExpr[] = [];
  const applied = new Set<string>();
  for (const el of parent) {
    if (Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'property' && el.length > 2) {
      const name = String(el[1]);
      const override = overrides.get(name);
      if (override) {
        merged.push(override);
        applied.add(name);
        continue;
      }
    }
    merged.push(el);
  }
  for (const [name, override] of overrides) {
    if (!applied.has(name)) merged.push(override);
  }
  return merged;
}

/**
 * Copy of a symbol node with its direct unit sub-symbols (`(symbol
 * "Name_0_1")` …) renamed from the parent's previous bare name to the new
 * one. Embedded lib_symbols unit sub-symbols carry the parent's BARE name
 * (no library prefix) as a `Name_unit_body` prefix, and KiCad associates
 * units with their parent by that prefix — a renamed parent must rename its
 * units to match or the schematic fails to load.
 */
function renameUnitChildren(node: SList, fromBareName: string, toBareName: string): SList {
  const out = [...node] as SList;
  if (fromBareName === toBareName) return out;
  const prefix = `${fromBareName}_`;
  for (let i = 0; i < out.length; i++) {
    const el = out[i];
    if (
      Array.isArray(el) &&
      Sym.isSym(el[0]) &&
      el[0].name === 'symbol' &&
      typeof el[1] === 'string' &&
      el[1].startsWith(prefix)
    ) {
      const renamed = [...el] as SList;
      renamed[1] = `${toBareName}_${el[1].slice(prefix.length)}`;
      out[i] = renamed;
    }
  }
  return out;
}

/**
 * Resolve a symbol in a library, following `(extends "Parent")` ancestry to
 * the ultimate base symbol and flattening the chain: the base contributes
 * graphics and pins, each derived level contributes its property overrides,
 * and the result is named after the requested `library:symbol` (never the
 * base). Parent references may be a bare name (same library) or `Lib:Name`
 * (cross-library, resolved via the loader). Circular chains and chains
 * deeper than {@link MAX_EXTENDS_DEPTH} resolve to null.
 */
export function resolveExtends(
  libraryName: string,
  symbolName: string,
  loadLibrary: LibraryLoader,
  visited: Set<string> = new Set(),
  depth = 0,
): ResolvedSymbol | null {
  if (depth >= MAX_EXTENDS_DEPTH) return null;

  const fqn = `${libraryName}:${symbolName}`;
  if (visited.has(fqn)) return null;

  const nodes = loadLibrary(libraryName);
  if (!nodes) return null;

  const node = findSymbolNode(nodes, symbolName);
  if (!node) return null;

  const parentRef = extendsParentOf(node);
  if (parentRef === undefined) {
    const flattened = renameUnitChildren(node, String(node[1]), symbolName);
    flattened[1] = fqn;
    return { libraryName, symbolName, node: flattened, serialized: serialize(flattened) };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(fqn);

  const separator = parentRef.indexOf(':');
  const parentLibrary = separator === -1 ? libraryName : parentRef.slice(0, separator);
  const parentName = separator === -1 ? parentRef : parentRef.slice(separator + 1);
  const parent = resolveExtends(parentLibrary, parentName, loadLibrary, nextVisited, depth + 1);
  if (!parent) return null;

  const merged = mergePropertiesOver(parent.node, node);
  const flattened = renameUnitChildren(merged, parent.symbolName, symbolName);
  flattened[1] = fqn;
  return { libraryName, symbolName, node: flattened, serialized: serialize(flattened) };
}
