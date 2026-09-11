"use strict";
// ---------------------------------------------------------------------------
// Building `typecad-pcb query` command lines and parsing their --json output.
//
// The CLI is the single source of truth for board analysis (pad nets,
// unconnected pads, the source "Code" property); this extension only shells
// out to it — same producer/consumer split as the HAL breakpoint file. Output
// is clean JSON on stdout (chalk disables itself on non-TTY pipes), but npx
// can prepend noise, so parsing extracts the JSON document defensively.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryError = void 0;
exports.indexCommand = indexCommand;
exports.detailCommand = detailCommand;
exports.extractJson = extractJson;
exports.parseComponentIndex = parseComponentIndex;
exports.parseComponentDetail = parseComponentDetail;
/** Characters safe to interpolate into a shell command line. */
const SAFE_ARG = /^[A-Za-z0-9_+\-.]+$/;
class QueryError extends Error {
    constructor(message, 
    /** True when the failure is just "no compiled board yet" — hover shows a hint. */
    boardMissing = false) {
        super(message);
        this.boardMissing = boardMissing;
        this.name = 'QueryError';
    }
}
exports.QueryError = QueryError;
/** `query components --json` — the index every hover resolution starts from. */
function indexCommand() {
    return 'npx typecad-pcb query components --json';
}
/** `query component <ref> --json` — pad-by-pad connectivity for one component. */
function detailCommand(ref) {
    if (!SAFE_ARG.test(ref)) {
        throw new QueryError(`Unsafe reference '${ref}' — refusing to build a query command`);
    }
    return `npx typecad-pcb query component ${ref} --json`;
}
/**
 * Extract the first JSON document from mixed output. `query --json` prints
 * exactly one document, but npx banners and other tooling occasionally write
 * to stdout too, so scan for the outermost braces/brackets.
 */
function extractJson(output) {
    const text = output.trim();
    try {
        return JSON.parse(text);
    }
    catch {
        // fall through to the scan
    }
    const start = text.search(/[{[]/);
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);
    if (start === -1 || end <= start) {
        throw new QueryError(`query output contained no JSON: ${text.slice(0, 200)}`);
    }
    try {
        return JSON.parse(text.slice(start, end + 1));
    }
    catch {
        // banner noise past the document (a stray '}' …) — classify it the same
        // way as no-JSON rather than leaking a raw SyntaxError to the hover
        throw new QueryError(`query output was not valid JSON: ${text.slice(0, 200)}`);
    }
}
/** The CLI reports its own failures as `{ error: true, message }` JSON. */
function throwIfCliError(parsed) {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const doc = parsed;
        if (doc.error === true && typeof doc.message === 'string') {
            const boardMissing = doc.code === 'COMPONENT_NOT_FOUND' || /no \.kicad_pcb/i.test(doc.message);
            throw new QueryError(doc.message, boardMissing);
        }
    }
}
function asString(value) {
    return typeof value === 'string' ? value : '';
}
function asPoint(value) {
    if (value && typeof value === 'object') {
        const p = value;
        return { x: typeof p.x === 'number' ? p.x : 0, y: typeof p.y === 'number' ? p.y : 0 };
    }
    return { x: 0, y: 0 };
}
function asDimensions(value) {
    if (value && typeof value === 'object') {
        const d = value;
        if (typeof d.width === 'number' && typeof d.height === 'number') {
            return { width: d.width, height: d.height };
        }
    }
    return null;
}
function parseSummary(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const doc = raw;
    const reference = asString(doc.reference);
    if (!reference)
        return null;
    return {
        reference,
        value: asString(doc.value),
        footprint: asString(doc.footprint),
        variable: typeof doc.variable === 'string' ? doc.variable : undefined,
        side: doc.side === 'back' ? 'back' : 'front',
        at: {
            ...asPoint(doc.at),
            rotation: typeof doc.at?.rotation === 'number'
                ? doc.at.rotation
                : 0,
        },
        dimensions: asDimensions(doc.dimensions),
        padCount: typeof doc.padCount === 'number' ? doc.padCount : 0,
    };
}
/** Parse `query components --json` into the hover lookup index. */
function parseComponentIndex(output) {
    const parsed = extractJson(output);
    throwIfCliError(parsed);
    if (!Array.isArray(parsed)) {
        throw new QueryError('query components --json did not return an array');
    }
    const out = [];
    for (const raw of parsed) {
        const summary = parseSummary(raw);
        if (summary)
            out.push(summary);
    }
    return out;
}
/** Parse `query component <ref> --json` into a hover-ready detail. */
function parseComponentDetail(output) {
    const parsed = extractJson(output);
    throwIfCliError(parsed);
    const summary = parseSummary(parsed);
    if (!summary) {
        throw new QueryError('query component --json did not return a component');
    }
    const doc = parsed;
    const pads = [];
    if (Array.isArray(doc.pads)) {
        for (const raw of doc.pads) {
            if (!raw || typeof raw !== 'object')
                continue;
            const pad = raw;
            pads.push({
                pad: asString(pad.pad),
                net: typeof pad.net === 'string' ? pad.net : null,
                type: asString(pad.type),
                pinType: typeof pad.pinType === 'string' ? pad.pinType : undefined,
                at: asPoint(pad.at),
                layers: Array.isArray(pad.layers) ? pad.layers.filter((l) => typeof l === 'string') : [],
            });
        }
    }
    const unconnectedPads = Array.isArray(doc.unconnectedPads)
        ? doc.unconnectedPads.filter((p) => typeof p === 'string')
        : pads.filter((p) => p.net === null && p.type !== 'np_thru_hole').map((p) => p.pad);
    return {
        ...summary,
        source: typeof doc.source === 'string' ? doc.source : undefined,
        unconnectedPads,
        pads,
    };
}
//# sourceMappingURL=query.js.map