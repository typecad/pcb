"use strict";
// ---------------------------------------------------------------------------
// BoardViewerPanel — the gerber-viewer running in a vscode webview, with
// cross-probing in both directions.
//
// Generation pipeline (one shot per board change):
//   typecad-pcb export gerbers → typecad-pcb export drill →
//   gerber-viewer build/gerbers -o build/serve/viewer.html
//       [--netlist build/<board>.net] [--drc build/<board>_drc.json]
//       [--stackup build/<board>_stackup.json]
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
exports.BoardViewerPanel = exports.newestBoardFile = exports.mtimeOf = void 0;
exports.shellQuote = shellQuote;
exports.wordUnderCursor = wordUnderCursor;
const vscode = __importStar(require("vscode"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const probeClient_js_1 = require("./probeClient.js");
const layoutApply_js_1 = require("./layoutApply.js");
const boardRules_js_1 = require("./boardRules.js");
const sourceRef_js_1 = require("./sourceRef.js");
// discovery helpers live vscode-free in boardFile.ts for unit testing;
// re-exported here for the existing import sites
var boardFile_js_1 = require("./boardFile.js");
Object.defineProperty(exports, "mtimeOf", { enumerable: true, get: function () { return boardFile_js_1.mtimeOf; } });
Object.defineProperty(exports, "newestBoardFile", { enumerable: true, get: function () { return boardFile_js_1.newestBoardFile; } });
const boardFile_js_2 = require("./boardFile.js");
const GENERATE_TIMEOUT_MS = 120_000;
/** A selection is re-posted until the viewer page acks it (or this times out). */
const DELIVERY_TIMEOUT_MS = 5_000;
const DELIVERY_INTERVAL_MS = 200;
/** Double-quote a path for an `exec` shell line; embedded quotes are escaped. */
function shellQuote(value) {
    return `"${value.replace(/"/g, '\\"')}"`;
}
/** The host message for a pending selection id — "net:<name>" selects a net. */
function selectionMessage(ref, token) {
    return ref.startsWith('net:')
        ? { type: 'typecad/select-net', net: ref.slice('net:'.length), token }
        : { type: 'typecad/select', ref, token };
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
        /** Set by generate() when the DRC report predates the board — the next
         *  generated page carries a visible "markers hidden" notice. */
        this.staleDrcNotice = false;
    }
    /** Open/reveal the viewer, regenerating the HTML when the board changed. */
    async show() {
        const folder = this.hwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        if (!this.generated || this.generated.boardMtimeMs !== this.boardMtime(folder)) {
            let generated = false;
            try {
                generated = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'typeCAD/pcb: rendering board viewer' }, () => this.generate(folder));
            }
            catch (err) {
                this.output.appendLine(`viewer generation failed: ${err instanceof Error ? err.message : String(err)}`);
                void vscode.window
                    .showErrorMessage(`typeCAD: could not render the board viewer — see the 'typeCAD/pcb' output channel.`, 'Open Output')
                    .then((pick) => {
                    if (pick === 'Open Output')
                        this.output.show();
                });
                return;
            }
            if (!generated) {
                // the board was written <3s ago — the build (or a concurrent
                // kicad-cli) may still be writing. An already-open panel hears about
                // the settled board from the watcher; a first open needs this retry,
                // because refreshIfVisible no-ops without a panel
                if (!this.showRetryTimer) {
                    vscode.window.showInformationMessage('typeCAD/pcb: board is still being written — the viewer opens when it settles.');
                }
                this.armShowRetry(4_000);
                return;
            }
            if (this.showRetryTimer) {
                clearTimeout(this.showRetryTimer);
                this.showRetryTimer = undefined;
            }
        }
        if (!this.panel) {
            const webviewPanels = vscode.window.createWebviewPanel('typecadBoardViewer', 'Board', {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true,
            }, {
                enableScripts: true,
                // The viewer page is heavy (every gerber layer inlined as SVG); a
                // default webview is torn down when its tab hides, and re-showing
                // reloads and re-renders the whole document — a multi-second blank
                // tab on every switch back. Retaining the context makes the tab
                // switch instant at the cost of keeping the DOM alive while hidden.
                retainContextWhenHidden: true,
            });
            this.bindPanel(webviewPanels);
            this.loadToken++;
            this.assignHtml();
        }
        else if (this.assignedHtml !== this.generated.html) {
            // Only reassign when the board actually regenerated — html assignment
            // reloads the page.
            this.loadToken++;
            this.assignHtml();
        }
        this.panel?.reveal(undefined, true);
    }
    /** Wire a fresh-or-restored panel into this viewer instance. */
    bindPanel(panel) {
        panel.webview.options = { enableScripts: true };
        panel.webview.onDidReceiveMessage((m) => this.onMessage(m));
        panel.onDidDispose(() => {
            this.panel = undefined;
            this.pendingRef = null;
        });
        this.panel = panel;
    }
    /**
     * VS Code window reload: without a serializer, an open Board panel comes
     * back as a dead empty editor. restorePanel rebinds it and restores the
     * view — instantly when the last generated viewer on disk still matches
     * the board (page-localStorage puts the viewport/highlight back), else a
     * placeholder page while the full export pipeline reruns.
     */
    async restorePanel(panel) {
        this.bindPanel(panel);
        const folder = this.hwFolder();
        if (!folder) {
            panel.dispose();
            return;
        }
        const board = (0, boardFile_js_2.newestBoardFile)(folder);
        const htmlPath = node_path_1.default.join(folder, 'build', 'serve', 'viewer.html');
        // fast path: the on-disk viewer was generated from this exact board
        // revision (the file is newer than the board) — reuse it as-is
        if (board && node_fs_1.default.existsSync(htmlPath) && (0, boardFile_js_2.mtimeOf)(htmlPath) > (0, boardFile_js_2.mtimeOf)(board)) {
            try {
                const raw = node_fs_1.default.readFileSync(htmlPath, 'utf8');
                const [components, nets] = await Promise.all([this.service.components(), this.service.netSources().catch(() => [])]);
                const { html } = (0, probeClient_js_1.injectProbeClient)(raw, components, nets);
                this.generated = { html, boardMtimeMs: (0, boardFile_js_2.mtimeOf)(board) };
                this.loadToken++;
                this.assignHtml();
                this.output.appendLine('viewer restored from the last generated board view');
                return;
            }
            catch (err) {
                this.output.appendLine(`viewer restore fell back to a full render: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        // stale or missing: show something immediately, then let the regular
        // refresh pipeline (settle gate, retries, status notices) swap in the
        // freshly exported board
        panel.webview.html =
            '<html><body style="font:14px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:var(--vscode-foreground,#333)">reopening the board viewer…</body></html>';
        void this.doRefresh();
    }
    /** Assign the generated page and watch for the client announcing itself. */
    assignHtml() {
        this.readySeen = false;
        // track the assigned string ourselves: reading webview.html back is not
        // guaranteed to round-trip, and show()'s "needs reassign" check keys on it
        this.assignedHtml = this.generated.html;
        this.panel.webview.html = this.assignedHtml;
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
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        this.output.appendLine(`select ${ref}: opening/revealing viewer`);
        this.pendingRef = ref;
        this.pendingToken = this.loadToken;
        await this.show();
        this.deliverSelection();
    }
    /** Reveal the viewer with a net's traces highlighted. */
    async selectNet(net) {
        const folder = this.hwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        this.output.appendLine(`select net ${net}: opening/revealing viewer`);
        this.pendingRef = `net:${net}`;
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
            void this.panel.webview.postMessage(selectionMessage(ref, token)).then((delivered) => {
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
                // a click that does nothing is indistinguishable from a broken
                // command — say so in the window, not just the channel
                vscode.window.setStatusBarMessage('typeCAD/pcb: the Board viewer page did not respond — try reopening it', 5000);
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
        // 1.5s debounce: kicad-cli writes the board truncate-then-write and VS
        // Code watchers fire loosely on Windows (anything touching the
        // workspace) — wait for the writes and events to settle
        this.refreshTimer = setTimeout(() => {
            void this.doRefresh();
        }, 1_500);
    }
    /** One delayed re-run of show() — the board was too fresh to render. */
    armShowRetry(delayMs) {
        if (this.showRetryTimer)
            clearTimeout(this.showRetryTimer);
        this.showRetryTimer = setTimeout(() => {
            this.showRetryTimer = undefined;
            void this.show();
        }, delayMs);
    }
    /** Re-check after a skipped/failed/stale refresh; default 10s, overridable. */
    armRetry(delayMs = 10_000) {
        if (this.retryTimer)
            clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            void this.doRefresh();
        }, delayMs);
    }
    /** Show a notice in the viewer's lower-left status text (no-op w/o panel). */
    postStatus(text) {
        if (!this.panel)
            return;
        void this.panel.webview.postMessage({ type: 'typecad/status', text });
    }
    async doRefresh() {
        if (!this.panel)
            return;
        const folder = this.hwFolder();
        if (!folder)
            return;
        // watcher events are cheap and sometimes spurious (Windows fires
        // onChange loosely); the board's mtime against the last render decides
        // whether any work is warranted at all
        const board = (0, boardFile_js_2.newestBoardFile)(folder);
        if (board && this.generated && (0, boardFile_js_2.mtimeOf)(board) === this.generated.boardMtimeMs)
            return;
        // The re-render takes ~20s (gerber export incl. the zone refill); the
        // page keeps showing the old board meanwhile, so say so in its status
        // text — the reload when the new HTML lands resets the element
        this.postStatus('board changed — generating new render…');
        let generated = false;
        try {
            generated = await this.generate(folder);
        }
        catch (err) {
            this.output.appendLine(`viewer refresh failed: ${err instanceof Error ? err.message : String(err)}`);
            this.postStatus('render failed — see the typeCAD/pcb output channel');
        }
        if (!generated) {
            this.postStatus('board is mid-build — waiting for it to settle…');
            // mid-build skip or failure: the board's final write may coalesce into
            // the in-flight generate (or never fire) — re-check soon (the board
            // might just need 3s to settle)
            this.armRetry(4_000);
            return;
        }
        // the export takes ~25-30s; the board may have been written again while
        // it ran. BUT kicad-cli itself creates/removes a project .lck file and
        // touches the build directory during the export — the resulting watcher
        // event is self-inflicted, not a real board change. Only re-render when
        // the mtime genuinely moved AND stays moved on a re-check 5s later
        // (rides out kicad-cli's cleanup churn).
        const boardNow = (0, boardFile_js_2.newestBoardFile)(folder);
        if (boardNow && (0, boardFile_js_2.mtimeOf)(boardNow) !== this.generated.boardMtimeMs) {
            const staleMtime = (0, boardFile_js_2.mtimeOf)(boardNow);
            if (this.retryTimer)
                clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => {
                this.retryTimer = undefined;
                const settled = (0, boardFile_js_2.newestBoardFile)(folder);
                if (!settled || (0, boardFile_js_2.mtimeOf)(settled) === staleMtime) {
                    // board quiet at the new mtime — render the new revision
                    void this.doRefresh();
                }
                // if the mtime moved again, the new watcher event's debounce plus
                // doRefresh's own gates handle it
            }, 5_000);
            this.output.appendLine(`board mtime moved during export (${this.generated.boardMtimeMs} → ${(0, boardFile_js_2.mtimeOf)(boardNow)}) — re-checking in 5s`);
            return;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
        if (this.panel && this.generated && this.assignedHtml !== this.generated.html) {
            this.output.appendLine('board changed — refreshing viewer');
            this.loadToken++;
            this.assignHtml();
        }
        else {
            // regenerated to identical HTML: no reload happens, so the generating
            // notice must be cleared by hand
            this.postStatus('');
        }
    }
    boardMtime(folder) {
        const board = (0, boardFile_js_2.newestBoardFile)(folder);
        if (!board)
            return 0;
        return (0, boardFile_js_2.mtimeOf)(board);
    }
    /** Generate viewer HTML; resolves false when skipped (board mid-build). */
    async generate(folder) {
        if (this.generating)
            return this.generating;
        this.generating = (async () => {
            const board = (0, boardFile_js_2.newestBoardFile)(folder);
            if (!board)
                throw new Error('no .kicad_pcb in build/ — run npm run build first');
            // The build writes zone declarations without fill geometry; fills are
            // materialized by `export gerbers` (--check-zones) and `check`. The
            // board is "settled" when its mtime has been stable for 3s — before
            // that, the build (or a concurrent kicad-cli run) may still be
            // writing, and an export would race a rewrite.
            const stableFor = Date.now() - node_fs_1.default.statSync(board).mtimeMs;
            if (stableFor < 3_000) {
                this.output.appendLine(`board written ${stableFor}ms ago — waiting for it to settle`);
                return false;
            }
            this.output.appendLine('exporting gerbers…');
            // explicit board path: build/ can hold stray .kicad_pcb files (fp
            // upgrade tests, imports) and the CLI refuses an ambiguous export
            await this.run(folder, `npx typecad-pcb export gerbers "${board}"`, GENERATE_TIMEOUT_MS);
            await this.run(folder, `npx typecad-pcb export drill "${board}"`, GENERATE_TIMEOUT_MS);
            const boardName = node_path_1.default.basename(board, '.kicad_pcb');
            const gerbersDir = node_path_1.default.join('build', 'gerbers');
            const outPath = node_path_1.default.join('build', 'serve', 'viewer.html');
            // Optional data overlays, each shipped only when the build actually
            // produced it: the netlist fills pad→net (click a pad, its whole net
            // highlights); DRC markers exist after a `typecad-pcb drc` run; the
            // stackup drives the Copper ΔT view's per-layer copper weight. A
            // missing artifact must not sink the render — the viewer opens
            // without that overlay.
            const flags = [];
            const overlay = (flag, name) => {
                const rel = node_path_1.default.join('build', name);
                if (node_fs_1.default.existsSync(node_path_1.default.join(folder, rel)))
                    flags.push(flag, shellQuote(rel));
            };
            overlay('--netlist', `${boardName}.net`);
            // A DRC report OLDER than the board describes the previous revision —
            // embedding it paints stale violation markers on the new board (seen
            // as ghost "unconnected/shorting" dots on a route the move fixed).
            // Re-evaluated on every generate: a flag left over from an attempt
            // that later failed must not leak a bogus notice into this one.
            this.staleDrcNotice = false;
            const drcRel = node_path_1.default.join('build', `${boardName}_drc.json`);
            if (node_fs_1.default.existsSync(node_path_1.default.join(folder, drcRel))) {
                flags.push('--drc', shellQuote(drcRel));
                // A report older than the board describes the previous revision —
                // still embed it (a muted/absent DRC affordance reads as breakage)
                // but bake a provenance notice into the page so stale markers are
                // never mistaken for the new board's truth
                if ((0, boardFile_js_2.mtimeOf)(node_path_1.default.join(folder, drcRel)) < (0, boardFile_js_2.mtimeOf)(board)) {
                    this.output.appendLine('drc report predates the board — embedding with a previous-revision notice');
                    this.staleDrcNotice = true;
                }
            }
            overlay('--stackup', `${boardName}_stackup.json`);
            // the layout view's rule floors + net-class defaults. The project's
            // optional typecad.rules.json is the primary source (hand-authored,
            // beside typecad.conf.ts); the board's .kicad_pro fills the gaps.
            const boardRules = (0, boardRules_js_1.resolveBoardRules)(folder, board);
            if (boardRules) {
                const rulesRel = node_path_1.default.join('build', `${boardName}_rules.json`);
                try {
                    node_fs_1.default.writeFileSync(node_path_1.default.join(folder, rulesRel), JSON.stringify(boardRules));
                    flags.push('--rules', shellQuote(rulesRel));
                    this.output.appendLine(`board rules: ${(0, boardRules_js_1.userRulesFromFolder)(folder) ? 'typecad.rules.json' : 'board .kicad_pro'}` +
                        (boardRules.netClasses ? ` (+${Object.keys(boardRules.netClasses).length} net class(es))` : ''));
                }
                catch {
                    this.output.appendLine('warning: could not write the rules island — the width control runs without a floor');
                }
            }
            this.output.appendLine('building viewer HTML…');
            await this.run(folder, `npx gerber-viewer ${shellQuote(gerbersDir)} -o ${shellQuote(outPath)} ${flags.join(' ')}`, GENERATE_TIMEOUT_MS);
            let raw = node_fs_1.default.readFileSync(node_path_1.default.join(folder, outPath), 'utf8');
            if (this.staleDrcNotice) {
                // A postStatus would be wiped by the reload that lands this HTML —
                // bake the notice into the page's own status line instead. Spliced
                // in BEFORE injectProbeClient: the probe client's nonce policy must
                // cover this script too, or the CSP silently blocks it.
                const notice = `<script>(function(){function n(){var el=document.getElementById('status');if(el){el.textContent='DRC markers show the PREVIOUS board revision — run typeCAD: DRC to refresh';el.setAttribute('data-locked','');}}if(document.readyState==='complete')n();else window.addEventListener('load',n);})();</script>`;
                raw = raw.includes('</body>') ? raw.replace('</body>', notice + '</body>') : raw;
            }
            const [components, nets] = await Promise.all([
                this.service.components(),
                // net sources are decorative metadata — a failed query must not
                // take the viewer down with it
                this.service.netSources().catch(() => []),
            ]);
            const { html, injected } = (0, probeClient_js_1.injectProbeClient)(raw, components, nets);
            if (!injected) {
                this.output.appendLine('warning: viewer HTML had no <head>/</body> anchors — cross-probe disabled');
            }
            this.generated = { html, boardMtimeMs: (0, boardFile_js_2.mtimeOf)(board) };
            this.output.appendLine(`viewer ready: ${components.length} component outline(s), board mtime ${this.generated.boardMtimeMs}, cross-probe ${injected ? 'on' : 'off'}`);
            return true;
        })().finally(() => {
            this.generating = null;
        });
        return this.generating;
    }
    /**
     * Layout view "apply & rebuild": move deltas arrive in the board (y-down)
     * frame. planLayoutApply turns the whole gesture (moves, text/value/label/
     * rename edits, new routes, segment deletes) into sequential edit stages
     * over the project's sources — each stage planned against the text the
     * previous stage produced, so no two edits ever overlap — then the project
     * rebuilds and the viewer regenerates. Computed (non-literal) placements
     * are skipped and reported, never silently mangled.
     */
    async onLayoutRebuild(moves, texts, values, labels, renames, routes, deletes) {
        const folder = this.hwFolder();
        const fail = (error) => {
            this.output.appendLine(`layout apply failed: ${error}`);
            void this.panel?.webview.postMessage({ type: 'typecad/layout-status', error });
        };
        if (!folder) {
            fail('no typeCAD project found');
            return;
        }
        try {
            const comps = await this.service.components();
            const variableOf = new Map(comps.map((c) => [c.reference, c.variable ?? '']));
            const srcUris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, 'src/**/*.ts'));
            const files = [];
            for (const uri of srcUris) {
                files.push({ uri: uri.toString(), text: (await vscode.workspace.openTextDocument(uri)).getText() });
            }
            const plan = (0, layoutApply_js_1.planLayoutApply)(files, {
                moves,
                texts,
                values,
                labels,
                renames,
                routes,
                deletes,
                variableOf: (ref) => variableOf.get(ref),
                allRefs: new Set(comps.map((c) => c.reference).filter(Boolean)),
            });
            // stage by stage: positions come from the live document, which by now
            // reflects every earlier stage — exactly the text each stage planned
            // against. One WorkspaceEdit per stage keeps every applied range
            // unambiguous.
            for (const stage of plan.stages) {
                const edits = new vscode.WorkspaceEdit();
                for (const batch of stage) {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(batch.uri));
                    for (const edit of batch.edits) {
                        edits.replace(doc.uri, new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end)), edit.line);
                    }
                }
                if (edits.size > 0)
                    await vscode.workspace.applyEdit(edits);
            }
            for (const key of plan.touched) {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
                await doc.save();
            }
            const c = plan.counts;
            const anyApplied = c.moves > 0 || c.endpoints > 0 || c.texts > 0 || c.values > 0 || c.labels > 0 || c.renames > 0 || c.routes > 0 || c.deletes > 0;
            this.output.appendLine(`layout apply: ${c.moves} placement(s) moved${c.endpoints ? `, ${c.endpoints} route endpoint(s) translated` : ''}${c.routes ? `, ${c.routes} track route(s) added to source` : ''}${c.deletes ? `, ${c.deletes} segment(s) deleted from source` : ''}${c.texts ? `, ${c.texts} text(s) edited` : ''}${c.values ? `, ${c.values} value(s) edited` : ''}${c.labels ? `, ${c.labels} label(s) repositioned` : ''}${c.renames ? `, ${c.renames} reference(s) renamed` : ''}${plan.skipped.length ? `, skipped ${plan.skipped.join('; ')}` : ''} — rebuilding`);
            if (plan.skipped.length) {
                vscode.window.setStatusBarMessage(`layout: skipped ${plan.skipped.join('; ')}`, 8000);
            }
            if (!anyApplied) {
                void this.panel?.webview.postMessage({ type: 'typecad/layout-status', error: undefined });
                return;
            }
            this.postStatus('rebuilding board…');
            await this.run(folder, 'npx typecad-pcb build', GENERATE_TIMEOUT_MS);
            // A move invalidates every DRC marker — re-run DRC so the regenerated
            // view carries fresh ones instead of none (the report predates the
            // new board, and markers are the move's feedback loop). Non-zero
            // exit just means violations exist; the report is still written.
            this.postStatus('checking rules…');
            try {
                await this.run(folder, 'npx typecad-pcb drc', GENERATE_TIMEOUT_MS);
            }
            catch {
                // violations exit non-zero — only a real failure (missing board,
                // engine crash) skips the markers, same as before
            }
            // generate() refuses a board written <3s ago (the build may still be
            // writing); wait for it to settle so the viewer regenerates NOW, not
            // only whenever the file watcher next fires
            const boardFile = (0, boardFile_js_2.newestBoardFile)(folder);
            if (boardFile) {
                for (let i = 0; i < 10 && Date.now() - (0, boardFile_js_2.mtimeOf)(boardFile) < 3_500; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 1_000));
                }
            }
            await this.generate(folder);
            void this.panel?.webview.postMessage({ type: 'typecad/layout-status', error: undefined });
        }
        catch (error) {
            fail(error instanceof Error ? error.message : String(error));
        }
    }
    async onMessage(message) {
        if (message.type === 'typecad/layout-rebuild') {
            await this.onLayoutRebuild(message.moves, message.texts, message.values, message.labels, message.renames, message.routes, message.deletes);
            return;
        }
        if (message.type === 'typecad/ready') {
            this.readySeen = true;
            this.output.appendLine('viewer page ready');
            // The page re-applies its own saved highlight after a reload (the
            // saved viewport puts the view back too) — only an explicit pending
            // selection needs delivering.
            if (this.pendingRef && this.panel) {
                await this.panel.webview.postMessage(selectionMessage(this.pendingRef, this.pendingToken ?? this.loadToken));
            }
            return;
        }
        if (message.type === 'typecad/ack') {
            const isNet = message.ref.startsWith('net:');
            const label = isNet ? `net ${message.ref.slice('net:'.length)}` : message.ref;
            this.output.appendLine(`select ${message.ref}: ack (found=${String(message.found)}, token=${String(message.token)})`);
            if (this.pendingRef === message.ref && (message.token === undefined || message.token === this.pendingToken)) {
                this.pendingRef = null;
                if (message.found === false) {
                    vscode.window.setStatusBarMessage(`${label}: no ${isNet ? 'traces' : 'pads'} for it on the rendered board — is the build current?`, 5000);
                }
            }
            return;
        }
        if (message.type === 'typecad/probe-net') {
            // double-clicked a trace: the client resolved the net's declaring
            // file:line (route call preferred) — reveal it, or say why not
            this.output.appendLine(`probe: net ${message.net} → source`);
            const folder = this.hwFolder();
            if (!folder)
                return;
            if (!message.source) {
                vscode.window.setStatusBarMessage(`net ${message.net}: no recorded source — rebuild with a current typeCAD`, 5000);
                return;
            }
            const loc = (0, sourceRef_js_1.parseSourceLocation)(folder, message.source);
            if (!loc) {
                vscode.window.setStatusBarMessage(`net ${message.net}: source location "${message.source}" did not resolve`, 5000);
                return;
            }
            await this.revealLocation(loc);
            return;
        }
        // after the checks above, the message can only be a probe
        if (message.ref) {
            this.output.appendLine(`probe: ${message.ref}${message.pin ? ' ' + message.pin : ''} → source`);
            await this.revealInEditor(message.ref, message.pin);
        }
    }
    /**
     * The board→editor direction: open the declaring file at its line. A
     * double-click on a SPECIFIC pad asks about that pad's net — land on the
     * line that declared or routed it (same preference as the trace
     * double-click), falling back to the component's own declaration when the
     * pad carries no net or the net has no recorded provenance.
     */
    async revealInEditor(ref, pin) {
        const folder = this.hwFolder();
        if (!folder)
            return;
        try {
            const detail = await this.service.resolve(ref);
            if (!detail)
                return;
            let source = detail.source;
            if (pin) {
                const padNet = detail.pads.find((p) => p.pad === pin)?.net ?? null;
                if (padNet !== null) {
                    const nets = await this.service.netSources().catch(() => []);
                    const net = nets.find((n) => n.name === padNet);
                    source = net?.routeSource ?? net?.source ?? source;
                }
            }
            const loc = (0, sourceRef_js_1.parseSourceLocation)(folder, source);
            if (!loc) {
                vscode.window.setStatusBarMessage(`${ref}: no source location on the compiled board`, 4000);
                return;
            }
            await this.revealLocation(loc);
        }
        catch (err) {
            this.output.appendLine(`reveal ${ref} failed: ${err instanceof Error ? err.message : String(err)}`);
            vscode.window.setStatusBarMessage(`typeCAD/pcb: could not resolve ${ref} — see the typeCAD/pcb output channel`, 4000);
        }
    }
    /** Open a resolved source location (shared by component and net probes). */
    async revealLocation(loc) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(loc.fsPath));
        const line = Math.max(0, loc.line - 1);
        const range = new vscode.Range(line, 0, line, 0);
        await vscode.window.showTextDocument(document, { selection: range, preserveFocus: false });
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