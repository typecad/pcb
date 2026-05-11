import fs from 'node:fs';
import * as acorn from 'acorn';
import { simple as walk } from 'acorn-walk';
import type { Node, ObjectExpression } from 'acorn';
import { createRequire } from 'node:module';
import { TypeCadError } from './errors.js';

const _require = createRequire(import.meta.url);

let _tsPluginModule: object | null | undefined = undefined;
function getTsPluginModule(): object | null | undefined {
    if (_tsPluginModule === undefined) {
        try {
            _tsPluginModule = _require('acorn-typescript') || null;
        } catch {
            _tsPluginModule = null;
        }
    }
    return _tsPluginModule;
}

/**
 * Inspects source code to find variable name and params for a instantiation.
 */
export function inspectSource(filePath: string, line: number): { variable?: string, params?: Record<string, unknown>, isThis?: boolean } {
    let sourceContent = '';
    try {
        sourceContent = fs.readFileSync(filePath, 'utf8');

        // 1. Try AST Parsing
        try {
            throw new Error('Fallback to regex for better "this." detection');
            const tsPlugin = getTsPluginModule();
            let ast;
            if (tsPlugin) {
                // @ts-ignore - acorn-typescript loaded lazily
                const Parser = acorn.Parser.extend(tsPlugin.default ? tsPlugin.default() : tsPlugin());
                ast = Parser.parse(sourceContent, {
                    ecmaVersion: 2022,
                    sourceType: 'module',
                    locations: true,
                    allowReturnOutsideFunction: true,
                    allowImportExportEverywhere: true
                });
            } else {
                throw new TypeCadError('acorn-typescript not available');
            }

            let targetVariable: string | undefined;
            let targetParams: Record<string, unknown> | undefined;
            let targetIsThis = false;
            let foundVariable = false;

            // @ts-ignore - acorn-walk typing issues
            walk(ast, {
                VariableDeclaration(node: Node) {
                    if (node.loc && node.loc.start.line >= line - 5 && node.loc.end.line >= line) {
                        (node as any).declarations.forEach((decl: any) => {
                            if (decl.init && decl.init.type === 'NewExpression' &&
                                decl.init.callee.type === 'Identifier') {
                                if (decl.init.loc &&
                                    decl.init.loc.start.line <= line &&
                                    decl.init.loc.end.line >= line) {
                                    if (decl.id && decl.id.type === 'Identifier') {
                                        targetVariable = decl.id.name;
                                        foundVariable = true;
                                    }

                                    const arg = decl.init.arguments[0];
                                    if (arg && arg.type === 'ObjectExpression') {
                                        targetParams = extractAstObject(arg as ObjectExpression);
                                    }
                                }
                            }
                        });
                    }
                },
                AssignmentExpression(node: Node) {
                    if (node.loc && node.loc.start.line >= line - 5 && node.loc.end.line >= line &&
                        (node as any).right.type === 'NewExpression' &&
                        ((node as any).left.type === 'Identifier' || (node as any).left.type === 'MemberExpression')) {
                        if ((node as any).right.loc &&
                            (node as any).right.loc.start.line <= line &&
                            (node as any).right.loc.end.line >= line) {
                            
                            if ((node as any).left.type === 'Identifier') {
                                targetVariable = (node as any).left.name;
                            } else if ((node as any).left.type === 'MemberExpression') {
                                const property = (node as any).left.property;
                                if (property && property.type === 'Identifier') {
                                    targetVariable = property.name;
                                    const object = (node as any).left.object;
                                    if (object && (object.type === 'ThisExpression' || (object.type === 'Identifier' && object.name === 'this'))) {
                                        targetIsThis = true;
                                    }
                                }
                            }
                            
                            foundVariable = true;

                            const arg = (node as any).right.arguments[0];
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
        } catch (tsError) {
            // AST failed, fall through to fallback
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
    } catch (err) {
        return {};
    }
}

// Helper function to extract object from AST node
function extractAstObject(node: ObjectExpression): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    (node as any).properties.forEach((prop: any) => {
        if (prop.key && prop.key.type === 'Identifier' && prop.value) {
            const key = prop.key.name;
            obj[key] = extractAstValue(prop.value);
        }
    });
    return obj;
}

// Recursive helper to extract values from AST nodes
function extractAstValue(node: any): any {
    switch (node.type) {
        case 'Literal': return node.value;
        case 'StringLiteral': return node.value;
        case 'NumericLiteral': return node.value;
        case 'BooleanLiteral': return node.value;
        case 'ObjectExpression': return extractAstObject(node);
        case 'ArrayExpression': return node.elements.map(extractAstValue);
        case 'Identifier': return node.name;
        case 'TemplateLiteral':
            if (node.quasis && node.quasis.length > 0) {
                return node.quasis[0].value.raw;
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
function parseValue(val: string): any {
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
