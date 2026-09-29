// ---------------------------------------------------------------------------
// BoardViewerPanel — the gerber-viewer running in a vscode webview, with
// cross-probing in both directions.
//
// Generation pipeline (one shot per board change):
//   typecad-pcb simulate (best-effort: ngspice op data, stale-only) →
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

import * as vscode from 'vscode';
import fs from 'node:fs';
import path from 'node:path';
import { injectProbeClient, type LabelEdit, type LayoutTextEdit, type ProbeHostMessage, type ProbeWebviewMessage } from './probeClient.js';
import { backupRootLabel, writeBackup } from './sourceBackup.js';
import { planLayoutApply } from './layoutApply.js';
import type { RouteDeleteInput, RouteInput } from './routeEdits.js';
import { resolveBoardRules, userRulesFromFolder } from './boardRules.js';
import { parseSourceLocation } from './sourceRef.js';
import type { BoardDataService } from './boardData.js';
// discovery helpers live vscode-free in boardFile.ts for unit testing;
// re-exported here for the existing import sites
export { mtimeOf, newestBoardFile, entrySourceFile } from './boardFile.js';
import { mtimeOf, newestBoardFile, entrySourceFile } from './boardFile.js';

export type CommandRunner = (cwd: string, command: string, timeoutMs: number) => Promise<string>;

interface GeneratedViewer {
  html: string;
  /** .kicad_pcb mtime the HTML was generated from — stale when it changes. */
  boardMtimeMs: number;
  /**
   * mtime of build/serve/viewer.html this html came from. A NEWER on-disk
   * page (viewer-tooling update, out-of-band `gerber-viewer` run) rewrites
   * the file without touching the board, so the board-mtime cache key alone
   * would keep serving the pre-update page; adoption compares against this.
   */
  diskMtimeMs: number;
}

const GENERATE_TIMEOUT_MS = 120_000;
/** A selection is re-posted until the viewer page acks it (or this times out). */
const DELIVERY_TIMEOUT_MS = 5_000;
const DELIVERY_INTERVAL_MS = 200;

/** Double-quote a path for an `exec` shell line; embedded quotes are escaped. */
export function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * First syntax error in planned source text, or null. Best-effort: the
 * TypeScript compiler resolves in workspace installs; a bundled extension
 * copy without it returns null (no gate) instead of breaking the apply.
 */
function plannedTextSyntaxError(text: string): string | null {
  let tsModule: typeof import('typescript') | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tsModule = require('typescript') as typeof import('typescript');
  } catch {
    return null;
  }
  try {
    const { diagnostics } = tsModule.transpileModule(text, {
      reportDiagnostics: true,
      compilerOptions: { target: tsModule.ScriptTarget.ES2022 },
    });
    const first = (diagnostics ?? []).find((d) => d.category === tsModule!.DiagnosticCategory.Error);
    return first ? tsModule.flattenDiagnosticMessageText(first.messageText, ' ') : null;
  } catch {
    return null;
  }
}

/** The host message for a pending selection id — "net:<name>" selects a net. */
function selectionMessage(ref: string, token: number | undefined): ProbeHostMessage {
  return ref.startsWith('net:')
    ? { type: 'typecad/select-net', net: ref.slice('net:'.length), token }
    : { type: 'typecad/select', ref, token };
}

export class BoardViewerPanel {
  private panel: vscode.WebviewPanel | undefined;
  private generated: GeneratedViewer | null = null;
  private pendingRef: string | null = null;
  private pendingToken: number | undefined;
  /** Bumped on every html assignment; acks carry it so stale acks are ignored. */
  private loadToken = 0;
  /** The html string last assigned to the webview (undefined = never). */
  private assignedHtml: string | undefined;
  private readySeen = false;
  private refreshTimer: NodeJS.Timeout | undefined;
  /** Re-check after a skipped/failed refresh — the board's final write can
   *  coalesce into an in-flight generate and never fire the watcher again. */
  private retryTimer: NodeJS.Timeout | undefined;
  /** One delayed re-run of show() while the board settles (first open only). */
  private showRetryTimer: NodeJS.Timeout | undefined;
  private generating: Promise<boolean> | null = null;

  constructor(
    private readonly hwFolder: () => string | null,
    private readonly service: BoardDataService,
    private readonly run: CommandRunner,
    private readonly output: vscode.OutputChannel,
  ) {}

  /** Open/reveal the viewer, regenerating the HTML when the board changed. */
  async show(): Promise<void> {
    const folder = this.hwFolder();
    if (!folder) {
      vscode.window.showInformationMessage('typeCAD/pcb: no typeCAD project (typecad.conf.ts) in this workspace.');
      return;
    }
    if (!this.generated || this.generated.boardMtimeMs !== this.boardMtime(folder)) {
      let generated = false;
      try {
        generated = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'typeCAD/pcb: rendering board viewer' },
          () => this.generate(folder),
        );
      } catch (err) {
        this.output.appendLine(`viewer generation failed: ${err instanceof Error ? err.message : String(err)}`);
        void vscode.window
          .showErrorMessage(
            `typeCAD: could not render the board viewer — see the 'typeCAD/pcb' output channel.`,
            'Open Output',
          )
          .then((pick) => {
            if (pick === 'Open Output') this.output.show();
          });
        return;
      }
      if (!generated) {
        // the board was written <3s ago — the build (or a concurrent
        // kicad-cli) may still be writing. An already-open panel hears about
        // the settled board from the watcher; a first open needs this retry,
        // because refreshIfVisible no-ops without a panel
        if (!this.showRetryTimer) {
          vscode.window.showInformationMessage(
            'typeCAD/pcb: board is still being written — the viewer opens when it settles.',
          );
        }
        this.armShowRetry(4_000);
        return;
      }
      if (this.showRetryTimer) {
        clearTimeout(this.showRetryTimer);
        this.showRetryTimer = undefined;
      }
    } else if (this.generated) {
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
    } else if (this.assignedHtml !== this.generated!.html) {
      // Only reassign when the board actually regenerated — html assignment
      // reloads the page.
      this.loadToken++;
      this.assignHtml();
    }
    this.panel?.reveal(undefined, true);
  }

  /** Wire a fresh-or-restored panel into this viewer instance. */
  private bindPanel(panel: vscode.WebviewPanel): void {
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
  async restorePanel(panel: vscode.WebviewPanel): Promise<void> {
    this.bindPanel(panel);
    const folder = this.hwFolder();
    if (!folder) {
      panel.dispose();
      return;
    }
    const board = newestBoardFile(folder);
    // fast path: the on-disk viewer was generated from this exact board
    // revision (the file is newer than the board) — reuse it as-is
    const page = board ? await this.readDiskViewer(folder) : null;
    if (board && page && page.diskMtimeMs > mtimeOf(board)) {
      this.generated = { html: page.html, boardMtimeMs: mtimeOf(board), diskMtimeMs: page.diskMtimeMs };
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
  private async readDiskViewer(folder: string): Promise<{ html: string; diskMtimeMs: number } | null> {
    const htmlPath = path.join(folder, 'build', 'serve', 'viewer.html');
    if (!fs.existsSync(htmlPath)) return null;
    try {
      const raw = fs.readFileSync(htmlPath, 'utf8');
      const [components, nets] = await Promise.all([
        this.service.components(),
        this.service.netSources().catch(() => []),
      ]);
      const { html } = injectProbeClient(raw, components, nets);
      return { html, diskMtimeMs: mtimeOf(htmlPath) };
    } catch (err) {
      this.output.appendLine(
        `viewer page read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
  private async adoptNewerDiskViewer(folder: string): Promise<boolean> {
    // mid-pipeline the page on disk can be half-written — only adopt pages
    // that finished landing
    if (this.generating) return false;
    if (!this.generated) return false;
    const board = newestBoardFile(folder);
    if (!board) return false;
    const page = await this.readDiskViewer(folder);
    if (!page) return false;
    // a page older than the board describes the previous revision
    if (page.diskMtimeMs <= mtimeOf(board)) return false;
    if (page.diskMtimeMs <= this.generated.diskMtimeMs) return false;
    this.generated = { html: page.html, boardMtimeMs: mtimeOf(board), diskMtimeMs: page.diskMtimeMs };
    this.output.appendLine('viewer page on disk is newer than the served one — adopted it');
    return true;
  }

  /** Assign the generated page and watch for the client announcing itself. */
  private assignHtml(): void {
    this.readySeen = false;
    // track the assigned string ourselves: reading webview.html back is not
    // guaranteed to round-trip, and show()'s "needs reassign" check keys on it
    this.assignedHtml = this.generated!.html;
    // the page's generation stamp — with three caches (VS Code's installed
    // workspace-extension copy, this panel's in-memory html, the retained
    // webview page) between a rebuild and what renders, the output channel
    // must be able to say WHICH build actually loaded
    const build = /<meta name="tc-viewer-build" content="([^"]*)"/.exec(this.assignedHtml);
    this.output.appendLine(`viewer page assigned (build ${build ? build[1] : 'unknown — pre-stamp page'})`);
    this.panel!.webview.html = this.assignedHtml;
    setTimeout(() => {
      if (!this.readySeen && this.panel) {
        this.output.appendLine(
          'viewer page: no ready signal — the page scripts are blocked or failed to boot (check for CSP/content errors)',
        );
      }
    }, 4_000);
  }

  /** Reveal the viewer centered on a component reference. */
  async select(ref: string): Promise<void> {
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
  async selectNet(net: string): Promise<void> {
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
  private deliverSelection(): void {
    const ref = this.pendingRef;
    const token = this.pendingToken;
    if (!ref) return;
    const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
    let loggedDrop = false;
    const attempt = (): void => {
      if (this.pendingRef !== ref || this.pendingToken !== token) return; // delivered or superseded
      if (!this.panel) return; // closed
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
      } else {
        this.output.appendLine(`select ${ref}: no ack — the viewer page may be missing the probe client`);
        // a click that does nothing is indistinguishable from a broken
        // command — say so in the window, not just the channel
        vscode.window.setStatusBarMessage('typeCAD/pcb: the Board viewer page did not respond — try reopening it', 5000);
      }
    };
    attempt();
  }

  /** Drop the cached HTML; the next show regenerates from the current board. */
  invalidate(): void {
    this.generated = null;
  }

  /**
   * Regenerate and reload an open panel after a board change (npm run build
   * rewrote build/*.kicad_pcb). No-op when the panel is closed — the next
   * show() regenerates anyway. The reload lands on the fit view; the ready
   * handler re-applies the last selection so a watch-loop build keeps the
   * component you were looking at.
   */
  async refreshIfVisible(): Promise<void> {
    if (!this.panel) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    // 1.5s debounce: kicad-cli writes the board truncate-then-write and VS
    // Code watchers fire loosely on Windows (anything touching the
    // workspace) — wait for the writes and events to settle
    this.refreshTimer = setTimeout(() => {
      void this.doRefresh();
    }, 1_500);
  }

  /** One delayed re-run of show() — the board was too fresh to render. */
  private armShowRetry(delayMs: number): void {
    if (this.showRetryTimer) clearTimeout(this.showRetryTimer);
    this.showRetryTimer = setTimeout(() => {
      this.showRetryTimer = undefined;
      void this.show();
    }, delayMs);
  }

  /** Re-check after a skipped/failed/stale refresh; default 10s, overridable. */
  private armRetry(delayMs = 10_000): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.doRefresh();
    }, delayMs);
  }

  /** Show a notice in the viewer's lower-left status text (no-op w/o panel). */
  private postStatus(text: string): void {
    if (!this.panel) return;
    void this.panel.webview.postMessage({ type: 'typecad/status', text } satisfies ProbeHostMessage);
  }

  private async doRefresh(): Promise<void> {
    if (!this.panel) return;
    const folder = this.hwFolder();
    if (!folder) return;
    // watcher events are cheap and sometimes spurious (Windows fires
    // onChange loosely); the board's mtime against the last render decides
    // whether any work is warranted at all
    const board = newestBoardFile(folder);
    if (board && this.generated && mtimeOf(board) === this.generated.boardMtimeMs) {
      // board unchanged — still pick up a newer on-disk viewer page (a
      // viewer-tooling update regenerated it without touching the board);
      // otherwise this watcher path has nothing to do
      if (!(await this.adoptNewerDiskViewer(folder))) return;
      if (this.panel && this.assignedHtml !== this.generated.html) {
        this.output.appendLine('viewer page updated — reloading');
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
    try {
      generated = await this.generate(folder);
    } catch (err) {
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
    const boardNow = newestBoardFile(folder);
    if (boardNow && mtimeOf(boardNow) !== this.generated!.boardMtimeMs) {
      const staleMtime = mtimeOf(boardNow);
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined;
        const settled = newestBoardFile(folder);
        if (!settled || mtimeOf(settled) === staleMtime) {
          // board quiet at the new mtime — render the new revision
          void this.doRefresh();
        }
        // if the mtime moved again, the new watcher event's debounce plus
        // doRefresh's own gates handle it
      }, 5_000);
      this.output.appendLine(
        `board mtime moved during export (${this.generated!.boardMtimeMs} → ${mtimeOf(boardNow)}) — re-checking in 5s`,
      );
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
    } else {
      // regenerated to identical HTML: no reload happens, so the generating
      // notice must be cleared by hand
      this.postStatus('');
    }
  }

  private boardMtime(folder: string): number {
    const board = newestBoardFile(folder);
    if (!board) return 0;
    return mtimeOf(board);
  }

  /** Generate viewer HTML; resolves false when skipped (board mid-build). */
  private async generate(folder: string): Promise<boolean> {
    if (this.generating) return this.generating;
    this.generating = (async () => {
      const board = newestBoardFile(folder);
      if (!board) throw new Error('no .kicad_pcb in build/ — run npm run build first');

      // The build writes zone declarations without fill geometry; fills are
      // materialized by `export gerbers` (--check-zones) and `check`. The
      // board is "settled" when its mtime has been stable for 3s — before
      // that, the build (or a concurrent kicad-cli run) may still be
      // writing, and an export would race a rewrite.
      const stableFor = Date.now() - fs.statSync(board).mtimeMs;
      if (stableFor < 3_000) {
        this.output.appendLine(`board written ${stableFor}ms ago — waiting for it to settle`);
        return false;
      }

      const boardName = path.basename(board, '.kicad_pcb');

      // The ngspice view's electrical data (build/<board>_op.json) is only
      // written by `typecad-pcb simulate` — nothing in the plain build or
      // the export pipeline produces it, so without this a fresh project
      // opens with an ngspice view that has nothing to hover. Best-effort:
      // run it when the op file is missing or older than the netlist, and a
      // failure (no ngspice installed, entry error) only costs the hover
      // data — the viewer still generates.
      const netlistFile = path.join(folder, 'build', `${boardName}.net`);
      const opFile = path.join(folder, 'build', `${boardName}_op.json`);
      if (fs.existsSync(netlistFile) && (!fs.existsSync(opFile) || mtimeOf(opFile) < mtimeOf(netlistFile))) {
        this.output.appendLine('solving ngspice operating point…');
        try {
          await this.run(folder, 'npx typecad-pcb simulate', GENERATE_TIMEOUT_MS);
        } catch (error) {
          this.output.appendLine(`op solve skipped: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      this.output.appendLine('exporting gerbers…');
      // explicit board path: build/ can hold stray .kicad_pcb files (fp
      // upgrade tests, imports) and the CLI refuses an ambiguous export
      await this.run(folder, `npx typecad-pcb export gerbers "${board}"`, GENERATE_TIMEOUT_MS);
      await this.run(folder, `npx typecad-pcb export drill "${board}"`, GENERATE_TIMEOUT_MS);

      const gerbersDir = path.join('build', 'gerbers');
      const outPath = path.join('build', 'serve', 'viewer.html');
      // Optional data overlays, each shipped only when the build actually
      // produced it: the netlist fills pad→net (click a pad, its whole net
      // highlights); DRC markers exist after a `typecad-pcb drc` run; the
      // stackup drives the Copper ΔT view's per-layer copper weight. A
      // missing artifact must not sink the render — the viewer opens
      // without that overlay.
      const flags: string[] = [];
      const overlay = (flag: string, name: string): void => {
        const rel = path.join('build', name);
        if (fs.existsSync(path.join(folder, rel))) flags.push(flag, shellQuote(rel));
      };
      overlay('--netlist', `${boardName}.net`);
      // A DRC report OLDER than the board describes the previous revision —
      // embedding it paints stale violation markers on the new board (seen
      // as ghost "unconnected/shorting" dots on a route the move fixed).
      // Still embed it (a muted/absent DRC affordance reads as breakage);
      // the provenance call goes to the output channel only — a page status
      // banner would lock the status line forever.
      const drcRel = path.join('build', `${boardName}_drc.json`);
      if (fs.existsSync(path.join(folder, drcRel))) {
        flags.push('--drc', shellQuote(drcRel));
        if (mtimeOf(path.join(folder, drcRel)) < mtimeOf(board)) {
          this.output.appendLine('drc report predates the board — its markers describe the previous revision (run typeCAD: DRC to refresh)');
        }
      }
      overlay('--stackup', `${boardName}_stackup.json`);
      // the layout view's rule floors + net-class defaults. The project's
      // optional typecad.rules.json is the primary source (hand-authored,
      // beside typecad.conf.ts); the board's .kicad_pro fills the gaps.
      const boardRules = resolveBoardRules(folder, board);
      if (boardRules) {
        const rulesRel = path.join('build', `${boardName}_rules.json`);
        try {
          fs.writeFileSync(path.join(folder, rulesRel), JSON.stringify(boardRules));
          flags.push('--rules', shellQuote(rulesRel));
          this.output.appendLine(
            `board rules: ${userRulesFromFolder(folder) ? 'typecad.rules.json' : 'board .kicad_pro'}` +
              (boardRules.netClasses ? ` (+${Object.keys(boardRules.netClasses).length} net class(es))` : ''),
          );
        } catch {
          this.output.appendLine('warning: could not write the rules island — the width control runs without a floor');
        }
      }

      this.output.appendLine('building viewer HTML…');
      await this.run(
        folder,
        `npx gerber-viewer ${shellQuote(gerbersDir)} -o ${shellQuote(outPath)} ${flags.join(' ')}`,
        GENERATE_TIMEOUT_MS,
      );

      let raw = fs.readFileSync(path.join(folder, outPath), 'utf8');
      const [components, nets] = await Promise.all([
        this.service.components(),
        // net sources are decorative metadata — a failed query must not
        // take the viewer down with it
        this.service.netSources().catch(() => []),
      ]);
      const { html, injected } = injectProbeClient(raw, components, nets);
      if (!injected) {
        this.output.appendLine('warning: viewer HTML had no <head>/</body> anchors — cross-probe disabled');
      }
      this.generated = { html, boardMtimeMs: mtimeOf(board), diskMtimeMs: mtimeOf(path.join(folder, outPath)) };
      this.output.appendLine(
        `viewer ready: ${components.length} component outline(s), board mtime ${this.generated.boardMtimeMs}, cross-probe ${injected ? 'on' : 'off'}`,
      );
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
  private async onLayoutRebuild(
    moves: Array<{ ref: string; dx: number; dy: number; rot?: number; pads?: Array<{ x: number; y: number }> }>,
    texts?: LayoutTextEdit[],
    values?: Array<{ ref: string; value: string }>,
    labels?: LabelEdit[],
    renames?: Array<{ ref: string; newRef: string }>,
    routes?: RouteInput[],
    deletes?: RouteDeleteInput[],
  ): Promise<void> {
    const folder = this.hwFolder();
    const fail = (error: string): void => {
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
      // the build's ENTRY file plans first: the route stages take the first
      // file that carries typecad.create(), and a stray copy in src/ (with
      // its own create()) otherwise captures every rewrite — edits land in
      // a file nothing builds, and drawn traces silently miss the board
      const entry = entrySourceFile(folder);
      let ordered = srcUris;
      if (entry) {
        const hit = srcUris.find((u) => u.fsPath.toLowerCase() === entry.toLowerCase());
        if (hit) ordered = [hit, ...srcUris.filter((u) => u !== hit)];
      }
      const files = [];
      for (const uri of ordered) {
        files.push({ uri: uri.toString(), text: (await vscode.workspace.openTextDocument(uri)).getText() });
      }
      const plan = planLayoutApply(files, {
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

      // dry-run the whole plan and parse every touched file's final text —
      // a planner bug (overlapping ranges, a spliced token) must surface as
      // a REFUSED apply with a message, never as broken source the build
      // chokes on. Best-effort: `typescript` resolves in workspace installs;
      // a standalone bundled copy without it skips the gate rather than
      // failing the apply.
      const dry = new Map(files.map((f) => [f.uri, f.text]));
      for (const stage of plan.stages) {
        for (const batch of stage) {
          let out = dry.get(batch.uri)!;
          for (const e of [...batch.edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.line + out.slice(e.end);
          dry.set(batch.uri, out);
        }
      }
      for (const [uri, text] of dry) {
        const err = plannedTextSyntaxError(text);
        if (err) {
          fail(`planned edits would leave ${vscode.workspace.asRelativePath(vscode.Uri.parse(uri))} unparsable (${err}) — nothing was written`);
          return;
        }
      }

      // snapshot every touched file before anything is written — the
      // post-write check auto-restores from memory, and the Restore Source
      // from Backup command restores from disk; a user must never unscramble
      // a corrupted .ts by hand
      const boardNameForApply = path.basename(newestBoardFile(folder) ?? '');
      const backup = writeBackup(
        folder,
        files.map((f) => ({ uri: f.uri, text: f.text })),
        'layout apply',
        boardNameForApply || undefined,
      );
      if (backup) {
        this.output.appendLine(
          `source snapshot before apply: ${backupRootLabel()}/${backup.id} (${backup.manifest.files.length} file(s))`,
        );
      }

      // stage by stage, one whole-document replacement per file: the stage's
      // edits compose into the final text exactly like the dry run above
      // (descending offsets, string splices), then swap the document in one
      // applyEdit. Multi-range WorkspaceEdits resolve sequentially and
      // silently drop overlapping entries — a dropped delete left the live
      // document longer than the plan's text and every later stage's ranges
      // landed early, splicing tokens (seen as `width: 0.3const route15`).
      // Whole-document replacement makes application byte-identical to what
      // the parse gate validated.
      for (const stage of plan.stages) {
        const edits = new vscode.WorkspaceEdit();
        const seen = new Set<string>();
        for (const batch of stage) {
          if (seen.has(batch.uri)) continue; // one replacement per file per stage
          seen.add(batch.uri);
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(batch.uri));
          let out = doc.getText();
          for (const e of [...batch.edits].sort((a, b) => b.start - a.start || b.end - a.end))
            out = out.slice(0, e.start) + e.line + out.slice(e.end);
          edits.replace(
            doc.uri,
            new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
            out,
          );
        }
        if (edits.size > 0) await vscode.workspace.applyEdit(edits);
      }
      for (const key of plan.touched) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
        await doc.save();
      }

      // post-write verification: if anything slipped past the gate (or the
      // write itself diverged), restore the snapshot IMMEDIATELY — the user
      // must never be left with an unparsable file, even for a moment
      for (const key of plan.touched) {
        const savedDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
        const err = plannedTextSyntaxError(savedDoc.getText());
        if (!err) continue;
        this.output.appendLine(`POST-WRITE CHECK FAILED for ${key} (${err}) — restoring the pre-apply snapshot`);
        const restore = new vscode.WorkspaceEdit();
        const pre = files.find((f) => f.uri === key);
        if (pre) {
          restore.replace(
            savedDoc.uri,
            new vscode.Range(savedDoc.positionAt(0), savedDoc.positionAt(savedDoc.getText().length)),
            pre.text,
          );
          await vscode.workspace.applyEdit(restore);
          await savedDoc.save();
        }
        vscode.window.showErrorMessage(
          `typeCAD layout apply wrote unparsable source and restored ${vscode.workspace.asRelativePath(vscode.Uri.parse(key))} from its pre-apply snapshot — please report this (the typeCAD/pcb output has the plan)`,
        );
        void this.panel?.webview.postMessage({ type: 'typecad/layout-status', error: 'apply wrote invalid source — rolled back to the pre-apply snapshot' });
        return;
      }

      const c = plan.counts;
      const anyApplied =
        c.moves > 0 || c.endpoints > 0 || c.texts > 0 || c.values > 0 || c.labels > 0 || c.renames > 0 || c.routes > 0 || c.deletes > 0;
      this.output.appendLine(
        `layout apply: ${c.moves} placement(s) moved${c.endpoints ? `, ${c.endpoints} route endpoint(s) translated` : ''}${c.routes ? `, ${c.routes} track route(s) added to source` : ''}${c.deletes ? `, ${c.deletes} segment(s) deleted from source` : ''}${c.texts ? `, ${c.texts} text(s) edited` : ''}${c.values ? `, ${c.values} value(s) edited` : ''}${c.labels ? `, ${c.labels} label(s) repositioned` : ''}${c.renames ? `, ${c.renames} reference(s) renamed` : ''}${plan.skipped.length ? `, skipped ${plan.skipped.join('; ')}` : ''}`,
      );
      if (plan.skipped.length) {
        vscode.window.setStatusBarMessage(`layout: skipped ${plan.skipped.join('; ')}`, 8000);
      }
      if (!anyApplied) {
        void this.panel?.webview.postMessage({ type: 'typecad/layout-status', error: undefined });
        return;
      }
      // the button says "apply & rebuild" — every apply rebuilds. (A former
      // fast path deferred moves-only applies to the next manual build; the
      // page's ghosts already showed the answer, but a button that names the
      // rebuild must run it.)
      this.postStatus('rebuilding board…');
      await this.run(folder, 'npx typecad-pcb build', GENERATE_TIMEOUT_MS);
      // A move invalidates every DRC marker — re-run DRC so the regenerated
      // view carries fresh ones instead of none (the report predates the
      // new board, and markers are the move's feedback loop). Non-zero
      // exit just means violations exist; the report is still written.
      this.postStatus('checking rules…');
      try {
        await this.run(folder, 'npx typecad-pcb drc', GENERATE_TIMEOUT_MS);
      } catch {
        // violations exit non-zero — only a real failure (missing board,
        // engine crash) skips the markers, same as before
      }
      // generate() refuses a board written <3s ago (the build may still be
      // writing); wait for it to settle so the viewer regenerates NOW, not
      // only whenever the file watcher next fires
      const boardFile = newestBoardFile(folder);
      if (boardFile) {
        for (let i = 0; i < 10 && Date.now() - mtimeOf(boardFile) < 3_500; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
      }
      await this.generate(folder);
      void this.panel?.webview.postMessage({ type: 'typecad/layout-status', error: undefined });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  private async onMessage(message: ProbeWebviewMessage): Promise<void> {
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
        await this.panel.webview.postMessage(
          selectionMessage(this.pendingRef, this.pendingToken ?? this.loadToken),
        );
      }
      return;
    }
    if (message.type === 'typecad/ack') {
      const isNet = message.ref.startsWith('net:');
      const label = isNet ? `net ${message.ref.slice('net:'.length)}` : message.ref;
      this.output.appendLine(
        `select ${message.ref}: ack (found=${String(message.found)}, token=${String(message.token)})`,
      );
      if (this.pendingRef === message.ref && (message.token === undefined || message.token === this.pendingToken)) {
        this.pendingRef = null;
        if (message.found === false) {
          vscode.window.setStatusBarMessage(
            `${label}: no ${isNet ? 'traces' : 'pads'} for it on the rendered board — is the build current?`,
            5000,
          );
        }
      }
      return;
    }
    if (message.type === 'typecad/probe-net') {
      // double-clicked a trace: the client resolved the net's declaring
      // file:line (route call preferred) — reveal it, or say why not
      this.output.appendLine(`probe: net ${message.net} → source`);
      const folder = this.hwFolder();
      if (!folder) return;
      if (!message.source) {
        vscode.window.setStatusBarMessage(
          `net ${message.net}: no recorded source — rebuild with a current typeCAD`,
          5000,
        );
        return;
      }
      const loc = parseSourceLocation(folder, message.source);
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
  private async revealInEditor(ref: string, pin?: string): Promise<void> {
    const folder = this.hwFolder();
    if (!folder) return;
    try {
      const detail = await this.service.resolve(ref);
      if (!detail) return;
      let source = detail.source;
      if (pin) {
        const padNet = detail.pads.find((p) => p.pad === pin)?.net ?? null;
        if (padNet !== null) {
          const nets = await this.service.netSources().catch(() => []);
          const net = nets.find((n) => n.name === padNet);
          source = net?.routeSource ?? net?.source ?? source;
        }
      }
      const loc = parseSourceLocation(folder, source);
      if (!loc) {
        vscode.window.setStatusBarMessage(`${ref}: no source location on the compiled board`, 4000);
        return;
      }
      await this.revealLocation(loc);
    } catch (err) {
      this.output.appendLine(`reveal ${ref} failed: ${err instanceof Error ? err.message : String(err)}`);
      vscode.window.setStatusBarMessage(`typeCAD/pcb: could not resolve ${ref} — see the typeCAD/pcb output channel`, 4000);
    }
  }

  /** Open a resolved source location (shared by component and net probes). */
  private async revealLocation(loc: { fsPath: string; line: number }): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(loc.fsPath));
    const line = Math.max(0, loc.line - 1);
    const range = new vscode.Range(line, 0, line, 0);
    await vscode.window.showTextDocument(document, { selection: range, preserveFocus: false });
  }
}

/** The hovered/selected identifier in the active editor, or null. */
export function wordUnderCursor(editor: vscode.TextEditor | undefined): string | null {
  if (!editor) return null;
  const range = editor.selection.isEmpty
    ? editor.document.getWordRangeAtPosition(editor.selection.active)
    : editor.selection;
  if (!range) return null;
  const word = editor.document.getText(range).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(word) ? word : null;
}
