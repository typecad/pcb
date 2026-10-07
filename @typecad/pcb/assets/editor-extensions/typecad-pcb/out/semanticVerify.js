"use strict";
// ---------------------------------------------------------------------------
// Semantic verification of a layout apply: after the rebuild, does the BOARD
// actually carry what the apply intended? The parse gate guarantees the
// source is syntactically intact; this catches the next class — a plan that
// parses but silently fails to produce the geometry (a route dropped by the
// board model, a delete that missed, a move that didn't land). vscode-free
// (regex scans over the .kicad_pcb text) so the checks are unit-tested.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBoardSemantics = verifyBoardSemantics;
function boardSegments(board) {
    const out = [];
    for (const m of board.matchAll(/\(segment \(start (-?[\d.]+) (-?[\d.]+)\) \(end (-?[\d.]+) (-?[\d.]+)\)[^\n]*?\(layer "([^"]+)"\)(?:[^\n]*?\(net (\d+)\))?/g)) {
        out.push({
            x1: parseFloat(m[1]),
            y1: parseFloat(m[2]),
            x2: parseFloat(m[3]),
            y2: parseFloat(m[4]),
            layer: m[5],
            net: m[6] !== undefined ? Number(m[6]) : null,
        });
    }
    return out;
}
function boardVias(board) {
    const out = [];
    for (const m of board.matchAll(/\(via(?: \w+)? \(at (-?[\d.]+) (-?[\d.]+)\)/g))
        out.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
    return out;
}
function boardPlacements(board) {
    // each footprint block: first (at x y [rot]) is the placement, the
    // footprint's own (layer …) names the side, and the Reference property
    // names it. Blocks come in BOTH serializations — classic single-line
    // `(footprint …` and pcbnew-10 split style `(\n  footprint\n` (resaved
    // boards); splitting on the literal `(footprint ` went blind on the
    // split form and reported every moved component as having no footprint.
    const out = new Map();
    const blocks = board.split(/\(\s*footprint\b/).slice(1);
    for (const block of blocks) {
        // The PLACEMENT (at) is the first one OUTSIDE any (property …) form:
        // typeCAD's provenance `(property "Code" "typecad:v1:…" (at 0 0 0) …)`
        // precedes the footprint's own placement, so the naive first-(at) read
        // the property's 0,0 and every move verified as "sits at 0.00,0.00".
        const at = /\(at (-?[\d.]+) (-?[\d.]+)/.exec(stripPropertyForms(block));
        const ref = /\(property "Reference" "([^"]+)"/.exec(block);
        if (!at || !ref)
            continue;
        // the footprint's own layer: the first (layer "…") in the block — a
        // bare "B.Cu"/"F.Cu" (the fp_ prefixes appear on child items only)
        const layer = /\(layer "([^"]+)"/.exec(block);
        const side = layer && /B\.Cu$/.test(layer[1]) ? 'back' : 'front';
        out.set(ref[1], { x: parseFloat(at[1]), y: parseFloat(at[2]), side });
    }
    return out;
}
/** Blank out every balanced `(property …)` sub-expression, keeping length
 *  and everything outside them (a cheap scanner — properties never nest
 *  properties, so one pass per opening works). */
function stripPropertyForms(block) {
    const chars = block.split('');
    let i = 0;
    while (i < block.length) {
        const open = block.indexOf('(property', i);
        if (open === -1)
            break;
        let depth = 0;
        let end = -1;
        for (let j = open; j < block.length; j++) {
            if (block[j] === '(')
                depth++;
            else if (block[j] === ')') {
                depth--;
                if (depth === 0) {
                    end = j;
                    break;
                }
            }
        }
        if (end === -1)
            break;
        for (let j = open; j <= end; j++) {
            if (chars[j] !== '\n')
                chars[j] = ' ';
        }
        i = end + 1;
    }
    return chars.join('');
}
function boardTexts(board) {
    const out = [];
    for (const m of board.matchAll(/\(gr_text "((?:[^"\\]|\\.)*)"[^\n]*?\(at (-?[\d.]+) (-?[\d.]+)/g))
        out.push({ text: m[1], x: parseFloat(m[2]), y: parseFloat(m[3]) });
    return out;
}
function boardZones(board) {
    // zone blocks nest (polygon (pts (xy …) (xy …))); the outline is the
    // FIRST pts block — filled polygons carry their own and are ignored.
    // typeCAD's writer PRETTY-PRINTS zone blocks — every token on its own
    // line, grouped sub-lists each wrapped in their own parens — so the
    // block is collapsed to single spaces first and every token scan allows
    // whitespace (and the grouping parens) between tokens. Without this, a
    // rebuilt board reads as zone-less and every zone apply reports
    // "MISSING from the rebuilt board" while the pour renders fine.
    const out = [];
    for (const m of board.matchAll(/\(\s*zone\b/g)) {
        let depth = 0;
        let start = -1;
        let end = -1;
        for (let i = m.index; i < board.length; i++) {
            const ch = board[i];
            if (ch === '(') {
                if (depth === 0)
                    start = i;
                depth++;
            }
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        if (start === -1 || end === -1)
            break;
        const flat = board.slice(start, end).replace(/\s+/g, ' ');
        const layers = Array.from(flat.matchAll(/\(\s*layers ((?:"[^"]*"\s*)+)\)/g))[0]?.[1]
            ?.match(/"([^"]*)"/g)
            ?.map((l) => l.slice(1, -1)) ?? [];
        const netName = /\(\s*net_name "((?:[^"\\]|\\.)*)"\)/.exec(flat)?.[1] ?? '';
        const ptsBlock = /\(\s*polygon\s*\(\s*pts\s*((?:\(xy\s+-?[\d.]+\s+-?[\d.]+\)\s*)+)/.exec(flat)?.[1];
        const pts = ptsBlock
            ? Array.from(ptsBlock.matchAll(/\(xy\s+(-?[\d.]+)\s+(-?[\d.]+)\)/g)).map((p) => ({
                x: parseFloat(p[1]),
                y: parseFloat(p[2]),
            }))
            : [];
        out.push({ layers, netName, keepout: /\(\s*keepout\b/.test(flat), pts });
    }
    return out;
}
const TOL = 0.03; // mm — coordinates round-trip through 3-4 decimal writes
const near = (a, b) => Math.abs(a - b) < TOL;
/**
 * Filled gr_poly graphics on the board (artwork emits them; the writer
 * pretty-prints, so the block is paren-balanced then collapsed — same
 * shape of scan as boardZones).
 */
function boardFilledPolys(board) {
    const out = [];
    for (const m of board.matchAll(/\(\s*gr_poly\b/g)) {
        let depth = 0;
        let start = -1;
        let end = -1;
        for (let i = m.index; i < board.length; i++) {
            const ch = board[i];
            if (ch === '(') {
                if (depth === 0)
                    start = i;
                depth++;
            }
            else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        if (start === -1 || end === -1)
            break;
        const flat = board.slice(start, end).replace(/\s+/g, ' ');
        const layer = /\(\s*layer "([^"]+)"\)/.exec(flat)?.[1] ?? '';
        const ptsBlock = /\(\s*pts\s*((?:\(xy\s+-?[\d.]+\s+-?[\d.]+\)\s*)+)\)/.exec(flat)?.[1];
        if (!layer || !ptsBlock)
            continue;
        const xs = [];
        const ys = [];
        for (const p of ptsBlock.matchAll(/\(xy\s+(-?[\d.]+)\s+(-?[\d.]+)\)/g)) {
            xs.push(parseFloat(p[1]));
            ys.push(parseFloat(p[2]));
        }
        if (xs.length === 0)
            continue;
        out.push({
            layer,
            filled: /\(\s*fill\s+solid\s*\)/.test(flat),
            x0: Math.min(...xs),
            y0: Math.min(...ys),
            x1: Math.max(...xs),
            y1: Math.max(...ys),
        });
    }
    return out;
}
function segMatches(segs, x1, y1, x2, y2, layer) {
    for (const s of segs) {
        if (layer && s.layer !== layer)
            continue;
        if ((near(s.x1, x1) && near(s.y1, y1) && near(s.x2, x2) && near(s.y2, y2)) ||
            (near(s.x1, x2) && near(s.y1, y2) && near(s.x2, x1) && near(s.y2, y1)))
            return true;
    }
    return false;
}
/**
 * The board's Edge.Cuts extent as a board-frame min-corner rect, from the
 * gr_line segments and gr_arc extremes on the outline layer (a filleted
 * rect's lines sit inside the corners — the arcs carry the extremes).
 */
function boardOutlineRect(board) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let any = false;
    const point = (x, y) => {
        any = true;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
    };
    // the block between the coordinates and the layer token carries the
    // (stroke ...) child — scan lazily but never cross into the next gr_
    // element, or a F.Cu line could adopt a later Edge.Cuts layer token
    for (const m of board.matchAll(/\(gr_line \(start (-?[\d.]+) (-?[\d.]+)\) \(end (-?[\d.]+) (-?[\d.]+)\)(?:(?!\(gr_)[\s\S])*?\(layer "Edge\.Cuts"\)/g)) {
        point(parseFloat(m[1]), parseFloat(m[2]));
        point(parseFloat(m[3]), parseFloat(m[4]));
    }
    for (const m of board.matchAll(/\(gr_arc \(start (-?[\d.]+) (-?[\d.]+)\) \(mid (-?[\d.]+) (-?[\d.]+)\) \(end (-?[\d.]+) (-?[\d.]+)\)(?:(?!\(gr_)[\s\S])*?\(layer "Edge\.Cuts"\)/g)) {
        point(parseFloat(m[1]), parseFloat(m[2]));
        point(parseFloat(m[3]), parseFloat(m[4]));
        point(parseFloat(m[5]), parseFloat(m[6]));
    }
    if (!any)
        return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const fmt = (n) => n.toFixed(2);
/**
 * Verify the rebuilt board against what an apply intended. Every check is
 * an existence (or absence) question; `misses` describes each failure in
 * user-facing words for the output channel and the page status.
 */
function verifyBoardSemantics(board, check) {
    const misses = [];
    let checked = 0;
    const segs = boardSegments(board);
    const vias = boardVias(board);
    for (const route of check.routes) {
        for (const piece of route.pieces) {
            for (let i = 1; i < piece.pts.length; i++) {
                const a = piece.pts[i - 1];
                const b = piece.pts[i];
                checked++;
                if (!segMatches(segs, a.x, a.y, b.x, b.y, piece.layer))
                    misses.push(`route segment ${fmt(a.x)},${fmt(a.y)} → ${fmt(b.x)},${fmt(b.y)} on ${piece.layer}${route.net ? ` (net ${route.net})` : ''} is missing from the rebuilt board`);
            }
        }
        for (const v of route.vias) {
            checked++;
            if (!vias.some((bv) => near(bv.x, v.x) && near(bv.y, v.y)))
                misses.push(`via at ${fmt(v.x)},${fmt(v.y)}${route.net ? ` (net ${route.net})` : ''} is missing from the rebuilt board`);
        }
    }
    for (const d of check.deletes) {
        checked++;
        if (!segMatches(segs, d.x1, d.y1, d.x2, d.y2, d.layer))
            continue;
        // Width is not part of the match (the delete payload carries none), so
        // a rip-up-and-REDRAW over the same path at a different width reads as
        // the deleted leg surviving. The apply knows its own new routes: when
        // the "still present" copper coincides with a leg this same gesture
        // added, it is the redraw, not a failed delete.
        const redrawn = check.routes.some((route) => route.pieces.some((piece) => piece.pts.some((pt, i) => {
            if (i === 0)
                return false;
            const a = piece.pts[i - 1];
            const b = pt;
            return ((near(a.x, d.x1) && near(a.y, d.y1) && near(b.x, d.x2) && near(b.y, d.y2)) ||
                (near(a.x, d.x2) && near(a.y, d.y2) && near(b.x, d.x1) && near(b.y, d.y1)));
        })));
        if (!redrawn)
            misses.push(`deleted segment ${fmt(d.x1)},${fmt(d.y1)} → ${fmt(d.x2)},${fmt(d.y2)}${d.layer ? ` on ${d.layer}` : ''}${d.net ? ` (net ${d.net})` : ''} is STILL on the rebuilt board`);
    }
    if (check.placements.length > 0) {
        const placed = boardPlacements(board);
        for (const p of check.placements) {
            checked++;
            const at = placed.get(p.ref);
            if (!at)
                misses.push(`component ${p.ref} has no footprint on the rebuilt board`);
            else if (!near(at.x, p.x) || !near(at.y, p.y))
                misses.push(`component ${p.ref} sits at ${fmt(at.x)},${fmt(at.y)} — the apply moved it to ${fmt(p.x)},${fmt(p.y)}`);
            else if (p.side && at.side !== p.side)
                misses.push(`component ${p.ref} sits on the ${at.side} side — the apply flipped it to the ${p.side}`);
        }
    }
    for (const t of check.texts) {
        checked++;
        if (!boardTexts(board).some((bt) => bt.text === t.text && near(bt.x, t.x) && near(bt.y, t.y)))
            misses.push(`text "${t.text}" at ${fmt(t.x)},${fmt(t.y)} is missing from the rebuilt board`);
    }
    if (check.zoneDeletes && check.zoneDeletes.length > 0) {
        const zones = boardZones(board);
        for (const d of check.zoneDeletes) {
            checked++;
            const corners = [
                { x: d.x, y: d.y },
                { x: d.x + d.w, y: d.y },
                { x: d.x + d.w, y: d.y + d.h },
                { x: d.x, y: d.y + d.h },
            ];
            const still = zones.some((bz) => !bz.keepout && bz.layers.includes(d.layer) && corners.every((c) => bz.pts.some((p) => near(p.x, c.x) && near(p.y, c.y))));
            if (still)
                misses.push(`deleted zone on ${d.layer} at ${fmt(d.x)},${fmt(d.y)} ${fmt(d.w)}×${fmt(d.h)} mm is STILL on the rebuilt board`);
        }
    }
    if (check.zones && check.zones.length > 0) {
        const zones = boardZones(board);
        for (const z of check.zones) {
            checked++;
            const corners = [
                { x: z.x, y: z.y },
                { x: z.x + z.w, y: z.y },
                { x: z.x + z.w, y: z.y + z.h },
                { x: z.x, y: z.y + z.h },
            ];
            const hit = zones.some((bz) => bz.keepout === (z.kind === 'keepout') &&
                bz.layers.includes(z.layer) &&
                (z.net ? bz.netName.toLowerCase() === z.net.toLowerCase() : true) &&
                corners.every((c) => bz.pts.some((p) => near(p.x, c.x) && near(p.y, c.y))));
            if (!hit)
                misses.push(`${z.kind === 'keepout' ? 'keepout' : `pour${z.net ? ` (net ${z.net})` : ''}`} zone on ${z.layer} at ${fmt(z.x)},${fmt(z.y)} ${fmt(z.w)}×${fmt(z.h)} mm is missing from the rebuilt board`);
        }
    }
    if (check.images && check.images.length > 0) {
        const polys = boardFilledPolys(board);
        for (const img of check.images) {
            checked++;
            // artwork decomposes into filled polys on the side's copper, silk, or
            // mask layers (a mask-only PNG paints only openings); the ink always
            // INTERSECTS the placed rect, which is the existence question
            const prefix = img.side === 'back' ? 'B.' : 'F.';
            const hit = polys.some((p) => p.filled &&
                p.layer.startsWith(prefix) &&
                p.x0 < img.x + img.w / 2 + TOL &&
                p.x1 > img.x - img.w / 2 - TOL &&
                p.y0 < img.y + img.h / 2 + TOL &&
                p.y1 > img.y - img.h / 2 - TOL);
            if (!hit)
                misses.push(`artwork ${fmt(img.w)}×${fmt(img.h)} mm at ${fmt(img.x)},${fmt(img.y)} (${img.side} side) is missing from the rebuilt board`);
        }
    }
    if (check.outline) {
        checked++;
        const got = boardOutlineRect(board);
        const r = check.outline.rect;
        if (!got)
            misses.push(`the board outline (${fmt(r.w)}×${fmt(r.h)} mm) is missing from the rebuilt board`);
        else if (!near(got.x, r.x) ||
            !near(got.y, r.y) ||
            !near(got.w, r.w) ||
            !near(got.h, r.h))
            misses.push(`the rebuilt board outline sits at ${fmt(got.x)},${fmt(got.y)} measuring ${fmt(got.w)}×${fmt(got.h)} mm — the apply set ${fmt(r.x)},${fmt(r.y)} ${fmt(r.w)}×${fmt(r.h)}`);
    }
    // an empty check verifies nothing — say so rather than reporting "ok"
    return { ok: misses.length === 0 && checked > 0, misses, checked };
}
//# sourceMappingURL=semanticVerify.js.map