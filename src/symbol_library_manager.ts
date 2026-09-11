import fs from 'node:fs';
import { serialize, Sym } from './sexpr/index.js';
import { KiCAD } from './kicad.js';
import { LIBRARY_SEPARATOR, getBuildDir } from './utils/constants.js';
import type { SExprNode } from './types/sexpr_types.js';
import { extractPins, findSymbolNode, parseSymbolLibrary, resolveExtends } from './symbol_core.js';
import {
  type SymbolDefinition,
  type PinLocation,
  type BoundingBox,
  type PinInfo,
  logError,
  logWarning,
} from './renderers/schematic_visualizer_types.js';

export class SymbolLibraryManager {
  private libraryCache: Map<string, SExprNode> = new Map();
  private symbolCache: Map<string, SymbolDefinition> = new Map();
  private pinLocationCache: Map<string, PinLocation> = new Map();
  private pinInfoCache: Map<string, Map<string, PinInfo>> = new Map();
  private boundingBoxCache: Map<string, BoundingBox | null> = new Map();
  private kicadSymbolPath: string;

  constructor() {
    const kicad = KiCAD.instance;
    const libraryPaths = kicad.getLibraryPaths();
    this.kicadSymbolPath = libraryPaths.symbols || '';
  }

  private getLibraryContent(libraryName: string): SExprNode | null {
    if (this.libraryCache.has(libraryName)) {
      return this.libraryCache.get(libraryName)!;
    }

    let symbolFilePath = `${this.kicadSymbolPath}/${libraryName}.kicad_sym`;
    let symbolFileContents = '';

    try {
      if (fs.existsSync(symbolFilePath)) {
        symbolFileContents = fs.readFileSync(symbolFilePath, 'utf8');
      } else {
        symbolFilePath = `${getBuildDir()}/lib/${libraryName}.kicad_sym`;
        if (fs.existsSync(symbolFilePath)) {
          symbolFileContents = fs.readFileSync(symbolFilePath, 'utf8');
        } else {
          logError(`Library file ${libraryName}.kicad_sym not found.`);
          return null;
        }
      }

      const parsedLibrary = parseSymbolLibrary(symbolFileContents);
      this.libraryCache.set(libraryName, parsedLibrary);
      return parsedLibrary;
    } catch (err) {
      logError(`Error reading or parsing library ${libraryName}:`, err);
      return null;
    }
  }

  private findSymbolInLibrary(
    libraryContent: SExprNode,
    libraryName: string,
    symbolName: string,
    visited?: Set<string>,
  ): SymbolDefinition | null {
    const symbolFqn = `${libraryName}:${symbolName}`;

    if (visited && visited.has(symbolFqn)) {
      logError(`Circular extends detected for symbol ${symbolFqn}. Resolution aborted to prevent infinite recursion.`);
      return null;
    }

    if (this.symbolCache.has(symbolFqn)) {
      return this.symbolCache.get(symbolFqn)!;
    }

    if (!findSymbolNode(libraryContent, symbolName)) {
      return null;
    }

    // resolveExtends returns the symbol itself when it has no (extends ...) parent,
    // and otherwise flattens the chain (including cross-library parents) via the loader.
    const resolved = resolveExtends(
      libraryName,
      symbolName,
      (lib) => (lib === libraryName ? libraryContent : this.getLibraryContent(lib)),
      new Set(visited),
    );
    if (!resolved) {
      logError(`Base symbol of the extends chain for ${symbolFqn} not found.`);
      return null;
    }

    // The embedded lib_symbols entry must carry the REQUESTED symbol's name
    // to match the placed symbol's lib_id — KiCad silently drops components
    // whose lib_id has no matching embedded definition (netlist export and
    // ERC omit them entirely). resolveExtends already flattens extends
    // chains and names the node this way; the explicit assignment keeps that
    // contract local and obvious.
    const rawSexpr = [...resolved.node] as SExprNode;
    rawSexpr[1] = symbolFqn;

    const definition: SymbolDefinition = {
      rawSexpr: rawSexpr,
      serializedLibEntry: serialize(rawSexpr),
    };

    this.symbolCache.set(symbolFqn, definition);
    return definition;
  }

  public getSymbolDefinition(symbolFqn: string, visited?: Set<string>): SymbolDefinition | null {
    if (this.symbolCache.has(symbolFqn)) {
      return this.symbolCache.get(symbolFqn)!;
    }

    const parts = symbolFqn.split(LIBRARY_SEPARATOR);
    if (parts.length !== 2) {
      logError(`Invalid fully qualified symbol name: ${symbolFqn}`);
      return null;
    }
    const [libraryName, symbolName] = parts;

    const libraryContent = this.getLibraryContent(libraryName);
    if (!libraryContent) {
      return null;
    }

    const definition = this.findSymbolInLibrary(libraryContent, libraryName, symbolName, visited);
    if (!definition) {
      logError(`Symbol definition ${symbolFqn} not found in library ${libraryName}.`);
    }
    return definition;
  }

  public getPinLocation(symbolFqn: string, pinNumber: string | number): PinLocation | null {
    const cacheKey = `${symbolFqn}_${pinNumber}`;
    if (this.pinLocationCache.has(cacheKey)) {
      return this.pinLocationCache.get(cacheKey)!;
    }

    const symbolDef = this.getSymbolDefinition(symbolFqn);
    if (!symbolDef) {
      return null;
    }

    try {
      const match = extractPins(symbolDef.rawSexpr).find((pin) => pin.number === String(pinNumber) && pin.at);
      if (match?.at) {
        const location: PinLocation = { x: match.at.x, y: match.at.y, angle: match.at.angle };
        this.pinLocationCache.set(cacheKey, location);
        return location;
      }
    } catch (e) {
      logError(`Error parsing pin data for ${symbolFqn} pin ${pinNumber}:`, e);
      return null;
    }

    logError(`Pin ${pinNumber} not found in symbol ${symbolFqn}`);
    return null;
  }

  private calculateSymbolBoundingBoxRecursive(element: unknown, currentBox: BoundingBox): void {
    if (!Array.isArray(element)) {
      return;
    }

    const tag = Sym.isSym(element[0]) ? element[0].name : String(element[0]);

    if (tag === 'rectangle' && element.length >= 3) {
      const start = element.find(
        (el): el is SExprNode => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'start',
      );
      const end = element.find((el): el is SExprNode => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'end');
      if (start && end && start.length >= 3 && end.length >= 3) {
        const x1 = parseFloat(String(start[1]));
        const y1 = parseFloat(String(start[2]));
        const x2 = parseFloat(String(end[1]));
        const y2 = parseFloat(String(end[2]));
        currentBox.minX = Math.min(currentBox.minX, x1, x2);
        currentBox.minY = Math.min(currentBox.minY, y1, y2);
        currentBox.maxX = Math.max(currentBox.maxX, x1, x2);
        currentBox.maxY = Math.max(currentBox.maxY, y1, y2);
      }
    } else if (tag === 'pin') {
      const at = element.find((el): el is SExprNode => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'at');
      if (at && at.length >= 3) {
        const x = parseFloat(String(at[1]));
        const y = parseFloat(String(at[2]));
        currentBox.minX = Math.min(currentBox.minX, x);
        currentBox.minY = Math.min(currentBox.minY, y);
        currentBox.maxX = Math.max(currentBox.maxX, x);
        currentBox.maxY = Math.max(currentBox.maxY, y);
      }
    } else if (tag === 'circle' && element.length >= 3) {
      const center = element.find(
        (el): el is SExprNode => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'center',
      );
      const radiusEl = element.find(
        (el): el is SExprNode => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'radius',
      );
      if (center && radiusEl && center.length >= 3 && radiusEl.length >= 2) {
        const cx = parseFloat(String(center[1]));
        const cy = parseFloat(String(center[2]));
        const r = parseFloat(String(radiusEl[1]));
        currentBox.minX = Math.min(currentBox.minX, cx - r);
        currentBox.minY = Math.min(currentBox.minY, cy - r);
        currentBox.maxX = Math.max(currentBox.maxX, cx + r);
        currentBox.maxY = Math.max(currentBox.maxY, cy + r);
      }
    }

    for (let i = 1; i < element.length; i++) {
      this.calculateSymbolBoundingBoxRecursive(element[i], currentBox);
    }
  }

  /**
   * Get a map of pin number → { name, type } for all pins in a symbol.
   * Extracts pin name and electrical type from KiCAD symbol s-expressions:
   *   (pin <electrical_type> <graphical_style> ... (name "...") (number "..."))
   */
  public getPinInfoMap(symbolFqn: string): Map<string, PinInfo> | null {
    if (this.pinInfoCache.has(symbolFqn)) {
      return this.pinInfoCache.get(symbolFqn)!;
    }

    const symbolDef = this.getSymbolDefinition(symbolFqn);
    if (!symbolDef) {
      return null;
    }

    const pinMap = new Map<string, PinInfo>();
    for (const pin of extractPins(symbolDef.rawSexpr)) {
      pinMap.set(pin.number, { name: pin.name, type: pin.type });
    }

    if (pinMap.size === 0) {
      logError(`No pins found in symbol ${symbolFqn}`);
      return null;
    }

    this.pinInfoCache.set(symbolFqn, pinMap);
    return pinMap;
  }

  public getSymbolBoundingBox(symbolFqn: string): BoundingBox | null {
    if (this.boundingBoxCache.has(symbolFqn)) {
      return this.boundingBoxCache.get(symbolFqn)!;
    }

    const symbolDef = this.getSymbolDefinition(symbolFqn);
    if (!symbolDef) {
      logError(`Cannot calculate bounding box: Symbol definition ${symbolFqn} not found.`);
      this.boundingBoxCache.set(symbolFqn, null);
      return null;
    }

    const boundingBox: BoundingBox = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };

    this.calculateSymbolBoundingBoxRecursive(symbolDef.rawSexpr, boundingBox);

    if (boundingBox.minX === Infinity || boundingBox.maxX === -Infinity) {
      logWarning(`No recognized graphical elements found to calculate bounding box for ${symbolFqn}.`);
      this.boundingBoxCache.set(symbolFqn, null);
      return null;
    }

    this.boundingBoxCache.set(symbolFqn, boundingBox);
    return boundingBox;
  }
}

let _sharedInstance: SymbolLibraryManager | undefined;

export function getSymbolLibraryManager(): SymbolLibraryManager {
  if (!_sharedInstance) {
    _sharedInstance = new SymbolLibraryManager();
  }
  return _sharedInstance;
}

export function resetSymbolLibraryManager(): void {
  _sharedInstance = undefined;
}
