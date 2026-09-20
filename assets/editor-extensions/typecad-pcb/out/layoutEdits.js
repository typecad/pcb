"use strict";
// ---------------------------------------------------------------------------
// Layout-view placement edits: pure text transforms, no vscode dependency —
// the unit tests exercise exactly what `typecad/layout-rebuild` runs.
//
// A move arrives as a per-ref delta in board (y-down) millimetres. The
// component's source variable resolves elsewhere (the board's "Code"
// property); here we rewrite `<var>.pcb = { x: …, y: …, … }` literals by the
// delta. Literals only: a computed placement (x: b.center.x) is reported as
// skipped, never mangled.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.planPlacementEdits = planPlacementEdits;
exports.planEndpointEdits = planEndpointEdits;
exports.applyPlacementEdits = applyPlacementEdits;
exports.planTextEdits = planTextEdits;
exports.parsePlacementLiteral = parsePlacementLiteral;
exports.planComponentEdits = planComponentEdits;
/** Matches `  var.pcb = { … }` (leading indent captured, literal body only). */
function placementMatcher(variable) {
    return new RegExp(`^([ \\t]*)${escapeRegExp(variable)}\\.pcb\\s*=\\s*\\{([^}]*)\\}`, 'm');
}
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** mm with up to 3 decimals, trailing zeros stripped — reads like hand-written code */
function fmt(n) {
    return String(parseFloat(n.toFixed(3)));
}
/**
 * Compute the literal rewrites for `moves` against one source document.
 * `variableOf` maps a board reference to its source variable (empty/absent
 * when unknown). Only the first matching document wins per ref — pass each
 * src file in turn and stop when a ref resolves.
 */
function planPlacementEdits(text, moves, variableOf) {
    const edits = [];
    const skipped = [];
    for (const move of moves) {
        const variable = variableOf(move.ref);
        if (!variable) {
            skipped.push({ ref: move.ref, reason: 'no source variable' });
            continue;
        }
        const match = placementMatcher(variable).exec(text);
        if (!match) {
            skipped.push({ ref: move.ref, reason: `no \`${variable}.pcb = {…}\` literal found` });
            continue;
        }
        const inner = match[2];
        const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(inner);
        const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(inner);
        if (!xNum || !yNum) {
            skipped.push({ ref: move.ref, reason: 'placement is computed, not a literal' });
            continue;
        }
        const nx = parseFloat(xNum[1]) + move.dx;
        const ny = parseFloat(yNum[1]) + move.dy;
        let newInner = inner.replace(/\bx\s*:\s*-?[\d.]+/, `x: ${fmt(nx)}`).replace(/\by\s*:\s*-?[\d.]+/, `y: ${fmt(ny)}`);
        // rotation rides as a delta onto the literal's field (0 or absent = 0)
        if (move.rot) {
            const rotNum = /\brotation\s*:\s*(-?[\d.]+)/.exec(inner);
            const newRot = (rotNum ? parseFloat(rotNum[1]) : 0) + move.rot;
            if (rotNum)
                newInner = newInner.replace(/\brotation\s*:\s*-?[\d.]+/, `rotation: ${fmt(newRot)}`);
            else
                newInner = `${newInner.trimEnd()}, rotation: ${fmt(newRot)} `;
        }
        edits.push({
            ref: move.ref,
            line: `${match[1]}${variable}.pcb = { ${newInner.trim()} }`,
            start: match.index,
            end: match.index + match[0].length,
        });
    }
    return { edits, skipped };
}
/**
 * Sticky TrackBuilder endpoints: any `.from({ x: …, y: … })` / `.to({ … })`
 * literal whose coordinates sit on one of the moved component's ORIGINAL
 * pads (within 0.05 mm) translates by the same delta — hand-built routes
 * follow the part instead of dangling. Pure numeric literals only.
 */
function planEndpointEdits(text, move) {
    const pads = move.pads ?? [];
    if (pads.length === 0 || (!move.dx && !move.dy))
        return [];
    const edits = [];
    // translate a numeric literal by delta, keeping ITS decimal precision
    // (source coordinates can carry 4+ decimals; rounding to 3 would erode
    // them every apply)
    const shift = (axis) => (whole, lead, num) => {
        const decimals = Math.max((num.split('.')[1] ?? '').length, 3);
        const value = (parseFloat(num) + (axis === 'x' ? move.dx : move.dy)).toFixed(decimals);
        return `${lead}${parseFloat(value)}`;
    };
    for (const kind of ['from', 'to']) {
        const re = new RegExp(`\\.${kind}\\(\\{\\s*x\\s*:\\s*(-?[\\d.]+)\\s*,\\s*y\\s*:\\s*(-?[\\d.]+)`, 'g');
        let match;
        while ((match = re.exec(text)) !== null) {
            const ex = parseFloat(match[1]);
            const ey = parseFloat(match[2]);
            if (!pads.some((p) => Math.abs(p.x - ex) < 0.05 && Math.abs(p.y - ey) < 0.05))
                continue;
            // only the x/y numbers inside this literal move — layer/width stay
            const head = text.indexOf('{', match.index);
            const tail = text.indexOf('}', head);
            if (head === -1 || tail === -1)
                continue;
            const inner = text.slice(head + 1, tail);
            const newInner = inner
                .replace(/(\bx\s*:\s*)(-?[\d.]+)/, shift('x'))
                .replace(/(\by\s*:\s*)(-?[\d.]+)/, shift('y'));
            edits.push({
                ref: `${move.ref} route endpoint`,
                // the replacement covers exactly [match.index, tail+1] — the literal
                // through its closing brace, nothing beyond
                line: `${text.slice(match.index, head + 1)}${newInner}}`,
                start: match.index,
                end: tail + 1,
            });
        }
    }
    return edits;
}
/** Apply planned edits to a document's text (latest edit first, ranges stay valid). */
function applyPlacementEdits(text, edits) {
    const sorted = [...edits].sort((a, b) => b.start - a.start);
    let out = text;
    for (const edit of sorted)
        out = out.slice(0, edit.start) + edit.line + out.slice(edit.end);
    return out;
}
/** Find the balanced `{ … }` object literal starting at/after the call head. */
function objectLiteralRange(text, head) {
    const open = text.indexOf('{', head);
    if (open === -1)
        return null;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{')
            depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0)
                return { head, open, close: i };
        }
    }
    return null;
}
/**
 * Compute the `.text({ … })` literal rewrites for `edits` against one source
 * document. A call matches an edit when its x/y literals sit within 0.05 mm
 * of the authored anchor and its text literal equals the authored value.
 */
function planTextEdits(text, edits) {
    const planned = [];
    const skipped = [];
    const used = new Set();
    const callRe = /\.text\s*\(/g;
    let match;
    while ((match = callRe.exec(text)) !== null) {
        const range = objectLiteralRange(text, match.index);
        if (!range)
            continue;
        const inner = text.slice(range.open + 1, range.close);
        const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(inner);
        const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(inner);
        const tNum = /\btext\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(inner);
        if (!xNum || !yNum || !tNum)
            continue;
        const cx = parseFloat(xNum[1]);
        const cy = parseFloat(yNum[1]);
        const ctext = tNum[2];
        const edit = edits.find((e, i) => !used.has(i) &&
            e.text0 === ctext &&
            Math.abs(e.x0 - cx) < 0.05 &&
            Math.abs(e.y0 - cy) < 0.05);
        if (!edit)
            continue;
        used.add(edits.indexOf(edit));
        let newInner = inner;
        if (edit.text !== ctext) {
            const esc = edit.text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
            newInner = newInner.replace(tNum[0], () => `text: ${tNum[1]}${esc}${tNum[1]}`);
        }
        if (edit.x !== cx)
            newInner = newInner.replace(/\bx\s*:\s*-?[\d.]+/, `x: ${fmt(edit.x)}`);
        if (edit.y !== cy)
            newInner = newInner.replace(/\by\s*:\s*-?[\d.]+/, `y: ${fmt(edit.y)}`);
        // rotation accumulates onto the literal like placements (absent = 0)
        if (edit.rot) {
            const rotNum = /\brotation\s*:\s*(-?[\d.]+)/.exec(inner);
            const newRot = (rotNum ? parseFloat(rotNum[1]) : 0) + edit.rot;
            if (rotNum)
                newInner = newInner.replace(/\brotation\s*:\s*-?[\d.]+/, `rotation: ${fmt(newRot)}`);
            else
                newInner = `${newInner.trimEnd()}, rotation: ${fmt(newRot)} `;
        }
        planned.push({
            ref: `text "${edit.text0}"`,
            // exactly the call's object literal, nothing beyond
            line: `${text.slice(match.index, range.open + 1)}${newInner}}`,
            start: match.index,
            end: range.close + 1,
        });
    }
    for (let i = 0; i < edits.length; i++) {
        if (!used.has(i))
            skipped.push({ ref: `text "${edits[i].text0}"`, reason: 'no .text({…}) literal matches its authored value/anchor' });
    }
    return { edits: planned, skipped };
}
// ---------------------------------------------------------------------------
// Component LABEL repositioning: a Reference/Value fp_text dragged in the
// layout view. The final world position arrives in board (y-down) mm; it is
// converted to FOOTPRINT-LOCAL coordinates against the part's final
// placement (literal + the same apply's move delta) and written into the
// Component constructor's referenceLayout / valueLayout options — exactly
// what the board writer's applyLayoutToFpText consumes on rebuild.
// ---------------------------------------------------------------------------
/** Parse a `<var>.pcb = { x, y, rotation? }` literal (null when computed). */
function parsePlacementLiteral(text, variable) {
    const match = new RegExp(`^([ \\t]*)${escapeRegExp(variable)}\\.pcb\\s*=\\s*\\{([^}]*)\\}`, 'm').exec(text);
    if (!match)
        return null;
    const xNum = /\bx\s*:\s*(-?[\d.]+)/.exec(match[2]);
    const yNum = /\by\s*:\s*(-?[\d.]+)/.exec(match[2]);
    if (!xNum || !yNum)
        return null;
    const rNum = /\brotation\s*:\s*(-?[\d.]+)/.exec(match[2]);
    return { x: parseFloat(xNum[1]), y: parseFloat(yNum[1]), rot: rNum ? parseFloat(rNum[1]) : 0 };
}
function planComponentEdits(text, specs, placementOf, allRefs) {
    const planned = [];
    const skipped = [];
    const used = new Set();
    const callRe = /new\s+Component\s*\(/g;
    let match;
    while ((match = callRe.exec(text)) !== null) {
        const range = objectLiteralRange(text, match.index);
        if (!range)
            continue;
        const inner = text.slice(range.open + 1, range.close);
        const rNum = /\breference\s*:\s*(['"])((?:\.|(?!\1).)*)\1/.exec(inner);
        if (!rNum)
            continue;
        const ref = rNum[2];
        const spec = specs.find((sp, i) => !used.has(i) && sp.ref === ref);
        if (!spec)
            continue;
        used.add(specs.indexOf(spec));
        let skip = null;
        if (spec.newRef && allRefs.has(spec.newRef) && spec.newRef !== ref)
            skip = `\`${spec.newRef}\` is already a component reference`;
        let newInner = inner;
        const insertAt = rNum.index + rNum[0].length;
        const after = [];
        if (!skip && spec.newRef) {
            const esc = spec.newRef.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
            newInner = newInner.replace(rNum[0], () => `reference: ${rNum[1]}${esc}${rNum[1]}`);
        }
        if (!skip && spec.value !== undefined) {
            const vNum = /\bvalue\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(inner);
            const esc = spec.value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
            if (vNum)
                newInner = newInner.replace(vNum[0], () => `value: ${vNum[1]}${esc}${vNum[1]}`);
            else
                after.push(`value: ${rNum[1]}${esc}${rNum[1]}`);
        }
        if (!skip && spec.label) {
            const part = placementOf(ref);
            if (!part) {
                skip = 'no .pcb placement literal found';
            }
            else {
                const rad = (-part.rot * Math.PI) / 180;
                const c = Math.cos(rad);
                const s2 = Math.sin(rad);
                const dx = spec.label.x - part.x;
                const dy = spec.label.y - part.y;
                const body = `{ x: ${fmt(dx * c - dy * s2)}, y: ${fmt(dx * s2 + dy * c)}, rotation: ${fmt(spec.label.rot - part.rot)} }`;
                // reference/value carry their own Layout option names; the small
                // fab refdes text is positioned by the plain 'fab' option
                const prop = spec.label.kind === 'fab' ? 'fab' : `${spec.label.kind}Layout`;
                const layoutRe = new RegExp(`\b${prop}\s*:\s*\{[^}]*\}`);
                const existing = layoutRe.exec(inner);
                if (existing)
                    newInner = newInner.replace(existing[0], () => `${prop}: ${body}`);
                else
                    after.push(`${prop}: ${body}`);
            }
        }
        if (skip) {
            skipped.push({ ref: `${ref} (${spec.label ? spec.label.kind + ' label' : spec.newRef ? 'rename' : 'value'})`, reason: skip });
            continue;
        }
        if (after.length)
            newInner = newInner.slice(0, insertAt) + ', ' + after.join(', ') + newInner.slice(insertAt);
        planned.push({
            ref: `${ref} edits`,
            line: `${text.slice(match.index, range.open + 1)}${newInner}}`,
            start: match.index,
            end: range.close + 1,
        });
    }
    for (let i = 0; i < specs.length; i++) {
        if (!used.has(i))
            skipped.push({ ref: `${specs[i].ref} edits`, reason: 'no Component constructor literal found' });
    }
    return { edits: planned, skipped };
}
//# sourceMappingURL=layoutEdits.js.map