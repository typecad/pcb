// ---------------------------------------------------------------------------
// The layout view's apply bridge — the vscode side of "apply & rebuild".
//
// BoardViewerPanel owns the webview and the render pipeline; this module
// owns what happens when the page commits its pending gesture: plan the
// edits (planLayoutApply), gate them (syntax dry-run, stale-view refusal,
// phantom-recipe refusal), snapshot, write atomically, rebuild, verify the
// rebuilt board against the intent, and regenerate the viewer. It runs
// against the panel through the narrow ViewerHost surface, so the panel
// keeps no apply logic and the bridge keeps no webview plumbing.
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import fs from 'node:fs';
import path from 'node:path';
import { backupRootLabel, writeBackup } from './sourceBackup.js';
import { syncFileNameFor } from './syncFile.js';
import { planLayoutApply, type LayoutApplyInput, type LayoutImageInput } from './layoutApply.js';
import { parsePlacementLiteral } from './layoutEdits.js';
import { verifyBoardSemantics } from './semanticVerify.js';
import { pipelineBusy, sync } from './syncState.js';
import { boardIdentity, entrySourceFile, listBoardFiles, mtimeOf, newestBoardFile } from './boardFile.js';
import type { LayoutRebuildPayload } from './probeClient.js';
import type { BoardDataService } from './boardData.js';

export type CommandRunner = (cwd: string, command: string, timeoutMs: number) => Promise<string>;

/** The panel surface the apply bridge runs against — everything it needs
 *  from BoardViewerPanel and nothing else. */
export interface ViewerHost {
  hwFolder(): string | null;
  readonly boardStem?: string;
  readonly service: BoardDataService;
  readonly run: CommandRunner;
  readonly output: vscode.OutputChannel;
  /** notice in the viewer's lower-left status text */
  postStatus(text: string): void;
  /** answer the page's apply callback (error undefined = success) */
  postLayoutStatus(error: string | undefined): void;
  /** hand a picked (or canceled) PNG back to the page's ghost-preview hook */
  postImagePicked(message: { type: 'typecad/image-picked'; path: string; name: string; dataUrl: string }): void;
  /** full refresh path — a refused stale view regenerates immediately */
  doRefresh(force?: boolean): Promise<void>;
  /** re-run the export pipeline (a successful apply's last step) */
  generate(folder: string): Promise<boolean>;
  /** replay a watcher refresh that arrived while this apply owned the pipeline */
  replayOwedRefresh(): Promise<void>;
  /** may an apply stamped against a superseded render proceed because every
   *  part its edits touch is exactly where that render showed it? Absent on
   *  hosts that cannot tell — the apply is then refused as before. */
  rebaseCheck?(stamp: string, refs: string[]): Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Can this payload ride a rebase at all? Only edits that are DELTAS on named
 * parts' source placements (moves) or ref-keyed text swaps (values, renames)
 * mean the same thing against a rebuilt board whose touched parts did not
 * change. Anything carrying absolute board geometry (routes, deletes, zones,
 * the outline, artwork, label/text positions, net classes) describes ink on
 * the superseded view and must be redone on the fresh one.
 */
export function rebasableRefs(payload: LayoutRebuildPayload): string[] | null {
  const geometric =
    (payload.routes?.length ?? 0) > 0 ||
    (payload.deletes?.length ?? 0) > 0 ||
    (payload.partDeletes?.length ?? 0) > 0 ||
    (payload.zones?.length ?? 0) > 0 ||
    (payload.zoneEdits?.length ?? 0) > 0 ||
    (payload.zoneDeletes?.length ?? 0) > 0 ||
    (payload.images?.length ?? 0) > 0 ||
    (payload.imageEdits?.length ?? 0) > 0 ||
    (payload.imageDeletes?.length ?? 0) > 0 ||
    (payload.texts?.length ?? 0) > 0 ||
    (payload.labels?.length ?? 0) > 0 ||
    (payload.textDeletes?.length ?? 0) > 0 ||
    (payload.classEdits?.length ?? 0) > 0 ||
    (payload.values?.length ?? 0) > 0 ||
    (payload.renames?.length ?? 0) > 0 ||
    !!payload.outline;
  if (geometric) return null;
  const refs = new Set<string>();
  for (const m of payload.moves ?? []) refs.add(m.ref);
  for (const v of payload.values ?? []) refs.add(v.ref);
  for (const r of payload.renames ?? []) refs.add(r.ref);
  return refs.size > 0 ? [...refs] : null;
}

/**
 * The ONE build command every pipeline path runs (apply and auto-build). It
 * is the project's own `build` script — the same thing the Build Board lens
 * and a hand-typed `npm run build` run — so a script that does extra work
 * (pre-steps, a custom entry, flags) produces the same board whichever path
 * built it. (Apply used to call `npx typecad-pcb build` directly, silently
 * bypassing the script.)
 */
export const BUILD_COMMAND = 'npm run build';

/** Wall-clock budget for one host-run pipeline command (build, exports). */
export const GENERATE_TIMEOUT_MS = 120_000;

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

export class LayoutApplyBridge {
  /** The largest PNG handed to the page as a preview data URL — past this,
   *  the webview message and the localStorage pending-state snapshot get
   *  heavy and the artwork itself is almost certainly mis-scaled anyway. */
  static readonly MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  static readonly PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  /** True while an apply runs — webview messages don't queue, and a second
   *  apply's snapshots would capture the first one's half-written sources. */
  private applying = false;

  constructor(private readonly host: ViewerHost) {}

  /** Answer a place-image arm: file-picker, PNG check, bytes as a data URL
   *  for the page's ghost preview plus the absolute path the apply copies
   *  into the project's art/ folder. */
  async onPickImage(): Promise<void> {
    const post = (message: { type: 'typecad/image-picked'; path: string; name: string; dataUrl: string }): void =>
      this.host.postImagePicked(message);
    const pick = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Place as board artwork',
      filters: { 'PNG image': ['png'] },
      title: 'typeCAD: place board artwork',
    });
    if (!pick || pick.length === 0) {
      // canceled — tell the page so it disarms instead of waiting forever
      post({ type: 'typecad/image-picked', path: '', name: '', dataUrl: '' });
      return;
    }
    const filePath = pick[0]!.fsPath;
    try {
      const data = fs.readFileSync(filePath);
      if (!data.subarray(0, 8).equals(LayoutApplyBridge.PNG_SIGNATURE)) {
        vscode.window.showErrorMessage(`typeCAD: ${path.basename(filePath)} is not a PNG file.`);
        post({ type: 'typecad/image-picked', path: '', name: '', dataUrl: '' });
        return;
      }
      if (data.length > LayoutApplyBridge.MAX_IMAGE_BYTES) {
        vscode.window.showErrorMessage(
          `typeCAD: ${path.basename(filePath)} is ${(data.length / 1024 / 1024).toFixed(1)} MB — artwork PNGs up to 8 MB are supported (downscale the image for finer placement).`,
        );
        post({ type: 'typecad/image-picked', path: '', name: '', dataUrl: '' });
        return;
      }
      post({
        type: 'typecad/image-picked',
        path: filePath,
        name: path.basename(filePath),
        dataUrl: 'data:image/png;base64,' + data.toString('base64'),
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        `typeCAD: could not read ${path.basename(filePath)} — ${err instanceof Error ? err.message : String(err)}`,
      );
      post({ type: 'typecad/image-picked', path: '', name: '', dataUrl: '' });
    }
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
  /** Roll every touched file back to its pre-apply text (a file the apply
   *  created is deleted instead of emptied). Best-effort per file — the
   *  disk snapshot (build/layout-backups) remains for the Restore Source
   *  from Backup command when even this cannot run. */
  private async restorePreApply(
    files: Array<{ uri: string; text: string; created?: boolean }>,
    touched: string[],
    createdUris: Set<string>,
    applied: Map<string, string>,
  ): Promise<boolean> {
    let restored = true;
    for (const key of touched) {
      const pre = files.find((f) => f.uri === key);
      if (!pre) continue;
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
        if (doc.getText() !== applied.get(key)) {
          this.host.output.appendLine(`layout rollback skipped ${key}: document changed after apply`);
          restored = false;
          continue;
        }
        if (createdUris.has(key)) {
          try {
            await doc.save();
            await vscode.workspace.fs.delete(vscode.Uri.parse(key), { useTrash: false });
          } catch {
            // best-effort — the restore command can finish the job
          }
          continue;
        }
        const restore = new vscode.WorkspaceEdit();
        restore.replace(
          doc.uri,
          new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
          pre.text,
        );
        await vscode.workspace.applyEdit(restore);
        await doc.save();
      } catch {
        restored = false;
        // best-effort — the disk snapshot stays authoritative
      }
    }
    return restored;
  }

  async onLayoutRebuild(payload: LayoutRebuildPayload): Promise<void> {
    const fail = (error: string): void => {
      this.host.output.appendLine(`layout apply failed: ${error}`);
      this.host.postLayoutStatus(error);
    };
    if (this.applying || pipelineBusy()) {
      // a second click while the first apply is mid-pipeline would snapshot
      // half-written sources and splice the second plan onto a moving board
      fail('an apply is already running — wait for it to finish, then apply again');
      return;
    }
    const folder = this.host.hwFolder();
    if (!folder) {
      fail('no typeCAD project found');
      return;
    }
    // the apply owns the whole build pipeline: its own source writes must
    // not trigger the auto-build watcher (double build), and the status
    // indicator should read "building" for its whole run
    this.applying = true;
    sync.applyBusy = true;
    let staleRefused = false;
    try {
      // board identity: the page carries the mtime of the board it was
      // generated from. A different board on disk now means a build ran
      // since the page rendered (auto-build, external edit) — the page's
      // ink describes a superseded revision and its edits must not splice
      // into a source that moved on. Unstamped = an old page (pre-stamp
      // viewer) — allow, the near-source drift guard still backs this up.
      const boardStamp = payload.board;
      const boardNow = newestBoardFile(folder, this.host.boardStem);
      let rebased = false;
      if (boardStamp && boardNow && boardIdentity(boardNow) !== String(boardStamp)) {
        // A build ran since this view rendered. Refusing is the safe default
        // (the view's ink describes a superseded revision), but when the
        // edits are part-relative and every part they touch is exactly where
        // the view showed it, they still mean what the user meant — apply
        // them instead of making the user redo the gesture.
        const refs = rebasableRefs(payload);
        const verdict = refs && this.host.rebaseCheck ? await this.host.rebaseCheck(String(boardStamp), refs) : null;
        if (verdict?.ok) {
          rebased = true;
          this.host.output.appendLine(
            `layout apply: board was rebuilt since this view rendered, but ${refs!.join(', ')} are unchanged — rebasing the edit onto the new board`,
          );
        } else if (verdict && verdict.reason) {
          this.host.output.appendLine(`layout apply: not rebasing — ${verdict.reason}`);
        }
      }
      if (!rebased && boardStamp && boardNow && boardIdentity(boardNow) !== String(boardStamp)) {
        fail(
          'the board was rebuilt since this view rendered (a build ran) — reopening the viewer; redo the edit on the fresh view',
        );
        this.host.postStatus('view out of date — regenerating…');
        // NOT refreshed here: this apply still owns the pipeline, so
        // doRefresh would only queue itself as "owed" and the regeneration
        // would wait for the replay's debounce. Refresh once released.
        staleRefused = true;
        return;
      }
      await this.applyPayload(folder, fail, payload);
    } finally {
      sync.applyBusy = false;
      this.applying = false;
      if (staleRefused) {
        // the pipeline is free: regenerate NOW (doRefresh also retires any
        // refresh that was deferred while this apply ran)
        await this.host.doRefresh();
      } else {
        // a watcher refresh that arrived while this apply owned the pipeline
        // was deferred (it would have raced the apply's own render); the
        // pipeline is free — replay it so the view settles on the final state
        await this.host.replayOwedRefresh();
      }
    }
  }

  private async applyPayload(
    folder: string,
    fail: (error: string) => void,
    {
      moves,
      texts,
      values,
      labels,
      renames,
      routes,
      deletes,
      partDeletes,
      zones,
      outline,
      zoneEdits,
      zoneDeletes,
      images,
      imageEdits,
      imageDeletes,
      classEdits,
      textDeletes,
    }: LayoutRebuildPayload,
  ): Promise<void> {
    try {
      const comps = await this.host.service.components();
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
      const files: Array<{ uri: string; text: string; created?: boolean }> = [];
      for (const uri of ordered) {
        files.push({ uri: uri.toString(), text: (await vscode.workspace.openTextDocument(uri)).getText() });
      }
      // the sidecar rides beside the entry file (same dir, so its import is
      // './_sync[.<stem>].js' — per-board on multi-board projects); an
      // absent file joins the set EMPTY — the apply creates it only when a
      // stage actually writes it, and the backup/restore path knows to
      // delete rather than empty it
      const multi = listBoardFiles(folder).length > 1;
      const boardStem = multi ? path.basename(newestBoardFile(folder, this.host.boardStem) ?? '', '.kicad_pcb') : undefined;
      const syncName = syncFileNameFor(boardStem || undefined);
      const syncPath = path.join(
        entry ? path.dirname(entry) : path.join(folder, 'src'),
        syncName,
      );
      const syncUri = vscode.Uri.file(syncPath);
      let syncCreated = false;
      if (!files.some((f) => f.uri.toLowerCase() === syncUri.toString().toLowerCase())) {
        let syncText = '';
        try {
          syncText = fs.readFileSync(syncPath, 'utf8');
        } catch {
          syncCreated = true;
        }
        files.push({ uri: syncUri.toString(), text: syncText, ...(syncCreated ? { created: true } : {}) });
      }
      const createdUris = new Set(syncCreated ? [syncUri.toString()] : []);
      // final placements for the semantic check: the move deltas land on the
      // placement literals, so the finals are computable from the PRE-apply
      // text (a moved part's footprint should sit exactly there after the
      // rebuild)
      const finalPlacements: Array<{ ref: string; x: number; y: number; side?: 'front' | 'back' }> = [];
      for (const mv of moves ?? []) {
        const variable = variableOf.get(mv.ref);
        if (!variable) continue;
        for (const f of files) {
          const lit = parsePlacementLiteral(f.text, variable);
          if (lit) {
            finalPlacements.push({
              ref: mv.ref,
              x: +(lit.x + mv.dx).toFixed(3),
              y: +(lit.y + mv.dy).toFixed(3),
              ...(mv.side ? { side: mv.side } : {}),
            });
            break;
          }
        }
      }
      // artwork: the picked PNGs are copied into <folder>/art/ BEFORE the
      // plan, so the generated statements carry project-relative paths —
      // the build (and any later `npm run build`) resolves them from the
      // project root, keeping the project self-contained. Same bytes
      // already present under a name? reuse it (dedupe by content, not by
      // picking time). Replacement files for applied artwork ride the same
      // copy so the rewritten statement stays project-relative.
      const copyIntoArt = (pickedPath: string, pickedName: string): string => {
        const data = fs.readFileSync(pickedPath);
        const artDir = path.join(folder, 'art');
        fs.mkdirSync(artDir, { recursive: true });
        const safeName = pickedName.replace(/[^A-Za-z0-9._-]/g, '_');
        const stem = safeName.replace(/\.png$/i, '');
        let finalName = `${stem}.png`;
        let n = 1;
        while (fs.existsSync(path.join(artDir, finalName))) {
          if (data.equals(fs.readFileSync(path.join(artDir, finalName)))) break;
          finalName = `${stem}-${n}.png`;
          n++;
        }
        const dest = path.join(artDir, finalName);
        if (!fs.existsSync(dest)) fs.writeFileSync(dest, data);
        return `art/${finalName}`;
      };
      const layoutImages: LayoutImageInput[] = [];
      for (const img of images ?? []) {
        try {
          const file = copyIntoArt(img.path, img.name);
          layoutImages.push({
            file,
            name: path.basename(file),
            x: img.x,
            y: img.y,
            w: img.w,
            h: img.h,
            ...(img.side === 'back' ? { side: 'back' as const } : {}),
          });
        } catch (err) {
          fail(`image ${img.name} could not be copied into the project — ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }
      // applied-artwork edits: copy any replacement file, then hand the
      // planner the project-relative path
      const layoutImageEdits: NonNullable<LayoutApplyInput['imageEdits']> = [];
      for (const edit of imageEdits ?? []) {
        try {
          layoutImageEdits.push({
            ...edit,
            newFile: edit.newFile ? copyIntoArt(edit.newFile, path.basename(edit.newFile)) : null,
          });
        } catch (err) {
          fail(`replacement artwork could not be copied into the project — ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }
      const layoutImageDeletes = imageDeletes ?? [];
      const plan = planLayoutApply(files, {
        moves,
        texts,
        values,
        labels,
        renames,
        routes,
        deletes,
        partDeletes,
        zones,
        images: layoutImages,
        outline,
        zoneEdits,
        zoneDeletes,
        imageEdits: layoutImageEdits,
        imageDeletes: layoutImageDeletes,
        textDeletes: textDeletes ?? [],
        classEdits: classEdits ?? [],
        variableOf: (ref) => variableOf.get(ref),
        allRefs: new Set(comps.map((c) => c.reference).filter(Boolean)),
        syncUri: syncUri.toString(),
        entryUri: entry ? vscode.Uri.file(entry).toString() : undefined,
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
          for (const e of [...batch.edits].sort((a, b) => b.start - a.start))
            out = out.slice(0, e.start) + e.line + out.slice(e.end);
          dry.set(batch.uri, out);
        }
      }
      for (const [uri, text] of dry) {
        const err = plannedTextSyntaxError(text);
        if (err) {
          fail(
            `planned edits would leave ${vscode.workspace.asRelativePath(vscode.Uri.parse(uri))} unparsable (${err}) — nothing was written`,
          );
          return;
        }
      }

      // a replacement gesture whose OLD geometry matched nothing NEAR source
      // copper is the phantom recipe: the deletes were computed against a
      // view that predates the source, so the old chain survives beside the
      // new route — refuse and have the user redo the edit on a fresh view.
      // Unmatched deletes NOWHERE NEAR source copper are noise (the page
      // pushes a via-delete at every deleted-segment endpoint; most carry
      // no via) — they drop and the apply proceeds
      if (plan.unmatchedDeletes.length > 0 && (routes ?? []).length > 0) {
        const replaced = plan.unmatchedDeletes.filter((u) => u.near > 0 && (routes ?? []).some((r) => r.net === u.net));
        const dropped = plan.unmatchedDeletes.filter((u) => u.near === 0);
        if (dropped.length > 0) {
          this.host.output.appendLine(
            `dropped ${dropped.map((d) => `${d.count} delete(s) on ${d.net ?? 'N/C'}`).join(', ')} matching no source copper (no via / autorouter ink) — nothing in source to remove`,
          );
        }
        if (replaced.length > 0) {
          const detail = replaced.map((u) => `${u.near} segment(s) on net ${u.net}`).join(', ');
          fail(
            `the view was stale — deleted ${detail} no longer exist in source, so applying would leave the old trace beside the new route. Nothing was written — close and reopen the Board tab, then redo the edit`,
          );
          return;
        }
      }

      // snapshot every touched file before anything is written — the
      // post-write check auto-restores from memory, and the Restore Source
      // from Backup command restores from disk; a user must never unscramble
      // a corrupted .ts by hand
      const boardNameForApply = path.basename(newestBoardFile(folder, this.host.boardStem) ?? '');
      const backup = writeBackup(
        folder,
        files.map((f) => ({ uri: f.uri, text: f.text, ...(f.created ? { created: true } : {}) })),
        'layout apply',
        boardNameForApply || undefined,
      );
      if (backup) {
        this.host.output.appendLine(
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
      // Application writes each touched file's FINAL composed text (the dry
      // map — exactly what the gate validated) as one whole-document
      // replacement, all files in ONE applyEdit. Two hazards this kills:
      // multi-range WorkspaceEdits resolve sequentially and silently drop
      // overlapping entries (a dropped delete desynced the live document and
      // later ranges spliced mid-token), and per-stage application left
      // awaits between stages — a keystroke landing mid-apply changed the
      // document under every remaining offset. Writing the final text
      // atomically leaves no inter-stage window at all.
      // One guard first: if the live document no longer matches the text
      // the plan was built against (the user typed while the apply was
      // planning), every offset is stale — refuse and let them re-apply.
      const touchedSet = new Set(plan.touched);
      // a file this apply CREATES must exist before it can be opened,
      // verified, and replaced — an empty placeholder is byte-identical to
      // the planned base text (''), so every downstream guard holds
      for (const uri of createdUris) {
        if (!touchedSet.has(uri)) continue;
        try {
          await vscode.workspace.fs.writeFile(vscode.Uri.parse(uri), new Uint8Array(0));
        } catch (err) {
          fail(`cannot create ${vscode.workspace.asRelativePath(vscode.Uri.parse(uri))} — ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }
      const applyDocs = new Map<string, vscode.TextDocument>();
      for (const f of files) {
        if (!touchedSet.has(f.uri)) continue;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(f.uri));
        if (doc.getText() !== f.text) {
          fail(
            `${vscode.workspace.asRelativePath(vscode.Uri.parse(f.uri))} changed while the apply was planning — nothing was written, press apply again`,
          );
          return;
        }
        applyDocs.set(f.uri, doc);
      }
      const finalEdits = new vscode.WorkspaceEdit();
      for (const [uri, text] of dry) {
        if (!touchedSet.has(uri)) continue;
        const doc = applyDocs.get(uri)!;
        finalEdits.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), text);
      }
      if (finalEdits.size > 0 && !(await vscode.workspace.applyEdit(finalEdits))) {
        fail('VS Code rejected the source edits');
        return;
      }
      for (const key of plan.touched) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
        if (!(await doc.save()) || doc.getText() !== dry.get(key)) {
          const restored = await this.restorePreApply(files, plan.touched, createdUris, dry);
          fail(restored ? 'Could not save the planned source edits; source restored' : 'Could not save the planned source edits; some documents changed and need review');
          return;
        }
      }

      // post-write verification: if anything slipped past the gate (or the
      // write itself diverged), restore the snapshot IMMEDIATELY — the user
      // must never be left with an unparsable file, even for a moment. A
      // file this apply created restores by deletion, not by emptying.
      for (const key of plan.touched) {
        const savedDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(key));
        const err = plannedTextSyntaxError(savedDoc.getText());
        if (!err) continue;
        this.host.output.appendLine(`POST-WRITE CHECK FAILED for ${key} (${err}) — restoring the pre-apply snapshot`);
        const pre = files.find((f) => f.uri === key);
        if (pre) {
          if (createdUris.has(key)) {
            try {
              await savedDoc.save();
              await vscode.workspace.fs.delete(vscode.Uri.parse(key), { useTrash: false });
            } catch {
              // best-effort — the restore command can finish the job
            }
          } else {
            const restore = new vscode.WorkspaceEdit();
            restore.replace(
              savedDoc.uri,
              new vscode.Range(savedDoc.positionAt(0), savedDoc.positionAt(savedDoc.getText().length)),
              pre.text,
            );
            await vscode.workspace.applyEdit(restore);
            await savedDoc.save();
          }
        }
        vscode.window.showErrorMessage(
          `typeCAD layout apply wrote unparsable source and restored ${vscode.workspace.asRelativePath(vscode.Uri.parse(key))} from its pre-apply snapshot — please report this (the typeCAD/pcb output has the plan)`,
        );
        this.host.postLayoutStatus('apply wrote invalid source — rolled back to the pre-apply snapshot');
        return;
      }

      const c = plan.counts;
      const anyApplied =
        c.moves > 0 ||
        c.endpoints > 0 ||
        c.texts > 0 ||
        c.textDeletes > 0 ||
        c.values > 0 ||
        c.labels > 0 ||
        c.renames > 0 ||
        c.routes > 0 ||
        c.deletes > 0 ||
        c.partDeletes > 0 ||
        c.zones > 0 ||
        c.images > 0 ||
        c.imageEdits > 0 ||
        c.imageDeletes > 0 ||
        c.outline > 0 ||
        c.zoneEdits > 0 ||
        c.zoneDeletes > 0 ||
        c.classEdits > 0;
      this.host.output.appendLine(
        `layout apply: ${c.moves} placement(s) moved${c.endpoints ? `, ${c.endpoints} route endpoint(s) translated` : ''}${c.routes ? `, ${c.routes} track route(s) added to source` : ''}${c.deletes ? `, ${c.deletes} segment(s) deleted from source` : ''}${c.texts ? `, ${c.texts} text(s) edited` : ''}${c.textDeletes ? `, ${c.textDeletes} text(s) deleted from source` : ''}${c.values ? `, ${c.values} value(s) edited` : ''}${c.labels ? `, ${c.labels} label(s) repositioned` : ''}${c.partDeletes ? `, ${c.partDeletes} part(s) deleted from source` : ''}${c.renames ? `, ${c.renames} reference(s) renamed` : ''}${c.zones ? `, ${c.zones} zone(s) added to source` : ''}${c.images ? `, ${c.images} artwork image(s) added to source` : ''}${c.imageEdits ? `, ${c.imageEdits} artwork edit(s) written to source` : ''}${c.imageDeletes ? `, ${c.imageDeletes} artwork image(s) deleted from source` : ''}${c.outline ? ', the board outline edited in source' : ''}${c.zoneEdits ? `, ${c.zoneEdits} zone(s) edited in source` : ''}${c.zoneDeletes ? `, ${c.zoneDeletes} zone(s) deleted from source` : ''}${plan.skipped.length ? `, skipped ${plan.skipped.join('; ')}` : ''}`,
      );
      if (plan.syncFile) {
        const s = plan.syncFile;
        this.host.output.appendLine(
          `sync sidecar${s.created ? ' created' : ''}: ${s.placements} placement(s), ${s.labels} label(s), ${s.routes} route(s)${s.zones ? `, ${s.zones} zone(s)` : ''}${s.images ? `, ${s.images} artwork image(s)` : ''} now live in ${syncName} — they win the code-order battle (syncBoard() runs right before create())`,
        );
      }
      if (plan.skipped.length) {
        vscode.window.setStatusBarMessage(`layout: skipped ${plan.skipped.join('; ')}`, 8000);
      }
      if (!anyApplied) {
        // Nothing landed and everything was skipped: answering success would
        // make the page DROP its pending gesture (boardZoneDeletes = {} and
        // friends) against a board that never rebuilt — the edit would
        // silently un-do itself on the next render. Report the skips as the
        // failure so the page keeps the gesture and the user sees why.
        this.host.postLayoutStatus(plan.skipped.length ? `nothing was applied — ${plan.skipped.join('; ')}` : undefined);
        return;
      }
      // the button says "apply & rebuild" — every apply rebuilds. (A former
      // fast path deferred moves-only applies to the next manual build; the
      // page's ghosts already showed the answer, but a button that names the
      // rebuild must run it.)
      this.host.postStatus('rebuilding board…');
      try {
        sync.lastBuildStartedAt = Date.now();
        await this.host.run(folder, BUILD_COMMAND, GENERATE_TIMEOUT_MS);
      } catch (err) {
        // the written source PARSED (the post-write check guards that) but
        // does not BUILD — the writer-bug class (a duplicate symbol only
        // esbuild sees). Restore the pre-apply snapshot so the tree stays
        // green; the page keeps its pending gesture on a failure answer, so
        // the edit is not lost — the next attempt re-applies against clean
        // source. Silent maintenance: output channel + the failure line,
        // never a corrupted tree to unscramble by hand.
        const why = err instanceof Error ? err.message : String(err);
        const restored = await this.restorePreApply(files, plan.touched, createdUris, dry);
        this.host.output.appendLine(
          `layout apply: the rebuild failed after the write (${why}) — source restored to its pre-apply state; the edit stays pending in the view`,
        );
        fail(restored
          ? `build failed — source restored, the edit is still pending: ${why}`
          : `build failed — some source changed during the build and needs review: ${why}`);
        return;
      }
      // semantic verification: the parse gate guaranteed the SOURCE parses;
      // this checks the BOARD actually carries the geometry the apply
      // intended (a route the model dropped, a delete that missed, a move
      // that didn't land all parse fine — this is the layer that sees them)
      const boardForCheck = newestBoardFile(folder, this.host.boardStem);
      if (boardForCheck) {
        try {
          const rebuilt = fs.readFileSync(boardForCheck, 'utf8');
          const report = verifyBoardSemantics(rebuilt, {
            routes: (routes ?? []).map((r) => ({
              net: r.net,
              w: r.w,
              pieces: r.pieces.map((p) => ({ layer: p.layer, w: p.w, pts: p.pts })),
              vias: (r.vias ?? []).map((v) => ({ x: v.x, y: v.y })),
            })),
            deletes: (deletes ?? []).map((d) => ({
              net: d.net,
              x1: d.x1,
              y1: d.y1,
              x2: d.x2,
              y2: d.y2,
              layer: d.layer,
            })),
            placements: finalPlacements,
            texts: (texts ?? []).filter((t) => t.text).map((t) => ({ text: t.text, x: t.x, y: t.y })),
            zones: (zones ?? []).map((z) => ({ kind: z.kind, layer: z.layer, net: z.net, x: z.x, y: z.y, w: z.w, h: z.h })),
            outline: outline
              ? { rect: { x: outline.rect.x, y: outline.rect.y, w: outline.rect.w, h: outline.rect.h } }
              : undefined,
            zoneDeletes: (zoneDeletes ?? []).map((z) => ({ layer: z.layer, x: z.x, y: z.y, w: z.w, h: z.h })),
            images: layoutImages.map((im) => ({ side: im.side ?? 'front', x: im.x, y: im.y, w: im.w, h: im.h })),
          });
          if (report.checked > 0) {
            this.host.output.appendLine(
              report.ok
                ? `semantic check: ${report.checked} committed edit(s) verified on the rebuilt board`
                : `semantic check: ${report.misses.length} of ${report.checked} committed edit(s) MISSING from the rebuilt board —\n    ${report.misses.join('\n    ')}`,
            );
          }
          if (!report.ok) {
            vscode.window.setStatusBarMessage(
              `typeCAD layout apply: ${report.misses.length} edit(s) missing from the rebuilt board — see the typeCAD/pcb output`,
              10_000,
            );
            this.host.postStatus('semantic check failed — edits missing from the rebuilt board (see output)');
          }
        } catch (err) {
          this.host.output.appendLine(`semantic check skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      // artwork verification: the rebuilt board's images manifest is the
      // ground truth (the semantic poly scan cannot tell one artwork from
      // another). Every edit must land at its new placement under its
      // (possibly replaced) file; every delete must be gone.
      if (layoutImageEdits.length > 0 || layoutImageDeletes.length > 0) {
        try {
          const manifestPath = path.join(folder, 'build', `${path.basename(newestBoardFile(folder, this.host.boardStem) ?? 'x').replace(/\.kicad_pcb$/, '')}_images.json`);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
            images?: Array<{ file: string; x: number; y: number }>;
          };
          const entries = manifest.images ?? [];
          const misses: string[] = [];
          for (const e of layoutImageEdits) {
            const wantFile = e.newFile ?? e.match.file;
            const hit = entries.some((im) => im.file === wantFile && Math.abs(im.x - e.x) < 0.05 && Math.abs(im.y - e.y) < 0.05);
            if (!hit) misses.push(`${wantFile} at ${e.x.toFixed(1)},${e.y.toFixed(1)}`);
          }
          for (const d of layoutImageDeletes) {
            const hit = entries.some((im) => im.file === d.file && Math.abs(im.x - d.x) < 0.05 && Math.abs(im.y - d.y) < 0.05);
            if (hit) misses.push(`deleted ${d.file} at ${d.x.toFixed(1)},${d.y.toFixed(1)} is STILL placed`);
          }
          if (misses.length > 0) {
            this.host.output.appendLine(
              `artwork check: ${misses.length} edit(s) missing from the rebuilt board —\n    ${misses.join('\n    ')}`,
            );
            vscode.window.setStatusBarMessage(`typeCAD layout apply: ${misses.length} artwork edit(s) missing — see the typeCAD/pcb output`, 10_000);
          } else {
            this.host.output.appendLine(`artwork check: ${layoutImageEdits.length + layoutImageDeletes.length} committed artwork edit(s) verified via the images manifest`);
          }
        } catch (err) {
          this.host.output.appendLine(`artwork check skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // DRC no longer rides the apply: it runs on request (the palette's
      // typeCAD: DRC, or the status chip's link) against the settled board.
      // A report left from an older revision is withheld from the page by
      // the render (stale markers would sit at the PRE-move positions).
      // generate() refuses a board written <3s ago (the build may still be
      // writing); wait for it to settle so the viewer regenerates NOW, not
      // only whenever the file watcher next fires
      const boardFile = newestBoardFile(folder, this.host.boardStem);
      if (boardFile) {
        for (let i = 0; i < 10 && Date.now() - mtimeOf(boardFile) < 3_500; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
      }
      // Release the pipeline BEFORE the final render. Rendered while the
      // apply still held it, the render's drift check saw pipelineBusy() and
      // deferred "to the settled state" — which nothing ever checked, so
      // drift introduced by the apply went unreported. The apply's source
      // writes and its build are done (the board is freshly built and
      // signed); a competing render coalesces into this one (generate() is
      // single-flight), and the source watcher's auto-build sees no build
      // owed (every write predates this apply's build start).
      sync.applyBusy = false;
      await this.host.generate(folder);
      this.host.postLayoutStatus(undefined);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}
