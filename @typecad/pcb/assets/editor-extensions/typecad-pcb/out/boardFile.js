"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mtimeOf = mtimeOf;
exports.newestBoardFile = newestBoardFile;
exports.entrySourceFile = entrySourceFile;
// Board-file discovery, kept free of vscode imports so it stays unit-testable.
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function mtimeOf(file) {
    try {
        return node_fs_1.default.statSync(file).mtimeMs;
    }
    catch {
        return 0;
    }
}
/**
 * The project's compiled board. The build's own manifest
 * (.typecad-board.json, written beside the board) is the truth — a renamed
 * board is found at once and a leftover under the previous name can never
 * shadow it (seen live: the project was renamed and the stale old-named
 * board kept being rendered). Without a manifest, the package-name match
 * prefers the project's own board over strays; newest is the fallback.
 */
function newestBoardFile(folder) {
    const buildDir = node_path_1.default.join(folder, 'build');
    if (!node_fs_1.default.existsSync(buildDir))
        return null;
    try {
        const manifest = JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(buildDir, '.typecad-board.json'), 'utf8'));
        if (typeof manifest.board === 'string' && manifest.board.endsWith('.kicad_pcb')) {
            const manifestBoard = node_path_1.default.join(buildDir, manifest.board);
            if (node_fs_1.default.existsSync(manifestBoard))
                return manifestBoard;
        }
    }
    catch {
        /* no/invalid manifest: the heuristics below */
    }
    const boards = node_fs_1.default.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_pcb'));
    if (boards.length === 0)
        return null;
    const byNewest = boards.map((f) => node_path_1.default.join(buildDir, f)).sort((a, b) => mtimeOf(b) - mtimeOf(a));
    try {
        const pkgName = String(JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(folder, 'package.json'), 'utf8')).name ?? '');
        const stem = pkgName.replace(/-hw$/, '').replace(/[.-]/g, '_').toLowerCase();
        const own = byNewest.find((f) => node_path_1.default.basename(f, '.kicad_pcb').toLowerCase() === stem);
        if (own)
            return own;
    }
    catch {
        // no/read-failed package.json: newest-wins stands
    }
    return byNewest[0] ?? null;
}
/**
 * The source file the build actually runs, from typecad.conf.ts's
 * `entry: './src/<name>.ts'` — resolved against the hw folder, or null when
 * the conf is missing or carries no entry. The apply bridge targets THIS
 * file first: a workspace with stray copies in src/ (a stale duplicate
 * carrying its own typecad.create()) must not capture route rewrites —
 * edits landing there build nothing while the board silently misses every
 * drawn trace.
 */
function entrySourceFile(folder) {
    try {
        const conf = node_fs_1.default.readFileSync(node_path_1.default.join(folder, 'typecad.conf.ts'), 'utf8');
        const m = /entry\s*:\s*['"]([^'"]+)['"]/.exec(conf);
        if (!m || !m[1])
            return null;
        return node_path_1.default.resolve(folder, m[1]);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=boardFile.js.map