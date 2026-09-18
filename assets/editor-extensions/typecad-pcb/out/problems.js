"use strict";
// ---------------------------------------------------------------------------
// Problems-pane content, pure: unconnected-pad warnings and DRC violations
// mapped to the DECLARING source lines (component Code property, net
// Code/Route provenance) so a violation points at the code that caused it.
// vscode-free — the extension turns ProblemEntry into vscode.Diagnostic.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.refSourceMap = refSourceMap;
exports.unconnectedProblems = unconnectedProblems;
exports.parseDrcReport = parseDrcReport;
exports.drcProblems = drcProblems;
/** ref -> "file:line" from the component index's source field. */
function refSourceMap(components) {
    const map = new Map();
    for (const c of components) {
        if (c.reference && c.source)
            map.set(c.reference, c.source);
    }
    return map;
}
/**
 * Unconnected pads (one warning each, at the declaring line of their
 * component) plus single-pin nets (at the net's declaration). Mechanical
 * pads are already excluded by the query. Pads of components without a
 * recorded source attach to the board file as a catch-all.
 */
function unconnectedProblems(report, refs, nets, boardFile) {
    const out = [];
    for (const pad of report.unconnectedPads) {
        out.push({
            location: refs.get(pad.reference) ?? `${boardFile}:1`,
            message: `${pad.reference} pad ${pad.pad} is unconnected`,
            severity: 'warning',
            code: 'unconnected-pad',
        });
    }
    const netByName = new Map(nets.map((n) => [n.name, n]));
    for (const name of report.singlePinNets) {
        const net = netByName.get(name);
        out.push({
            location: net?.source ?? net?.routeSource ?? `${boardFile}:1`,
            message: `net ${name} has only one pin`,
            severity: 'warning',
            code: 'single-pin-net',
        });
    }
    return out;
}
/** Parse kicad-cli's `pcb drc --format json` document defensively. */
function parseDrcReport(raw) {
    if (!raw || typeof raw !== 'object')
        return [];
    const doc = raw;
    if (!Array.isArray(doc.violations))
        return [];
    const out = [];
    for (const v of doc.violations) {
        if (!v || typeof v !== 'object')
            continue;
        const violation = v;
        const severity = String(violation.severity ?? 'error');
        if (severity !== 'error' && severity !== 'warning' && severity !== 'exclusion' && severity !== 'ignore')
            continue;
        const items = Array.isArray(violation.items)
            ? violation.items.map((i) => ({ description: i.description ? String(i.description) : undefined }))
            : [];
        out.push({
            severity,
            type: String(violation.type ?? 'uncategorized'),
            description: String(violation.description ?? violation.type ?? ''),
            items,
        });
    }
    return out;
}
/**
 * Map DRC violations to source lines: item descriptions name pads
 * ("pad R1.2"), vias and tracks; a token matching a known reference wins,
 * then a net name from the net provenance. Unmatched violations attach to
 * the board file itself (still visible in Problems, just not source-aimed).
 */
function drcProblems(violations, refs, nets, boardFile) {
    const netByName = new Map();
    for (const n of nets)
        netByName.set(n.name, n);
    const out = [];
    for (const v of violations) {
        if (v.severity !== 'error' && v.severity !== 'warning')
            continue;
        let location;
        let aimed = '';
        const descriptions = [v.description, ...v.items.map((i) => i.description ?? '')].join(' ; ');
        for (const token of descriptions.split(/[^A-Za-z0-9_.]+/)) {
            // item descriptions name pads as "R1.2" — try the token, then its
            // pre-dot prefix (the reference), then a trailing-dot cleanup
            const clean = token.replace(/\.$/, '');
            const candidates = clean.includes('.') ? [clean, clean.split('.')[0]] : [clean];
            for (const candidate of candidates) {
                if (candidate && refs.has(candidate)) {
                    location = refs.get(candidate);
                    aimed = candidate;
                    break;
                }
            }
            if (location)
                break;
        }
        if (!location) {
            for (const n of nets) {
                if (descriptions.includes(n.name)) {
                    location = n.routeSource ?? n.source ?? `${boardFile}:1`;
                    aimed = `net ${n.name}`;
                    break;
                }
            }
        }
        const where = aimed ? ` (${aimed})` : '';
        out.push({
            location: location ?? `${boardFile}:1`,
            message: `${v.description}${where}`,
            severity: v.severity,
            code: v.type,
        });
    }
    return out;
}
//# sourceMappingURL=problems.js.map