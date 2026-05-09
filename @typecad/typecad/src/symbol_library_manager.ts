import { platform } from "node:os";
import fs from "node:fs";
import fsexp from "fast-sexpr";
import S from "./utils/sexpr_instance.js";
import { KiCAD } from "./kicad.js";
import {
    type SExprNode,
    type SymbolDefinition,
    type PinLocation,
    type BoundingBox,
    logError,
    logWarning,
} from './schematic_visualizer_types.js';

export class SymbolLibraryManager {
    private libraryCache: Map<string, SExprNode> = new Map();
    private symbolCache: Map<string, SymbolDefinition> = new Map();
    private pinLocationCache: Map<string, PinLocation> = new Map();
    private boundingBoxCache: Map<string, BoundingBox | null> = new Map();
    private kicadSymbolPath: string;

    constructor() {
        const kPath = KiCAD.path;
        this.kicadSymbolPath = platform() === 'win32'
            ? `${kPath}share/kicad/symbols`
            : `${kPath}symbols`;
    }

    private getLibraryContent(libraryName: string): SExprNode | null {
        if (this.libraryCache.has(libraryName)) {
            return this.libraryCache.get(libraryName)!;
        }

        let symbolFilePath = `${this.kicadSymbolPath}/${libraryName}.kicad_sym`;
        let symbolFileContents = "";

        try {
            if (fs.existsSync(symbolFilePath)) {
                symbolFileContents = fs.readFileSync(symbolFilePath, "utf8");
            } else {
                symbolFilePath = `./build/lib/${libraryName}.kicad_sym`;
                if (fs.existsSync(symbolFilePath)) {
                    symbolFileContents = fs.readFileSync(symbolFilePath, "utf8");
                } else {
                    logError(`Library file ${libraryName}.kicad_sym not found.`);
                    return null;
                }
            }

            const parsedLibrary = fsexp(symbolFileContents.replaceAll('"', "`")).pop();
            this.libraryCache.set(libraryName, parsedLibrary);
            return parsedLibrary;

        } catch (err) {
            logError(`Error reading or parsing library ${libraryName}:`, err);
            return null;
        }
    }

    private findSymbolInLibrary(libraryContent: SExprNode, libraryName: string, symbolName: string): SymbolDefinition | null {
        const symbolFqn = `${libraryName}:${symbolName}`;
        if (this.symbolCache.has(symbolFqn)) {
            return this.symbolCache.get(symbolFqn)!;
        }

        for (const item of libraryContent) {
            if (Array.isArray(item) && item.length > 1 && item[0] === 'symbol') {
                const currentSymbolName = String(item[1]).replaceAll('`', '');

                if (currentSymbolName === symbolName) {
                    const rawSexpr = [...item];

                    rawSexpr[1] = `"${symbolFqn}"`;

                    const extendsIndex = rawSexpr.findIndex(el => Array.isArray(el) && el[0] === 'extends');
                    if (extendsIndex !== -1 && Array.isArray(rawSexpr[extendsIndex]) && rawSexpr[extendsIndex].length > 1) {
                        const baseSymbolName = String(rawSexpr[extendsIndex][1]).replaceAll('`', '');
                        rawSexpr[extendsIndex][1] = `"${libraryName}:${baseSymbolName}"`;
                        const baseSymbolDef = this.getSymbolDefinition(`${libraryName}:${baseSymbolName}`);
                        if (baseSymbolDef) {
                            this.symbolCache.set(symbolFqn, baseSymbolDef);
                            return baseSymbolDef;
                        } else {
                            logError(`Base symbol ${libraryName}:${baseSymbolName} for ${symbolFqn} not found.`);
                            return null;
                        }
                    }

                    const serializedLibEntry = S.serialize(rawSexpr).replaceAll("`", '"');

                    const definition: SymbolDefinition = {
                        rawSexpr: rawSexpr,
                        serializedLibEntry: serializedLibEntry
                    };
                    this.symbolCache.set(symbolFqn, definition);
                    return definition;
                }
            }
        }
        return null;
    }

    public getSymbolDefinition(symbolFqn: string): SymbolDefinition | null {
        if (this.symbolCache.has(symbolFqn)) {
            return this.symbolCache.get(symbolFqn)!;
        }

        const parts = symbolFqn.split(':');
        if (parts.length !== 2) {
            logError(`Invalid fully qualified symbol name: ${symbolFqn}`);
            return null;
        }
        const [libraryName, symbolName] = parts;

        const libraryContent = this.getLibraryContent(libraryName);
        if (!libraryContent) {
            return null;
        }

        const definition = this.findSymbolInLibrary(libraryContent, libraryName, symbolName);
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

                if (element[0] === 'pin') {
                    let currentPinNumber: string | null = null;
                    let atData: number[] | null = null;

                    for (const prop of element) {
                        if (!Array.isArray(prop)) continue;
                        if (prop[0] === 'number' && prop.length > 1) {
                            currentPinNumber = String(prop[1]).replaceAll('`', '');
                        } else if (prop[0] === 'at' && prop.length > 3) {
                            atData = [parseFloat(String(prop[1])), parseFloat(String(prop[2])), parseFloat(String(prop[3]))];
                        }
                    }

                    if (currentPinNumber === String(pinNumber) && atData) {
                        const location: PinLocation = { x: atData[0], y: atData[1], angle: atData[2] };
                        this.pinLocationCache.set(cacheKey, location);
                        return location;
                    }
                }
                // Nested symbol units: (symbol NAME_1_1 (pin ...) (pin ...))
                else if (Array.isArray(element) && element.length > 1 && element[0] === 'symbol' && typeof element[1] === 'string') {
                    for (const subElement of element.slice(2)) {
                        if (!Array.isArray(subElement) || subElement.length === 0 || subElement[0] !== 'pin') continue;

                        let currentPinNumber: string | null = null;
                        let atData: number[] | null = null;

                        for (const prop of subElement) {
                            if (!Array.isArray(prop)) continue;
                            if (prop[0] === 'number' && prop.length > 1) {
                                currentPinNumber = String(prop[1]).replaceAll('`', '');
                            } else if (prop[0] === 'at' && prop.length > 3) {
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
        logError(`Failed structure for ${symbolFqn}:`, JSON.stringify(symbolDef?.rawSexpr, null, 2));
        return null;
    }

    private calculateSymbolBoundingBoxRecursive(element: string | SExprNode, currentBox: BoundingBox): void {
        if (!Array.isArray(element)) {
            return;
        }

        const elementType = element[0];

        if (elementType === 'rectangle' && element.length >= 3) {
            const start = element.find((el): el is SExprNode => Array.isArray(el) && el[0] === 'start');
            const end = element.find((el): el is SExprNode => Array.isArray(el) && el[0] === 'end');
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
        } else if (elementType === 'pin') {
            const at = element.find((el): el is SExprNode => Array.isArray(el) && el[0] === 'at');
            if (at && at.length >= 3) {
                const x = parseFloat(String(at[1]));
                const y = parseFloat(String(at[2]));
                currentBox.minX = Math.min(currentBox.minX, x);
                currentBox.minY = Math.min(currentBox.minY, y);
                currentBox.maxX = Math.max(currentBox.maxX, x);
                currentBox.maxY = Math.max(currentBox.maxY, y);
            }
        } else if (elementType === 'circle' && element.length >= 3) {
            const center = element.find((el): el is SExprNode => Array.isArray(el) && el[0] === 'center');
            const radiusEl = element.find((el): el is SExprNode => Array.isArray(el) && el[0] === 'radius');
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
            minX: Infinity, minY: Infinity,
            maxX: -Infinity, maxY: -Infinity
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
