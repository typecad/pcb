"use strict";
// ---------------------------------------------------------------------------
// component_delete.ts — removing a component from typeCAD source: ONE
// grammar shared by every deleting path (the board import's deleted-on-KiCad
// pass and the layout view's Delete-for-parts).
//
// A deleted component must leave NOTHING dangling: the declaration
// statement, its standalone `x.pcb`/`parts.x.…` overrides, the identifier
// in every `typecad.create(…)` argument list, and its entry in the
// `syncBoard(…)` parts map all go in one plan. The planner is text-based
// and comment/string-aware (a length-preserving shadow carries every scan),
// so prose that merely mentions an identifier is never touched.
//
// The caller owns safety: simulate the edits (applyDeleteEdits), then
// require identifierInCode() to be false before writing — a residual
// occurrence means some reference the planner does not know, and the
// deletion is refused rather than leaving a dangling identifier.
//
// This module is deliberately dependency-free and pure so the vscode
// extension compiles a byte-identical copy (its build cannot reach across
// package roots) — a contract test pins the two copies together, exactly
// like sync_file.ts.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.componentInCreateArgs = componentInCreateArgs;
exports.isCreateReceiver = isCreateReceiver;
exports.declaresComponent = declaresComponent;
exports.identifierInCode = identifierInCode;
exports.applyDeleteEdits = applyDeleteEdits;
exports.planComponentRemoval = planComponentRemoval;
/**
 * A length-preserving structural shadow: comment bodies and string-literal
 * contents become spaces (quotes and newlines stay, so every offset and
 * line anchor maps 1:1 back to the real text). Structural scans —
 * declarations, argument lists, brace balance — run over this so prose or
 * string text that merely looks like code can never capture them.
 */
function codeShadow(text) {
    const out = text.split('');
    const blank = (i) => {
        if (out[i] !== '\n')
            out[i] = ' ';
    };
    let i = 0;
    let quote = null;
    while (i < text.length) {
        const ch = text[i];
        if (quote) {
            if (ch === '\\' && i + 1 < text.length) {
                blank(i);
                blank(i + 1);
                i += 2;
                continue;
            }
            if (ch === quote)
                quote = null;
            else
                blank(i);
            i++;
        }
        else if (ch === "'" || ch === '"' || ch === '`') {
            quote = ch;
            i++;
        }
        else if (ch === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') {
                blank(i);
                i++;
            }
        }
        else if (ch === '/' && text[i + 1] === '*') {
            blank(i);
            blank(i + 1);
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
                blank(i);
                i++;
            }
            if (i < text.length) {
                blank(i);
                blank(i + 1);
                i += 2;
            }
        }
        else {
            i++;
        }
    }
    return out.join('');
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Index just past the quote/escape-aware close of the paren opened at `open`. */
function balancedClose(text, open) {
    let depth = 0;
    let quote = null;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === '\\')
                i++;
            else if (ch === quote)
                quote = null;
        }
        else if (ch === "'" || ch === '"' || ch === '`')
            quote = ch;
        else if (ch === '(')
            depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0)
                return i;
        }
    }
    return -1;
}
/** Index just past the `;` ending the statement scanned from `from`, or -1. */
function statementEnd(text, from) {
    let depth = 0;
    let quote = null;
    for (let i = from; i < Math.min(text.length, from + 20000); i++) {
        const ch = text[i];
        if (quote) {
            if (ch === '\\')
                i++;
            else if (ch === quote)
                quote = null;
        }
        else if (ch === "'" || ch === '"' || ch === '`')
            quote = ch;
        else if (ch === '(' || ch === '[' || ch === '{')
            depth++;
        else if (ch === ')' || ch === ']' || ch === '}')
            depth--;
        else if (ch === ';' && depth <= 0)
            return i + 1;
    }
    return -1;
}
/** The declaration pattern for `variable`: `const/let/var x =` (a type
 *  annotation tolerated) or a class-field/plain `this.x =`. */
function declarationRe(variable) {
    return new RegExp(`(?:\\b(?:const|let|var)\\s+${escapeRegExp(variable)}\\s*(?::[^=;\\n]+?)?|\\bthis\\s*\\.\\s*${escapeRegExp(variable)})\\s*=`);
}
/** Skip whitespace and comments forward from `i` (returns the rest index). */
function skipTrivia(text, i, end) {
    for (;;) {
        while (i < end && /\s/.test(text[i]))
            i++;
        if (i < end - 1 && text[i] === '/' && text[i + 1] === '/') {
            while (i < end && text[i] !== '\n')
                i++;
            continue;
        }
        if (i < end - 1 && text[i] === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < end && !(text[i] === '*' && text[i + 1] === '/'))
                i++;
            i += 2;
            continue;
        }
        return i;
    }
}
/**
 * Ranges of the top-level comma-separated chunks between `open` and `close`
 * (the argument region of a call), each TRIMMED to its first/last non-trivia
 * character. A chunk that is only trivia yields no range.
 */
function topLevelChunkRanges(args) {
    const ranges = [];
    let depth = 0;
    let quote = null;
    let chunkStart = 0;
    const flush = (commaAt) => {
        const s = skipTrivia(args, chunkStart, commaAt);
        let e = commaAt;
        while (e > s && /\s/.test(args[e - 1]))
            e--;
        if (e > s)
            ranges.push({ start: s, end: e });
        chunkStart = commaAt + 1;
    };
    for (let i = 0; i < args.length; i++) {
        const ch = args[i];
        if (quote) {
            if (ch === '\\')
                i++;
            else if (ch === quote)
                quote = null;
        }
        else if (ch === "'" || ch === '"' || ch === '`')
            quote = ch;
        else if (ch === '(' || ch === '[' || ch === '{')
            depth++;
        else if (ch === ')' || ch === ']' || ch === '}')
            depth--;
        else if (ch === ',' && depth === 0)
            flush(i);
    }
    flush(args.length);
    return ranges;
}
/** Whether one trimmed chunk is exactly `variable` (or `this.variable`). */
function isIdentifierChunk(chunk, variable) {
    return chunk === variable || chunk === `this.${variable}`;
}
/** Whether one trimmed chunk is a bare pin reference `variable.pin(N)`. */
function isPinChunk(chunk, variable) {
    return new RegExp(`^(?:this\\.)?${escapeRegExp(variable)}\\.pin\\([^()]*\\)$`).test(chunk);
}
/**
 * Plan the removal of `variable`'s entries from one delimited,
 * comma-separated list — the argument region [open+1, close) of a call.
 * `match` decides which chunks belong to the component (a bare identifier,
 * a `.pin(…)` reference). Surgical: a surviving entry and its comments
 * keep their bytes; a dropped entry takes the smaller of its following or
 * preceding comma.
 */
function planIdentifierListRemoval(text, open, close, variable, edits, match = isIdentifierChunk) {
    const args = text.slice(open + 1, close);
    const chunks = topLevelChunkRanges(args);
    let any = false;
    for (const c of chunks) {
        const chunk = args.slice(c.start, c.end);
        if (!match(chunk, variable))
            continue;
        any = true;
        // prefer eating the FOLLOWING comma (whitespace on both sides goes
        // with it; comments stay — they may document the next entry)
        let cutEnd = -1;
        const after = skipTrivia(args, c.end, args.length);
        if (after < args.length && args[after] === ',') {
            cutEnd = after + 1;
            while (cutEnd < args.length && /\s/.test(args[cutEnd]))
                cutEnd++;
        }
        if (cutEnd !== -1) {
            // the dropped entry's leading trivia goes too, so a first/middle
            // argument leaves no indentation behind (bounded by the paren). A
            // `{`-list (the syncBoard parts map) keeps one space after the brace
            // so the map never collapses to `{r2}`; a paren list compacts fully.
            let cutStart = c.start;
            while (cutStart > 0 && /\s/.test(args[cutStart - 1]))
                cutStart--;
            const opener = cutStart > 0 ? args[cutStart - 1] : text[open];
            // a kept token follows: lists keep their separator spacing (`r1, r3`,
            // `{ r2 }`), a paren's first slot compacts (`create(r2)`)
            const spacer = (opener === ',' || opener === '{') && cutEnd < args.length && !/\s/.test(args[cutEnd]) ? ' ' : '';
            edits.push({ start: open + 1 + cutStart, end: open + 1 + cutEnd, line: spacer });
            continue;
        }
        // last entry: eat the PRECEDING comma itself (and the entry's trivia)
        let cutStart = c.start;
        for (let i = c.start - 1; i >= 0; i--) {
            if (args[i] === ',') {
                cutStart = i;
                break;
            }
            if (!/\s/.test(args[i]))
                break; // non-trivia before us — no comma to eat
        }
        while (cutStart > 0 && /\s/.test(args[cutStart - 1]))
            cutStart--;
        edits.push({ start: open + 1 + cutStart, end: open + 1 + c.end, line: '' });
    }
    return any;
}
/** Does this text pass `variable` (or `this.variable`) to any `.create(…)`? */
function componentInCreateArgs(text, variable) {
    const shadow = codeShadow(text);
    const re = /\.\s*create\s*\(/g;
    let m;
    while ((m = re.exec(shadow)) !== null) {
        const open = shadow.indexOf('(', m.index);
        const close = balancedClose(shadow, open);
        if (close === -1)
            continue;
        const args = shadow.slice(open + 1, close);
        if (topLevelChunkRanges(args).some((c) => isIdentifierChunk(args.slice(c.start, c.end), variable)))
            return true;
    }
    return false;
}
/** Is `variable` the RECEIVER of a `.create(…)` call? That is a PCB
 *  instance, not a component — deletions never target it. */
function isCreateReceiver(text, variable) {
    return new RegExp(`\\b${escapeRegExp(variable)}\\s*\\.\\s*create\\s*\\(`).test(codeShadow(text));
}
/** Does this text declare `variable` as a component (const/let/var/this)? */
function declaresComponent(text, variable) {
    return declarationRe(variable).test(codeShadow(text));
}
/** Does the identifier occur in CODE (comments and strings shadowed out)? */
function identifierInCode(text, variable) {
    return new RegExp(`\\b${escapeRegExp(variable)}\\b`).test(codeShadow(text));
}
/** Apply zero/positive-width edits exactly like the appliers do. */
function applyDeleteEdits(text, edits) {
    let out = text;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, e.start) + e.line + out.slice(e.end);
    }
    return out;
}
/**
 * Plan EVERY edit that removes `variable` from one source text: the
 * declaration statement, the standalone `(parts.)variable.pcb/…Layout`
 * overrides, the identifier in each `typecad.create(…)` argument list, and
 * its entry in each `syncBoard(…)` parts map. Empty when this text holds
 * nothing of the component.
 */
function planComponentRemoval(text, variable) {
    const edits = [];
    const shadow = codeShadow(text);
    // declaration statement — removed with its whole line
    const decl = declarationRe(variable).exec(shadow);
    if (decl) {
        const lineStart = text.lastIndexOf('\n', decl.index) + 1;
        const leadsClean = text.slice(lineStart, decl.index).trim() === '';
        const end = statementEnd(text, decl.index + decl[0].length);
        if (leadsClean && end !== -1) {
            let rmEnd = end;
            if (text[rmEnd] === '\r')
                rmEnd++;
            if (text[rmEnd] === '\n')
                rmEnd++;
            edits.push({ start: lineStart, end: rmEnd, line: '' });
        }
    }
    // standalone placement/label overrides, plain or sidecar form
    const assignRe = new RegExp(`^[ \\t]*(?:parts\\.)?${escapeRegExp(variable)}\\.(?:pcb|referenceLayout|valueLayout|fabLayout|fab)\\s*=\\s*\\{`, 'gm');
    let am;
    while ((am = assignRe.exec(shadow)) !== null) {
        const open = shadow.indexOf('{', am.index + am[0].length - 1);
        // balance braces from the literal's opening `{`
        let depth = 0;
        let close = -1;
        for (let i = open; i < shadow.length; i++) {
            if (shadow[i] === '{')
                depth++;
            else if (shadow[i] === '}') {
                depth--;
                if (depth === 0) {
                    close = i;
                    break;
                }
            }
        }
        if (close === -1)
            continue;
        let rmEnd = close + 1;
        if (text[rmEnd] === ';')
            rmEnd++;
        if (text[rmEnd] === '\r')
            rmEnd++;
        if (text[rmEnd] === '\n')
            rmEnd++;
        edits.push({ start: am.index, end: rmEnd, line: '' });
    }
    // every `.create(…)` argument list
    const createRe = /\.\s*create\s*\(/g;
    let cm;
    while ((cm = createRe.exec(shadow)) !== null) {
        const open = shadow.indexOf('(', cm.index);
        const close = balancedClose(shadow, open);
        if (close === -1)
            continue;
        planIdentifierListRemoval(text, open, close, variable, edits);
    }
    // every netlist call's `variable.pin(N)` entries — a deleted component's
    // pins must leave the nets with them (an empty .net() is valid and simply
    // connects nothing)
    const netRe = /\.\s*(?:net|joint)\s*\(/g;
    let nm;
    while ((nm = netRe.exec(shadow)) !== null) {
        const open = shadow.indexOf('(', nm.index);
        const close = balancedClose(shadow, open);
        if (close === -1)
            continue;
        planIdentifierListRemoval(text, open, close, variable, edits, isPinChunk);
    }
    // every `syncBoard(…)` parts map (the second argument's braces)
    const syncRe = /\bsyncBoard\s*\(/g;
    let sm;
    while ((sm = syncRe.exec(shadow)) !== null) {
        const open = shadow.indexOf('(', sm.index);
        const close = balancedClose(shadow, open);
        if (close === -1)
            continue;
        const args = shadow.slice(open + 1, close);
        const chunks = topLevelChunkRanges(args);
        const mapChunk = chunks.find((c) => args.slice(c.start, c.end).trim().startsWith('{'));
        if (!mapChunk)
            continue;
        const mapOpen = open + 1 + args.indexOf('{', mapChunk.start);
        let depth = 0;
        let mapClose = -1;
        for (let i = mapOpen; i < shadow.length; i++) {
            if (shadow[i] === '{')
                depth++;
            else if (shadow[i] === '}') {
                depth--;
                if (depth === 0) {
                    mapClose = i;
                    break;
                }
            }
        }
        if (mapClose === -1)
            continue;
        planIdentifierListRemoval(text, mapOpen, mapClose, variable, edits);
    }
    return edits;
}
//# sourceMappingURL=componentDelete.js.map