"use strict";
// ---------------------------------------------------------------------------
// BoardViewerPanel — the gerber-viewer running in a vscode webview, with
// cross-probing in both directions.
//
// Generation pipeline (same steps the `gerber-viewer serve` mode runs, one
// shot instead of a dev server):
//   typecad-pcb export gerbers → typecad-pcb export drill →
//   gerber-viewer build/gerbers -o build/serve/viewer.html
//       [--netlist build/<board>.net] [--drc build/<board>_drc.json]
// The generated HTML is then post-processed: CSP for the webview, embedded
// component outlines, and the probe client script.
//
// Reverse probing rides on the board model's "Code" property: the viewer
// reports a clicked reference, the cached query detail carries its source
// file:line, the editor reveals it.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoardViewerPanel = void 0;
exports.wordUnderCursor = wordUnderCursor;
const vscode = __importStar(require("vscode"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const probeClient_js_1 = require("./probeClient.js");
const sourceRef_js_1 = require("./sourceRef.js");
const GENERATE_TIMEOUT_MS = 120_000;
/** A selection is re-posted until the viewer page acks it (or this times out). */
const DELIVERY_TIMEOUT_MS = 5_000;
const DELIVERY_INTERVAL_MS = 200;
/** mtime in ms, or 0 when the file vanished — enough for freshness checks. */
function mtimeOf(file) {
    try {
        return node_fs_1.default.statSync(file).mtimeMs;
    }
    catch {
        return 0;
    }
}
/** Double-quote a path for an `exec` shell line; embedded quotes are escaped. */
function shellQuote(value) {
    return `"${value.replace(/"/g, '\\"')}"`;
}
class BoardViewerPanel {
    constructor(hwFolder, service, run, output) {
        this.hwFolder = hwFolder;
        this.service = service;
        this.run = run;
        this.output = output;
        this.generated = null;
        this.pendingRef = null;
        /** Bumped on every html assignment; acks carry it so stale acks are ignored. */
        this.loadToken = 0;
        this.readySeen = false;
        this.generating = null;
    }
    /** Open/reveal the viewer, regenerating the HTML when the board changed. */
    async show() {
        const folder = this.hwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        if (!this.generated || this.generated.boardMtimeMs !== this.boardMtime(folder)) {
            try {
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'typeCAD: rendering board viewer' }, () => this.generate(folder));
            }
            catch (err) {
                this.output.appendLine(`viewer generation failed: ${err instanceof Error ? err.message : String(err)}`);
                vscode.window.showErrorMessage(`typeCAD: could not render the board viewer — see the 'typeCAD PCB' output channel.`);
                return;
            }
        }
        if (!this.panel) {
            const webviewPanels = vscode.window.createWebviewPanel('typecadBoardViewer', 'Board', {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true,
            });
            webviewPanels.webview.options = { enableScripts: true };
            webviewPanels.webview.onDidReceiveMessage((m) => this.onMessage(m));
            webviewPanels.onDidDispose(() => {
                this.panel = undefined;
                this.pendingRef = null;
            });
            this.panel = webviewPanels;
            this.loadToken++;
            this.assignHtml();
        }
        else if (this.panel.webview.html !== this.generated.html) {
            // Only reassign when the board actually regenerated — html assignment
            // reloads the page.
            this.loadToken++;
            this.assignHtml();
        }
        this.panel.reveal(undefined, true);
    }
    /** Assign the generated page and watch for the client announcing itself. */
    assignHtml() {
        this.readySeen = false;
        this.panel.webview.html = this.generated.html;
        setTimeout(() => {
            if (!this.readySeen && this.panel) {
                this.output.appendLine('viewer page: no ready signal — the page scripts are blocked or failed to boot (check for CSP/content errors)');
            }
        }, 4_000);
    }
    /** Reveal the viewer centered on a component reference. */
    async select(ref) {
        const folder = this.hwFolder();
        if (!folder) {
            // A dead hover command-link must say so, not return silently.
            vscode.window.showInformationMessage('typeCAD: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        this.output.appendLine(`select ${ref}: opening/revealing viewer`);
        this.pendingRef = ref;
        this.pendingToken = this.loadToken;
        await this.show();
        this.deliverSelection();
    }
    /**
     * Post the pending selection until the viewer page acks it. The first post
     * after an html assignment races the page load — VS Code drops messages
     * until the page is live — so delivery repeats and self-terminates on ack
     * (or when a newer selection supersedes this one).
     */
    deliverSelection() {
        const ref = this.pendingRef;
        const token = this.pendingToken;
        if (!ref)
            return;
        const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
        let loggedDrop = false;
        const attempt = () => {
            if (this.pendingRef !== ref || this.pendingToken !== token)
                return; // delivered or superseded
            if (!this.panel)
                return; // closed
            void this.panel.webview
                .postMessage({ type: 'typecad/select', ref, token })
                .then((delivered) => {
                // false = the page hasn't loaded yet; the retry covers it, and the
                // log makes a persistently-unloaded page visible in the output channel
                if (!delivered && !loggedDrop) {
                    loggedDrop = true;
                    this.output.appendLine(`select ${ref}: page not loaded yet, retrying…`);
                }
            });
            if (Date.now() < deadline) {
                setTimeout(attempt, DELIVERY_INTERVAL_MS);
            }
            else {
                this.output.appendLine(`select ${ref}: no ack — the viewer page may be missing the probe client`);
            }
        };
        attempt();
    }
    /** Drop the cached HTML; the next show regenerates from the current board. */
    invalidate() {
        this.generated = null;
    }
    /**
     * Regenerate and reload an open panel after a board change (npm run build
     * rewrote build/*.kicad_pcb). No-op when the panel is closed — the next
     * show() regenerates anyway. The reload lands on the fit view; the ready
     * handler re-applies the last selection so a watch-loop build keeps the
     * component you were looking at.
     */
    async refreshIfVisible() {
        if (!this.panel)
            return;
        if (this.refreshTimer)
            clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            void this.doRefresh();
        }, 500);
    }
    async doRefresh() {
        if (!this.panel)
            return;
        const folder = this.hwFolder();
        if (!folder)
            return;
        try {
            await this.generate(folder);
        }
        catch (err) {
            this.output.appendLine(`viewer refresh failed: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        if (this.panel && this.generated && this.panel.webview.html !== this.generated.html) {
            this.output.appendLine('board changed — refreshing viewer');
            this.loadToken++;
            this.assignHtml();
        }
    }
    boardMtime(folder) {
        const board = this.findBoard(folder);
        if (!board)
            return 0;
        return mtimeOf(board);
    }
    findBoard(folder) {
        const buildDir = node_path_1.default.join(folder, 'build');
        if (!node_fs_1.default.existsSync(buildDir))
            return null;
        const boards = node_fs_1.default.readdirSync(buildDir).filter((f) => f.endsWith('.kicad_pcb'));
        if (boards.length === 0)
            return null;
        // The project's board is whichever build touched last: stray boards (fp
        // upgrade tests, imports) can share build/, and picking by name is
        // unreliable — the newest .kicad_pcb is always the one just written.
        // statSync is guarded: a board rewritten/deleted between readdir and
        // stat (a build cleaning build/) must not crash the command.
        return boards.map((f) => node_path_1.default.join(buildDir, f)).sort((a, b) => mtimeOf(b) - mtimeOf(a))[0] ?? null;
    }
    async generate(folder) {
        if (this.generating)
            return this.generating;
        this.generating = (async () => {
            const board = this.findBoard(folder);
            if (!board)
                throw new Error('no .kicad_pcb in build/ — run npm run build first');
            this.output.appendLine('exporting gerbers…');
            // explicit board path: build/ can hold stray .kicad_pcb files (fp
            // upgrade tests, imports) and the CLI refuses an ambiguous export
            await this.run(folder, `npx typecad-pcb export gerbers "${board}"`, GENERATE_TIMEOUT_MS);
            await this.run(folder, `npx typecad-pcb export drill "${board}"`, GENERATE_TIMEOUT_MS);
            const boardName = node_path_1.default.basename(board, '.kicad_pcb');
            const gerbersDir = node_path_1.default.join('build', 'gerbers');
            const outPath = node_path_1.default.join('build', 'serve', 'viewer.html');
            // netlist/DRC mirror what `gerber-viewer serve` passes: the netlist
            // fills pad→net so clicking a pad highlights its whole net; DRC markers
            // only exist after a `typecad-pcb drc` run. boardName derives from the
            // board file name, so it is quoted like every other interpolated path.
            const flags = [`--netlist`, shellQuote(node_path_1.default.join('build', `${boardName}.net`))];
            const drcReport = node_path_1.default.join(folder, 'build', `${boardName}_drc.json`);
            if (node_fs_1.default.existsSync(drcReport))
                flags.push('--drc', shellQuote(node_path_1.default.join('build', `${boardName}_drc.json`)));
            this.output.appendLine('building viewer HTML…');
            await this.run(folder, `npx gerber-viewer ${shellQuote(gerbersDir)} -o ${shellQuote(outPath)} ${flags.join(' ')}`, GENERATE_TIMEOUT_MS);
            const raw = node_fs_1.default.readFileSync(node_path_1.default.join(folder, outPath), 'utf8');
            const components = await this.service.components();
            const { html, injected } = (0, probeClient_js_1.injectProbeClient)(raw, components);
            if (!injected) {
                this.output.appendLine('warning: viewer HTML had no <head>/</body> anchors — cross-probe disabled');
            }
            this.generated = { html, boardMtimeMs: mtimeOf(board) };
            this.output.appendLine(`viewer ready: ${components.length} component outline(s) embedded, cross-probe ${injected ? 'on' : 'off'}`);
        })().finally(() => {
            this.generating = null;
        });
        return this.generating;
    }
    async onMessage(message) {
        if (message.type === 'typecad/ready') {
            this.readySeen = true;
            this.output.appendLine('viewer page ready');
            // The page re-applies its own saved highlight after a reload (the
            // saved viewport puts the view back too) — only an explicit pending
            // selection needs delivering.
            if (this.pendingRef && this.panel) {
                await this.panel.webview.postMessage({
                    type: 'typecad/select',
                    ref: this.pendingRef,
                    token: this.pendingToken ?? this.loadToken,
                });
            }
            return;
        }
        if (message.type === 'typecad/ack') {
            this.output.appendLine(`select ${message.ref}: ack (found=${String(message.found)}, token=${String(message.token)})`);
            if (this.pendingRef === message.ref && (message.token === undefined || message.token === this.pendingToken)) {
                this.pendingRef = null;
                if (message.found === false) {
                    vscode.window.setStatusBarMessage(`${message.ref}: no pads for it on the rendered board — is the build current?`, 5000);
                }
            }
            return;
        }
        // after the checks above, the message can only be a probe
        if (message.ref) {
            this.output.appendLine(`probe: ${message.ref}${message.pin ? ' ' + message.pin : ''} → source`);
            await this.revealInEditor(message.ref);
        }
    }
    /** The board→editor direction: open the declaring file at its line. */
    async revealInEditor(ref) {
        const folder = this.hwFolder();
        if (!folder)
            return;
        try {
            const detail = await this.service.resolve(ref);
            if (!detail)
                return;
            const loc = (0, sourceRef_js_1.parseSourceLocation)(folder, detail.source);
            if (!loc) {
                vscode.window.setStatusBarMessage(`${ref}: no source location on the compiled board`, 4000);
                return;
            }
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(loc.fsPath));
            const line = Math.max(0, loc.line - 1);
            const range = new vscode.Range(line, 0, line, 0);
            await vscode.window.showTextDocument(document, { selection: range, preserveFocus: false });
        }
        catch (err) {
            this.output.appendLine(`reveal ${ref} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.BoardViewerPanel = BoardViewerPanel;
/** The hovered/selected identifier in the active editor, or null. */
function wordUnderCursor(editor) {
    if (!editor)
        return null;
    const range = editor.selection.isEmpty
        ? editor.document.getWordRangeAtPosition(editor.selection.active)
        : editor.selection;
    if (!range)
        return null;
    const word = editor.document.getText(range).trim();
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(word) ? word : null;
}
//# sourceMappingURL=viewer.js.map