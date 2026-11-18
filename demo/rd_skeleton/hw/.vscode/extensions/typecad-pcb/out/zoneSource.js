"use strict";
// ---------------------------------------------------------------------------
// Zone source resolution: map a selected board zone (board-frame points,
// from the viewer) onto the `zone({ … points: […] })` literal that authored
// it, and return the source line of that call. Matching is by points
// bounding box (the canonical writer and the zones island both round to
// 0.001 mm), with the net as a tie-break between coincident zones. Rect
// zones author as four-corner polygons, so one matcher covers both.
// vscode-free (pure string work) so the matching is unit-tested.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveZoneSource = resolveZoneSource;
const TOL = 0.05;
/** every `zone({ … points: [{ x, y }, …] … })` call in the sources */
function collectZoneLiterals(files) {
    const out = [];
    const callRe = /\bzone\s*\(\s*\{/g;
    const pairRe = /\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)\s*\}/g;
    for (const f of files) {
        let m;
        callRe.lastIndex = 0;
        while ((m = callRe.exec(f.text)) !== null) {
            // the call's object literal — scan forward to its closing brace and
            // read the points pairs (and the net) inside it
            const objStart = m.index + m[0].length - 1;
            let depth = 0;
            let end = objStart;
            for (let i = objStart; i < f.text.length; i++) {
                if (f.text[i] === '{')
                    depth++;
                else if (f.text[i] === '}') {
                    depth--;
                    if (depth === 0) {
                        end = i;
                        break;
                    }
                }
            }
            const body = f.text.slice(objStart, end);
            const ptsRe = /points\s*:\s*\[/;
            if (!ptsRe.test(body))
                continue;
            const pts = [];
            pairRe.lastIndex = body.search(ptsRe);
            if (pairRe.lastIndex < 0)
                pairRe.lastIndex = 0;
            let p;
            while ((p = pairRe.exec(body)) !== null) {
                const x = Number.parseFloat(p[1]);
                const y = Number.parseFloat(p[2]);
                if (Number.isFinite(x) && Number.isFinite(y))
                    pts.push({ x, y });
            }
            if (pts.length < 3)
                continue;
            const netM = /net\s*:\s*['"]([^'"]+)['"]/.exec(body);
            out.push({
                uri: f.uri,
                line: f.text.slice(0, m.index).split(/\r?\n/).length,
                net: netM ? netM[1] : null,
                pts,
            });
        }
    }
    return out;
}
function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
}
/**
 * Resolve a selected zone to its declaring `zone({...})` line. The points
 * bounding box matches within TOL (both sides are mm at 0.001 rounding);
 * among coincident matches (a pour per layer over the same area) the net
 * and layer prefer their own. Null when nothing matches.
 */
function resolveZoneSource(zone, files) {
    if (zone.pts.length < 3)
        return null;
    const z = bbox(zone.pts);
    let best = null;
    let bestScore = -1;
    for (const lit of collectZoneLiterals(files)) {
        const b = bbox(lit.pts);
        if (Math.abs(b.x0 - z.x0) > TOL || Math.abs(b.y0 - z.y0) > TOL ||
            Math.abs(b.x1 - z.x1) > TOL || Math.abs(b.y1 - z.y1) > TOL)
            continue;
        let score = 1;
        if (zone.net && lit.net === zone.net)
            score += 2;
        if (score > bestScore) {
            bestScore = score;
            best = lit;
        }
    }
    if (!best)
        return null;
    return {
        uri: best.uri,
        line: best.line,
        detail: `zone(${best.net ? "'" + best.net + "'" : '…'}) ${best.pts.length}-point pour`,
    };
}
//# sourceMappingURL=zoneSource.js.map