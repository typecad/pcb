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
//# sourceMappingURL=layoutEdits.js.map