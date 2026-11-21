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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const sourceBackup_js_1 = require("./sourceBackup.js");
const bundledUpdate_js_1 = require("./bundledUpdate.js");
const boardData_js_1 = require("./boardData.js");
const boardSource_js_1 = require("./boardSource.js");
const boardStatus_js_1 = require("./boardStatus.js");
const browse_js_1 = require("./browse.js");
const hwFolder_js_1 = require("./hwFolder.js");
const hover_js_1 = require("./hover.js");
const missing_js_1 = require("./missing.js");
const problems_js_1 = require("./problems.js");
const probeClient_js_1 = require("./probeClient.js");
const query_js_1 = require("./query.js");
const sourceRef_js_1 = require("./sourceRef.js");
const viewer_js_1 = require("./viewer.js");
const boardFile_js_1 = require("./boardFile.js");
const syncState_js_1 = require("./syncState.js");
const viewerApply_js_1 = require("./viewerApply.js");
/** Identifiers only — skips numbers, operators, and property dots. */
const WORD_LIKE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * One terminal per purpose, reused across invocations — recreated when it
 * was closed or the project moved, because cwd is only settable at creation.
 */
class PerFolderTerminal {
    constructor(name, command) {
        this.name = name;
        this.command = command;
    }
    runIn(folder) {
        if (!this.terminal || this.terminal.exitStatus !== undefined || this.folder !== folder) {
            this.terminal = vscode.window.createTerminal({ name: this.name, cwd: folder });
            this.folder = folder;
        }
        this.terminal.show(true);
        this.terminal.sendText(this.command, true);
    }
}
function activate(context) {
    const output = vscode.window.createOutputChannel('typeCAD/pcb');
    const service = new boardData_js_1.BoardDataService(runQuery);
    // typeCAD projects are plain folders (no virtual filesystems), so a sync
    // node check is enough to locate typecad.conf.ts.
    const resolveHwFolder = () => (0, hwFolder_js_1.findHwFolder)((vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath), (p) => node_fs_1.default.existsSync(p));
    const viewer = new viewer_js_1.BoardViewerPanel(resolveHwFolder, service, runQuery, output);
    // ---- source→board→viewer sync: the user should never wonder whether a
    // build is owed or the Board view is current. Source edits auto-build
    // (debounced; an in-flight apply owns its own build), the board watcher
    // already regenerates the viewer, and the status bar says which state
    // the pipeline is in ----
    const syncBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    syncBar.name = 'typeCAD sync';
    syncBar.command = 'typecad-pcb.viewBoard';
    syncBar.tooltip = 'typeCAD/pcb source ↔ board sync — click to open the Board view';
    context.subscriptions.push(syncBar);
    const syncLabel = () => {
        const folder = resolveHwFolder();
        if (!folder) {
            syncBar.hide();
            return;
        }
        syncBar.show();
        if (syncState_js_1.sync.building || syncState_js_1.sync.absorbing) {
            syncBar.text = syncState_js_1.sync.absorbing ? '$(circuit-board) typeCAD: importing board edits…' : '$(circuit-board) typeCAD: building…';
            return;
        }
        if (syncState_js_1.sync.paused) {
            syncBar.text = '$(warning) typeCAD: sync paused';
            syncBar.tooltip = `typeCAD/pcb automatic board↔source sync is paused — ${syncState_js_1.sync.paused}. Click for the details in the typeCAD/pcb output.`;
            syncBar.command = 'typecad-pcb.showSyncLog';
            return;
        }
        syncBar.command = 'typecad-pcb.viewBoard';
        if (syncState_js_1.sync.lastError) {
            syncBar.text = '$(error) typeCAD: build failed';
            syncBar.tooltip = `typeCAD/pcb build failed — ${syncState_js_1.sync.lastError} (see the typeCAD/pcb output)`;
            return;
        }
        // status display only — the memoized scan (invalidated by the source
        // watcher and the save hook), not a directory walk per call
        const stale = (0, boardFile_js_1.boardStale)(folder, { cached: true });
        syncBar.text = stale ? '$(circuit-board) typeCAD: syncing…' : '$(check) typeCAD';
        syncBar.tooltip = 'typeCAD/pcb source ↔ board sync — click to open the Board view';
    };
    // the pipeline (viewer.ts) flips the paused state; the label follows
    (0, syncState_js_1.onSyncChange)(syncLabel);
    context.subscriptions.push(new vscode.Disposable(() => (0, syncState_js_1.onSyncChange)(null)));
    let autoBuildTimer;
    const scheduleAutoBuild = (delayMs = 2_000) => {
        if (autoBuildTimer)
            clearTimeout(autoBuildTimer);
        autoBuildTimer = setTimeout(() => {
            autoBuildTimer = undefined;
            const folder = resolveHwFolder();
            if (!folder)
                return;
            // the apply pipeline builds itself; its own source writes land here
            // too and must not double-build. But a save made WHILE a build/apply
            // runs must not be dropped either: re-check once the pipeline frees
            // up. buildOwed() then decides — the apply's own writes predate its
            // build start (no extra build); a mid-build save postdates it (build).
            if ((0, syncState_js_1.pipelineBusy)()) {
                syncLabel();
                scheduleAutoBuild(3_000);
                return;
            }
            // uncached, and against the OLDEST board: this decides whether to
            // build, so it must see the disk as it is now and every board of a
            // multi-board project
            const owed = (0, syncState_js_1.buildOwed)((0, boardFile_js_1.newestSourceMtime)(folder), (0, boardFile_js_1.oldestBoardMtime)(folder), syncState_js_1.sync.lastBuildStartedAt);
            if (!owed) {
                syncLabel();
                return;
            }
            syncState_js_1.sync.building = true;
            syncState_js_1.sync.lastBuildStartedAt = Date.now();
            syncLabel();
            runQuery(folder, viewerApply_js_1.BUILD_COMMAND, 180_000)
                .then(() => {
                syncState_js_1.sync.building = false;
                syncState_js_1.sync.lastError = null;
                // the board watcher refreshes the viewer; the label follows the
                // board catching up on its next event — nudge it once here too
                setTimeout(syncLabel, 3_000);
                // a save that landed mid-build is newer than the build's start:
                // build again (debounced) instead of leaving the board behind
                if ((0, boardFile_js_1.newestSourceMtime)(folder) > syncState_js_1.sync.lastBuildStartedAt)
                    scheduleAutoBuild();
            })
                .catch((err) => {
                syncState_js_1.sync.building = false;
                syncState_js_1.sync.lastError = err instanceof Error ? err.message : String(err);
                output.appendLine(`auto-build failed: ${syncState_js_1.sync.lastError}`);
                syncLabel();
            });
        }, delayMs);
    };
    // TWO independent watchers, two directions of the sync loop — they must
    // never share a variable: installBoard used to dispose the source watcher
    // through a shared handle, leaving source edits with no auto-build from
    // activation on (seen live as an absorbed-reconcile whose "rebuilding…"
    // status never cleared — the source rewrite triggered nothing).
    let sourceWatcher;
    let boardWatcher;
    context.subscriptions.push(new vscode.Disposable(() => {
        sourceWatcher?.dispose();
        boardWatcher?.dispose();
    }));
    const rewatchSources = () => {
        sourceWatcher?.dispose();
        sourceWatcher = undefined;
        const folder = resolveHwFolder();
        if (!folder) {
            syncBar.hide();
            return;
        }
        const pattern = new vscode.RelativePattern(folder, '{src/**/*.ts,typecad.conf.ts}');
        sourceWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        const sourceEvent = () => {
            (0, boardFile_js_1.invalidateSourceMtime)();
            scheduleAutoBuild();
        };
        sourceWatcher.onDidChange(sourceEvent);
        sourceWatcher.onDidCreate(sourceEvent);
        sourceWatcher.onDidDelete(sourceEvent);
        syncLabel();
        // opening the workspace with sources newer than the board (the failed
        // apply + manual edit case): build once now, not on the next save
        if ((0, boardFile_js_1.boardStale)(folder))
            scheduleAutoBuild(1_000);
    };
    context.subscriptions.push(new vscode.Disposable(rewatchSources));
    rewatchSources();
    vscode.workspace.onDidChangeWorkspaceFolders(() => rewatchSources(), undefined, context.subscriptions);
    // NOTE: no per-keystroke handler. Staleness is a disk question (source
    // mtime vs board mtime) and typing does not change the disk; the label used
    // to re-scan every source file on EVERY keystroke to learn nothing. It now
    // updates from the source watcher / save hook below and from the pipeline.
    vscode.workspace.onDidSaveTextDocument(() => {
        const folder = resolveHwFolder();
        if (!folder)
            return;
        (0, boardFile_js_1.invalidateSourceMtime)();
        syncLabel();
    }, undefined, context.subscriptions);
    // Reload/window-reopen restores a previously open Board panel instead of
    // leaving a dead empty webview behind; must be registered at activation
    // for VS Code to restore the panel at all.
    context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('typecadBoardViewer', {
        deserializeWebviewPanel: (panel) => viewer.restorePanel(panel),
    }));
    // DRC runs ONLY on request — the palette command (typeCAD: DRC, or the
    // status chip's Run DRC link) is the single trigger. The old opt-in
    // drcOnBuild watcher and the apply's automatic re-run are gone: a check
    // nobody asked for is seconds of build time on every board change.
    const watchBuild = (folder) => {
        boardWatcher?.dispose();
        boardWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, 'build/**/*.kicad_pcb'));
        const boardChanged = (uri) => {
            output.appendLine(`board file event: ${node_path_1.default.basename(uri.fsPath)}`);
            service.invalidate();
            viewer.invalidate();
            drcCounts = null; // the DRC report describes the previous board revision
            refreshAmbient();
            void viewer.refreshIfVisible();
        };
        boardWatcher.onDidChange(boardChanged);
        boardWatcher.onDidCreate(boardChanged);
        boardWatcher.onDidDelete(boardChanged);
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
    // -- "▶ Build Board" lens on hw TypeScript sources (HAL's Flash & Monitor
    //    pattern): runs npm run build in a reused terminal; the board watcher
    //    picks the new board up and refreshes an open viewer on its own --
    // the live KiCad -> source sync terminal (Start KiCAD Sync command)
    const buildTerminal = new PerFolderTerminal('typeCAD/pcb', 'npm run build');
    const syncTerminal = new PerFolderTerminal('typeCAD/pcb: KiCad sync', 'npm run kicad_sync');
    context.subscriptions.push(vscode.commands.registerCommand('typecad-pcb.buildBoard', () => {
        const folder = resolveHwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        buildTerminal.runIn(folder);
    }), vscode.languages.registerCodeLensProvider({ language: 'typescript', scheme: 'file' }, {
        provideCodeLenses(document) {
            if (!(0, boardSource_js_1.isBoardSourceFile)(document.uri.fsPath, resolveHwFolder()))
                return [];
            return [
                new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                    title: '▶ Build Board',
                    command: 'typecad-pcb.buildBoard',
                    arguments: [document.uri],
                }),
            ];
        },
    }));
    context.subscriptions.push(vscode.commands.registerCommand('typecad-pcb.viewBoard', () => viewer.show()), vscode.commands.registerCommand('typecad-pcb.showSyncLog', () => output.show()), 
    // multi-board projects (mother/daughter, board/jig): pick which of the
    // manifest's boards the viewer shows — pages, gerbers dirs, and session
    // state are per board
    vscode.commands.registerCommand('typecad-pcb.switchBoard', async () => {
        const choices = viewer.boardChoices();
        if (choices.length === 0) {
            vscode.window.showInformationMessage('typeCAD/pcb: no boards in build/ — run npm run build first.');
            return;
        }
        const active = viewer.boardStem;
        const picked = await vscode.window.showQuickPick([
            { label: '$(layers) Active board (last built)', stem: undefined },
            ...choices.map((c) => ({
                label: `$(circuit-board) ${c.stem}${c.stem === active ? '  (shown)' : ''}`,
                stem: c.stem,
                detail: c.file,
            })),
        ], { placeHolder: 'Which board should the viewer show?', matchOnDetail: true });
        if (!picked)
            return;
        await viewer.switchBoard(picked.stem);
    }), vscode.commands.registerCommand('typecad-pcb.viewComponent', async (ref) => {
        // Command-link args arrive spread as JSON (the hover's "view on
        // board" link): go straight to that component, no prompt.
        if (typeof ref === 'string' && ref.trim() !== '') {
            output.appendLine(`viewComponent: arg=${JSON.stringify(ref)}`);
            await viewer.select(ref.trim());
            return;
        }
        // Palette invocation: one picker for browsing AND typing — items are
        // the compiled board's components, the filter seeds from the cursor
        // word, and a typed designator matching no item is still attempted
        // (the viewer reports it when the board doesn't carry it). This
        // subsumes the old Browse Components entry.
        let components;
        try {
            components = await service.components();
        }
        catch {
            noBoardYet();
            return;
        }
        const picker = vscode.window.createQuickPick();
        picker.placeholder = 'components on the compiled board — Enter zooms the Board viewer (a typed designator works too)';
        picker.matchOnDescription = true;
        picker.matchOnDetail = true;
        picker.items = (0, browse_js_1.browseItems)(components).map((item) => ({
            label: item.label,
            description: item.description,
            detail: item.detail,
            ref: item.ref,
        }));
        picker.value = (0, viewer_js_1.wordUnderCursor)(vscode.window.activeTextEditor) ?? '';
        picker.onDidAccept(() => {
            const picked = picker.selectedItems[0];
            const typed = picker.value.trim();
            picker.hide();
            const target = picked?.ref ?? (typed === '' ? undefined : typed);
            if (target) {
                output.appendLine(`viewComponent: picked=${JSON.stringify(target)}`);
                void viewer.select(target);
            }
        });
        picker.onDidHide(() => picker.dispose());
        picker.show();
    }), vscode.commands.registerCommand('typecad-pcb.viewNet', async (net) => {
        // Command-link args arrive spread as JSON (the net hover's "show on
        // board" link): go straight to that net. Palette: prompt for a name.
        if (typeof net === 'string' && net.trim() !== '') {
            output.appendLine(`viewNet: arg=${JSON.stringify(net)}`);
            await viewer.selectNet(net.trim());
            return;
        }
        // Palette invocation: prompt for the net name, seeded with the quoted
        // string under the cursor when the editor has one
        const active = vscode.window.activeTextEditor;
        const seed = active
            ? (0, hover_js_1.quotedTextAt)(active.document.lineAt(active.selection.active.line).text, active.selection.active.character)
            : null;
        const typed = await vscode.window.showInputBox({
            prompt: 'net name to highlight on the board',
            placeHolder: 'e.g. VCC, GND',
            value: seed ?? '',
        });
        if (!typed || typed.trim() === '')
            return; // dismissed — nothing to do
        output.appendLine(`viewNet: typed=${JSON.stringify(typed)}`);
        await viewer.selectNet(typed.trim());
    }));
    // -- ambient board state: status bar, Problems, declaration-line warnings --
    // Priority 101 parks the pcb chip just left of typeCAD/hal's (99) — stable
    // ordering, board state before firmware state.
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    statusItem.command = 'typecad-pcb.statusClick';
    context.subscriptions.push(statusItem);
    // The chip's click is state-aware: no board → build; stale → ask; fresh →
    // view. An internal command (not palette-contributed) keeps the chip's
    // command static while the behavior follows the board's state.
    context.subscriptions.push(vscode.commands.registerCommand('typecad-pcb.statusClick', () => {
        const folder = resolveHwFolder();
        const board = folder ? (0, viewer_js_1.newestBoardFile)(folder) : null;
        if (!folder || !board) {
            void vscode.commands.executeCommand('typecad-pcb.buildBoard');
            return;
        }
        if (boardIsStale(folder, (0, viewer_js_1.mtimeOf)(board))) {
            void vscode.window
                .showInformationMessage('typeCAD/pcb: the built board is older than your sources.', 'Build Board', 'View Board')
                .then((pick) => {
                if (pick === 'Build Board')
                    void vscode.commands.executeCommand('typecad-pcb.buildBoard');
                else if (pick === 'View Board')
                    void viewer.show();
            });
            return;
        }
        void viewer.show();
    }));
    const problems = vscode.languages.createDiagnosticCollection('typecad-pcb');
    context.subscriptions.push(problems);
    const warnChip = vscode.window.createTextEditorDecorationType({
        after: {
            color: new vscode.ThemeColor('editorWarning.foreground'),
            fontStyle: 'italic',
            margin: '0 0 0 1.5em',
        },
    });
    context.subscriptions.push(warnChip);
    /** DRC counts from this session's last run, null before the first run. */
    let drcCounts = null;
    /** Per-diagnostic probe target (ref and/or net) — powers code actions. */
    const diagnosticInfo = new WeakMap();
    /** ProblemEntry[] -> vscode diagnostics grouped by file. */
    function setProblemDiagnostics(entries, folder) {
        const byFile = new Map();
        for (const entry of entries) {
            const loc = (0, sourceRef_js_1.parseSourceLocation)(folder, entry.location);
            if (!loc)
                continue;
            const line = Math.max(0, loc.line - 1);
            const diagnostic = new vscode.Diagnostic(new vscode.Range(line, 0, line, 0), entry.message, entry.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
            diagnostic.source = 'typeCAD/pcb';
            diagnostic.code = entry.code;
            if (entry.ref || entry.net)
                diagnosticInfo.set(diagnostic, { ref: entry.ref, net: entry.net });
            const list = byFile.get(loc.fsPath) ?? [];
            list.push(diagnostic);
            byFile.set(loc.fsPath, list);
        }
        problems.clear();
        for (const [file, list] of byFile) {
            problems.set(vscode.Uri.file(file), list);
        }
    }
    /** "R1 · 2 unconnected pads" warning chips on the declaring lines. */
    function refreshWarnChips(pads, refs, folder) {
        const counts = new Map();
        for (const pad of pads)
            counts.set(pad.reference, (counts.get(pad.reference) ?? 0) + 1);
        for (const editor of vscode.window.visibleTextEditors) {
            const options = [];
            for (const [ref, count] of counts) {
                const loc = (0, sourceRef_js_1.parseSourceLocation)(folder, refs.get(ref) ?? '');
                // case-insensitive: on Windows the same file can be open under a
                // differently-cased path, and a strict compare would drop its chips
                if (!loc || loc.fsPath.toLowerCase() !== editor.document.uri.fsPath.toLowerCase())
                    continue;
                const line = Math.min(Math.max(0, loc.line - 1), editor.document.lineCount - 1);
                const range = editor.document.lineAt(line).range;
                options.push({
                    range,
                    renderOptions: { after: { contentText: ` ${ref} · ${count} unconnected pad${count === 1 ? '' : 's'}` } },
                });
            }
            editor.setDecorations(warnChip, options);
        }
    }
    /** True when a build input (any TypeScript under src/, or the conf) is
     *  newer than the built board — the same rule the auto-build gate uses, so
     *  the chip can never disagree with the builder about a build being owed. */
    function boardIsStale(folder, boardMtime) {
        if (!boardMtime)
            return false;
        return (0, boardFile_js_1.newestSourceMtime)(folder) > boardMtime;
    }
    /** Drop every board-derived surface — the board (or project) is gone. */
    function clearBoardSurfaces() {
        problems.clear();
        for (const editor of vscode.window.visibleTextEditors)
            editor.setDecorations(warnChip, []);
    }
    /** "No compiled board yet" with a one-click build — every entry point shares it. */
    const noBoardYet = () => {
        void vscode.window
            .showInformationMessage('typeCAD/pcb: no compiled board yet.', 'Build Board')
            .then((pick) => {
            if (pick === 'Build Board')
                void vscode.commands.executeCommand('typecad-pcb.buildBoard');
        });
    };
    /** Status tooltips carry command links — wrapped in narrowly-trusted markdown. */
    const statusTooltip = (markdown) => {
        const hover = new vscode.MarkdownString(markdown);
        hover.isTrusted = { enabledCommands: ['typecad-pcb.buildBoard', 'typecad-pcb.runDrc'] };
        return hover;
    };
    /** Pull fresh board data and re-render every ambient surface. */
    const refreshAmbient = () => {
        void (async () => {
            const folder = resolveHwFolder();
            if (!folder) {
                // No typeCAD project, no chip — activation is workspaceContains-gated,
                // so this only happens after a command invocation or the project
                // folder leaving the workspace. Diagnostics describe a board that
                // is no longer part of this workspace — they go too.
                statusItem.hide();
                clearBoardSurfaces();
                return;
            }
            const board = (0, viewer_js_1.newestBoardFile)(folder);
            if (!board) {
                const content = (0, boardStatus_js_1.statusContent)({
                    boardName: null,
                    parts: null,
                    unconnected: null,
                    drcErrors: null,
                    drcWarnings: null,
                    stale: false,
                });
                statusItem.text = content.text;
                statusItem.tooltip = statusTooltip(content.tooltip);
                statusItem.show();
                // the previous board's Problems/chips must not outlive build/ being
                // cleaned (the watcher's onDidDelete lands here)
                clearBoardSurfaces();
                return;
            }
            try {
                const [components, nets, unconnectedReport] = await Promise.all([
                    service.components(),
                    service.netSources().catch(() => []),
                    service.unconnected().catch(() => ({ unconnectedPads: [], singlePinNets: [] })),
                ]);
                const refs = (0, problems_js_1.refSourceMap)(components);
                const unconnectedTotal = unconnectedReport.unconnectedPads.length + unconnectedReport.singlePinNets.length;
                const content = (0, boardStatus_js_1.statusContent)({
                    boardName: node_path_1.default.basename(board, '.kicad_pcb'),
                    parts: components.length,
                    unconnected: unconnectedTotal,
                    drcErrors: drcCounts?.errors ?? null,
                    drcWarnings: drcCounts?.warnings ?? null,
                    stale: boardIsStale(folder, node_fs_1.default.statSync(board).mtimeMs),
                });
                statusItem.text = content.text;
                statusItem.tooltip = statusTooltip(content.tooltip);
                statusItem.show();
                setProblemDiagnostics((0, problems_js_1.unconnectedProblems)(unconnectedReport, refs, nets, node_path_1.default.relative(folder, board)), folder);
                refreshWarnChips(unconnectedReport.unconnectedPads, refs, folder);
            }
            catch (err) {
                output.appendLine(`status refresh failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    };
    refreshAmbient();
    // -- quick fixes on diagnostics: jump into the Board viewer --
    /** A quick-fix action that runs a command from a diagnostic's line. */
    const probeAction = (title, command, args, diagnostic) => {
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        action.command = { command, title, arguments: args };
        action.diagnostics = [diagnostic];
        return action;
    };
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider([
        { language: 'typescript', scheme: 'file' },
        // catch-all violations attach to the generated board file — clicking
        // the diagnostic opens a huge generated text file; the action escapes
        { scheme: 'file', pattern: '**/build/**/*.kicad_pcb' },
    ], {
        provideCodeActions(document, range) {
            // diagnostics are whole-line (zero-width at column 0) — match by line
            const hits = (problems.get(document.uri) ?? []).filter((d) => d.range.start.line === range.start.line);
            const actions = [];
            for (const diagnostic of hits) {
                const info = diagnosticInfo.get(diagnostic);
                if (info?.ref) {
                    actions.push(probeAction(`Show ${info.ref} on board`, 'typecad-pcb.viewComponent', [info.ref], diagnostic));
                }
                if (info?.net) {
                    actions.push(probeAction(`Show net ${info.net} on board`, 'typecad-pcb.viewNet', [info.net], diagnostic));
                }
                if (!info?.ref && !info?.net) {
                    actions.push(probeAction('Open Board viewer', 'typecad-pcb.viewBoard', [], diagnostic));
                }
            }
            return actions;
        },
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        // Re-point the service when the editor moves between hw/ and fw/ so a
        // stale folder never survives a workspace switch; chips live
        // per-editor — reapply them for the newly focused one.
        const folder = resolveHwFolder();
        if (folder)
            service.setFolder(folder);
        if (!folder)
            return;
        void (async () => {
            try {
                const [components, report] = await Promise.all([service.components(), service.unconnected()]);
                refreshWarnChips(report.unconnectedPads, (0, problems_js_1.refSourceMap)(components), folder);
            }
            catch {
                /* no board yet */
            }
        })();
    }), vscode.workspace.onDidSaveTextDocument((doc) => {
        // a source save can only flip the stale flag
        if (doc.languageId === 'typescript' && (0, boardSource_js_1.isBoardSourceFile)(doc.uri.fsPath, resolveHwFolder()))
            refreshAmbient();
    }));
    // -- DRC: run the check, land violations in Problems aimed at their source --
    context.subscriptions.push(vscode.commands.registerCommand('typecad-pcb.runDrc', async () => {
        const folder = resolveHwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        const board = (0, viewer_js_1.newestBoardFile)(folder);
        if (!board) {
            noBoardYet();
            return;
        }
        output.appendLine('running DRC…');
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'typeCAD/pcb: running DRC' }, async () => {
            try {
                await runQuery(folder, `npx typecad-pcb drc ${(0, viewer_js_1.shellQuote)(node_path_1.default.relative(folder, board))}`, 180_000);
            }
            catch (err) {
                // kicad-cli exits non-zero on violations; only real failures land here
                output.appendLine(`drc: ${err.message.split('\n')[0]}`);
            }
        });
        const reportPath = board.replace(/\.kicad_pcb$/i, '_drc.json');
        try {
            const violations = (0, problems_js_1.parseDrcReport)(JSON.parse(node_fs_1.default.readFileSync(reportPath, 'utf8')));
            const [components, nets] = await Promise.all([
                service.components(),
                service.netSources().catch(() => []),
            ]);
            const refs = (0, problems_js_1.refSourceMap)(components);
            const boardRel = node_path_1.default.relative(folder, board);
            const entries = (0, problems_js_1.drcProblems)(violations, refs, nets, boardRel);
            // keep unconnected entries too — Problems shows the union
            const unconnectedReport = await service.unconnected().catch(() => ({ unconnectedPads: [], singlePinNets: [] }));
            setProblemDiagnostics([...(0, problems_js_1.unconnectedProblems)(unconnectedReport, refs, nets, boardRel), ...entries], folder);
            drcCounts = {
                errors: entries.filter((e) => e.severity === 'error').length,
                warnings: entries.filter((e) => e.severity === 'warning').length,
            };
            vscode.window.setStatusBarMessage(drcCounts.errors + drcCounts.warnings === 0
                ? 'typeCAD/pcb: DRC clean'
                : `typeCAD/pcb: DRC found ${drcCounts.errors} error(s), ${drcCounts.warnings} warning(s) — see Problems`, 6000);
        }
        catch (err) {
            vscode.window.setStatusBarMessage(`typeCAD/pcb: DRC report unreadable — see the typeCAD/pcb output channel`, 6000);
            output.appendLine(`drc report: ${err instanceof Error ? err.message : String(err)}`);
        }
        refreshAmbient();
    }));
    // -- board diff vs HEAD, in a webview panel that survives reloads --
    let diffPanel;
    /** Create-or-reuse the diff panel and load a generated report into it. */
    const presentDiff = (html) => {
        // same lockdown as the Board viewer: per-page nonce, never
        // script-src 'unsafe-inline'. A page without a <head> anchor
        // (none produced today) degrades to the unmodified HTML.
        const page = (0, probeClient_js_1.applyNoncePolicy)(html) ?? html;
        if (diffPanel) {
            diffPanel.webview.html = page;
            diffPanel.reveal(undefined, true);
            return;
        }
        diffPanel = vscode.window.createWebviewPanel('typecadBoardDiff', 'Board diff', {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true,
        });
        diffPanel.webview.options = { enableScripts: true };
        diffPanel.webview.html = page;
        diffPanel.onDidDispose(() => {
            diffPanel = undefined;
        });
    };
    /** Run `typecad-pcb diff` vs HEAD and present the report. */
    const runBoardDiff = async (folder, board) => {
        const out = node_path_1.default.join('build', 'serve', 'board-diff.html');
        output.appendLine('generating board diff vs HEAD…');
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'typeCAD/pcb: diffing board against HEAD' }, () => runQuery(folder, `npx typecad-pcb diff --no-open --output=${(0, viewer_js_1.shellQuote)(out)} HEAD ${(0, viewer_js_1.shellQuote)(node_path_1.default.relative(folder, board))}`, 240_000));
        }
        catch (err) {
            void vscode.window
                .showErrorMessage('typeCAD/pcb: diff failed — see the typeCAD/pcb output channel.', 'Open Output')
                .then((pick) => {
                if (pick === 'Open Output')
                    output.show();
            });
            output.appendLine(`diff: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        try {
            presentDiff(node_fs_1.default.readFileSync(node_path_1.default.join(folder, out), 'utf8'));
        }
        catch {
            vscode.window.showErrorMessage('typeCAD/pcb: diff produced no report.');
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('typecad-pcb.diffBoard', async () => {
        const folder = resolveHwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        const board = (0, viewer_js_1.newestBoardFile)(folder);
        if (!board) {
            noBoardYet();
            return;
        }
        await runBoardDiff(folder, board);
    }), 
    // live KiCad -> source sync: the kicad_sync npm script (import
    // --watch --auto) in a dedicated terminal — every KiCad save lands in
    // the .ts sources, debounced and snapshot-guarded. One terminal per hw
    // folder so re-invoking focuses the running sync instead of stacking
    // watchers (the import's project lock would refuse a second anyway).
    vscode.commands.registerCommand('typecad-pcb.startKiCadSync', () => {
        const folder = resolveHwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        syncTerminal.runIn(folder);
    }), 
    // the safety net under the layout apply bridge: list the pre-apply
    // source snapshots and restore one — a user should never have to
    // unscramble a corrupted .ts by hand
    vscode.commands.registerCommand('typecad-pcb.restoreBackup', async () => {
        const folder = resolveHwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        const backups = (0, sourceBackup_js_1.listBackups)(folder);
        if (backups.length === 0) {
            vscode.window.showInformationMessage(`typeCAD/pcb: no source snapshots in ${(0, sourceBackup_js_1.backupRootLabel)()} yet — one is taken before every layout apply.`);
            return;
        }
        const pick = await vscode.window.showQuickPick(backups.map((b) => ({
            label: b.id,
            description: `${b.manifest.files.map((f) => node_path_1.default.basename(f.source)).join(', ')} — ${b.manifest.reason}`,
            detail: new Date(b.manifest.time).toLocaleString(),
            id: b.id,
        })), { placeHolder: 'Restore source files from a pre-apply snapshot (newest first)' });
        if (!pick)
            return;
        let restored = 0;
        try {
            const entries = (0, sourceBackup_js_1.readBackup)(folder, pick.id);
            for (const entry of entries) {
                const docUri = vscode.Uri.file(entry.source);
                // a file the apply CREATED restores by disappearing — an empty
                // _sync.ts beside an entry that no longer imports it is litter
                if (entry.created) {
                    try {
                        await vscode.workspace.fs.delete(docUri, { useTrash: false });
                        restored++;
                    }
                    catch {
                        // already gone — that IS the restored state
                        restored++;
                    }
                    continue;
                }
                const doc = await vscode.workspace.openTextDocument(docUri);
                const edit = new vscode.WorkspaceEdit();
                edit.replace(docUri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), entry.text);
                if (await vscode.workspace.applyEdit(edit)) {
                    await doc.save();
                    restored++;
                }
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`typeCAD/pcb: restore failed — ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        vscode.window.setStatusBarMessage(`typeCAD/pcb: restored ${restored} file(s) from ${pick.id}`, 6000);
    }), 
    // window reload: restore the diff panel like the Board viewer —
    // instantly from the on-disk report when it still exists, else a
    // fresh diff run (the board may have changed since)
    vscode.window.registerWebviewPanelSerializer('typecadBoardDiff', {
        deserializeWebviewPanel: (panel) => {
            diffPanel = panel;
            panel.webview.options = { enableScripts: true };
            panel.onDidDispose(() => {
                diffPanel = undefined;
            });
            const folder = resolveHwFolder();
            const board = folder ? (0, viewer_js_1.newestBoardFile)(folder) : null;
            if (!folder || !board) {
                panel.dispose();
                return Promise.resolve();
            }
            try {
                presentDiff(node_fs_1.default.readFileSync(node_path_1.default.join(folder, 'build', 'serve', 'board-diff.html'), 'utf8'));
                return Promise.resolve();
            }
            catch {
                return runBoardDiff(folder, board);
            }
        },
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
            // Board hovers belong to hw sources only — fw/ files are the
            // typeCAD/hal extension's hover domain, and the two stack
            // confusingly when both fire on one identifier.
            if (!(0, boardSource_js_1.isBoardSourceFile)(document.uri.fsPath, folder))
                return;
            service.setFolder(folder);
            if (!boardWatcher)
                watchBuild(folder);
            try {
                const detail = await service.resolve(word);
                if (!detail) {
                    // Not a component: hovering a quoted string that names a net
                    // gets the net's card — the editor→board half of net
                    // cross-probing. Full quoted span, not the word: net names
                    // can carry spaces and tokenizer-breaking characters.
                    const quoted = (0, hover_js_1.quotedTextAt)(document.lineAt(position.line).text, position.character);
                    if (quoted) {
                        const nets = await service.netSources().catch(() => []);
                        const net = nets.find((n) => n.name === quoted);
                        if (net) {
                            const report = await service.unconnected().catch(() => null);
                            const markdown = new vscode.MarkdownString((0, hover_js_1.renderNetHover)(net, report?.singlePinNets.includes(net.name) ?? false), true);
                            markdown.supportThemeIcons = true;
                            markdown.isTrusted = { enabledCommands: ['typecad-pcb.viewNet'] };
                            return new vscode.Hover(markdown, range);
                        }
                    }
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
                    const hint = new vscode.MarkdownString('$(circuit-board) typeCAD/pcb: no compiled board yet — run `npm run build` in the hw folder.');
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
        vscode.window.setStatusBarMessage('typeCAD/pcb: board data refreshed', 3000);
    }));
    output.appendLine('typeCAD/pcb extension activated');
    // the load path is the first thing to check when host-side behavior looks
    // stale — dev windows, installed copies and stray snapshots all behave
    // differently, and this line says which one is live
    output.appendLine(`extension code loaded from: ${__dirname}`);
    // the workspace-bundled copy self-updates from the project's own
    // @typecad/pcb dependency asset when the dependency is newer — the copy
    // only exists because the scaffold dropped it there, and it used to rot
    // at whatever version the project was created with
    void checkBundledExtensionUpdate(context, output, resolveHwFolder());
}
/** Once-a-day staleness check of the running copy against the workspace asset. */
async function checkBundledExtensionUpdate(context, output, folder) {
    const THROTTLE_KEY = 'typecad-pcb.bundledUpdateCheck';
    const today = new Date().toISOString().slice(0, 10);
    if (context.globalState.get(THROTTLE_KEY) === today)
        return;
    void context.globalState.update(THROTTLE_KEY, today);
    if (!folder)
        return;
    const selfRoot = node_path_1.default.dirname(__dirname);
    // a dev-hosted run (packages/vscode-typecad-pcb) IS the source — the
    // workspace asset symlinks to it; planExtensionUpdate sees equal versions
    try {
        const plan = (0, bundledUpdate_js_1.planExtensionUpdate)(folder, selfRoot);
        if (!plan)
            return;
        (0, bundledUpdate_js_1.applyExtensionUpdate)(plan);
        output.appendLine(`workspace-bundled extension updated ${plan.fromVersion} → ${plan.toVersion} from the project's @typecad/pcb asset — reload the window to run it`);
        const pick = await vscode.window.showInformationMessage(`typeCAD/pcb: the bundled extension updated itself ${plan.fromVersion} → ${plan.toVersion}.`, 'Reload Window');
        if (pick === 'Reload Window')
            void vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
    catch (err) {
        output.appendLine(`bundled extension update check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
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