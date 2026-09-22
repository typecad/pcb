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

import * as vscode from 'vscode';
import fs from 'node:fs';
import path from 'node:path';
import { injectProbeClient, type ProbeHostMessage, type ProbeWebviewMessage } from './probeClient.js';
import { planComponentEdits, planEndpointEdits, parsePlacementLiteral, planPlacementEdits, planTextEdits, type ComponentEditSpec } from './layoutEdits.js';
import { parseSourceLocation } from './sourceRef.js';
import type { BoardDataService } from './boardData.js';
// discovery helpers live vscode-free in boardFile.ts for unit testing;
// re-exported here for the existing import sites
export { mtimeOf, newestBoardFile } from './boardFile.js';
import { mtimeOf, newestBoardFile } from './boardFile.js';

export type CommandRunner = (cwd: string, command: string, timeoutMs: number) => Promise<string>;

interface GeneratedViewer {
  html: string;
  /** .kicad_pcb mtime the HTML was generated from — stale when it changes. */
  boardMtimeMs: number;
}

const GENERATE_TIMEOUT_MS = 120_000;
/** A selection is re-posted until the viewer page acks it (or this times out). */
const DELIVERY_TIMEOUT_MS = 5_000;
const DELIVERY_INTERVAL_MS = 200;

/** Double-quote a path for an `exec` shell line; embedded quotes are escaped. */
export function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
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
  /** Set by generate() when the DRC report predates the board — the next
   *  generated page carries a visible "markers hidden" notice. */
  private staleDrcNotice = false;

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
    }

    if (!this.panel) {
      const webviewPanels = vscode.window.createWebviewPanel('typecadBoardViewer', 'Board', {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
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
    const htmlPath = path.join(folder, 'build', 'serve', 'viewer.html');
    // fast path: the on-disk viewer was generated from this exact board
    // revision (the file is newer than the board) — reuse it as-is
    if (board && fs.existsSync(htmlPath) && mtimeOf(htmlPath) > mtimeOf(board)) {
      try {
        const raw = fs.readFileSync(htmlPath, 'utf8');
        const [components, nets] = await Promise.all([this.service.components(), this.service.netSources().catch(() => [])]);
        const { html } = injectProbeClient(raw, components, nets);
        this.generated = { html, boardMtimeMs: mtimeOf(board) };
        this.loadToken++;
        this.assignHtml();
        this.output.appendLine('viewer restored from the last generated board view');
        return;
      } catch (err) {
        this.output.appendLine(
          `viewer restore fell back to a full render: ${err instanceof Error ? err.message : String(err)}`,
        );
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
  private assignHtml(): void {
    this.readySeen = false;
    // track the assigned string ourselves: reading webview.html back is not
    // guaranteed to round-trip, and show()'s "needs reassign" check keys on it
    this.assignedHtml = this.generated!.html;
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
    if (board && this.generated && mtimeOf(board) === this.generated.boardMtimeMs) return;
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

      this.output.appendLine('exporting gerbers…');
      // explicit board path: build/ can hold stray .kicad_pcb files (fp
      // upgrade tests, imports) and the CLI refuses an ambiguous export
      await this.run(folder, `npx typecad-pcb export gerbers "${board}"`, GENERATE_TIMEOUT_MS);
      await this.run(folder, `npx typecad-pcb export drill "${board}"`, GENERATE_TIMEOUT_MS);

      const boardName = path.basename(board, '.kicad_pcb');
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
      const drcRel = path.join('build', `${boardName}_drc.json`);
      if (fs.existsSync(path.join(folder, drcRel))) {
        flags.push('--drc', shellQuote(drcRel));
        // A report older than the board describes the previous revision —
        // still embed it (a muted/absent DRC affordance reads as breakage)
        // but bake a provenance notice into the page so stale markers are
        // never mistaken for the new board's truth
        if (mtimeOf(path.join(folder, drcRel)) < mtimeOf(board)) {
          this.output.appendLine('drc report predates the board — embedding with a previous-revision notice');
          this.staleDrcNotice = true;
        }
      }
      overlay('--stackup', `${boardName}_stackup.json`);

      this.output.appendLine('building viewer HTML…');
      await this.run(
        folder,
        `npx gerber-viewer ${shellQuote(gerbersDir)} -o ${shellQuote(outPath)} ${flags.join(' ')}`,
        GENERATE_TIMEOUT_MS,
      );

      const raw = fs.readFileSync(path.join(folder, outPath), 'utf8');
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
      let finalHtml = html;
      if (this.staleDrcNotice) {
        this.staleDrcNotice = false;
        // A postStatus would be wiped by the reload that lands this HTML —
        // bake the notice into the page's own status line instead
        const notice = `<script>(function(){function n(){var el=document.getElementById('status');if(el){el.textContent='DRC markers show the PREVIOUS board revision — run typeCAD: DRC to refresh';el.setAttribute('data-locked','');}}if(document.readyState==='complete')n();else window.addEventListener('load',n);})();</script>`;
        finalHtml = html.includes('</body>') ? html.replace('</body>', notice + '</body>') : html;
      }
      this.generated = { html: finalHtml, boardMtimeMs: mtimeOf(board) };
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
   * frame. Each moved ref resolves to its source variable (the board's
   * "Code" property), its `<var>.pcb = { x, y, ... }` literal is rewritten
   * by the delta, then the project rebuilds and the viewer regenerates.
   * Computed (non-literal) placements are skipped and reported, never
   * silently mangled.
   */
  private async onLayoutRebuild(
    moves: Array<{ ref: string; dx: number; dy: number; rot?: number; pads?: Array<{ x: number; y: number }> }>,
    texts?: Array<{ text0: string; x0: number; y0: number; text: string; x: number; y: number; rot: number }>,
    values?: Array<{ ref: string; value: string }>,
    labels?: Array<{ ref: string; kind: 'reference' | 'value' | 'fab'; x: number; y: number; rot: number }>,
    renames?: Array<{ ref: string; newRef: string }>,
  ): Promise<void> {
    const folder = this.hwFolder();
    const fail = (error: string): void => {
      this.output.appendLine(`layout apply failed: ${error}`);
      void this.panel?.webview.postMessage({ type: 'typecad/layout-status', error });
    };
    if (!folder || this.panel === null) {
      fail('no typeCAD project found');
      return;
    }
    try {
      const comps = await this.service.components();
      const variableOf = new Map(comps.map((c) => [c.reference, c.variable ?? '']));
      const srcFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, 'src/**/*.ts'));
      const edits = new vscode.WorkspaceEdit();
      const touched = new Set<string>();
      const skipped: string[] = [];
      const appliedRefs = new Set<string>();
      // per document: plan edits for every not-yet-resolved move, then commit
      // the ones that matched here (a ref resolves in its first matching file)
      for (const uri of srcFiles) {
        const pending = moves.filter((m) => !appliedRefs.has(m.ref) && !skipped.some((sk) => sk.startsWith(m.ref + ' ')));
        if (pending.length === 0) continue;
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const planned = planPlacementEdits(text, pending, (ref) => variableOf.get(ref));
        for (const sk of planned.skipped) {
          // "no literal found" is only final once every src file has been
          // tried — the other reasons are
          if (sk.reason.startsWith('no `') && srcFiles.length > 1) continue;
          skipped.push(`${sk.ref} (${sk.reason})`);
        }
        if (planned.edits.length === 0) continue;
        for (const edit of planned.edits) {
          edits.replace(
            uri,
            new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end)),
            edit.line,
          );
          appliedRefs.add(edit.ref);
        }
        touched.add(uri.toString());
      }
      // sticky TrackBuilder endpoints: hand-built routes whose .from/.to
      // literals sit on a moved component's ORIGINAL pads follow the part
      let endpointsMoved = 0;
      for (const uri of srcFiles) {
        const pending = moves.filter((m) => appliedRefs.has(m.ref) && (m.pads?.length ?? 0) > 0);
        if (pending.length === 0) continue;
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        let plannedEndpoints = pending.flatMap((m) => planEndpointEdits(text, m));
        if (plannedEndpoints.length === 0) continue;
        // one literal can be a sticky endpoint of at most one move
        const seen = new Set<number>();
        plannedEndpoints = plannedEndpoints.filter((e) => {
          if (seen.has(e.start)) return false;
          seen.add(e.start);
          return true;
        });
        for (const edit of plannedEndpoints) {
          edits.replace(
            uri,
            new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end)),
            edit.line,
          );
        }
        endpointsMoved += plannedEndpoints.length;
        touched.add(uri.toString());
      }
      for (const move of moves) {
        if (!appliedRefs.has(move.ref) && !skipped.some((sk) => sk.startsWith(move.ref + ' '))) {
          skipped.push(`${move.ref} (no \`${variableOf.get(move.ref) ?? move.ref}\`.pcb literal found)`);
        }
      }
      // silk/fab text edits: .text({ … }) literals matched by authored
      // value + anchor, rewritten with the new value/position/rotation
      let textsEdited = 0;
      const textsDone = new Set<string>();
      for (const uri of srcFiles) {
        const pendingTexts = (texts ?? []).filter((t) => !textsDone.has(`${t.text0}@${t.x0},${t.y0}`));
        if (pendingTexts.length === 0) continue;
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const plannedTexts = planTextEdits(text, pendingTexts);
        for (const sk of plannedTexts.skipped) {
          if (srcFiles.length > 1) continue; // final once every file is tried
          skipped.push(`${sk.ref} (${sk.reason})`);
        }
        if (plannedTexts.edits.length === 0) continue;
        for (const edit of plannedTexts.edits) {
          edits.replace(
            uri,
            new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end)),
            edit.line,
          );
          textsEdited++;
        }
        for (const t of pendingTexts) textsDone.add(`${t.text0}@${t.x0},${t.y0}`);
        touched.add(uri.toString());
      }
      for (const t of texts ?? []) {
        if (!textsDone.has(`${t.text0}@${t.x0},${t.y0}`) && srcFiles.length <= 1)
          skipped.push(`text "${t.text0}" (no .text({…}) literal matches its authored value/anchor)`);
      }
      // component edits — value, rename, label layout — target the SAME
      // constructor literal, so they run as ONE pass producing one
      // replacement per constructor (ranges never collide in the edit)
      let valuesEdited = 0;
      let labelsEdited = 0;
      let renamesEdited = 0;
      const specByRef = new Map<string, ComponentEditSpec>();
      for (const v of values ?? []) specByRef.set(v.ref, { ref: v.ref, value: v.value });
      for (const r of renames ?? []) {
        const spec = specByRef.get(r.ref) ?? { ref: r.ref };
        spec.newRef = r.newRef;
        specByRef.set(r.ref, spec);
      }
      for (const l of labels ?? []) {
        const spec = specByRef.get(l.ref) ?? { ref: l.ref };
        spec.label = { kind: l.kind, x: l.x, y: l.y, rot: l.rot };
        specByRef.set(l.ref, spec);
      }
      const specs = [...specByRef.values()];
      if (specs.length > 0) {
        // placements first: each label converts against the part's FINAL
        // placement (literal + this apply's move delta)
        const placementMap = new Map<string, { x: number; y: number; rot: number }>();
        for (const uri of srcFiles) {
          const doc = await vscode.workspace.openTextDocument(uri);
          const text = doc.getText();
          for (const spec of specs) {
            if (placementMap.has(spec.ref) || !spec.label) continue;
            const pl = parsePlacementLiteral(text, variableOf.get(spec.ref) ?? '');
            if (pl) {
              const mv = moves.find((m) => m.ref === spec.ref);
              placementMap.set(spec.ref, {
                x: pl.x + (mv?.dx ?? 0),
                y: pl.y + (mv?.dy ?? 0),
                rot: pl.rot + (mv?.rot ?? 0),
              });
            }
          }
        }
        const allRefs = new Set(comps.map((c) => c.reference).filter(Boolean));
        const doneRefs = new Set<string>();
        for (const uri of srcFiles) {
          const pending = specs.filter((sp) => !doneRefs.has(sp.ref));
          if (pending.length === 0) continue;
          const doc = await vscode.workspace.openTextDocument(uri);
          const text = doc.getText();
          const planned = planComponentEdits(
            text,
            pending,
            (ref) => placementMap.get(ref) ?? null,
            allRefs,
          );
          for (const sk of planned.skipped) skipped.push(`${sk.ref} (${sk.reason})`);
          for (const edit of planned.edits) {
            edits.replace(
              uri,
              new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end)),
              edit.line,
            );
            const spec = pending.find((sp) => edit.ref === sp.ref + ' edits');
            if (spec?.value !== undefined) valuesEdited++;
            if (spec?.newRef) renamesEdited++;
            if (spec?.label) labelsEdited++;
            if (spec) doneRefs.add(spec.ref);
          }
          if (planned.edits.length > 0) touched.add(uri.toString());
        }
      }
      const applied = appliedRefs.size;
      if (applied > 0 || endpointsMoved > 0 || textsEdited > 0 || valuesEdited > 0 || labelsEdited > 0 || renamesEdited > 0) {
        await vscode.workspace.applyEdit(edits);
        for (const key of touched) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
          await doc.save();
        }
      }
      this.output.appendLine(
        `layout apply: ${applied} placement(s) moved${endpointsMoved ? `, ${endpointsMoved} route endpoint(s) translated` : ''}${textsEdited ? `, ${textsEdited} text(s) edited` : ''}${valuesEdited ? `, ${valuesEdited} value(s) edited` : ''}${labelsEdited ? `, ${labelsEdited} label(s) repositioned` : ''}${renamesEdited ? `, ${renamesEdited} reference(s) renamed` : ''}${skipped.length ? `, skipped ${skipped.join('; ')}` : ''} — rebuilding`,
      );
      if (skipped.length) {
        vscode.window.setStatusBarMessage(`layout: skipped ${skipped.join('; ')}`, 8000);
      }
      if (applied === 0 && textsEdited === 0 && valuesEdited === 0 && labelsEdited === 0 && renamesEdited === 0) {
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
      await this.onLayoutRebuild(message.moves, message.texts, message.values, message.labels, message.renames);
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
