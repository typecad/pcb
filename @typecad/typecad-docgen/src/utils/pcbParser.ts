type SExpr = string | SExpr[];

function parseSExpression(expr: string): SExpr {
    const quotedStrings: string[] = [];
    const exprWithPlaceholders = expr.replace(/"([^"]*)"/g, (match, content) => {
        quotedStrings.push(content);
        return `"${quotedStrings.length - 1}"`;
    });

    const tokens = exprWithPlaceholders.match(/\(|\)|[^()\s]+/g) || [];
    const stack: SExpr[][] = [];
    let depth = 0;

    for (const token of tokens) {
        if (token === '(') {
            stack.push([]);
            depth++;
        } else if (token === ')') {
            depth--;
            if (depth < 0) throw new Error('Unexpected closing parenthesis');
            const top = stack.pop();
            if (stack.length > 0) {
                stack[stack.length - 1].push(top!);
            } else {
                return top!;
            }
        } else {
            const match = token.match(/^"(\d+)"$/);
            if (match) {
                const index = parseInt(match[1]);
                if (stack.length > 0) {
                    stack[stack.length - 1].push(quotedStrings[index]);
                }
            } else {
                if (stack.length > 0) {
                    stack[stack.length - 1].push(token);
                }
            }
        }
    }

    return stack[0];
}

function isString(expr: SExpr): expr is string {
    return typeof expr === 'string';
}

function isArray(expr: SExpr): expr is SExpr[] {
    return Array.isArray(expr);
}

function getString(expr: SExpr): string {
    return isString(expr) ? expr : '';
}

interface ComponentInfo {
    designator: string;
    value: string;
    footprint: string;
}

function findNodes(node: SExpr, name: string): SExpr[][] {
    const results: SExpr[][] = [];
    if (isArray(node)) {
        if (node[0] === name) {
            results.push(node);
        }
        for (const child of node) {
            if (isArray(child)) {
                results.push(...findNodes(child, name));
            }
        }
    }
    return results;
}

export async function extractComponents(pcbFilePath: string): Promise<Map<string, ComponentInfo>> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(pcbFilePath, 'utf-8');
    const parsed = parseSExpression(content);
    const components = new Map<string, ComponentInfo>();

    const footprints = findNodes(parsed, 'footprint');
    for (const fp of footprints) {
        let designator = '';
        let value = '';
        const footprint = getString(fp[1]);

        for (const prop of fp.slice(1)) {
            if (!isArray(prop)) continue;
            const key = getString(prop[0]);

            if (key === 'property') {
                const propName = getString(prop[1]);
                const propValue = getString(prop[2]);
                if (propName === 'Reference') {
                    designator = propValue;
                } else if (propName === 'Value') {
                    value = propValue;
                }
            } else if (key === 'fp_text') {
                const textType = getString(prop[1]);
                const textValue = getString(prop[2]);
                if (textType === 'reference') {
                    designator = textValue;
                } else if (textType === 'value') {
                    value = textValue;
                }
            }
        }

        if (designator && /^[A-Z]+\d+$/i.test(designator)) {
            components.set(designator, { designator, value, footprint });
        }
    }

    return components;
}
