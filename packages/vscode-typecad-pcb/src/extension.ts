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

import * as vscode from 'vscode';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { BoardDataService } from './boardData.js';
import { findHwFolder } from './hwFolder.js';
import { renderComponentHover } from './hover.js';
import { findDeclaration, renderMissingHint } from './missing.js';
import { QueryError } from './query.js';
import { BoardViewerPanel, wordUnderCursor } from './viewer.js';

/** Identifiers only — skips numbers, operators, and property dots. */
const WORD_LIKE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('typeCAD PCB');
  const service = new BoardDataService(runQuery);

  // typeCAD projects are plain folders (no virtual filesystems), so a sync
  // node check is enough to locate typecad.conf.ts.
  const resolveHwFolder = (): string | null =>
    findHwFolder(
      (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
      existsSync,
    );

  const viewer = new BoardViewerPanel(resolveHwFolder, service, runQuery, output);

  let watcher: vscode.FileSystemWatcher | undefined;
  const watchBuild = (folder: string) => {
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
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const folder = resolveHwFolder();
      if (folder) {
        service.setFolder(folder);
        watchBuild(folder);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('typecad-pcb.viewBoard', () => viewer.show()),
    vscode.commands.registerCommand('typecad-pcb.viewComponent', async (ref?: unknown) => {
      // Command-link args arrive spread as JSON; anything unexpected falls
      // back to the word under the cursor. Every branch is logged so a dead
      // link is distinguishable from a dead delivery.
      output.appendLine(`viewComponent: arg=${JSON.stringify(ref) ?? 'undefined'} (${typeof ref})`);
      const target =
        typeof ref === 'string' && ref.trim() !== '' ? ref.trim() : wordUnderCursor(vscode.window.activeTextEditor);
      if (!target) {
        output.appendLine('viewComponent: no ref argument and no word under cursor');
        vscode.window.showInformationMessage('typeCAD: place the cursor on a component (or select a reference).');
        return;
      }
      await viewer.select(target);
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'typescript', scheme: 'file' },
      {
        async provideHover(document, position) {
          const range = document.getWordRangeAtPosition(position);
          if (!range) return;
          const word = document.getText(range);
          if (!WORD_LIKE.test(word)) return;

          const folder = resolveHwFolder();
          if (!folder) return;
          service.setFolder(folder);
          if (!watcher) watchBuild(folder);

          try {
            const detail = await service.resolve(word);
            if (!detail) {
              // Declared as `new <Component>(...)` in this file but absent
              // from the compiled board — say so instead of staying silent.
              const declaration = findDeclaration(document.getText(), word);
              if (declaration) {
                const hint = new vscode.MarkdownString(renderMissingHint(declaration), true);
                hint.supportThemeIcons = true;
                return new vscode.Hover(hint, range);
              }
              return;
            }
            const markdown = new vscode.MarkdownString(renderComponentHover(detail), true);
            markdown.supportThemeIcons = true;
            markdown.isTrusted = true;
            return new vscode.Hover(markdown, range);
          } catch (err) {
            // boardMissing is the CLI's classified "no compiled board yet"
            // flag — anything else is a real failure worth logging.
            if (err instanceof QueryError && err.boardMissing) {
              const hint = new vscode.MarkdownString(
                '$(circuit-board) typeCAD: no compiled board yet — run `npm run build` in the hw folder.',
              );
              hint.supportThemeIcons = true;
              return new vscode.Hover(hint, range);
            }
            output.appendLine(`query failed for '${word}': ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
        },
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('typecad-pcb.refreshBoardData', () => {
      service.invalidate();
      vscode.window.setStatusBarMessage('typeCAD: board data refreshed', 3000);
    }),
  );

  // Re-point the service when the editor moves between hw/ and fw/ so a
  // stale folder never survives a workspace switch.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      const folder = resolveHwFolder();
      if (folder) service.setFolder(folder);
    }),
  );

  output.appendLine('typeCAD PCB extension activated');
}

/** Real query runner: `exec` with cwd pinned to the hw folder. */
function runQuery(cwd: string, command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = [stderr.toString().trim(), stdout.toString().trim()].filter(Boolean).join('\n');
          reject(new Error(detail || error.message));
          return;
        }
        resolve(stdout.toString());
      },
    );
  });
}

export function deactivate() {}
