import fsexp from 'fast-sexpr';

/**
 * Typed wrapper around fast-sexpr's raw array output.
 * Provides key-based access instead of error-prone numeric indexing.
 *
 * KiCad S-expressions use double quotes for strings, but fast-sexpr
 * cannot parse double quotes. The parseSExpr utility replaces " with `
 * before parsing. This class handles that convention transparently.
 *
 * Example raw structure after parseSExpr:
 *   ["footprint", "`MyLib:QFN50P300X300X75-13N-D`",
 *     ["at", 10, 20, 0],
 *     ["layer", "`F.Cu`"],
 *     ["property", "`Code`", "`{...}`", ...]
 *   ]
 *
 * Usage:
 *   const tree = SExprNode.parse(fileContent);
 *   const fps = tree.findAll('footprint');
 *   for (const fp of fps) {
 *     const name = fp.stringAt(1);           // "MyLib:QFN50P300X300X75-13N-D"
 *     const x = fp.child('at')?.getNumber(1); // 10
 *     const y = fp.child('at')?.getNumber(2); // 20
 *     const props = fp.children('property');
 *   }
 */
export class SExprNode {
    private raw: unknown[];

    constructor(raw: unknown[]) {
        this.raw = raw;
    }

    // === Static Factory ===

    /**
     * Parse a .kicad_pcb file content into a root SExprNode tree.
     * Handles the " → ` substitution required by fast-sexpr.
     */
    static parse(content: string): SExprNode {
        const converted = content.replaceAll('"', '`');
        const parsed = fsexp(converted);
        if (!parsed || parsed.length === 0) {
            throw new Error('Failed to parse S-expression: empty result');
        }
        const root = parsed[parsed.length - 1];
        if (!Array.isArray(root)) {
            throw new Error('Failed to parse S-expression: root is not an array');
        }
        return new SExprNode(root as unknown[]);
    }

    // === Name Access ===

    /** The first element of the node (its type/key name), with quotes stripped. */
    get name(): string {
        return stripQuotes(String(this.raw[0]));
    }

    /** Check if this node is of the given type. */
    is(name: string): boolean {
        return this.name === name;
    }

    // === Child Access ===

    /**
     * Returns the first direct child node with the given name, or null.
     * Children are array elements of this.raw (excluding the name at index 0).
     */
    child(name: string): SExprNode | null {
        for (let i = 1; i < this.raw.length; i++) {
            const item = this.raw[i];
            if (Array.isArray(item) && item.length > 0 && stripQuotes(String(item[0])) === name) {
                return new SExprNode(item);
            }
        }
        return null;
    }

    /**
     * Returns all direct child nodes, optionally filtered by name.
     */
    children(name?: string): SExprNode[] {
        const result: SExprNode[] = [];
        for (let i = 1; i < this.raw.length; i++) {
            const item = this.raw[i];
            if (Array.isArray(item) && item.length > 0) {
                if (!name || stripQuotes(String(item[0])) === name) {
                    result.push(new SExprNode(item));
                }
            }
        }
        return result;
    }

    /**
     * Returns true if this node has a direct child with the given name.
     */
    hasChild(name: string): boolean {
        return this.child(name) !== null;
    }

    // === Recursive Search ===

    /**
     * Recursively finds all descendant nodes with the given name.
     * Includes nodes at any depth.
     */
    findAll(name: string): SExprNode[] {
        const results: SExprNode[] = [];
        this._findAll(name, results);
        return results;
    }

    private _findAll(name: string, results: SExprNode[]): void {
        for (let i = 1; i < this.raw.length; i++) {
            const item = this.raw[i];
            if (Array.isArray(item) && item.length > 0) {
                const node = new SExprNode(item);
                if (node.name === name) {
                    results.push(node);
                }
                node._findAll(name, results);
            }
        }
    }

    // === Typed Value Access ===

    /**
     * Returns the raw value at the given index (1-based, after the name).
     * Example: for ["at", 10, 20, 0], rawAt(1) → 10, rawAt(2) → 20
     */
    rawAt(index: number): unknown {
        return this.raw[index];
    }

    /**
     * Returns a numeric value at the given child index.
     * If the value is missing or not a valid number, returns the fallback.
     */
    getNumber(index: number, fallback: number = 0): number {
        const val = this.raw[index];
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const n = parseFloat(stripQuotes(val));
            return isNaN(n) ? fallback : n;
        }
        return fallback;
    }

    /**
     * Returns a string value at the given child index, with quotes and backticks stripped.
     * Returns null if the value is missing or not a string.
     */
    getString(index: number): string | null {
        const val = this.raw[index];
        if (typeof val === 'string') return stripQuotes(val);
        return null;
    }

    /**
     * Returns a boolean value at the given child index.
     * KiCad uses "yes"/"no" for booleans.
     * Returns null if the value is missing or unrecognized.
     */
    getBool(index: number): boolean | null {
        const val = this.raw[index];
        if (typeof val === 'string') {
            const cleaned = stripQuotes(val).toLowerCase();
            if (cleaned === 'yes' || cleaned === 'true') return true;
            if (cleaned === 'no' || cleaned === 'false') return false;
        }
        return null;
    }

    // === Leaf Value ===

    /**
     * For leaf nodes (node without sub-arrays after the name), returns
     * the first string value found. For example, for ("version" 20260206),
     * this returns null (it's a number). For ("generator" "pcbnew") → "pcbnew".
     */
    get stringValue(): string | null {
        for (let i = 1; i < this.raw.length; i++) {
            const item = this.raw[i];
            if (typeof item === 'string') return stripQuotes(item);
        }
        return null;
    }

    /**
     * For leaf-like nodes where all values after the name are strings,
     * joins them with spaces. Useful for gr_text where text content
     * may be split across multiple string tokens.
     *
     * Example: ("gr_text" "hello" "world" (at 10 20)) → "hello world"
     */
    get joinedStringValue(): string {
        const parts: string[] = [];
        for (let i = 1; i < this.raw.length; i++) {
            const item = this.raw[i];
            if (typeof item === 'string') {
                parts.push(stripQuotes(item));
            } else {
                break; // Stop at first non-string (e.g., sub-array)
            }
        }
        return parts.join(' ');
    }

    // === Convenience Helpers ===

    /**
     * Returns the raw underlying array. Use sparingly — prefer typed accessors.
     */
    toArray(): unknown[] {
        return this.raw;
    }

    /**
     * Number of elements in the raw array (including the name).
     */
    get length(): number {
        return this.raw.length;
    }
}

/**
 * Strips surrounding backtick and double-quote characters from a string.
 */
function stripQuotes(s: string): string {
    return s.replace(/[`"]/g, '');
}
