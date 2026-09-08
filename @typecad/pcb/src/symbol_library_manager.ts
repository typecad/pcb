import fs from 'node:fs';
import { parseAsList, serialize, Sym } from './sexpr/index.js';
import type { SExpr } from './sexpr/types.js';
import { KiCAD } from './kicad.js';
import { LIBRARY_SEPARATOR } from './utils/constants.js';
import type { SExprNode } from './types/sexpr_types.js';
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
        symbolFilePath = `./build/lib/${libraryName}.kicad_sym`;
        if (fs.existsSync(symbolFilePath)) {
          symbolFileContents = fs.readFileSync(symbolFilePath, 'utf8');
        } else {
          logError(`Library file ${libraryName}.kicad_sym not found.`);
          return null;
        }
      }

      const parsedLibrary = parseAsList(symbolFileContents);
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

    for (const item of libraryContent) {
      if (Array.isArray(item) && item.length > 1 && Sym.isSym(item[0]) && item[0].name === 'symbol') {
        const currentSymbolName = String(item[1]);

        if (currentSymbolName === symbolName) {
          const rawSexpr = [...item];

          rawSexpr[1] = symbolFqn;

          const extendsIndex = rawSexpr.findIndex(
            (el) => Array.isArray(el) && el.length > 0 && Sym.isSym(el[0]) && el[0].name === 'extends',
          );
          if (extendsIndex !== -1 && Array.isArray(rawSexpr[extendsIndex]) && rawSexpr[extendsIndex].length > 1) {
            const baseSymbolName = String(rawSexpr[extendsIndex][1]);
            rawSexpr[extendsIndex][1] = `${libraryName}:${baseSymbolName}`;
            const nextVisited = new Set(visited);
            nextVisited.add(symbolFqn);
            const baseSymbolDef = this.getSymbolDefinition(`${libraryName}:${baseSymbolName}`, nextVisited);
            if (baseSymbolDef) {
              this.symbolCache.set(symbolFqn, baseSymbolDef);
              return baseSymbolDef;
            } else {
              logError(`Base symbol ${libraryName}:${baseSymbolName} for ${symbolFqn} not found.`);
              return null;
            }
          }

          const serializedLibEntry = serialize(rawSexpr);

          const definition: SymbolDefinition = {
            rawSexpr: rawSexpr,
            serializedLibEntry: serializedLibEntry,
          };
          this.symbolCache.set(symbolFqn, definition);
          return definition;
        }
      }
    }
    return null;
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
      for (const element of symbolDef.rawSexpr) {
        if (!Array.isArray(element)) continue;

        if (Sym.isSym(element[0]) && element[0].name === 'pin') {
          let currentPinNumber: string | null = null;
          let atData: number[] | null = null;

          for (const prop of element) {
            if (!Array.isArray(prop)) continue;
            if (Sym.isSym(prop[0]) && prop[0].name === 'number' && prop.length > 1) {
              currentPinNumber = String(prop[1]);
            } else if (Sym.isSym(prop[0]) && prop[0].name === 'at' && prop.length > 3) {
              atData = [parseFloat(String(prop[1])), parseFloat(String(prop[2])), parseFloat(String(prop[3]))];
            }
          }

          if (currentPinNumber === String(pinNumber) && atData) {
            const location: PinLocation = { x: atData[0], y: atData[1], angle: atData[2] };
            this.pinLocationCache.set(cacheKey, location);
            return location;
          }
        } else if (
          Array.isArray(element) &&
          element.length > 1 &&
          Sym.isSym(element[0]) &&
          element[0].name === 'symbol' &&
          typeof element[1] === 'string'
        ) {
          for (const subElement of element.slice(2)) {
            if (
              !Array.isArray(subElement) ||
              subElement.length === 0 ||
              !(Sym.isSym(subElement[0]) && subElement[0].name === 'pin')
            )
              continue;

            let currentPinNumber: string | null = null;
            let atData: number[] | null = null;

            for (const prop of subElement) {
              if (!Array.isArray(prop)) continue;
              if (Sym.isSym(prop[0]) && prop[0].name === 'number' && prop.length > 1) {
                currentPinNumber = String(prop[1]);
              } else if (Sym.isSym(prop[0]) && prop[0].name === 'at' && prop.length > 3) {
                atData = [parseFloat(String(prop[1])), parseFloat(String(prop[2])), parseFloat(String(prop[3]))];
              }
            }

            if (currentPinNumber === String(pinNumber) && atData) {
              const location: PinLocation = { x: atData[0], y: atData[1], angle: atData[2] };
              this.pinLocationCache.set(cacheKey, location);
              return location;
            }
          }
        }
      }
    } catch (e) {
      logError(`Error parsing pin data for ${symbolFqn} pin ${pinNumber}:`, e);
      return null;
    }

    logError(`Pin ${pinNumber} not found in symbol ${symbolFqn}`);
    return null;
  }

  private calculateSymbolBoundingBoxRecursive(element: SExpr, currentBox: BoundingBox): void {
    if (!Array.isArray(element)) {
      return;
    }

    const tag = Sym.isSym(element[0]) ? element[0].name : String(element[0]);

    if (tag === 'rectangle' && element.length >= 3) {
      const start = element.find(
        (el): el is SExpr[] => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'start',
      );
      const end = element.find((el): el is SExpr[] => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'end');
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
      const at = element.find((el): el is SExpr[] => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'at');
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
        (el): el is SExpr[] => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'center',
      );
      const radiusEl = element.find(
        (el): el is SExpr[] => Array.isArray(el) && Sym.isSym(el[0]) && el[0].name === 'radius',
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
    this.extractPinInfo(symbolDef.rawSexpr, pinMap);

    if (pinMap.size === 0) {
      logError(`No pins found in symbol ${symbolFqn}`);
      return null;
    }

    this.pinInfoCache.set(symbolFqn, pinMap);
    return pinMap;
  }

  /**
   * Recursively walk a symbol definition extracting (pin ...) nodes.
   * Handles both top-level pins and pins nested inside (symbol NAME_1_1 ...) units.
   */
  private extractPinInfo(element: SExpr[], pinMap: Map<string, PinInfo>): void {
    for (const item of element) {
      if (!Array.isArray(item)) continue;

      const itemTag = Sym.isSym(item[0]) ? item[0].name : '';
      if (itemTag === 'pin') {
        const pinType = Sym.isSym(item[1]) ? item[1].name : typeof item[1] === 'string' ? item[1] : '';
        let pinName = '';
        let pinNumber = '';

        for (const child of item) {
          if (!Array.isArray(child)) continue;
          const childTag = Sym.isSym(child[0]) ? child[0].name : '';
          if (childTag === 'name' && typeof child[1] === 'string') {
            pinName = child[1];
          }
          if (childTag === 'number' && typeof child[1] === 'string') {
            pinNumber = child[1];
          }
        }

        if (pinNumber && pinName) {
          pinMap.set(pinNumber, { name: pinName, type: pinType });
        }
      } else if (Array.isArray(item)) {
        // Recurse into nested lists (e.g. (symbol NAME_1_1 (pin ...)))
        this.extractPinInfo(item, pinMap);
      }
    }
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
