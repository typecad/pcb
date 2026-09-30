"use strict";
// ---------------------------------------------------------------------------
// Net-segment source resolution: map a selected trace segment (board-frame
// endpoints, from the viewer) onto the TrackBuilder chain that drew it, and
// return the source line of the `.to()` that defines it. Falls back to the
// net's `typecad.named('…')` declaration when no chain edge matches (the
// segment may be autorouter output with no authored chain). vscode-free
// (pure string work) so the matching is unit-tested.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectChainPoints = collectChainPoints;
exports.resolveSegmentSource = resolveSegmentSource;
exports.resolveNetDeclaration = resolveNetDeclaration;
const TOL = 0.05; // mm — source literals are written to 3-4 decimals
const near = (a, b) => Math.abs(a - b) < TOL;
/**
 * Every TrackBuilder chain POINT in the given sources, in chain order: the
 * net comes from the chain header (`new TrackBuilder(w, { net: '…' })`),
 * each point from its `.from({ x, y … })` / `.to({ x, y … })` call with the
 * 1-based line it sits on.
 */
function collectChainPoints(files) {
    const out = [];
    for (const f of files) {
        const lines = f.text.split(/\r?\n/);
        let net = null;
        let inChain = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/new\s+TrackBuilder\s*\(/.test(line)) {
                inChain = true;
                // the net may sit on the header line or a following line inside the
                // options object (`net:` then the quote on the next line) — scan a
                // small window regardless of a bare `net:` already on the header
                let opts = line;
                for (let w = 1; w <= 3 && i + w < lines.length; w++)
                    opts += '\n' + lines[i + w];
                const nm = /net\s*:\s*'([^']*)'/.exec(opts);
                net = nm ? nm[1] : null;
            }
            if (!inChain)
                continue;
            const m = /\.(?:from|to)\(\{\s*x\s*:\s*(-?[\d.]+)\s*,\s*y\s*:\s*(-?[\d.]+)/.exec(line);
            if (m)
                out.push({ uri: f.uri, line: i + 1, net, x: parseFloat(m[1]), y: parseFloat(m[2]) });
            // a `.to({ … });` (semicolon right after the closing paren) ends the
            // chain; bare comment or blank lines ride along inside it
            if (inChain && /\)\s*;\s*(\/\/.*)?$/.test(line.trim()) && !/new\s+TrackBuilder/.test(line))
                inChain = false;
        }
    }
    return out;
}
/**
 * Resolve a selected segment to a source line: consecutive chain points
 * matching the segment's endpoints (either orientation) are the edge that
 * drew it — reveal the line of the segment's FAR point (the `.to()` that
 * completes the edge). Null when no chain edge matches (autorouter output
 * has no authored chain).
 */
function resolveSegmentSource(seg, files) {
    const pts = collectChainPoints(files);
    const matchNet = (p) => !seg.net || !p.net || p.net === seg.net;
    for (const [end, start] of [
        [
            { x: seg.x2, y: seg.y2 },
            { x: seg.x1, y: seg.y1 },
        ],
        [
            { x: seg.x1, y: seg.y1 },
            { x: seg.x2, y: seg.y2 },
        ],
    ]) {
        for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (!matchNet(a) || !matchNet(b))
                continue;
            if (a.uri !== b.uri)
                continue;
            if (near(a.x, start.x) && near(a.y, start.y) && near(b.x, end.x) && near(b.y, end.y)) {
                return { uri: b.uri, line: b.line, detail: `chain edge (${a.x}, ${a.y}) → (${b.x}, ${b.y}) on net ${a.net ?? '?'}` };
            }
        }
    }
    return null;
}
/** Line of `typecad.named('net')` / `.named('net')` in the sources, or null. */
function resolveNetDeclaration(net, files) {
    const re = new RegExp("\\.named\\(\\s*['\"]" + net.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]\\s*\\)");
    for (const f of files) {
        const lines = f.text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i]))
                return { uri: f.uri, line: i + 1, detail: `typecad.named('${net}')` };
        }
    }
    return null;
}
//# sourceMappingURL=netSegmentSource.js.map