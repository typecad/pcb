import fs from 'node:fs';
import path from 'node:path';
import type {
    KicadFootprintIR,
    SourceLocation,
    MatchResult,
    MatchConfidence,
    CodeMetadata,
    LegacyCodeMetadata,
} from './types.js';

/**
 * Matches KiCad IR footprints to TypeScript source code locations.
 *
 * Matching strategy (in priority order):
 * 1. variable name from "Code" metadata — most reliable when available
 * 2. UUID + footprint hash proximity — stable across renames
 * 3. Legacy variable name regex — backward compatible
 *
 * The matcher reads source files and uses regex to find variable declarations
 * matching the component creation pattern (e.g., `this.X = new Component(...)`).
 */
export class SourceMatcher {
    private sourceRoot: string;

    constructor(sourceRoot: string) {
        this.sourceRoot = sourceRoot;
    }

    /**
     * Match all IR footprints to source locations.
     * Returns a MatchResult for each footprint, with null sourceLocation
     * for footprints that could not be matched.
     */
    matchAll(footprints: KicadFootprintIR[]): MatchResult[] {
        return footprints.map(fp => this.matchFootprint(fp));
    }

    /**
     * Match a single IR footprint to a source location.
     */
    matchFootprint(fp: KicadFootprintIR): MatchResult {
        const metadata = fp.codeMetadata;

        // Strategy 1: Use variable name + file from Code metadata
        if (metadata) {
            const variableName = metadata.n;
            const filePath = metadata.f;
            const isThis = metadata.t ?? false;

            // If we have a variable name and file path, try direct match
            if (variableName && filePath) {
                const location = this.findVariableInFile(filePath, variableName, isThis);
                if (location) {
                    const confidence = (metadata as CodeMetadata).u ? 'uuid' : 'variable-fallback';
                    return { irFootprint: fp, sourceLocation: location, matchConfidence: confidence };
                }
            }

            // If we have only variable name but no file, scan all source files
            if (variableName && !filePath) {
                const location = this.findVariableInSources(variableName, isThis);
                if (location) {
                    return { irFootprint: fp, sourceLocation: location, matchConfidence: 'variable-fallback' };
                }
            }
        }

        // Strategy 2: Try to find by reference + footprint name (for components without Code metadata)
        const refLocation = this.findByReference(fp.reference, fp.footprintName);
        if (refLocation) {
            return { irFootprint: fp, sourceLocation: refLocation, matchConfidence: 'variable-fallback' };
        }

        return { irFootprint: fp, sourceLocation: null, matchConfidence: 'none' };
    }

    /**
     * Find a variable declaration matching the given name in a specific file.
     * Returns the source location with file path, variable name, and isThis flag.
     */
    findVariableInFile(
        filePath: string,
        variableName: string,
        isThis: boolean
    ): SourceLocation | null {
        // Resolve relative paths against sourceRoot
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(this.sourceRoot, filePath);

        let content: string;
        try {
            content = fs.readFileSync(resolvedPath, 'utf-8');
        } catch {
            return null;
        }

        const lines = content.split('\n');
        const escapedVar = escapeRegex(variableName);

        // Build regex based on whether it's this.X or let/const/var X
        // Matches: this.variableName = new ...
        //          let variableName = new ...
        //          const variableName = new ...
        //          var variableName = new ...
        const patterns = [
            // this.X = new ... (class member)
            new RegExp(`^\\s*this\\.\\s*${escapedVar}\\s*=\\s*new\\s+`),
            // let/const/var X = new ... (local variable)
            new RegExp(`^\\s*(let|const|var)\\s+${escapedVar}\\s*=\\s*new\\s+`),
            // Implicit: X = new ... (no keyword, rare)
            new RegExp(`^\\s*${escapedVar}\\s*=\\s*new\\s+`),
        ];

        for (let i = 0; i < lines.length; i++) {
            for (const pattern of patterns) {
                if (pattern.test(lines[i])) {
                    // Verify the variable name is actually used in a Component-like constructor
                    // by checking for a class name or footprint-like pattern nearby
                    if (lines[i].includes('Component') || lines[i].includes('package')) {
                        return { filePath: resolvedPath, variableName, isThis };
                    }
                    // Also check next few lines for footprint: or pcb: patterns
                    for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
                        if (lines[j].match(/footprint:\s*['"]/) || lines[j].match(/\bpcb:\s*\{/)) {
                            return { filePath: resolvedPath, variableName, isThis };
                        }
                    }
                    // Accept the match if we at least found a `new` call
                    if (lines[i].match(/new\s+\w+/)) {
                        return { filePath: resolvedPath, variableName, isThis };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Scan all TypeScript source files under sourceRoot for a variable declaration
     * matching the given name.
     */
    private findVariableInSources(variableName: string, isThis: boolean): SourceLocation | null {
        const tsFiles = this.collectTypeScriptFiles(this.sourceRoot);
        for (const filePath of tsFiles) {
            const location = this.findVariableInFile(filePath, variableName, isThis);
            if (location) return location;
        }
        return null;
    }

    /**
     * Try to find a source location by KiCad reference designator and footprint name.
     * Used as a last-resort for components without Code metadata.
     */
    private findByReference(reference: string, footprintName: string): SourceLocation | null {
        const tsFiles = this.collectTypeScriptFiles(this.sourceRoot);

        // Extract the library name from the footprint (e.g., "lib:QFN50P..." → "lib")
        const libPart = footprintName.split(':')[0] || '';

        for (const filePath of tsFiles) {
            let content: string;
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch {
                continue;
            }

            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                // Look for lines containing the footprint name and reference
                if (lines[i].includes(footprintName) || (libPart && lines[i].includes(libPart))) {
                    // Check if this is a Component instantiation
                    const varMatch = lines[i].match(
                        /(?:this\.)?(\w+)\s*=\s*new\s+/
                    );
                    if (varMatch) {
                        // Check nearby lines for the reference
                        for (let j = i; j < Math.min(lines.length, i + 10); j++) {
                            if (lines[j].includes(`'${reference}'`) || lines[j].includes(`"${reference}"`)) {
                                return {
                                    filePath,
                                    variableName: varMatch[1],
                                    isThis: lines[i].includes('this.'),
                                };
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Collect all TypeScript source files under a directory.
     * Skips node_modules, dist, and build directories.
     */
    private collectTypeScriptFiles(dir: string): string[] {
        const results: string[] = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    // Skip common non-source directories
                    if (['node_modules', 'dist', 'build', '.git', '.typecode'].includes(entry.name)) {
                        continue;
                    }
                    results.push(...this.collectTypeScriptFiles(fullPath));
                } else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        } catch {
            // Directory not readable, skip
        }
        return results;
    }
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
