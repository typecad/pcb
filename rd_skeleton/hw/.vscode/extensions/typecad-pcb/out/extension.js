"use strict";
// ---------------------------------------------------------------------------
// vscode-typecad-pcb — VS Code extension
//
// Hover a component variable in a typeCAD project's TypeScript source to see
// its pads, nets, and unconnected pins from the compiled board.
//
// The extension is a thin shell over `typecad-pcb query` (the CLI owns all
// board analysis): one cached `query components --json` for the index, one
// cached `query component <ref> --json` per hovered component. The cache
// drops whenever build/*.kicad_pcb changes on disk.
//
// Unlike the HAL debug extension, the hw folder is never assumed to be
// workspaceFolders[0] — typeCAD projects are multi-root (hw/ + fw/), so the
// folder carrying typecad.conf.ts is resolved instead.
// ---------------------------------------------------------------------------
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const boardData_js_1 = require("./boardData.js");
const hwFolder_js_1 = require("./hwFolder.js");
const hover_js_1 = require("./hover.js");
const missing_js_1 = require("./missing.js");
const query_js_1 = require("./query.js");
const viewer_js_1 = require("./viewer.js");
/** Identifiers only — skips numbers, operators, and property dots. */
const WORD_LIKE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function activate(context) {
    const output = vscode.window.createOutputChannel('typeCAD PCB');
    const service = new boardData_js_1.BoardDataService(runQuery);
    // typeCAD projects are plain folders (no virtual filesystems), so a sync
    // node check is enough to locate typecad.conf.ts.
    const resolveHwFolder = () => (0, hwFolder_js_1.findHwFolder)((vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath), node_fs_1.existsSync);
    const viewer = new viewer_js_1.BoardViewerPanel(resolveHwFolder, service, runQuery, output);
    let watcher;
    const watchBuild = (folder) => {
        watcher?.dispose();
        watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, 'build/**/*.kicad_pcb'));
        const boardChanged = () => {
            service.invalidate();
            viewer.invalidate();
            void viewer.refreshIfVisible();
        };
        watcher.onDidChange(boardChanged);
        watcher.onDidCreate(boardChanged);
        watcher.onDidDelete(boardChanged);
        context.subscriptions.push(watcher);
    };
    const initial = resolveHwFolder();
    if (initial) {
        // Bind the service up front: without this, `View Board` as the very
        // first action of a session fails with "no project folder" until some
        // hover or workspace change happens to call setFolder.
        service.setFolder(initial);
        watchBuild(initial);
    }
    // Re-resolve when the workspace shape changes (opening the generated
    // .code-workspace, adding fw/, etc.).
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        const folder = resolveHwFolder();
        if (folder) {
            service.setFolder(folder);
            watchBuild(folder);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('typecad-pcb.viewBoard', () => viewer.show()), vscode.commands.registerCommand('typecad-pcb.viewComponent', async (ref) => {
        // Command-link args arrive spread as JSON; anything unexpected falls
        // back to the word under the cursor. Every branch is logged so a dead
        // link is distinguishable from a dead delivery.
        output.appendLine(`viewComponent: arg=${JSON.stringify(ref) ?? 'undefined'} (${typeof ref})`);
        const target = typeof ref === 'string' && ref.trim() !== '' ? ref.trim() : (0, viewer_js_1.wordUnderCursor)(vscode.window.activeTextEditor);
        if (!target) {
            output.appendLine('viewComponent: no ref argument and no word under cursor');
            vscode.window.showInformationMessage('typeCAD: place the cursor on a component (or select a reference).');
            return;
        }
        await viewer.select(target);
    }));
    context.subscriptions.push(vscode.languages.registerHoverProvider({ language: 'typescript', scheme: 'file' }, {
        async provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            if (!range)
                return;
            const word = document.getText(range);
            if (!WORD_LIKE.test(word))
                return;
            const folder = resolveHwFolder();
            if (!folder)
                return;
            service.setFolder(folder);
            if (!watcher)
                watchBuild(folder);
            try {
                const detail = await service.resolve(word);
                if (!detail) {
                    // Declared as `new <Component>(...)` in this file but absent
                    // from the compiled board — say so instead of staying silent.
                    const declaration = (0, missing_js_1.findDeclaration)(document.getText(), word);
                    if (declaration) {
                        const hint = new vscode.MarkdownString((0, missing_js_1.renderMissingHint)(declaration), true);
                        hint.supportThemeIcons = true;
                        return new vscode.Hover(hint, range);
                    }
                    return;
                }
                const markdown = new vscode.MarkdownString((0, hover_js_1.renderComponentHover)(detail), true);
                markdown.supportThemeIcons = true;
                markdown.isTrusted = true;
                return new vscode.Hover(markdown, range);
            }
            catch (err) {
                // boardMissing is the CLI's classified "no compiled board yet"
                // flag — anything else is a real failure worth logging.
                if (err instanceof query_js_1.QueryError && err.boardMissing) {
                    const hint = new vscode.MarkdownString('$(circuit-board) typeCAD: no compiled board yet — run `npm run build` in the hw folder.');
                    hint.supportThemeIcons = true;
                    return new vscode.Hover(hint, range);
                }
                output.appendLine(`query failed for '${word}': ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
        },
    }));
    context.subscriptions.push(vscode.commands.registerCommand('typecad-pcb.refreshBoardData', () => {
        service.invalidate();
        vscode.window.setStatusBarMessage('typeCAD: board data refreshed', 3000);
    }));
    // Re-point the service when the editor moves between hw/ and fw/ so a
    // stale folder never survives a workspace switch.
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        const folder = resolveHwFolder();
        if (folder)
            service.setFolder(folder);
    }));
    output.appendLine('typeCAD PCB extension activated');
}
/** Real query runner: `exec` with cwd pinned to the hw folder. */
function runQuery(cwd, command, timeoutMs) {
    return new Promise((resolve, reject) => {
        (0, node_child_process_1.exec)(command, {
            cwd,
            timeout: timeoutMs,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
        }, (error, stdout, stderr) => {
            if (error) {
                const detail = [stderr.toString().trim(), stdout.toString().trim()].filter(Boolean).join('\n');
                reject(new Error(detail || error.message));
                return;
            }
            resolve(stdout.toString());
        });
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map