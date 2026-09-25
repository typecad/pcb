"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mtimeOf = mtimeOf;
exports.newestBoardFile = newestBoardFile;
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
 * The project's compiled board. build/ can hold stray boards (fp upgrade
 * tests, imports, scratch files) that out-newest the real one — the
 * project's own board matches the hw package name (rd-skeleton-hw →
 * rd_skeleton) and wins over whatever stray was touched last; newest is
 * the fallback when no name matches.
 */
function newestBoardFile(folder) {
    const buildDir = node_path_1.default.join(folder, 'build');
    if (!node_fs_1.default.existsSync(buildDir))
        return null;
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
//# sourceMappingURL=boardFile.js.map