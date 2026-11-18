"use strict";
// ---------------------------------------------------------------------------
// Applied-artwork source edits: the layout view's image E-panel/Del ride the
// apply as edits/deletes keyed by the placement's file + center, and this
// module rewrites/removes the matching `new Image({ ... })` expression.
// Both spellings are recognized: the canonical sidecar statement
// (`syncArt.push(new Image({ file, at: { x, y }, size: [w, h][, side] }));`)
// and hand-written declarations (`let art = new Image({ at: [x, y], ... });`
// — tuple `at`, single-number `size`, nested `inks`, comments included).
// Matching is by FILE + at (the placed box is a fit — its w/h in the
// manifest need not equal the statement's size bounding box, so geometry
// matching beyond the center would misfire). vscode-free and pure, like the
// other source-edit planners.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.planImageSourceEdits = planImageSourceEdits;
/** mm with up to 3 decimals, trailing zeros stripped — the sync grammar. */
const fmt = (n) => String(parseFloat(n.toFixed(3)));
/** escape a project-relative path the way source literals write it */
const escPath = (p) => p.replace(/\\/g, '/').replace(/'/g, "\\'");
const NEAR = 0.05;
const near = (a, b) => Math.abs(a - b) < NEAR;
/** Quote/comment-aware scan: index just past the char that closes the
 *  opener at `from` (any of ( { [ — balanced against ) } ]). -1 on failure. */
function scanToClose(text, from, open, close) {
    const closeOf = { '(': ')', '{': '}', '[': ']' };
    let depth = 0;
    let i = from;
    let quote = null;
    while (i < text.length) {
        const ch = text[i];
        if (quote) {
            if (ch === '\\')
                i++;
            else if (ch === quote)
                quote = null;
            i++;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
            quote = ch;
            i++;
            continue;
        }
        if (ch === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n')
                i++;
            continue;
        }
        if (ch === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/'))
                i++;
            i += 2;
            continue;
        }
        if (ch === open)
            depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0)
                return i + 1;
        }
        else if (closeOf[ch]) {
            // nested group of another kind — skip it whole so its contents can
            // never tip this balance (braces inside strings already skipped)
            const nested = scanToClose(text, i, ch, closeOf[ch]);
            if (nested === -1)
                return -1;
            i = nested;
            continue;
        }
        i++;
    }
    return -1;
}
const NUM = String.raw `-?\d+(?:\.\d+)?`;
/** Extract the option spans from the object-literal text between braces. */
function parseOptions(text, objStart, objEnd, base) {
    const body = text.slice(objStart, objEnd);
    const at = new RegExp(`at:\\s*(?:\\{\\s*x:\\s*(${NUM})\\s*,\\s*y:\\s*(${NUM})\\s*\\}|\\[\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\])`).exec(body) ?? null;
    if (!at)
        return null;
    const size = new RegExp(`size:\\s*(?:\\[\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\]|(${NUM}))`).exec(body);
    const side = /side:\s*'(back|front)'/.exec(body);
    const file = /file:\s*'((?:[^'\\]|\\.)*)'/.exec(body);
    return {
        file: file?.[1] ?? '',
        fileSpan: file ? [base + file.index, base + file.index + file[0].length] : null,
        x: parseFloat((at[1] ?? at[3])),
        y: parseFloat((at[2] ?? at[4])),
        atSpan: [base + at.index, base + at.index + at[0].length],
        sizeSpan: size ? [base + size.index, base + size.index + size[0].length] : null,
        sideSpan: side ? [base + side.index, base + side.index + side[0].length] : null,
    };
}
function scanStatements(text) {
    const out = [];
    const seen = /new\s+Image\s*\(/g;
    let m;
    while ((m = seen.exec(text)) !== null) {
        const openParen = m.index + m[0].length - 1;
        const closeParen = scanToClose(text, openParen, '(', ')');
        if (closeParen === -1)
            continue;
        // the options object is the first {... after the paren
        let objStart = -1;
        for (let i = openParen + 1; i < closeParen; i++) {
            const ch = text[i];
            if (ch === '{') {
                objStart = i;
                break;
            }
            if (!/\s/.test(ch))
                break;
        }
        if (objStart === -1)
            continue;
        const objClose = scanToClose(text, objStart, '{', '}');
        if (objClose === -1)
            continue;
        const opts = parseOptions(text, objStart + 1, objClose - 1, objStart + 1);
        if (!opts)
            continue;
        // wrapper: `syncArt.push(` immediately before, `);` right after
        const before = text.slice(Math.max(0, m.index - 32), m.index);
        const wrapMatch = /(^|[^\w$.])syncArt\s*\.\s*push\s*\(\s*$/.exec(before);
        const after = text.slice(closeParen, closeParen + 4);
        const afterMatch = /^\s*\);/.exec(after);
        const wrapped = wrapMatch && afterMatch
            ? [m.index - wrapMatch[0].length + wrapMatch[1].length, closeParen + afterMatch[0].length]
            : null;
        // declaration: `let|const|var NAME =` immediately before the expression
        const declMatch = /(?:^|[;\n])[ \t]*(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before);
        let declared = null;
        if (declMatch) {
            const kwStart = m.index - declMatch[0].length + (declMatch[0].startsWith('\n') || declMatch[0].startsWith(';') ? 1 : 0);
            declared = [kwStart, m.index];
        }
        out.push({
            start: m.index,
            end: closeParen,
            wrapped,
            declared,
            ident: declMatch?.[1] ?? null,
            file: opts.file,
            x: opts.x,
            y: opts.y,
            side: sideOf(text, objStart, objClose),
            fileSpan: opts.fileSpan,
            atSpan: opts.atSpan,
            sizeSpan: opts.sizeSpan,
            sideSpan: opts.sideSpan,
            objClose: objClose - 1, // insertion point sits before the closing brace
        });
        seen.lastIndex = closeParen;
    }
    return out;
}
function sideOf(text, objStart, objEnd) {
    return /side:\s*'back'/.test(text.slice(objStart, objEnd)) ? 'back' : 'front';
}
/** does the statement's file literal equal the match key's path? */
function fileMatches(stmtFile, matchFile) {
    const key = escPath(matchFile);
    return stmtFile === key || stmtFile === matchFile.replace(/\\/g, '/');
}
/** statement span for deletion: the wrapper (incl. `);`) or the declaration
 *  (incl. `let x = ` ... `;`) — else the bare expression + trailing `;`. */
function deleteSpan(text, st) {
    let start = st.wrapped ? st.wrapped[0] : st.start;
    let end = st.wrapped ? st.wrapped[1] : st.end;
    if (!st.wrapped) {
        // extend to the statement's terminator
        const tail = /^\s*;/.exec(text.slice(end));
        if (tail)
            end += tail[0].length;
        // a bare declaration (`let art = new Image({...});`) deletes whole
        if (st.declared)
            start = st.declared[0];
    }
    // swallow the line's newline
    if (text[end] === '\r')
        end++;
    if (text[end] === '\n')
        end++;
    if (start > 0 && text[start - 1] === '\n' && text[start - 2] === '\r')
        start -= 2;
    else if (start > 0 && text[start - 1] === '\n')
        start -= 1;
    return [start, end];
}
/**
 * Plan rewrites and deletions of the matched image statements. Edits retire
 * on a consumed statement (file + center match); unmatched edits/deletes are
 * reported as skips with their match key. Rewrites are surgical spans (at,
 * size, side, file) so hand-written formatting survives everywhere else.
 */
function planImageSourceEdits(text, edits, deletes) {
    const stmts = scanStatements(text);
    const used = new Set();
    const out = { edits: [], deletes: [], skipped: [] };
    const findMatch = (file, x, y) => {
        for (let i = 0; i < stmts.length; i++) {
            if (used.has(i))
                continue;
            const st = stmts[i];
            if (fileMatches(st.file, file) && near(st.x, x) && near(st.y, y))
                return i;
        }
        return -1;
    };
    for (const e of edits) {
        const hit = findMatch(e.match.file, e.match.x, e.match.y);
        if (hit === -1) {
            out.skipped.push(`image edit: no statement matches ${e.match.file} @ ${fmt(e.match.x)},${fmt(e.match.y)}`);
            continue;
        }
        used.add(hit);
        const st = stmts[hit];
        const ref = `edit:${e.match.file}@${e.match.x},${e.match.y}`;
        out.edits.push({ start: st.atSpan[0], end: st.atSpan[1], line: `at: { x: ${fmt(e.x)}, y: ${fmt(e.y)} }`, ref });
        if (st.sizeSpan) {
            out.edits.push({ start: st.sizeSpan[0], end: st.sizeSpan[1], line: `size: [${fmt(e.w)}, ${fmt(e.h)}]`, ref });
        }
        if (e.newFile) {
            const span = st.fileSpan ?? null;
            if (span)
                out.edits.push({ start: span[0], end: span[1], line: `file: '${escPath(e.newFile)}'`, ref });
        }
        if (e.side === 'back') {
            if (st.sideSpan)
                out.edits.push({ start: st.sideSpan[0], end: st.sideSpan[1], line: `side: 'back'`, ref });
            else {
                // insert before the options' closing brace, absorbing one trailing
                // space so the canonical `..., side: 'back' }` shape is preserved
                const at = st.objClose;
                const pad = text[at - 1] === ' ' ? -1 : 0;
                out.edits.push({ start: at + pad, end: at, line: pad ? `, side: 'back' ` : `, side: 'back'`, ref });
            }
        }
        else if (st.sideSpan) {
            // explicit side present: flip its value (front is otherwise implicit)
            out.edits.push({ start: st.sideSpan[0], end: st.sideSpan[1], line: `side: 'front'`, ref });
        }
    }
    for (const d of deletes) {
        const hit = findMatch(d.file, d.x, d.y);
        if (hit === -1) {
            out.skipped.push(`image delete: no statement matches ${d.file} @ ${fmt(d.x)},${fmt(d.y)}`);
            continue;
        }
        used.add(hit);
        const st = stmts[hit];
        const [ds, de] = deleteSpan(text, st);
        out.deletes.push({ start: ds, end: de, line: '', ref: `delete:${d.file}@${d.x},${d.y}` });
        // a declared identifier leaving the board must leave create() too —
        // strip its standalone argument in any `.create(` call of this text so
        // the declaration's removal cannot dangle (the apply's parse gate is
        // the backstop when the reference lives in another file)
        if (st.ident) {
            const createRe = /\.create\s*\(/g;
            let cm;
            while ((cm = createRe.exec(text)) !== null) {
                const close = scanToClose(text, cm.index + cm[0].length - 1, '(', ')');
                if (close === -1)
                    continue;
                const args = text.slice(cm.index + cm[0].length, close - 1);
                const argRe = new RegExp(`(^|,\\s*|\\s)${st.ident.replace(/\$/g, '\\$')}(\\s*,|\\s*\\n|$)`);
                const am = argRe.exec(args);
                if (!am)
                    continue;
                const argStart = cm.index + cm[0].length + am.index + am[1].length;
                const argEnd = argStart + st.ident.length;
                // take the trailing separator when one follows, else the leading
                let s = argStart;
                let e2 = argEnd;
                const tail = /^\s*,/.exec(text.slice(e2));
                if (tail)
                    e2 += tail[0].length;
                else {
                    const head = /\s*,\s*$/.exec(text.slice(Math.max(0, s - 16), s));
                    if (head)
                        s -= head[0].length;
                }
                out.deletes.push({ start: s, end: e2, line: '', ref: `delete:${d.file}@${d.x},${d.y}` });
                break;
            }
        }
    }
    return out;
}
//# sourceMappingURL=imageEdits.js.map