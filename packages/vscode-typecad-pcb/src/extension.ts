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
import { basename } from 'node:path';
import { BoardDataService } from './boardData.js';
import { findHwFolder } from './hwFolder.js';
import { renderComponentHover } from './hover.js';
import { findDeclaration, renderMissingHint } from './missing.js';
import { QueryError } from './query.js';
import { BoardViewerPanel, wordUnderCursor } from './viewer.js';

/** Identifiers only — skips numbers, operators, and property dots. */
const WORD_LIKE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('typeCAD/pcb');
  const service = new BoardDataService(runQuery);

  // typeCAD projects are plain folders (no virtual filesystems), so a sync
  // node check is enough to locate typecad.conf.ts.
  const resolveHwFolder = (): string | null =>
    findHwFolder(
      (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
      existsSync,
    );

  const viewer = new BoardViewerPanel(resolveHwFolder, service, runQuery, output);

  // Reload/window-reopen restores a previously open Board panel instead of
  // leaving a dead empty webview behind; must be registered at activation
  // for VS Code to restore the panel at all.
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('typecadBoardViewer', {
      deserializeWebviewPanel: (panel) => viewer.restorePanel(panel),
    }),
  );

  let watcher: vscode.FileSystemWatcher | undefined;
  const watchBuild = (folder: string) => {
    watcher?.dispose();
    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, 'build/**/*.kicad_pcb'));
    const boardChanged = (uri: vscode.Uri) => {
      output.appendLine(`board file event: ${basename(uri.fsPath)}`);
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
      // Command-link args arrive spread as JSON (the hover's "view on
      // board" link): go straight to that component, no prompt.
      if (typeof ref === 'string' && ref.trim() !== '') {
        output.appendLine(`viewComponent: arg=${JSON.stringify(ref)}`);
        await viewer.select(ref.trim());
        return;
      }
      // Palette invocation: prompt for the designator, seeded with the word
      // under the cursor when the editor has one — typed designators land
      // in the open-or-opening viewer via the same delivery path
      const seed = wordUnderCursor(vscode.window.activeTextEditor);
      const typed = await vscode.window.showInputBox({
        prompt: 'component designator to show on the board',
        placeHolder: 'e.g. R1, U3',
        value: seed ?? '',
        ignoreFocusOut: false,
      });
      if (!typed || typed.trim() === '') return; // dismissed — nothing to do
      output.appendLine(`viewComponent: typed=${JSON.stringify(typed)}`);
      await viewer.select(typed.trim());
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
                '$(circuit-board) typeCAD/pcb: no compiled board yet — run `npm run build` in the hw folder.',
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
      vscode.window.setStatusBarMessage('typeCAD/pcb: board data refreshed', 3000);
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

  output.appendLine('typeCAD/pcb extension activated');
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
