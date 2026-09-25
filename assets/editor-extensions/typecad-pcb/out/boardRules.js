"use strict";
// ---------------------------------------------------------------------------
// Board design rules for the layout view: the trace-width/clearance floors,
// the copper-to-edge keep-out, and net-class width/via defaults.
//
// TWO sources, in priority order:
//  1. the project's own `typecad.rules.json` (hw folder, beside
//     typecad.conf.ts) — hand-authored, optional, wins over everything;
//  2. the board's `.kicad_pro` (design_settings.rules + net_settings) —
//     the same source drc_native reads.
// Vscode-free so the unit tests exercise exactly what the viewer's
// generate() runs.
// ---------------------------------------------------------------------------
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_RULES_FILE = void 0;
exports.userRulesFromFolder = userRulesFromFolder;
exports.rulesFromProject = rulesFromProject;
exports.resolveBoardRules = resolveBoardRules;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
/** The user-authored rules file, when the project carries one. */
exports.USER_RULES_FILE = 'typecad.rules.json';
const num = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
/** Read the project's optional typecad.rules.json (null when absent/invalid). */
function userRulesFromFolder(hwFolder) {
    const file = node_path_1.default.join(hwFolder, exports.USER_RULES_FILE);
    let raw;
    try {
        raw = JSON.parse(node_fs_1.default.readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
    if (!raw || typeof raw !== 'object')
        return null;
    const src = raw;
    const out = {};
    const minTrack = num(src.minTrackWidthMm);
    if (minTrack !== undefined)
        out.minTrackWidthMm = minTrack;
    const minVia = num(src.minViaDiameterMm);
    if (minVia !== undefined)
        out.minViaDiameterMm = minVia;
    const minCl = num(src.minClearanceMm);
    if (minCl !== undefined)
        out.minClearanceMm = minCl;
    const edge = num(src.minCopperEdgeClearanceMm);
    if (edge !== undefined)
        out.minCopperEdgeClearanceMm = edge;
    if (src.netClasses && typeof src.netClasses === 'object') {
        const classes = {};
        for (const [name, def] of Object.entries(src.netClasses)) {
            if (!def || typeof def !== 'object')
                continue;
            const d = def;
            const c = {};
            const w = num(d.width);
            if (w !== undefined)
                c.width = w;
            const vs = num(d.viaSize);
            if (vs !== undefined)
                c.viaSize = vs;
            const vd = num(d.viaDrill);
            if (vd !== undefined)
                c.viaDrill = vd;
            if (Object.keys(c).length > 0)
                classes[name] = c;
        }
        if (Object.keys(classes).length > 0)
            out.netClasses = classes;
    }
    if (Array.isArray(src.netClassPatterns)) {
        const patterns = [];
        for (const p of src.netClassPatterns) {
            const e = p;
            if (typeof e.pattern === 'string' && typeof e.class === 'string' && e.pattern.length > 0) {
                patterns.push({ pattern: e.pattern, class: e.class });
            }
        }
        if (patterns.length > 0)
            out.netClassPatterns = patterns;
    }
    return Object.keys(out).length > 0 ? out : null;
}
/** Extract what the board's .kicad_pro carries (floors + net classes). */
function rulesFromProject(boardPath) {
    const proPath = boardPath.replace(/\.kicad_pcb$/i, '.kicad_pro');
    let pro;
    try {
        pro = JSON.parse(node_fs_1.default.readFileSync(proPath, 'utf8'));
    }
    catch {
        return {};
    }
    const out = {};
    const rules = pro.board?.design_settings?.rules ?? {};
    const minTrack = num(rules.min_track_width);
    if (minTrack !== undefined)
        out.minTrackWidthMm = minTrack;
    const minVia = num(rules.min_via_diameter);
    if (minVia !== undefined)
        out.minViaDiameterMm = minVia;
    const minCl = num(rules.min_clearance);
    if (minCl !== undefined)
        out.minClearanceMm = minCl;
    const edge = num(rules.min_copper_edge_clearance);
    if (edge !== undefined)
        out.minCopperEdgeClearanceMm = edge;
    const classes = {};
    for (const cls of pro.net_settings?.classes ?? []) {
        const name = typeof cls.name === 'string' ? cls.name : '';
        if (!name)
            continue;
        const c = {};
        const w = num(cls.track_width);
        if (w !== undefined)
            c.width = w;
        const vs = num(cls.via_diameter);
        if (vs !== undefined)
            c.viaSize = vs;
        const vd = num(cls.via_drill);
        if (vd !== undefined)
            c.viaDrill = vd;
        if (Object.keys(c).length > 0)
            classes[name] = c;
    }
    if (Object.keys(classes).length > 0)
        out.netClasses = classes;
    const patterns = [];
    for (const p of pro.net_settings?.netclass_patterns ?? []) {
        if (p.netclass && p.pattern)
            patterns.push({ pattern: p.pattern, class: p.netclass });
    }
    if (patterns.length > 0)
        out.netClassPatterns = patterns;
    return out;
}
/**
 * The rules the layout view ships: the project's typecad.rules.json wins
 * field-by-field, the board's .kicad_pro fills the gaps. Null when neither
 * source yields anything usable (no floor AND no net classes).
 */
function resolveBoardRules(hwFolder, boardPath) {
    const user = userRulesFromFolder(hwFolder);
    const pro = rulesFromProject(boardPath);
    const merged = { ...pro, ...user };
    // arrays merge user-first (user patterns take precedence, pro patterns ride along)
    if (user?.netClassPatterns || pro.netClassPatterns) {
        merged.netClassPatterns = [...(user?.netClassPatterns ?? []), ...(pro.netClassPatterns ?? [])];
    }
    if (user?.netClasses || pro.netClasses) {
        merged.netClasses = { ...(pro.netClasses ?? {}), ...(user?.netClasses ?? {}) };
    }
    if (merged.minTrackWidthMm === undefined && !merged.netClasses)
        return null;
    return merged;
}
//# sourceMappingURL=boardRules.js.map