"use strict";
// ---------------------------------------------------------------------------
// Pure gate for the "Build Board" CodeLens: which files are board sources?
// vscode-free so the rule stays unit-testable.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBoardSourceFile = isBoardSourceFile;
/**
 * True for TypeScript files inside the project's hw folder — the folder that
 * carries typecad.conf.ts and the `npm run build` that compiles the board.
 * Firmware sources (fw/) and files outside the project get no lens.
 */
function isBoardSourceFile(fsPath, hwFolder) {
    if (!hwFolder)
        return false;
    const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const file = norm(fsPath);
    const folder = norm(hwFolder);
    return file.startsWith(folder + '/') && file.endsWith('.ts');
}
//# sourceMappingURL=boardSource.js.map