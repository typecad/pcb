"use strict";
// ---------------------------------------------------------------------------
// BoardViewerPanel — the gerber-viewer running in a vscode webview, with
// cross-probing in both directions.
//
// Generation pipeline (one shot per board change):
//   typecad-pcb viewer (ONE process: gerbers + drill + page) — or, on a
//   toolchain without that command, export gerbers → export drill →
//   gerber-viewer build/serve/viewer.html
//       [--netlist build/<board>.net] [--drc build/<board>_drc.json]
//       [--stackup build/<board>_stackup.json] [--rules build/<board>_rules.json]
// The ngspice op solve (best-effort, stale-only) and the check-sync drift
// oracle run concurrently with the render; drift never reaches the user as
// a task — the ts source is the source of truth, so the pipeline either
// lets the pending build take the source's side or absorbs a board-side
// edit into source (one-shot import --auto), and only a drift the system
// cannot fix surfaces as a page banner. The generated HTML is then
// post-processed: CSP for the webview, embedded component outlines, and
// the probe client script.
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
exports.BoardViewerPanel = exports.entrySourceFile = exports.newestBoardFile = exports.mtimeOf = void 0;
exports.shellQuote = shellQuote;
exports.wordUnderCursor = wordUnderCursor;
const vscode = __importStar(require("vscode"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const probeClient_js_1 = require("./probeClient.js");
const netSegmentSource_js_1 = require("./netSegmentSource.js");
const zoneSource_js_1 = require("./zoneSource.js");
const boardRules_js_1 = require("./boardRules.js");
const sourceRef_js_1 = require("./sourceRef.js");
const viewerApply_js_1 = require("./viewerApply.js");
// discovery helpers live vscode-free in boardFile.ts for unit testing;
// re-exported here for the existing import sites
var boardFile_js_1 = require("./boardFile.js");
Object.defineProperty(exports, "mtimeOf", { enumerable: true, get: function () { return boardFile_js_1.mtimeOf; } });
Object.defineProperty(exports, "newestBoardFile", { enumerable: true, get: function () { return boardFile_js_1.newestBoardFile; } });
Object.defineProperty(exports, "entrySourceFile", { enumerable: true, get: function () { return boardFile_js_1.entrySourceFile; } });
const boardFile_js_2 = require("./boardFile.js");
const syncState_js_1 = require("./syncState.js");
const timerSlots_js_1 = require("./timerSlots.js");
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
        /** Every pending refresh timer, by role: 'debounce' (watcher events),
         *  'retry' (re-check after a skipped/failed/stale refresh — the board's
         *  final write can coalesce into an in-flight generate and never fire the
         *  watcher again; also the failure backoff ladder), 'show' (first-open
         *  retry while the board settles). One slot per role, cleared together
         *  when the panel goes away. */
        this.timers = new timerSlots_js_1.TimerSlots();
        /** Consecutive generate() failures — drives exponential retry backoff. */
        this.consecutiveFailures = 0;
        /** Placement of every part as each recent render saw it, keyed by that
         *  render's board identity (the page's stamp) — what a refused apply
         *  compares against to decide whether its edits still describe the board
         *  (rebaseCheck). Newest last; capped. */
        this.renderedParts = new Map();
        this.generating = null;
        /** A refresh doRefresh deferred because the panel was hidden — runs when
         *  the tab becomes visible again. */
        this.refreshOwed = false;
        /** The deferred refresh came from a forced path (failure ladder, board
         *  switch) and must stay forced when it finally runs. */
        this.refreshOwedForce = false;
        /** Set when `typecad-pcb viewer` proved absent (older toolchain) — the
         *  render pipeline then uses the step-by-step chain for this session. */
        this.viewerCommandUnavailable = false;
        /** Board revisions already auto-absorbed this session — one attempt per
         *  revision, win or lose. Keyed on the board's CONTENT hash (mtime only
         *  as a fallback): every rebuild has a new mtime, so an mtime key never
         *  repeats inside a build→absorb→build cycle and never stopped it. */
        this.absorbedBoardRevisions = new Set();
        /** When the recent absorbs ran — the circuit breaker's window. */
        this.absorbHistory = [];
        this.applyBridge = new viewerApply_js_1.LayoutApplyBridge(this);
    }
    /** Open/reveal the viewer, regenerating the HTML when the board changed. */
    async show() {
        const folder = this.hwFolder();
        if (!folder) {
            vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
            return;
        }
        if (!this.generated || this.generated.boardId !== this.boardId(folder)) {
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
                if (!this.timers.has('show')) {
                    vscode.window.showInformationMessage('typeCAD/pcb: board is still being written — the viewer opens when it settles.');
                }
                this.armShowRetry(4_000);
                return;
            }
            this.timers.cancel('show');
        }
        else if (this.generated) {
            // the cache matches the board, but a newer on-disk page (viewer
            // update, out-of-band regen) supersedes it without a board change to
            // key on — swap it in so the panel never serves a pre-update page
            await this.adoptNewerDiskViewer(folder);
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
            this.refreshOwed = false;
            // nothing scheduled for a panel that is gone (the retry ladder would
            // otherwise keep ticking through doRefresh's no-panel early return)
            this.timers.clear();
        });
        panel.onDidChangeViewState((e) => {
            // a hidden panel's owed refresh (doRefresh deferred it) runs the
            // moment the tab is shown again
            if (e.webviewPanel.visible && this.refreshOwed) {
                this.refreshOwed = false;
                const force = this.refreshOwedForce;
                this.refreshOwedForce = false;
                void this.doRefresh(force);
            }
            // A toolchain update while this panel was live: the served page
            // predates the generator bits (page-side fixes land in dist with no
            // board change to key a re-render on), so a tab re-focus would keep
            // showing the old page — the user sees "no change" though the disk
            // page is new. Regenerate when the generator moved past the page.
            if (e.webviewPanel.visible && this.generated && !this.refreshOwed) {
                const folder = this.hwFolder();
                const gen = folder ? (0, boardFile_js_2.projectToolchainGeneratorMtime)(folder) : null;
                if (gen !== null && this.generated.diskMtimeMs < gen && !(0, syncState_js_1.pipelineBusy)()) {
                    this.output.appendLine('viewer page predates the installed generator — re-rendering on focus');
                    void this.doRefresh();
                }
            }
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
        const board = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        // fast path: the on-disk viewer was generated from this exact board
        // revision (the file is newer than the board) — reuse it as-is
        const page = board ? await this.readDiskViewer(folder) : null;
        // …but only when it was generated by the INSTALLED toolchain. A page
        // predating a toolchain update (the extension self-updated, or the
        // project's @typecad/pcb moved) carries interactions the new code
        // doesn't have — served forever, because nothing else keys a
        // regeneration while the board file itself is unchanged (seen live: a
        // page without the layout view's newer gestures, clicking dead). An
        // unresolvable toolchain version keeps the legacy behavior.
        const toolchain = board ? (0, boardFile_js_2.projectToolchainVersion)(folder) : null;
        const pageStale = (!!page && !!toolchain && (0, boardFile_js_2.pageGeneratorVersion)(page.html) !== toolchain) ||
            // same version, older bits: a workspace-linked toolchain gains
            // features without a version bump — a page older than the generator
            // module itself was not written by the code about to serve it
            (!!page && !!page.diskMtimeMs && (() => {
                const genMtime = (0, boardFile_js_2.projectToolchainGeneratorMtime)(folder);
                return genMtime !== null && page.diskMtimeMs < genMtime;
            })());
        if (pageStale) {
            this.output.appendLine(`viewer page predates the installed @typecad/pcb ${toolchain} — regenerating instead of restoring it`);
        }
        if (board && page && !pageStale && page.diskMtimeMs > (0, boardFile_js_2.mtimeOf)(board)) {
            this.generated = { html: page.html, boardId: (0, boardFile_js_2.boardIdentity)(board), diskMtimeMs: page.diskMtimeMs };
            this.loadToken++;
            this.assignHtml();
            this.output.appendLine('viewer restored from the last generated board view');
            return;
        }
        // stale or missing: show something immediately, then let the regular
        // refresh pipeline (settle gate, retries, status notices) swap in the
        // freshly exported board
        panel.webview.html =
            '<html><body style="font:14px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:var(--vscode-foreground,#333)">reopening the board viewer…</body></html>';
        void this.doRefresh();
    }
    /**
     * Read build/serve/viewer.html and probe-inject it, with its mtime.
     * Null when the file is missing or unreadable (logged, never thrown).
     */
    async readDiskViewer(folder) {
        const selected = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        const htmlName = (0, boardFile_js_2.listBoardFiles)(folder).length > 1 && selected
            ? `${node_path_1.default.basename(selected, '.kicad_pcb')}.html`
            : 'viewer.html';
        const htmlPath = node_path_1.default.join(folder, 'build', 'serve', htmlName);
        if (!node_fs_1.default.existsSync(htmlPath))
            return null;
        // the disk page renders some board revision — stamp it with the CURRENT
        // board's identity only when the page is actually newer than the board
        // (the restore fast path's own freshness rule); a stale page keeps no
        // stamp and its applies read as unstamped
        const boardForStamp = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        const stamp = boardForStamp && (0, boardFile_js_2.mtimeOf)(htmlPath) > (0, boardFile_js_2.mtimeOf)(boardForStamp) ? (0, boardFile_js_2.boardIdentity)(boardForStamp) || undefined : undefined;
        try {
            const raw = node_fs_1.default.readFileSync(htmlPath, 'utf8');
            const [components, nets] = await Promise.all([
                this.service.components(),
                this.service.netSources().catch(() => []),
            ]);
            if (stamp)
                this.rememberRender(stamp, components);
            const { html } = (0, probeClient_js_1.injectProbeClient)(raw, components, nets, stamp);
            return { html, diskMtimeMs: (0, boardFile_js_2.mtimeOf)(htmlPath) };
        }
        catch (err) {
            this.output.appendLine(`viewer page read failed: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }
    /**
     * Adopt a newer on-disk viewer page into the in-memory cache. The cached
     * page outlives the toolchain that generated it: a viewer update (or an
     * out-of-band `gerber-viewer` run) rewrites build/serve/viewer.html
     * without touching the board, and a live panel keyed on the board's mtime
     * would keep serving the pre-update page until the board next changes.
     * Same freshness rule as restorePanel's fast path (page newer than the
     * board = current revision), plus newer than what this panel already
     * serves. No export pipeline — read + probe-inject only.
     */
    async adoptNewerDiskViewer(folder) {
        // mid-pipeline the page on disk can be half-written — only adopt pages
        // that finished landing
        if (this.generating)
            return false;
        if (!this.generated)
            return false;
        const board = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        if (!board)
            return false;
        const page = await this.readDiskViewer(folder);
        if (!page)
            return false;
        // a page older than the board describes the previous revision
        if (page.diskMtimeMs <= (0, boardFile_js_2.mtimeOf)(board))
            return false;
        if (page.diskMtimeMs <= this.generated.diskMtimeMs)
            return false;
        // nor one older than the generator bits (workspace-linked toolchains
        // change without a version bump — restorePanel's staleness rule)
        const adoptGenMtime = (0, boardFile_js_2.projectToolchainGeneratorMtime)(folder);
        if (adoptGenMtime !== null && page.diskMtimeMs < adoptGenMtime)
            return false;
        this.generated = { html: page.html, boardId: (0, boardFile_js_2.boardIdentity)(board), diskMtimeMs: page.diskMtimeMs };
        this.output.appendLine('viewer page on disk is newer than the served one — adopted it');
        return true;
    }
    /** Assign the generated page and watch for the client announcing itself. */
    assignHtml() {
        this.readySeen = false;
        // track the assigned string ourselves: reading webview.html back is not
        // guaranteed to round-trip, and show()'s "needs reassign" check keys on it
        this.assignedHtml = this.generated.html;
        // the page's generation stamp — with three caches (VS Code's installed
        // workspace-extension copy, this panel's in-memory html, the retained
        // webview page) between a rebuild and what renders, the output channel
        // must be able to say WHICH build actually loaded
        const build = /<meta name="tc-viewer-build" content="([^"]*)"/.exec(this.assignedHtml);
        this.output.appendLine(`viewer page assigned (build ${build ? build[1] : 'unknown — pre-stamp page'})`);
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
        // 1.5s debounce: kicad-cli writes the board truncate-then-write and VS
        // Code watchers fire loosely on Windows (anything touching the
        // workspace) — wait for the writes and events to settle
        this.timers.arm('debounce', 1_500, () => {
            void this.doRefresh();
        });
    }
    /** One delayed re-run of show() — the board was too fresh to render. */
    armShowRetry(delayMs) {
        this.timers.arm('show', delayMs, () => {
            void this.show();
        });
    }
    /** Re-check after a skipped/failed/stale refresh; default 10s, overridable. */
    armRetry(delayMs = 10_000, force = false) {
        this.timers.arm('retry', delayMs, () => {
            void this.doRefresh(force);
        });
    }
    /**
     * Retry after a FAILED generate, with exponential backoff: a persistent
     * error (a board state our exporter chokes on) retried every 4s would
     * spin forever — each round re-runs the ~30s export pipeline and its
     * kicad-cli board resave, which fires every watcher in the workspace
     * (including a running `import --watch`), amplifying into a storm.
     * 30s → 60s → 5min cap; a successful generate resets the ladder.
     */
    armFailureRetry(boardId) {
        this.consecutiveFailures++;
        this.lastFailedBoardId = boardId;
        const delay = this.consecutiveFailures <= 1 ? 30_000 : this.consecutiveFailures === 2 ? 60_000 : 300_000;
        this.output.appendLine(`render failed (${this.consecutiveFailures} in a row) — retrying in ${delay / 1000}s; ` +
            `a real board change retries immediately`);
        this.armRetry(delay, true);
    }
    clearFailureLadder() {
        this.consecutiveFailures = 0;
        this.lastFailedBoardId = undefined;
    }
    /** Show a notice in the viewer's lower-left status text (no-op w/o panel). */
    postStatus(text) {
        if (!this.panel)
            return;
        void this.panel.webview.postMessage({ type: 'typecad/status', text });
    }
    /** Answer the page's apply callback — error undefined means success. */
    postLayoutStatus(error) {
        if (!this.panel)
            return;
        void this.panel.webview.postMessage({ type: 'typecad/layout-status', error });
    }
    /** Hand a picked (or canceled) PNG back to the page's ghost-preview hook. */
    postImagePicked(message) {
        if (!this.panel)
            return;
        void this.panel.webview.postMessage(message);
    }
    async doRefresh(force = false) {
        if (!this.panel)
            return;
        if (!this.panel.visible || (0, syncState_js_1.pipelineBusy)()) {
            // hidden, or an apply owns the pipeline: retainContextWhenHidden keeps
            // the panel (and this refresh path) alive while unseen, and an apply
            // runs its own build → render lifecycle — a watcher render racing it
            // paints a page the apply's own pipeline replaces seconds later (seen
            // live as one click running the pipeline three times). Defer to the
            // apply's completion (replayOwedRefresh) or the tab being shown.
            this.refreshOwed = true;
            this.refreshOwedForce = this.refreshOwedForce || force;
            return;
        }
        // past the gate: this refresh supersedes any deferred one (a stale
        // replay later would only re-check an up-to-date view)
        force = force || this.refreshOwedForce;
        this.refreshOwed = false;
        this.refreshOwedForce = false;
        const folder = this.hwFolder();
        if (!folder)
            return;
        // watcher events are cheap and sometimes spurious (Windows fires
        // onChange loosely); the board's mtime against the last render decides
        // whether any work is warranted at all
        const board = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        // A previous generate failed against THIS exact board revision: a
        // watcher event alone (the export pipeline touching build/) must not
        // re-run the failing export — only a genuinely new board does, or the
        // ladder's own scheduled retry.
        if (!force && board && this.lastFailedBoardId === (0, boardFile_js_2.boardIdentity)(board)) {
            return;
        }
        if (board && this.generated && (0, boardFile_js_2.boardIdentity)(board) === this.generated.boardId) {
            // board unchanged — still pick up a newer on-disk viewer page (a
            // viewer-tooling update regenerated it without touching the board)…
            const adopted = await this.adoptNewerDiskViewer(folder);
            // …and land any render the panel has not been shown yet. The apply
            // pipeline defers watcher refreshes while it owns the pipeline and
            // replays them here; its own generate() produces HTML without
            // assigning (assignment is this panel's job, not generate's), so
            // without this the panel keeps the PRE-apply page and the next
            // apply is refused against a stale board stamp (seen live: a
            // trace-delete rendered "viewer ready" but never assigned).
            if (this.panel && this.assignedHtml !== this.generated.html) {
                this.output.appendLine(adopted ? 'viewer page updated — reloading' : 'viewer page was rendered but never shown — loading it');
                this.loadToken++;
                this.assignHtml();
            }
            return;
        }
        // The re-render takes ~20s (gerber export incl. the zone refill); the
        // page keeps showing the old board meanwhile, so say so in its status
        // text — the reload when the new HTML lands resets the element
        this.postStatus('board changed — generating new render…');
        let generated = false;
        let failed = false;
        try {
            generated = await this.generate(folder);
        }
        catch (err) {
            failed = true;
            this.output.appendLine(`viewer refresh failed: ${err instanceof Error ? err.message : String(err)}`);
            this.postStatus('render failed — see the typeCAD/pcb output channel');
        }
        if (failed) {
            // A THROWN generate is a real error, not a settle race: back off
            // exponentially so a persistent failure cannot storm the workspace
            // (each retry re-runs the export pipeline, whose kicad-cli board
            // resave re-fires every watcher, including `import --watch`).
            const boardNow = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
            this.armFailureRetry(boardNow ? (0, boardFile_js_2.boardIdentity)(boardNow) : undefined);
            return;
        }
        if (!generated) {
            this.postStatus('board is mid-build — waiting for it to settle…');
            // mid-build skip or failure: the board's final write may coalesce into
            // the in-flight generate (or never fire) — re-check soon (the board
            // might just need 3s to settle)
            this.armRetry(4_000);
            return;
        }
        this.clearFailureLadder();
        // the export takes ~25-30s; the board may have been written again while
        // it ran. BUT kicad-cli itself creates/removes a project .lck file and
        // touches the build directory during the export — the resulting watcher
        // event is self-inflicted, not a real board change. Only re-render when
        // the mtime genuinely moved AND stays moved on a re-check 5s later
        // (rides out kicad-cli's cleanup churn).
        const boardNow = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        if (boardNow && (0, boardFile_js_2.boardIdentity)(boardNow) !== this.generated.boardId) {
            const staleId = (0, boardFile_js_2.boardIdentity)(boardNow);
            this.timers.arm('retry', 5_000, () => {
                const settled = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
                if (!settled || (0, boardFile_js_2.boardIdentity)(settled) === staleId) {
                    // board quiet at the new mtime — render the new revision
                    void this.doRefresh();
                }
                // if the board changed again, the new watcher event's debounce plus
                // doRefresh's own gates handle it
            });
            this.output.appendLine(`board changed during export (${this.generated.boardId} → ${(0, boardFile_js_2.boardIdentity)(boardNow)}) — re-checking in 5s`);
            return;
        }
        this.timers.cancel('retry');
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
    boardId(folder) {
        const board = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        return board ? (0, boardFile_js_2.boardIdentity)(board) : '';
    }
    rememberRender(boardId, components) {
        if (!boardId)
            return;
        this.renderedParts.delete(boardId);
        this.renderedParts.set(boardId, new Map(components.map((c) => [c.reference, { x: c.at.x, y: c.at.y, rot: c.at.rotation, side: c.side }])));
        while (this.renderedParts.size > 4) {
            const oldest = this.renderedParts.keys().next().value;
            if (oldest === undefined)
                break;
            this.renderedParts.delete(oldest);
        }
    }
    /**
     * May an apply stamped against a superseded render go ahead anyway? Yes —
     * when every part its edits touch sits EXACTLY where that render showed it
     * on the board now on disk (same position, rotation, side). The edits are
     * deltas on those parts' source placements, so they mean the same thing
     * they meant in the view; whatever rebuilt the board (an auto-build after
     * an unrelated source edit, an earlier apply, an absorbed import) changed
     * other things. If any touched part moved, vanished, or the old render is
     * unknown, the edits describe a board that no longer exists: refuse.
     */
    async rebaseCheck(stamp, refs) {
        const then = this.renderedParts.get(stamp);
        if (!then)
            return { ok: false, reason: 'the view this edit was made on is no longer known' };
        if (refs.length === 0)
            return { ok: false, reason: 'nothing part-relative to rebase' };
        this.service.invalidate();
        let now;
        try {
            now = await this.service.components();
        }
        catch (err) {
            return { ok: false, reason: `could not read the rebuilt board: ${err instanceof Error ? err.message : String(err)}` };
        }
        const byRef = new Map(now.map((c) => [c.reference, c]));
        for (const ref of refs) {
            const a = then.get(ref);
            const b = byRef.get(ref);
            if (!a)
                return { ok: false, reason: `${ref} was not on the view this edit was made on` };
            if (!b)
                return { ok: false, reason: `${ref} is gone from the rebuilt board` };
            const rotDiff = Math.abs((((a.rot - b.at.rotation) % 360) + 540) % 360 - 180);
            if (Math.abs(a.x - b.at.x) > 0.005 ||
                Math.abs(a.y - b.at.y) > 0.005 ||
                rotDiff > 0.01 ||
                a.side !== b.side) {
                return { ok: false, reason: `${ref} moved in the rebuild` };
            }
        }
        return { ok: true };
    }
    /** The check-sync oracle's answer for the page banner, or null when the
     *  check is unavailable (best-effort — a failed check never blocks the
     *  viewer, it only costs the banner). */
    async runCheckSync(folder) {
        try {
            const out = await this.run(folder, 'npx typecad-pcb check-sync --json', viewerApply_js_1.GENERATE_TIMEOUT_MS);
            const info = JSON.parse(out.slice(out.indexOf('{')));
            return info && typeof info.count === 'number' ? { count: info.count, changes: info.changes ?? [] } : null;
        }
        catch {
            this.output.appendLine('sync: check-sync unavailable — no drift banner');
            return null;
        }
    }
    /**
     * Classify a detected drift. The ts source is the single source of truth
     * and the .kicad_pcb is a build artifact — but maintenance is SILENT now:
     * the render path absorbs out-of-band board edits into source
     * automatically (absorbBoardSide — the canonical regeneration, exactly
     * the "apply & rebuild takes the board side" reconcile), so the
     * classifications mean: 'transient' resolves itself via the pending
     * build; 'external' is absorbed (the banner only appears when
     * absorption fails); 'bug' (equally-aged drift — the build does not
     * reproduce source) still banners, because nothing can auto-fix a
     * build bug.
     */
    classifyDrift(folder, board, drift) {
        const boardMtime = (0, boardFile_js_2.mtimeOf)(board);
        if ((0, boardFile_js_2.newestSourceMtime)(folder) > boardMtime) {
            // sources moved on — the pending build regenerates the board from
            // them; transient by construction
            this.output.appendLine(`sync: ${drift.count} difference(s) with newer sources — the pending build resolves them`);
            return 'transient';
        }
        // The build signs its output (sha256 in .typecad-board.json). A board
        // that still matches is the build's OWN output: the mtime test below
        // would call it 'external' (every build leaves the board newer than
        // every source), absorb it, rewrite source, auto-build a new board with
        // a new mtime, and absorb again — the endless rebuild loop. Drift on
        // our own output means the build does not reproduce source: a bug.
        const own = (0, boardFile_js_2.boardIsBuildOutput)(board);
        if (own === true) {
            this.output.appendLine(`sync: ${drift.count} difference(s) on the build's own output — the build does not reproduce this board from source (please report); not absorbing`);
            (0, syncState_js_1.setSyncPaused)(`the build does not reproduce this board from source (${drift.count} difference${drift.count === 1 ? '' : 's'})`);
            return 'bug';
        }
        if (boardMtime > (0, boardFile_js_2.newestSourceMtime)(folder)) {
            // the board was written after every source and does not follow from
            // them — someone edited the artifact out-of-band (KiCad without the
            // sync watcher). The watcher is THE import path; the next build
            // overwrites the edit.
            this.output.appendLine(`sync: ${drift.count} difference(s) — the board changed outside the build (KiCad?); start typeCAD: KiCad Sync to import them, or the next build overwrites`);
            return 'external';
        }
        this.output.appendLine(`sync: ${drift.count} difference(s) with no source or board newer than the other — the build does not reproduce this board from source (please report)`);
        (0, syncState_js_1.setSyncPaused)(`the build does not reproduce this board from source (${drift.count} difference${drift.count === 1 ? '' : 's'})`);
        return 'bug';
    }
    /**
     * Silent maintenance for out-of-band board drift: regenerate source from
     * the board through the importer's canonical write (byte-identical to
     * what kicad2typecad emits — zero drift by construction), then re-check.
     * True when the tree ended up in sync (no banner); false leaves the
     * banner as the fallback. Never runs while an apply owns the pipeline —
     * the caller checks — which is the race that killed the old render-path
     * reconcile (it absorbed mid-apply and reverted the apply's own work).
     */
    async absorbBoardSide(folder, board, drift) {
        // a running KiCad sync (or any other import process) owns board→source
        // import for this project: it will take this very edit, and a second
        // importer would be refused by the project lock anyway — burning this
        // revision's one attempt on a no-op and flashing a banner for drift the
        // terminal is about to resolve. Its source write auto-builds, and that
        // board's render re-checks.
        if ((0, boardFile_js_2.importLockHeld)(folder)) {
            this.output.appendLine('sync: a KiCad sync/import process is running — it owns board→source import; not absorbing from the viewer');
            return true;
        }
        const revision = (0, boardFile_js_2.boardContentHash)(board) ?? `mtime:${(0, boardFile_js_2.mtimeOf)(board)}`;
        if (this.absorbedBoardRevisions.has(revision))
            return false;
        const now = Date.now();
        this.absorbHistory = this.absorbHistory.filter((t) => now - t < BoardViewerPanel.ABSORB_WINDOW_MS);
        if (this.absorbHistory.length >= BoardViewerPanel.ABSORB_LIMIT) {
            (0, syncState_js_1.setSyncPaused)(`board→source import is not converging (${this.absorbHistory.length} automatic imports in ${BoardViewerPanel.ABSORB_WINDOW_MS / 60_000} min, board still differs)`);
            this.output.appendLine(`sync: ${this.absorbHistory.length} absorbs in the last ${BoardViewerPanel.ABSORB_WINDOW_MS / 60_000} min and the board still drifts — ` +
                'the source↔board round trip is not converging; stopping auto-absorb (the banner stays). Please report.');
            return false;
        }
        this.absorbedBoardRevisions.add(revision);
        this.absorbHistory.push(now);
        this.output.appendLine(`sync: absorbing ${drift.count} out-of-band board difference(s) into source (canonical regeneration)…`);
        // Take the pipeline for the whole absorb: the import rewrites source, and
        // the watcher's auto-build (and any watcher-driven render) must neither
        // race those writes nor double-build. Held across the verifying
        // check-sync; the source watcher's debounced auto-build re-checks as
        // soon as it is released and builds the absorbed source once.
        syncState_js_1.sync.absorbing = true;
        try {
            try {
                await this.run(folder, `npx typecad-pcb import ${shellQuote(board)} --apply --auto`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
            }
            catch (err) {
                this.output.appendLine(`sync: absorption failed: ${err instanceof Error ? err.message : String(err)} — the banner stays`);
                return false;
            }
            const after = await this.runCheckSync(folder);
            if (after && after.count > 0) {
                this.output.appendLine(`sync: ${after.count} difference(s) remain after regeneration — the banner stays`);
                return false;
            }
        }
        finally {
            syncState_js_1.sync.absorbing = false;
        }
        this.output.appendLine('sync: source regenerated from the board — in sync');
        // the source watcher's auto-build refreshes the board from the absorbed
        // source (identical content by construction) — no loop: the next
        // check-sync reads clean
        return true;
    }
    /** The board the panel currently shows (undefined = the active board). */
    get boardStem() {
        return this.selectedBoardStem;
    }
    /**
     * Replay a refresh the apply pipeline deferred (a watcher render that
     * arrived while the apply owned the pipeline). Debounced through
     * refreshIfVisible so a concurrent board event's own refresh coalesces
     * with it. Called from the apply bridge's completion.
     */
    async replayOwedRefresh() {
        if (!this.refreshOwed)
            return;
        this.refreshOwed = false;
        const force = this.refreshOwedForce;
        this.refreshOwedForce = false;
        if (force)
            await this.doRefresh(true);
        else
            await this.refreshIfVisible();
    }
    /** The boards the project's manifest lists, as picker entries (stem +
     *  file). Empty when the build has produced nothing yet. */
    boardChoices() {
        const folder = this.hwFolder();
        if (!folder)
            return [];
        return (0, boardFile_js_2.listBoardFiles)(folder).map((f) => ({ stem: node_path_1.default.basename(f, '.kicad_pcb'), file: f }));
    }
    /** Switch the panel to a board stem (undefined = the manifest's active
     *  board) and regenerate. */
    async switchBoard(stem) {
        if (this.selectedBoardStem === stem)
            return;
        this.selectedBoardStem = stem;
        this.service.setBoard(stem);
        this.output.appendLine(stem ? `viewer switched to board '${stem}'` : 'viewer switched to the active board');
        await this.doRefresh(true);
    }
    async generate(folder) {
        if (this.generating)
            return this.generating;
        this.generating = (async () => {
            const board = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
            if (!board)
                throw new Error(this.selectedBoardStem
                    ? `no board '${this.selectedBoardStem}' in build/ — run npm run build first`
                    : 'no .kicad_pcb in build/ — run npm run build first');
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
            const boardName = node_path_1.default.basename(board, '.kicad_pcb');
            // The identity of the board THIS render describes, taken before the
            // render starts: stamped on the page and keyed in the cache. Taken
            // after, a board rewritten mid-render would be stamped onto a page
            // that predates it — and the 'changed during export' check could
            // never fire.
            const renderedBoardId = (0, boardFile_js_2.boardIdentity)(board);
            // The drift oracle is independent of the export: it reads the settled
            // board + sources, and the native export never rewrites the board file
            // (zone fills are plotted from a temp copy), so there is nothing to
            // race — run it THROUGH the whole render and splice its banner in at
            // the end instead of paying its runtime after the page exists.
            const driftPromise = this.runCheckSync(folder);
            // The ngspice solve and the pcba/blueprint/schematic renders are NOT
            // paid here anymore: the page ships with lazy placeholders and solves
            // each on FIRST SWITCH through the typecad/view-part bridge (the
            // spinner names what is being calculated). The layout/gerber default
            // view — what every board change actually renders for — is the whole
            // eager cost now.
            // per-board fab dirs once the project is multi-board — the same rule
            // `export gerbers` uses, so the viewer reads exactly what the export
            // wrote (a shared dir would have each board's prune deleting its
            // sibling's inner layers)
            const multiBoard = (0, boardFile_js_2.listBoardFiles)(folder).length > 1;
            const gerbersDir = multiBoard ? node_path_1.default.join('build', 'gerbers', boardName) : node_path_1.default.join('build', 'gerbers');
            // one page per board: the pending-edit and settings keys derive from
            // the page path/title, so each board keeps its own session state
            const outPath = multiBoard ? node_path_1.default.join('build', 'serve', `${boardName}.html`) : node_path_1.default.join('build', 'serve', 'viewer.html');
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
            // embedding it paints stale violation markers at the PRE-move
            // positions. DRC runs on request now (the palette's typeCAD: DRC),
            // so nothing refreshes the report automatically: WITHHOLD a stale
            // one (no markers) and say so in the output channel; a fresh report
            // — the one the user just asked for — embeds as before.
            const drcRel = node_path_1.default.join('build', `${boardName}_drc.json`);
            if (node_fs_1.default.existsSync(node_path_1.default.join(folder, drcRel))) {
                if ((0, boardFile_js_2.mtimeOf)(node_path_1.default.join(folder, drcRel)) < (0, boardFile_js_2.mtimeOf)(board)) {
                    this.output.appendLine('drc report predates the board — markers withheld (run typeCAD: DRC against this revision)');
                }
                else {
                    flags.push('--drc', shellQuote(drcRel));
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
            // The render pipeline: `typecad-pcb viewer` does gerbers + drill +
            // page in ONE process when the toolchain has the command (no npx
            // startup between steps — and its native gerbers export already
            // writes the drill). Toolchains without it fall back to the
            // step-by-step chain for the rest of this session.
            if (this.viewerCommandUnavailable) {
                this.output.appendLine('exporting gerbers…');
                // explicit board path: build/ can hold stray .kicad_pcb files (fp
                // upgrade tests, imports) and the CLI refuses an ambiguous export
                await this.run(folder, `npx typecad-pcb export gerbers "${board}"`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
                await this.run(folder, `npx typecad-pcb export drill "${board}"`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
                this.output.appendLine('building viewer HTML…');
                await this.run(folder, `npx gerber-viewer ${shellQuote(gerbersDir)} -o ${shellQuote(outPath)} ${flags.join(' ')}`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
            }
            else {
                this.output.appendLine('rendering viewer (one-pass pipeline)…');
                try {
                    await this.run(folder, 
                    // --lazy-views: the pcba/blueprint/schematic renders (and the
                    // ngspice solve) happen on first switch, not on every board
                    // change — the typecad/view-part bridge serves them
                    `npx typecad-pcb viewer ${shellQuote(board)} -o ${shellQuote(outPath)} ${flags.join(' ')} --lazy-views`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
                }
                catch (err) {
                    if (err instanceof Error && /Unknown command ['"]viewer/.test(err.message)) {
                        this.viewerCommandUnavailable = true;
                        this.output.appendLine("the installed typecad-pcb has no 'viewer' command — falling back to the step-by-step pipeline for this session");
                        this.output.appendLine('exporting gerbers…');
                        await this.run(folder, `npx typecad-pcb export gerbers "${board}"`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
                        await this.run(folder, `npx typecad-pcb export drill "${board}"`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
                        this.output.appendLine('building viewer HTML…');
                        await this.run(folder, `npx gerber-viewer ${shellQuote(gerbersDir)} -o ${shellQuote(outPath)} ${flags.join(' ')}`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
                    }
                    else {
                        throw err;
                    }
                }
            }
            const raw = node_fs_1.default.readFileSync(node_path_1.default.join(folder, outPath), 'utf8');
            const [components, nets] = await Promise.all([
                this.service.components(),
                // net sources are decorative metadata — a failed query must not
                // take the viewer down with it
                this.service.netSources().catch(() => []),
            ]);
            this.rememberRender(renderedBoardId, components);
            const { html, injected } = (0, probeClient_js_1.injectProbeClient)(raw, components, nets, renderedBoardId);
            // Board vs source drift: the ts source is the single source of truth,
            // the .kicad_pcb a build artifact. Drift means one of two things — the
            // artifact changed out-of-band (KiCad without the sync watcher), which
            // absorbBoardSide writes back into source, or the build is not
            // reproducing source (a bug), which only banners. classifyDrift says
            // which, using the build's content signature so the build's own output
            // can never be mistaken for an external edit (that was a rebuild loop).
            let withDrift = html;
            const drift = await driftPromise;
            // a render that finds board and source in sync ends any paused state
            // (the oracle's answer is only trusted when it ran)
            if (drift && drift.count === 0)
                (0, syncState_js_1.setSyncPaused)(null);
            if (drift && drift.count > 0) {
                if ((0, syncState_js_1.pipelineBusy)()) {
                    // an apply owns the pipeline right now — its own build is in
                    // flight or just landed; this render's snapshot of mtimes says
                    // nothing yet. Log and move on: the apply's final render
                    // classifies against the settled state.
                    this.output.appendLine(`sync: ${drift.count} difference(s) while an apply runs — deferring to the settled state`);
                }
                else {
                    const cls = this.classifyDrift(folder, board, drift);
                    // external drift maintains itself: absorb into source silently;
                    // the banner is only the fallback when absorption fails
                    const bannerWorthy = cls !== 'transient' && !(cls === 'external' && (await this.absorbBoardSide(folder, board, drift)));
                    if (bannerWorthy) {
                        const payload = JSON.stringify({ count: drift.count, items: drift.changes.slice(0, 12) }).replace(/</g, '\u003c');
                        withDrift = html.replace('<head>', `<head><script>window.__typecadDrift = ${payload};</script>`);
                    }
                }
            }
            if (!injected) {
                this.output.appendLine('warning: viewer HTML had no <head>/</body> anchors — cross-probe disabled');
            }
            this.generated = { html: withDrift, boardId: renderedBoardId, diskMtimeMs: (0, boardFile_js_2.mtimeOf)(node_path_1.default.join(folder, outPath)) };
            this.output.appendLine(`viewer ready: ${components.length} component outline(s), board ${this.generated.boardId}, cross-probe ${injected ? 'on' : 'off'}`);
            return true;
        })().finally(() => {
            this.generating = null;
        });
        return this.generating;
    }
    /**
     * The lazy views' on-demand channel: the page's first switch to a
     * deferred view (or the ngspice/thermal view's first need for solved
     * data) asks for a part here. 'net-op' runs the ngspice solve (the old
     * eager chain did this on EVERY render; now only when the data is
     * actually looked at) and answers with the op JSON; a view part runs the
     * viewer CLI's --view-part mode and answers with the mountable fragment
     * it left in build/serve/. The page shows its spinner naming the work
     * the whole time. Errors answer as errors — the page surfaces them and
     * keeps the default view.
     */
    async serveViewPart(part) {
        if (!this.panel)
            return;
        const folder = this.hwFolder();
        if (!folder) {
            void this.panel.webview.postMessage({ type: 'typecad/view-part', part, error: 'no hardware folder' });
            return;
        }
        const board = (0, boardFile_js_2.newestBoardFile)(folder, this.selectedBoardStem);
        if (!board) {
            void this.panel.webview.postMessage({ type: 'typecad/view-part', part, error: 'no board file' });
            return;
        }
        const boardName = node_path_1.default.basename(board, '.kicad_pcb');
        try {
            if (part === 'net-op') {
                const netlistFile = node_path_1.default.join(folder, 'build', `${boardName}.net`);
                const opFile = node_path_1.default.join(folder, 'build', `${boardName}_op.json`);
                // solve only when stale (op missing or older than the netlist) —
                // the page caches after the first switch, so this runs once per
                // real netlist change, not once per render
                if (node_fs_1.default.existsSync(netlistFile) && (!node_fs_1.default.existsSync(opFile) || (0, boardFile_js_2.mtimeOf)(opFile) < (0, boardFile_js_2.mtimeOf)(netlistFile))) {
                    this.output.appendLine('solving ngspice operating point (first view switch)…');
                    try {
                        await this.run(folder, 'npx typecad-pcb simulate', viewerApply_js_1.GENERATE_TIMEOUT_MS);
                    }
                    catch (error) {
                        if (!node_fs_1.default.existsSync(opFile)) {
                            this.output.appendLine(`op solve failed: ${error instanceof Error ? error.message : String(error)}`);
                            throw new Error('ngspice solve failed — is ngspice installed?');
                        }
                    }
                }
                if (!node_fs_1.default.existsSync(opFile))
                    throw new Error('no solved operating point (run typeCAD: Simulate)');
                const op = JSON.parse(node_fs_1.default.readFileSync(opFile, 'utf8'));
                void this.panel.webview.postMessage({ type: 'typecad/view-part', part, op });
                return;
            }
            const multiBoard = (0, boardFile_js_2.listBoardFiles)(folder).length > 1;
            const outPath = multiBoard ? node_path_1.default.join('build', 'serve', `${boardName}.html`) : node_path_1.default.join('build', 'serve', 'viewer.html');
            await this.run(folder, `npx typecad-pcb viewer ${shellQuote(board)} -o ${shellQuote(outPath)} --view-part ${part} --json`, viewerApply_js_1.GENERATE_TIMEOUT_MS);
            const fragPath = node_path_1.default.join(folder, 'build', 'serve', `view-${part}.html`);
            if (!node_fs_1.default.existsSync(fragPath))
                throw new Error('the view-part run wrote no fragment');
            const html = node_fs_1.default.readFileSync(fragPath, 'utf8');
            void this.panel.webview.postMessage({ type: 'typecad/view-part', part, html });
        }
        catch (error) {
            this.output.appendLine(`view part ${part} failed: ${error instanceof Error ? error.message : String(error)}`);
            void this.panel.webview.postMessage({
                type: 'typecad/view-part',
                part,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    async onMessage(message) {
        if (message.type === 'typecad/layout-rebuild') {
            await this.applyBridge.onLayoutRebuild(message);
            return;
        }
        if (message.type === 'typecad/layout-refresh') {
            // the revert dialog's OK: adopt any newer on-disk page, then
            // re-assign — the webview reloads to the board as the source renders
            // it, and every session edit dies with the old page
            const folder = this.hwFolder();
            if (folder)
                await this.adoptNewerDiskViewer(folder);
            if (this.generated && this.panel)
                this.assignHtml();
            return;
        }
        if (message.type === 'typecad/pick-image') {
            if (this.panel)
                await this.applyBridge.onPickImage();
            return;
        }
        if (message.type === 'typecad/view-part') {
            await this.serveViewPart(message.part);
            return;
        }
        if (message.type === 'typecad/report') {
            // page-side self-diagnostics (render health where DOM probes can't
            // reach) — logged verbatim so a support session can read what the
            // renderer actually did from the output channel
            this.output.appendLine(`page report: ${JSON.stringify(message.data ?? message)}`);
            return;
        }
        if (message.type === 'typecad/ready') {
            this.readySeen = true;
            this.output.appendLine('viewer page ready');
            // boot diagnostics: a proto mismatch means the page's client is not
            // the one this host injects; a missing viewer API means the page was
            // generated by an OLDER toolchain — its gestures are dead clicks
            if (message.proto !== undefined && message.proto !== probeClient_js_1.PROBE_PROTO) {
                this.output.appendLine(`viewer page's probe client is protocol ${message.proto}, host expects ${probeClient_js_1.PROBE_PROTO} — regenerate the page (typeCAD: View Board)`);
            }
            if (message.page && !message.page.viewer) {
                this.output.appendLine('viewer page has no typecadViewer API — the page predates the installed toolchain; regenerate it (typeCAD: View Board) to pick up its interactions');
            }
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
        if (message.type === 'typecad/probe-zone') {
            // zone navigation: the selected pour's points bbox-match the
            // zone({...}) literal that authored it (net breaks coincident ties)
            this.output.appendLine(`probe: zone ${message.zone.net ?? '?'} → source`);
            const folder = this.hwFolder();
            if (!folder)
                return;
            const srcUris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, 'src/**/*.ts'));
            const files = [];
            for (const uri of srcUris) {
                files.push({ uri: uri.fsPath, text: (await vscode.workspace.openTextDocument(uri)).getText() });
            }
            const hit = (0, zoneSource_js_1.resolveZoneSource)(message.zone, files);
            if (!hit) {
                vscode.window.setStatusBarMessage(`zone ${message.zone.net ?? '(no net)'}: no zone({...}) literal matches its outline — is the build current?`, 5000);
                return;
            }
            this.output.appendLine(`probe: zone ${message.zone.net ?? '?'} → ${hit.detail} @ ${hit.line}`);
            await this.revealLocation({ fsPath: hit.uri, line: hit.line });
            return;
        }
        if (message.type === 'typecad/probe-net') {
            // trace navigation, most specific first:
            //   1. selected segment → the TrackBuilder `.to()` that DREW it
            //   2. the net's `typecad.named('…')` declaration
            //   3. the recorded route/net source (routes island)
            this.output.appendLine(`probe: net ${message.net} → source`);
            const folder = this.hwFolder();
            if (!folder)
                return;
            const srcUris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, 'src/**/*.ts'));
            const files = [];
            for (const uri of srcUris) {
                files.push({ uri: uri.fsPath, text: (await vscode.workspace.openTextDocument(uri)).getText() });
            }
            // 1. segment geometry → chain edge
            for (const seg of message.segs ?? []) {
                const hit = (0, netSegmentSource_js_1.resolveSegmentSource)(seg, files);
                if (!hit)
                    continue;
                this.output.appendLine(`probe: net ${message.net} segment → ${hit.detail} @ ${hit.line}`);
                await this.revealLocation({ fsPath: hit.uri, line: hit.line });
                return;
            }
            // 2. net declaration
            const decl = (0, netSegmentSource_js_1.resolveNetDeclaration)(message.net, files);
            if (decl) {
                this.output.appendLine(`probe: net ${message.net} → ${decl.detail} @ ${decl.line}`);
                await this.revealLocation({ fsPath: decl.uri, line: decl.line });
                return;
            }
            // 3. recorded source (route call preferred over the net's own)
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
/** At most this many absorbs inside ABSORB_WINDOW_MS; more means the
 *  source↔board round trip is not converging (a transform that drifts a
 *  little every pass), so stop and banner instead of rebuilding forever. */
BoardViewerPanel.ABSORB_LIMIT = 2;
BoardViewerPanel.ABSORB_WINDOW_MS = 5 * 60_000;
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