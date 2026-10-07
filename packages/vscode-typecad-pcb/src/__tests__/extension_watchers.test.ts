// ---------------------------------------------------------------------------
// Activation regression: the source watcher (auto-build trigger) and the
// board watcher (viewer refresh trigger) are TWO independent watchers. They
// used to share one handle — installing the board watcher at activation
// disposed the source watcher, so source edits never auto-built and an
// absorbed reconcile's "rebuilding…" notice never cleared (nothing rebuilt,
// nothing re-rendered). This test pins the activation contract: BOTH
// watchers exist and stay alive simultaneously.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface WatcherStub {
  pattern: string;
  disposed: boolean;
  onDidChange: (cb: unknown) => void;
  onDidCreate: (cb: unknown) => void;
  onDidDelete: (cb: unknown) => void;
  dispose: () => void;
}

const watchers: WatcherStub[] = [];
const makeWatcher = (pattern: string): WatcherStub => {
  const w: WatcherStub = {
    pattern,
    disposed: false,
    onDidChange: () => undefined,
    onDidCreate: () => undefined,
    onDidDelete: () => undefined,
    dispose: () => {
      w.disposed = true;
    },
  };
  watchers.push(w);
  return w;
};

vi.mock('vscode', () => {
  const disposable = { dispose: () => undefined };
  const event = () => disposable;
  class RelativePattern {
    constructor(public base: unknown, public pattern: string) {}
  }
  class Disposable {
    constructor(public callOnDispose: () => void) {}
    dispose(): void {
      this.callOnDispose();
    }
  }
  return {
    Disposable,
    RelativePattern,
    Uri: { file: (p: string) => ({ fsPath: p }) },
    window: {
      visibleTextEditors: [] as unknown[],
      createOutputChannel: () => ({ appendLine: () => undefined, show: () => undefined }),
      createStatusBarItem: () => ({ show: () => undefined, hide: () => undefined, command: '', name: '', text: '', tooltip: '' }),
      createTerminal: () => ({ show: () => undefined, sendText: () => undefined }),
      setStatusBarMessage: () => undefined,
      showInformationMessage: () => undefined,
      showErrorMessage: () => undefined,
      onDidChangeActiveTextEditor: event,
      registerWebviewPanelSerializer: () => disposable,
      createTextEditorDecorationType: () => ({}),
    },
    workspace: {
      workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
      createFileSystemWatcher: (_pattern: RelativePattern) => makeWatcher(_pattern.pattern),
      onDidChangeWorkspaceFolders: event,
      onDidChangeTextDocument: event,
      onDidSaveTextDocument: event,
      getConfiguration: () => ({ get: () => false }),
      registerTextDocumentContentProvider: () => disposable,
    },
    commands: {
      registerCommand: () => disposable,
      executeCommand: () => undefined,
    },
    languages: {
      registerCodeLensProvider: () => disposable,
      registerCodeActionsProvider: () => disposable,
      registerHoverProvider: () => disposable,
      createDiagnosticCollection: () => ({ clear: () => undefined, set: () => undefined }),
    },
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    Diagnostic: class {},
    CodeLens: class {},
    CodeAction: class {},
    Range: class {},
    MarkdownString: class {},
    ThemeColor: class {},
    StatusBarItem: {},
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { Beside: 2 },
    ProgressLocation: { Notification: 15 },
    WorkspaceEdit: class {},
    TextEditorDecorationType: {},
  };
});

import { activate } from '../extension.js';

describe('activation installs both watchers independently', () => {
  let root: string;

  beforeEach(() => {
    watchers.length = 0;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-activation-'));
    // a typeCAD project with NO board: findHwFolder resolves, no auto-build
    // is scheduled (boardStale is null without a board)
    fs.writeFileSync(path.join(root, 'typecad.conf.ts'), "export default {};\n");
    const vscode = (globalThis as unknown as { __vscodeFolders?: Array<{ uri: { fsPath: string } }> }).__vscodeFolders;
    void vscode;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the board watcher does not dispose the source watcher', async () => {
    const vscodeMock = await import('vscode');
    (vscodeMock.workspace as unknown as { workspaceFolders: Array<{ uri: { fsPath: string } }> }).workspaceFolders = [
      { uri: { fsPath: root } },
    ];

    const context = {
      subscriptions: [],
      globalState: {
        // throttle the bundled-update check to an early return — it must
        // not run (it reads the real workspace and could write)
        get: () => new Date().toISOString().slice(0, 10),
        update: () => undefined,
      },
    };
    activate(context as never);

    const source = watchers.find((w) => w.pattern.includes('src/**/*.ts'));
    const board = watchers.find((w) => w.pattern.includes('build/**/*.kicad_pcb'));
    // activation installs BOTH directions of the sync loop
    expect(source).toBeDefined();
    expect(board).toBeDefined();
    // and they are independent: the board watcher's installation is what
    // used to kill the source watcher through the shared handle
    expect(source!.disposed).toBe(false);
    expect(board!.disposed).toBe(false);
  });
});
