import fs from 'node:fs';
import * as acorn from 'acorn';
import { simple as walk } from 'acorn-walk';
import type { Node, ObjectExpression, VariableDeclaration, AssignmentExpression, NewExpression } from 'acorn';
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

const getTsPluginModule = (() => {
    let cached: object | null | undefined = undefined;
    return (): object | null | undefined => {
        if (cached === undefined) {
            try {
                cached = _require('acorn-typescript') || null;
            } catch {
                cached = null;
            }
        }
        return cached;
    };
})();

/**
 * Inspects source code to find variable name and params for a instantiation.
 */
export function inspectSource(filePath: string, line: number): { variable?: string, params?: Record<string, unknown>, isThis?: boolean } {
    let sourceContent = '';
    try {
        sourceContent = fs.readFileSync(filePath, 'utf8');

        // 1. Try AST Parsing
        try {
            const tsPlugin = getTsPluginModule();
            let ast: acorn.Node;
            if (tsPlugin) {
                // @ts-expect-error - acorn-typescript loaded lazily
                const Parser = acorn.Parser.extend(tsPlugin.default ? tsPlugin.default() : tsPlugin());
                ast = Parser.parse(sourceContent, {
                    ecmaVersion: 2022,
                    sourceType: 'module',
                    locations: true,
                    allowReturnOutsideFunction: true,
                    allowImportExportEverywhere: true
                });
            } else {
                // Fall back to plain acorn (no TypeScript-specific syntax support,
                // but handles the common `new` patterns we care about)
                ast = acorn.parse(sourceContent, {
                    ecmaVersion: 2022,
                    sourceType: 'module',
                    locations: true,
                    allowReturnOutsideFunction: true,
                    allowImportExportEverywhere: true
                });
            }

            let targetVariable: string | undefined;
            let targetParams: Record<string, unknown> | undefined;
            let targetIsThis = false;
            let foundVariable = false;
            let targetStartLine = -1; // track the best match proximity

            walk(ast, {
                VariableDeclaration(node: Node) {
                    if (!node.loc) return;
                    const declStart = node.loc.start.line;
                    const declEnd = node.loc.end.line;
                    // Check if the variable declaration spans or is near the target line
                    if (declStart <= line && declEnd >= line) {
                        (node as VariableDeclaration).declarations.forEach((decl) => {
                            if (decl.init && decl.init.type === 'NewExpression' &&
                                decl.init.callee.type === 'Identifier') {
                                if (decl.id && decl.id.type === 'Identifier') {
                                    const dist = Math.abs(declStart - line);
                                    // Take the closest match when multiple exist
                                    if (!foundVariable || dist < Math.abs(targetStartLine - line)) {
                                        targetVariable = decl.id.name;
                                        targetIsThis = false;
                                        foundVariable = true;
                                        targetStartLine = declStart;
                                    }
                                }

                                const arg = decl.init.arguments[0];
                                if (arg && arg.type === 'ObjectExpression') {
                                    targetParams = extractAstObject(arg as ObjectExpression);
                                }
                            }
                        });
                    }
                },
                AssignmentExpression(node: Node) {
                    if (!node.loc) return;
                    const exprStart = node.loc.start.line;
                    const exprEnd = node.loc.end.line;
                    // Check if the assignment spans or is near the target line
                    if (exprStart <= line && exprEnd >= line &&
                        (node as AssignmentExpression).right.type === 'NewExpression' &&
                        ((node as AssignmentExpression).left.type === 'Identifier' || (node as AssignmentExpression).left.type === 'MemberExpression')) {

                        const left = (node as AssignmentExpression).left as import('acorn').Identifier | import('acorn').MemberExpression;
                        let isThisAssign = false;
                        let varName: string | undefined;

                        if (left.type === 'Identifier') {
                            varName = left.name;
                        } else if (left.type === 'MemberExpression') {
                            const property = left.property;
                            if (property && property.type === 'Identifier') {
                                varName = property.name;
                                const object = left.object;
                                if (object && (object.type === 'ThisExpression' || (object.type === 'Identifier' && object.name === 'this'))) {
                                    isThisAssign = true;
                                }
                            }
                        }

                        if (varName) {
                            const dist = Math.abs(exprStart - line);
                            // Prefer `this.X` assignments over non-this for the same line proximity
                            const isBetter = !foundVariable
                                || dist < Math.abs(targetStartLine - line)
                                || (dist === Math.abs(targetStartLine - line) && isThisAssign && !targetIsThis);

                            if (isBetter) {
                                targetVariable = varName;
                                targetIsThis = isThisAssign;
                                foundVariable = true;
                                targetStartLine = exprStart;
                            }

                            const arg = ((node as AssignmentExpression).right as NewExpression).arguments[0];
                            if (arg && arg.type === 'ObjectExpression') {
                                targetParams = extractAstObject(arg as ObjectExpression);
                            }
                        }
                    }
                }
            });

            if (foundVariable) {
                return { variable: targetVariable, params: targetParams, isThis: targetIsThis };
            }
        } catch {
            // AST parsing failed (e.g., TypeScript syntax not understood by plain acorn).
            // Fall through to regex-based fallback below.
        }

        // 2. Fallback to Regex and Text Parsing
        const lines = sourceContent.split('\n');
        const startLine = Math.max(0, line - 10);
        const endLine = Math.min(lines.length, line + 10);
        const multiLineCode = lines.slice(startLine, endLine).join('\n');
        
        // Single-line fallback (prioritize target line)
        const targetLine = lines[line - 1];

        // Guard: if the target line contains super(), this is a subclass
        // constructor frame, not the user's instantiation site. Return empty
        // to avoid picking up a bogus variable from a nearby Pin initializer.
        if (targetLine && targetLine.includes('super(')) {
            return {};
        }

        if (targetLine) {
            const varMatch = targetLine.match(/^\s*(let|const|var|)\s*(this\.)?(\w+)\s*=\s*new\s+[\w.#]+\s*\(/);
            if (varMatch) {
                const variable = varMatch[3];
                const isThis = !!varMatch[2];
                return { variable, isThis };
            }

            // Simpler fallback for 'this.X = new Y(' patterns when the
            // primary regex fails on transformed/cached source files.
            const thisAssignMatch = targetLine.match(/^\s*this\.(\w+)\s*=\s*new\s+[\w.#]+/);
            if (thisAssignMatch) {
                return { variable: thisAssignMatch[1], isThis: true };
            }
        }

        // Enhanced regex to capture multi-line object literals properly
        const multiVarMatch = multiLineCode.match(/^\s*(let|const|var|)\s*(?:this\.)?(\w+)\s*=\s*new\s+[\w.#]+\s*\(\s*\{[\s\S]*?\}\s*\)\s*;?\s*$/m);
        if (multiVarMatch && multiVarMatch.length > 2) {
            const variable = multiVarMatch[2];
            let params: Record<string, unknown> | undefined;

            const paramsMatch = multiLineCode.match(/new\s+[\w.#]+\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;?\s*$/m);
            if (paramsMatch && paramsMatch[1]) {
                const paramsStr = paramsMatch[1].trim();
                params = parseObjectLiteral(paramsStr);
            }
            return { variable, params };
        }

        // 3. Search backwards as last resort
        if (line > 1) {
            let searchLine = line - 1;
            while (searchLine >= Math.max(0, line - 20)) {
                const lineText = lines[searchLine];
                if (lineText) {
                    // Skip Pin initializers - they're not Component instantiations
                    if (lineText.includes('new Pin(')) continue;
                    const varMatch = lineText.match(/^\s*(let|const|var|)\s*(this\.)?(\w+)\s*=\s*new\s+[\w.#]+\s*\(/);
                    if (varMatch) {
                        return { variable: varMatch[3], isThis: !!varMatch[2] };
                    }
                }
                searchLine--;
            }
        }

        return {};
    } catch {
        return {};
    }
}

// Helper function to extract object from AST node
function extractAstObject(node: ObjectExpression): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    node.properties.forEach((prop) => {
        if (prop.type !== 'Property') return;
        if (prop.key && prop.key.type === 'Identifier' && prop.value) {
            const key = prop.key.name;
            obj[key] = extractAstValue(prop.value);
        }
    });
    return obj;
}

type AcornNode = acorn.Node & {
    value?: unknown;
    name?: string;
    quasis?: { value: { raw: string } }[];
    elements?: acorn.Node[];
};

// Recursive helper to extract values from AST nodes
function extractAstValue(node: acorn.Node): unknown {
    const n = node as AcornNode;
    switch (n.type) {
        case 'Literal': return n.value;
        case 'StringLiteral': return n.value;
        case 'NumericLiteral': return n.value;
        case 'BooleanLiteral': return n.value;
        case 'ObjectExpression': return extractAstObject(node as ObjectExpression);
        case 'ArrayExpression': return n.elements ? n.elements.map(extractAstValue) : [];
        case 'Identifier': return n.name;
        case 'TemplateLiteral':
            if (n.quasis && n.quasis.length > 0) {
                return n.quasis[0].value.raw;
            }
            return undefined;
        default: return undefined;
    }
}

// Helper function to parse object literals from string
function parseObjectLiteral(objStr: string): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    const content = objStr.slice(1, -1).trim(); // Remove braces
    
    const pairs = splitObjectPairs(content);
    
    for (const pair of pairs) {
        const colonIndex = pair.indexOf(':');
        if (colonIndex > 0) {
            const key = pair.substring(0, colonIndex).trim();
            const val = pair.substring(colonIndex + 1).trim();
            if (key && val) {
                obj[key] = parseValue(val);
            }
        }
    }
    return obj;
}

// Helper to split object pairs properly, handling nested objects
function splitObjectPairs(str: string): string[] {
    const pairs: string[] = [];
    let current = '';
    let braceLevel = 0;
    let bracketLevel = 0;
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        current += char;
        
        if (char === '{') braceLevel++;
        if (char === '}') braceLevel--;
        if (char === '[') bracketLevel++;
        if (char === ']') bracketLevel--;
        
        if (char === ',' && braceLevel === 0 && bracketLevel === 0) {
            pairs.push(current.slice(0, -1).trim()); // Remove comma
            current = '';
        }
    }
    
    if (current.trim()) {
        pairs.push(current.trim());
    }
    
    return pairs;
}

// Helper to parse individual values
function parseValue(val: string): unknown {
    val = val.trim();
    
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        return val.slice(1, -1);
    }
    
    if (!isNaN(Number(val))) {
        return Number(val);
    }
    
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (val === 'undefined') return undefined;
    
    if (val.startsWith('{') && val.endsWith('}')) {
        return parseObjectLiteral(val);
    }
    
    if (val.startsWith('[') && val.endsWith(']')) {
        const content = val.slice(1, -1).trim();
        if (!content) return [];
        const elements = splitArrayElements(content);
        return elements.map(parseValue);
    }
    
    return val;
}

// Helper to split array elements properly
function splitArrayElements(str: string): string[] {
    const elements: string[] = [];
    let current = '';
    let braceLevel = 0;
    let bracketLevel = 0;
    let quoteChar = '';
    
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        current += char;
        
        if ((char === '"' || char === "'") && !quoteChar) {
            quoteChar = char;
        } else if (char === quoteChar) {
            quoteChar = '';
        }
        
        if (!quoteChar) {
            if (char === '{') braceLevel++;
            if (char === '}') braceLevel--;
            if (char === '[') bracketLevel++;
            if (char === ']') bracketLevel--;
        }
        
        if (char === ',' && braceLevel === 0 && bracketLevel === 0 && !quoteChar) {
            elements.push(current.slice(0, -1).trim()); // Remove comma
            current = '';
        }
    }
    
    if (current.trim()) {
        elements.push(current.trim());
    }
    
    return elements;
}
