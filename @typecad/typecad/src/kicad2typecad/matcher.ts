import path from 'node:path';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import logger from '../utils/logging.js';
import {
    analyzeFile,
    collectTypeScriptFiles,
    getMemberPrefix,
} from './source_analyzer.js';
import type {
    KicadFootprintIR,
    SourceLocation,
    MatchResult,
    MatchConfidence,
    CodeMetadata,
} from './types.js';

export class SourceMatcher {
    private sourceRoot: string;

    constructor(sourceRoot: string) {
        this.sourceRoot = sourceRoot;
    }

    async matchAll(footprints: KicadFootprintIR[]): Promise<MatchResult[]> {
        const results: MatchResult[] = [];
        for (const fp of footprints) {
            const result = await this.matchFootprint(fp);
            results.push(result);
        }
        return results;
    }

    async matchFootprint(fp: KicadFootprintIR): Promise<MatchResult> {
        const metadata = fp.codeMetadata;

        if (metadata) {
            const variableName = metadata.n;
            const filePath = metadata.f;
            const isThis = metadata.t ?? false;

            if (variableName && filePath) {
                const location = await this.findVariableInFile(filePath, variableName, isThis);
                if (location) {
                    const confidence = (metadata as CodeMetadata).u ? 'uuid' : 'variable-fallback';
                    return { irFootprint: fp, sourceLocation: location, matchConfidence: confidence };
                }
            }

            if (variableName && !filePath) {
                const location = await this.findVariableInSources(variableName, isThis);
                if (location) {
                    return { irFootprint: fp, sourceLocation: location, matchConfidence: 'variable-fallback' };
                }
            }

            if (!variableName && filePath && metadata.l) {
                const location = await this.findByFileAndLine(filePath, metadata.l);
                if (location) {
                    return { irFootprint: fp, sourceLocation: location, matchConfidence: 'variable-fallback' };
                }
            }
        }

        const refLocation = await this.findByReference(fp.reference, fp.footprintName);
        if (refLocation) {
            return { irFootprint: fp, sourceLocation: refLocation, matchConfidence: 'variable-fallback' };
        }

        return { irFootprint: fp, sourceLocation: null, matchConfidence: 'none' };
    }

    async findVariableInFile(
        filePath: string,
        variableName: string,
        isThis: boolean
    ): Promise<SourceLocation | null> {
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(this.sourceRoot, filePath);

        const analysis = await analyzeFile(resolvedPath);
        if (!analysis) return null;

        const component = analysis.components.find(c =>
            c.variableName === variableName &&
            (isThis === undefined || c.isThis === isThis)
        );

        if (component) {
            return {
                filePath: resolvedPath,
                variableName: component.variableName,
                isThis: component.isThis,
            };
        }

        return null;
    }

    private async findVariableInSources(variableName: string, isThis: boolean): Promise<SourceLocation | null> {
        const tsFiles = collectTypeScriptFiles(this.sourceRoot);
        for (const filePath of tsFiles) {
            const location = await this.findVariableInFile(filePath, variableName, isThis);
            if (location) return location;
        }
        return null;
    }

    private async findByFileAndLine(filePath: string, line: number): Promise<SourceLocation | null> {
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(this.sourceRoot, filePath);

        const analysis = await analyzeFile(resolvedPath);
        if (!analysis) return null;

        const component = analysis.components.find(c => c.line === line);
        if (component) {
            return {
                filePath: resolvedPath,
                variableName: component.variableName,
                isThis: component.isThis,
            };
        }

        return null;
    }

    private async findByReference(reference: string, footprintName: string): Promise<SourceLocation | null> {
        const tsFiles = collectTypeScriptFiles(this.sourceRoot);
        const libPart = footprintName.split(LIBRARY_SEPARATOR)[0] || '';

        for (const filePath of tsFiles) {
            const analysis = await analyzeFile(filePath);
            if (!analysis) continue;

            for (const comp of analysis.components) {
                if (comp.reference === reference) {
                    if (comp.footprint === footprintName ||
                        (libPart && comp.footprint?.startsWith(libPart + LIBRARY_SEPARATOR))) {
                        return {
                            filePath,
                            variableName: comp.variableName,
                            isThis: comp.isThis,
                        };
                    }
                }

                if (comp.footprint === footprintName || (libPart && comp.footprint?.startsWith(libPart + LIBRARY_SEPARATOR))) {
                    if (comp.constructorArgType === 'object') {
                        const refProp = comp.properties['reference'];
                        if (refProp && refProp.value === reference) {
                            return {
                                filePath,
                                variableName: comp.variableName,
                                isThis: comp.isThis,
                            };
                        }
                    }
                }

                if (comp.footprint === footprintName) {
                    if (comp.constructorArgType === 'string' || comp.constructorArgType === 'none') {
                        const refPrefix = reference.match(/^[A-Za-z]+/)?.[0] || '';
                        const refNum = parseInt(reference.slice(refPrefix.length), 10);
                        if (refPrefix && !isNaN(refNum) && !comp.reference) {
                            return {
                                filePath,
                                variableName: comp.variableName,
                                isThis: comp.isThis,
                            };
                        }
                    } else if (comp.constructorArgType === 'object' && !comp.reference) {
                        const refPrefix = reference.match(/^[A-Za-z]+/)?.[0] || '';
                        const refNum = parseInt(reference.slice(refPrefix.length), 10);
                        if (refPrefix && !isNaN(refNum)) {
                            return {
                                filePath,
                                variableName: comp.variableName,
                                isThis: comp.isThis,
                            };
                        }
                    }
                }
            }
        }

        return null;
    }
}
