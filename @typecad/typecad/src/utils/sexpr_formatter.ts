/**
 * Format an S-expression string with proper indentation for readability
 *
 * @param sexpr - The S-expression string to format
 * @returns The formatted S-expression string
 */
export function prettyPrintSExpr(sexpr: string): string {
    const result: string[] = [];
    let indent = 0;
    let inString = false;
    let prevChar = '';
    const indentSize = 2;

    // Dynamic indent string generation — no fixed upper limit.
    // A Map is used so deeply nested S-expressions are handled correctly
    // without pre-allocating a large array.
    const indentCache = new Map<number, string>();
    function getIndent(depth: number): string {
        let str = indentCache.get(depth);
        if (str === undefined) {
            str = ' '.repeat(depth * indentSize);
            indentCache.set(depth, str);
        }
        return str;
    }

    for (let i = 0; i < sexpr.length; i++) {
        const char = sexpr[i];
        const nextChar = sexpr[i + 1];

        // Track if we're inside a string (escaped quotes don't toggle)
        if (char === '"' && prevChar !== '\\') {
            inString = !inString;
            result.push(char);
            prevChar = char;
            continue;
        }

        // Don't format inside strings
        if (inString) {
            result.push(char);
            prevChar = char;
            continue;
        }

        if (char === '(') {
            result.push(char);
            indent++;
            // Add newline after opening paren if next char is also a paren
            if (nextChar === '(') {
                result.push('\n');
                result.push(getIndent(indent));
            }
        } else if (char === ')') {
            indent--;
            // Add newline before closing paren if previous was also a closing paren
            if (prevChar === ')') {
                result.push('\n');
                result.push(getIndent(indent));
            }
            result.push(char);
        } else if (char === ' ' && nextChar === '(') {
            // Space before opening paren - add newline
            result.push('\n');
            result.push(getIndent(indent));
        } else {
            result.push(char);
        }

        prevChar = char;
    }

    return result.join('');
}
