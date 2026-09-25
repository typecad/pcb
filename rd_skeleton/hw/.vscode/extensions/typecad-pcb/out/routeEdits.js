"use strict";
// ---------------------------------------------------------------------------
// Route apply: committed interactive routes become source TrackBuilders.
//
// A route arrives from the layout view as { net, w, pieces, vias } in board
// (y-down) millimetres. This plans pure text edits: one const declaration
// per route (`.from(...).to(...)` chain, `.via(...)` at every layer switch)
// inserted before the `typecad.create(` call, and the variable appended to
// that call's argument list — the same authoring style as the project's own
// hand-written routes.
//
// Deletes plan the reverse: matched `.to()` runs drop from existing chains,
// a middle break SPLITS the route so a real gap replaces the copper, and
// emptied routes vanish with their create() argument. Regenerated chains
// preserve the route's options (net), every surviving via (with its own
// args), and each point's layer.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeSingleQuoted = escapeSingleQuoted;
exports.createArgInsertion = createArgInsertion;
exports.planCreateArgsEdit = planCreateArgsEdit;
exports.planRouteEdits = planRouteEdits;
exports.planRouteDeletes = planRouteDeletes;
const fmt = (n) => String(parseFloat(n.toFixed(3)));
/** Escape a value for interpolation into a single-quoted TS string literal. */
function escapeSingleQuoted(value) {
    return value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/'/g, "\\'");
}
/** Do two points match within tolerance (board frame, mm)? */
const ptEq = (a, b, tol = 0.02) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
/** Locate `typecad.create(` and its balanced closing paren (null when absent/unbalanced). */
function findCreateCall(text) {
    const createIdx = text.indexOf('typecad.create(');
    if (createIdx === -1)
        return null;
    let depth = 0;
    for (let i = createIdx + 'typecad.create('.length - 1; i < text.length; i++) {
        if (text[i] === '(')
            depth++;
        else if (text[i] === ')') {
            depth--;
            if (depth === 0)
                return { createIdx, closeIdx: i };
        }
    }
    return null;
}
/**
 * Where appended create() arguments belong: after the last REAL token
 * inside the parens, skipping trailing whitespace and comments — a line
 * comment after the last arg (`r1, // main part`) must not end up between
 * two commas. The last real token decides the separator.
 */
function createArgInsertion(text, createIdx, closeIdx) {
    let at = createIdx + 'typecad.create('.length;
    let lastTok = '(';
    for (let i = at; i < closeIdx; i++) {
        const ch = text[i];
        if (ch === '/' && text[i + 1] === '/') {
            while (i < closeIdx && text[i] !== '\n')
                i++;
            continue;
        }
        if (ch === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < closeIdx && !(text[i] === '*' && text[i + 1] === '/'))
                i++;
            continue;
        }
        if (!/\s/.test(ch)) {
            at = i + 1;
            lastTok = ch;
        }
    }
    const sep = lastTok === '(' ? '' : lastTok === ',' ? ' ' : ', ';
    return { at, sep };
}
/**
 * One edit rewriting create()'s argument list: `add` names splice in with a
 * correct separator (before any trailing comment), `remove` names drop out
 * for every argument position. Null when there is nothing to do or no
 * create() call in this text.
 */
function planCreateArgsEdit(text, add, remove) {
    const call = findCreateCall(text);
    if (!call || (add.length === 0 && remove.length === 0))
        return null;
    let args = text.slice(call.createIdx, call.closeIdx + 1);
    if (add.length > 0) {
        const { at, sep } = createArgInsertion(text, call.createIdx, call.closeIdx);
        const gap = text.slice(at, call.closeIdx); // trailing comment/whitespace, kept
        const spacer = gap === '' || /^\s/.test(gap) ? '' : ' ';
        const rel = at - call.createIdx;
        args = args.slice(0, rel) + `${sep}${add.join(', ')}${spacer}${gap})`;
    }
    for (const nm of remove) {
        // NOTE: these build RegExp SOURCE strings — every backslash is doubled
        args = args
            .replace(new RegExp(`,\\s*${nm}\\b`), '')
            .replace(new RegExp(`\\b${nm}\\s*,\\s*`), '')
            .replace(new RegExp(`\\(\\s*${nm}\\s*\\)`), '()');
    }
    return { start: call.createIdx, end: call.closeIdx + 1, line: args };
}
/** Generate the TrackBuilder source for one route (multi-line, 2-space indents). */
function routeSource(name, r) {
    const netLit = r.net ? escapeSingleQuoted(r.net) : null;
    const head = `const ${name} = new TrackBuilder(typecad, { ${netLit ? `net: '${netLit}', ` : ''} })`;
    const chain = [];
    // walk pieces + vias in order: a via sits between consecutive pieces; its
    // position is the tail of the previous piece and the head of the next
    const segments = r.pieces.filter((p) => p.pts.length >= 2);
    if (segments.length === 0)
        return '';
    const first = segments[0];
    const f0 = first.pts[0];
    if (r.power && r.power.current > 0) {
        const dt = r.power.maxTempRise ?? 10;
        // 4 decimals: currents can be sub-milliamp and fmt's 3 would flatten them
        const cur = String(parseFloat(r.power.current.toFixed(4)));
        chain.push(`  .powerInfo({ current: ${cur}, maxTempRise: ${fmt(dt)} })`);
    }
    chain.push(`  .from({ x: ${fmt(f0.x)}, y: ${fmt(f0.y)} }, '${first.layer}', ${fmt(first.w ?? r.w)})`);
    for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        // every piece after the first starts at the boundary point shared with
        // the previous piece's tail — already emitted — so it walks from pts[1]
        for (let pi = 1; pi < seg.pts.length; pi++) {
            const pt = seg.pts[pi];
            const isLastPoint = si === segments.length - 1 && pi === seg.pts.length - 1;
            chain.push(`  .to({ x: ${fmt(pt.x)}, y: ${fmt(pt.y)}, layer: '${seg.layer}', width: ${fmt(seg.w ?? r.w)} })`);
            // any recorded via at an emitted non-final point lands its barrel —
            // piece boundaries AND mid-piece stitches alike, with its own sizing
            // and layer span (plain F<->B pairs stay default through vias)
            if (!isLastPoint) {
                const v = r.vias.find((vi) => ptEq(vi, pt));
                if (v) {
                    const size = v.size !== undefined ? fmt(v.size) : '0.6';
                    const drill = v.drill !== undefined ? fmt(v.drill) : '0.3';
                    const plainThrough = !v.layers ||
                        (v.layers[0] === 'F.Cu' && v.layers[1] === 'B.Cu') ||
                        (v.layers[0] === 'B.Cu' && v.layers[1] === 'F.Cu');
                    const layers = plainThrough ? '' : `, layers: ['${v.layers[0]}', '${v.layers[1]}']`;
                    chain.push(`  .via({ size: ${size}, drill: ${drill}${layers} })`);
                }
            }
        }
    }
    return `${head}\n${chain.join('\n')};`;
}
/**
 * Plan the insertion of `routes` into one source document: declarations
 * before `typecad.create(` and variable names appended to its argument list.
 */
function planRouteEdits(text, routes) {
    const edits = [];
    const skipped = [];
    if (routes.length === 0)
        return { edits, applied: 0, skipped };
    const createIdx = text.indexOf('typecad.create(');
    if (createIdx === -1) {
        return { edits, applied: 0, skipped: routes.map((r) => `${r.from.ref}.${r.from.pin}${r.to ? `→${r.to.ref}.${r.to.pin}` : ''} (no typecad.create( call found)`) };
    }
    // unique variable names: route1, route2... continuing past existing ones
    let maxExisting = 0;
    for (const m of text.matchAll(/\broute(\d+)\b/g)) {
        maxExisting = Math.max(maxExisting, Number(m[1]));
    }
    const lineStart = text.lastIndexOf('\n', createIdx) + 1;
    const indentMatch = /^[ \t]*/.exec(text.slice(lineStart, createIdx));
    const indent = indentMatch ? indentMatch[0] : '';
    const call = findCreateCall(text);
    if (!call) {
        return { edits, applied: 0, skipped: routes.map((r) => `${r.from.ref}.${r.from.pin} (unbalanced typecad.create()`) };
    }
    const decls = [];
    const names = [];
    for (const r of routes) {
        const name = `route${++maxExisting}`;
        const src = routeSource(name, r);
        if (!src) {
            skipped.push(`${r.from.ref}.${r.from.pin}${r.to ? `→${r.to.ref}.${r.to.pin}` : ''} (no geometry)`);
            maxExisting--;
            continue;
        }
        decls.push(indent +
            (r.impedance && r.impedance.z0 > 0
                ? `// \u2248${fmt(r.impedance.z0)} \u03a9 controlled impedance (stackup solve)\n${indent}`
                : '') +
            src);
        names.push(name);
    }
    if (names.length === 0)
        return { edits, applied: 0, skipped };
    // declarations land next to create() — they need TrackBuilder in scope
    // there. A create-owning file that never mentions it (routes live in a
    // dedicated module) gets a reported skip, not a broken import.
    if (!/\bTrackBuilder\b/.test(text)) {
        return {
            edits,
            applied: 0,
            skipped: routes.map((r) => `${r.from.ref}.${r.from.pin}${r.to ? `→${r.to.ref}.${r.to.pin}` : ''} (TrackBuilder is not in scope where typecad.create( lives — add the route in the routes module instead)`),
        };
    }
    // one edit: declarations + a blank line inserted before the create line
    const declLine = `${decls.join('\n\n')}\n\n`;
    const argsEdit = planCreateArgsEdit(text, names, []);
    if (argsEdit.start <= lineStart) {
        // create( at column 0: the insert and the args rewrite would touch —
        // fold them into one replacement
        edits.push({ start: argsEdit.start, end: argsEdit.end, line: declLine + argsEdit.line });
    }
    else {
        edits.push({ start: lineStart, end: lineStart, line: declLine });
        edits.push(argsEdit);
    }
    return { edits, applied: names.length, skipped };
}
/** Does a deleted segment match the a->b run (either orientation)? */
const segMatch = (d, a, b) => (ptEq({ x: d.x1, y: d.y1 }, a) && ptEq({ x: d.x2, y: d.y2 }, b)) ||
    (ptEq({ x: d.x1, y: d.y1 }, b) && ptEq({ x: d.x2, y: d.y2 }, a));
// head: `[export ]const NAME = new TrackBuilder(typecad, { … })` — exported
// and bare declarations alike, any name (hand-written routes read like
// `const vcc = …`). `\s*$` tolerates CRLF line endings and trailing blanks.
// Chains accept the object form `.to({ x, y, layer, width })` and the
// positional form `.from({ x, y }, 'F.Cu', 0.3)` alike.
const HEAD_RE = /^([ \t]*)(export[ \t]+)?const ([A-Za-z_$][A-Za-z0-9_$]*) = new TrackBuilder\(typecad,\s*\{([^}]*)\}\s*\)\s*$/;
const FROM_RE = /^\.from\(\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*\}(?:\s*,\s*'([^']*)')?(?:\s*,\s*([\d.]+))?\s*\)/;
const TO_RE = /^\.to\(\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*(?:,\s*layer\s*:\s*'([^']*)')?(?:,\s*width\s*:\s*([\d.]+))?\s*\}(?:\s*,\s*'([^']*)')?(?:\s*,\s*([\d.]+))?\s*\)/;
/** Parse every `[export ]const NAME = new TrackBuilder...` block in the text. */
function parseRoutes(text) {
    const out = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = HEAD_RE.exec(lines[i]);
        if (!m)
            continue;
        const [, indent, exportPrefix, name, opts] = m;
        const points = [];
        const vias = [];
        let powerArgs = null;
        let end = lines.length; // unterminated chain: block runs to EOF
        for (let j = i + 1; j < lines.length; j++) {
            const l = lines[j].trim();
            if (l.startsWith('.from(')) {
                const fm = FROM_RE.exec(l);
                if (fm) {
                    const p = { x: +fm[1], y: +fm[2] };
                    if (fm[3])
                        p.layer = fm[3];
                    if (fm[4])
                        p.width = +fm[4];
                    points.push(p);
                }
            }
            else if (l.startsWith('.to(')) {
                const tm = TO_RE.exec(l);
                if (tm) {
                    const p = { x: +tm[1], y: +tm[2] };
                    const layer = tm[3] ?? tm[5];
                    const width = tm[4] ?? tm[6];
                    if (layer)
                        p.layer = layer;
                    if (width)
                        p.width = +width;
                    points.push(p);
                }
            }
            else if (l.startsWith('.via(')) {
                // the via sits at the chain's current point (the last pushed one);
                // its args ride verbatim so custom sizes/drills survive regeneration
                const open = l.indexOf('(');
                const close = l.lastIndexOf(')');
                if (points.length > 0 && open !== -1 && close > open) {
                    vias.push({ at: points.length - 1, args: l.slice(open + 1, close) });
                }
            }
            else if (l.startsWith('.powerInfo(')) {
                // the power contract is chain-builder config, not geometry: capture
                // its args verbatim and keep scanning — without this the chain scan
                // would treat it as a foreign statement and truncate the route
                const open = l.indexOf('(');
                const close = l.lastIndexOf(')');
                if (close > open)
                    powerArgs = l.slice(open + 1, close);
            }
            else if (l === '' || l.startsWith('//') || l.startsWith('/*')) {
                // blank/comment lines INSIDE a chain are tolerated — a comment
                // carrying a ';' must not truncate the route
                continue;
            }
            else {
                // any other statement ends the block without being consumed by it
                end = j;
                break;
            }
            // the FINAL chain line carries the terminating ';' — the block ends
            // there, consuming that line
            if (l.endsWith(';')) {
                end = j + 1;
                break;
            }
        }
        out.push({
            name: name,
            exportPrefix: exportPrefix ?? '',
            opts: (opts ?? '').trim(),
            powerArgs,
            indent: indent,
            points,
            vias,
            start: i,
            end,
        });
        i = end - 1;
    }
    return out;
}
/**
 * Plan the removal of deleted segments from the source's TrackBuilder
 * chains: matched segments drop, and a route that breaks in the middle
 * splits into two builders (routeN + routeNb) so a real GAP replaces the
 * deleted copper instead of a bridge. Fully emptied routes disappear along
 * with their create() argument. Surviving runs keep the route's options,
 * every via not adjacent to a cut, and each point's own layer.
 */
function planRouteDeletes(text, deletes) {
    const edits = [];
    const skipped = [];
    const unhandledAdditions = [];
    const unhandledRemovals = [];
    if (deletes.length === 0)
        return { edits, applied: 0, skipped, unhandledAdditions, unhandledRemovals };
    const routes = parseRoutes(text);
    // line-index -> char-offset mapping for block edits (create() edits are
    // computed in char offsets directly and stay untouched by this)
    const lineStarts = [];
    {
        let acc = 0;
        for (const ln of text.split('\n')) {
            lineStarts.push(acc);
            acc += ln.length + 1;
        }
    }
    if (routes.length === 0) {
        return { edits, applied: 0, skipped: deletes.map((d) => `segment ${d.x1},${d.y1}->${d.x2},${d.y2} (no TrackBuilder routes in source)`), unhandledAdditions, unhandledRemovals };
    }
    const call = findCreateCall(text);
    const namesToAdd = [];
    const namesToRemove = [];
    /** indexes into `deletes` that matched a source segment somewhere */
    const matched = new Set();
    for (const r of routes) {
        // remaining segment flags: segment i is (points[i], points[i+1])
        const keep = [];
        for (let i = 0; i + 1 < r.points.length; i++) {
            const hit = deletes.findIndex((d) => {
                if (d.kind === 'via') {
                    // a via sits between two pieces: deleting it truncates the chain
                    // there — the segment leaving the via point goes with it (the far
                    // side survives as its own dangling route). A via on the chain's
                    // tail drops the segment leading into it
                    const via = { x: d.x1, y: d.y1 };
                    if (ptEq(via, r.points[i]))
                        return true;
                    if (i + 1 === r.points.length - 1 && ptEq(via, r.points[i + 1]))
                        return true;
                    return false;
                }
                return segMatch(d, r.points[i], r.points[i + 1]);
            });
            keep.push(hit === -1);
            if (hit !== -1)
                matched.add(hit);
        }
        if (keep.every((k) => k))
            continue; // untouched
        /** serialize one surviving run (a contiguous span of point indexes) */
        const emitRun = (name, idxs) => {
            const lines = [];
            const p0 = r.points[idxs[0]];
            // width may ride positionally only BEHIND a layer — .from()'s second
            // parameter is the layer string, so a width without a layer goes in
            // the object form instead
            lines.push(p0.layer !== undefined
                ? `.from({ x: ${fmt(p0.x)}, y: ${fmt(p0.y)} }, '${p0.layer}'${p0.width !== undefined ? `, ${fmt(p0.width)}` : ''})`
                : `.from({ x: ${fmt(p0.x)}, y: ${fmt(p0.y)}${p0.width !== undefined ? `, width: ${fmt(p0.width)}` : ''} })`);
            for (let k = 1; k < idxs.length; k++) {
                const p = r.points[idxs[k]];
                const fields = [`x: ${fmt(p.x)}`, `y: ${fmt(p.y)}`];
                if (p.layer)
                    fields.push(`layer: '${p.layer}'`);
                if (p.width !== undefined)
                    fields.push(`width: ${fmt(p.width)}`);
                lines.push(`.to({ ${fields.join(', ')} })`);
                // a via BETWEEN two kept segments survives with its own args; one at
                // a cut boundary dies with the deleted segment (no barrel on a gap)
                if (k < idxs.length - 1) {
                    const v = r.vias.find((vv) => vv.at === idxs[k]);
                    if (v)
                        lines.push(`.via(${v.args})`);
                }
            }
            return `${r.indent}${r.exportPrefix}const ${name} = new TrackBuilder(typecad, { ${r.opts} })${r.powerArgs ? `\n${r.indent}.powerInfo(${r.powerArgs})` : ''}\n${lines.map((s) => r.indent + s).join('\n')};`;
        };
        // split into contiguous runs of point indexes
        const runs = [];
        let cur = [];
        for (let i = 0; i < keep.length; i++) {
            if (keep[i]) {
                if (cur.length === 0)
                    cur.push(i);
                cur.push(i + 1);
            }
            else if (cur.length) {
                runs.push(cur);
                cur = [];
            }
        }
        if (cur.length)
            runs.push(cur);
        const blockLines = r.end - r.start;
        const blockStart = lineStarts[r.start] ?? 0;
        const blockEnd = lineStarts[r.start + blockLines] ?? text.length;
        if (runs.length === 0) {
            // emptied: remove the declaration (and blank line after if doubled)
            edits.push({ start: blockStart, end: blockEnd, line: '' });
            namesToRemove.push(r.name);
            continue;
        }
        const built = [emitRun(r.name, runs[0])];
        for (let ri = 1; ri < runs.length; ri++) {
            const base = `${r.name}${'abcdefgh'[ri - 1] ?? 'z'}`;
            // ensure uniqueness beyond existing names
            let candidate = base;
            let bump = 1;
            while (text.includes(`const ${candidate} =`) || built.some((b) => b.includes(`const ${candidate} =`))) {
                candidate = `${base}${++bump}`;
            }
            built.push(emitRun(candidate, runs[ri]));
            namesToAdd.push({ name: candidate, sibling: r.name });
        }
        edits.push({ start: blockStart, end: blockEnd, line: built.join('\n\n') + '\n' });
    }
    // ONE combined create() rewrite: additions splice in with a comment-aware
    // separator, then removals drop their names — never two edits over the
    // same range. Without a create() call in THIS text (route blocks live in
    // a dedicated module), the names surface as unhandled for the caller.
    if (namesToAdd.length > 0 || namesToRemove.length > 0) {
        const argsEdit = call
            ? planCreateArgsEdit(text, namesToAdd.map((a) => a.name), namesToRemove)
            : null;
        if (argsEdit) {
            edits.push(argsEdit);
        }
        else {
            unhandledAdditions.push(...namesToAdd);
            unhandledRemovals.push(...namesToRemove);
        }
    }
    const unmatched = deletes.length - matched.size;
    if (unmatched > 0)
        skipped.push(`${unmatched} deleted segment(s) matched no source route`);
    return { edits, applied: matched.size, skipped, unhandledAdditions, unhandledRemovals };
}
//# sourceMappingURL=routeEdits.js.map