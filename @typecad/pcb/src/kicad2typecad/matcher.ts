import path from 'node:path';
import { LIBRARY_SEPARATOR } from '../utils/constants.js';
import logger from '../utils/logging.js';
import { analyzeFile, collectTypeScriptFiles, getMemberPrefix } from './source_analyzer.js';
import type { ComponentInfo } from './source_analyzer.js';
import type { KicadFootprintIR, SourceLocation, MatchResult, MatchConfidence, CodeMetadata } from './types.js';

export class SourceMatcher {
  private sourceRoot: string;
  /** Components already claimed by an earlier match, keyed file#component. */
  private usedComponents = new Set<string>();

  constructor(sourceRoot: string) {
    this.sourceRoot = sourceRoot;
  }

  matchAll(footprints: KicadFootprintIR[]): MatchResult[] {
    this.usedComponents.clear();
    const results: MatchResult[] = [];
    for (const fp of footprints) {
      const result = this.matchFootprint(fp);
      results.push(result);
    }
    return results;
  }

  matchFootprint(fp: KicadFootprintIR): MatchResult {
    const metadata = fp.codeMetadata;

    if (metadata) {
      const variableName = metadata.n;
      const filePath = metadata.f;
      const isThis = metadata.t ?? false;

      if (variableName && filePath) {
        const location = this.findVariableInFile(filePath, variableName, isThis);
        if (location) {
          const confidence = (metadata as CodeMetadata).u ? 'uuid' : 'variable-fallback';
          return { irFootprint: fp, sourceLocation: location, matchConfidence: confidence };
        }
        // Stale file path (renames/moves): the variable name still
        // identifies the component, so search the other source files.
        const relocated = this.findVariableInSources(variableName, isThis, fp.reference);
        if (relocated) {
          return { irFootprint: fp, sourceLocation: relocated, matchConfidence: 'variable-fallback' };
        }
      }

      if (variableName && !filePath) {
        const location = this.findVariableInSources(variableName, isThis, fp.reference);
        if (location) {
          return { irFootprint: fp, sourceLocation: location, matchConfidence: 'variable-fallback' };
        }
      }

      if (!variableName && filePath && metadata.l) {
        const location = this.findByFileAndLine(filePath, metadata.l);
        if (location) {
          return { irFootprint: fp, sourceLocation: location, matchConfidence: 'variable-fallback' };
        }
      }
    }

    const refLocation = this.findByReference(fp.reference, fp.footprintName);
    if (refLocation) {
      return { irFootprint: fp, sourceLocation: refLocation, matchConfidence: 'variable-fallback' };
    }

    return { irFootprint: fp, sourceLocation: null, matchConfidence: 'none' };
  }

  findVariableInFile(filePath: string, variableName: string, isThis: boolean): SourceLocation | null {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.sourceRoot, filePath);

    const analysis = analyzeFile(resolvedPath);
    if (!analysis) return null;

    const component = analysis.components.find(
      (c) => c.variableName === variableName && (isThis === undefined || c.isThis === isThis),
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

  /**
   * Search every source file for a variable. When several files declare the
   * same name, prefer a component whose `reference` matches the board
   * footprint's reference; otherwise the first declaration wins.
   */
  private findVariableInSources(variableName: string, isThis: boolean, reference?: string): SourceLocation | null {
    const tsFiles = collectTypeScriptFiles(this.sourceRoot);
    const candidates: { filePath: string; component: ComponentInfo }[] = [];
    for (const filePath of tsFiles) {
      const analysis = analyzeFile(filePath);
      if (!analysis) continue;
      for (const component of analysis.components) {
        if (component.variableName !== variableName || component.isThis !== isThis) continue;
        if (this.usedComponents.has(`${filePath}#${component.line}`)) continue;
        candidates.push({ filePath, component });
      }
    }
    if (candidates.length === 0) return null;
    const byReference = reference ? candidates.filter((c) => c.component.reference === reference) : [];
    const chosen = byReference[0] ?? candidates[0];
    this.claim(chosen.filePath, chosen.component);
    return {
      filePath: chosen.filePath,
      variableName: chosen.component.variableName,
      isThis: chosen.component.isThis,
    };
  }

  private claim(filePath: string, component: { line: number }): void {
    this.usedComponents.add(`${filePath}#${component.line}`);
  }

  private findByFileAndLine(filePath: string, line: number): SourceLocation | null {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.sourceRoot, filePath);

    const analysis = analyzeFile(resolvedPath);
    if (!analysis) return null;

    const component = analysis.components.find((c) => c.line === line);
    if (component) {
      this.claim(resolvedPath, component);
      return {
        filePath: resolvedPath,
        variableName: component.variableName,
        isThis: component.isThis,
      };
    }

    return null;
  }

  /**
   * Last-resort matching by KiCad reference. Passives created through the
   * passives classes carry no explicit `footprint` property, so an exact
   * reference match is the strongest signal available for them; a
   * footprint-consistent match always wins over it.
   */
  private findByReference(reference: string, footprintName: string): SourceLocation | null {
    const tsFiles = collectTypeScriptFiles(this.sourceRoot);
    const libPart = footprintName.split(LIBRARY_SEPARATOR)[0] || '';

    type Candidate = { filePath: string; component: ComponentInfo; rank: number };
    let best: Candidate | null = null;

    for (const filePath of tsFiles) {
      const analysis = analyzeFile(filePath);
      if (!analysis) continue;

      for (let index = 0; index < analysis.components.length; index++) {
        const comp = analysis.components[index];
        const key = `${filePath}#${comp.line}`;
        if (this.usedComponents.has(key)) continue;

        let rank = 0;
        if (comp.reference === reference) {
          if (
            comp.footprint === footprintName ||
            (libPart && comp.footprint?.startsWith(libPart + LIBRARY_SEPARATOR))
          ) {
            rank = 3; // reference + footprint agree
          } else {
            rank = 1; // exact reference, footprint unknown (passives)
          }
        } else if (
          comp.footprint === footprintName ||
          (libPart && comp.footprint?.startsWith(libPart + LIBRARY_SEPARATOR))
        ) {
          if (comp.constructorArgType === 'object') {
            const refProp = comp.properties['reference'];
            if (refProp && refProp.value === reference) {
              rank = 3; // reference property literal (string-valued props)
            } else if (!comp.reference) {
              const refPrefix = reference.match(/^[A-Za-z]+/)?.[0] || '';
              const refNum = parseInt(reference.slice(refPrefix.length), 10);
              if (refPrefix && !isNaN(refNum)) {
                rank = 2; // anonymous component of the right footprint
              }
            }
          } else if ((comp.constructorArgType === 'string' || comp.constructorArgType === 'none') && !comp.reference) {
            const refPrefix = reference.match(/^[A-Za-z]+/)?.[0] || '';
            const refNum = parseInt(reference.slice(refPrefix.length), 10);
            if (refPrefix && !isNaN(refNum)) {
              rank = 2; // anonymous component of the right footprint
            }
          }
        }

        if (rank > (best?.rank ?? 0)) best = { filePath, component: comp, rank };
      }
    }

    if (!best) return null;
    this.claim(best.filePath, best.component);
    return {
      filePath: best.filePath,
      variableName: best.component.variableName,
      isThis: best.component.isThis,
    };
  }
}
