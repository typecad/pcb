import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// viewer.ts imports 'vscode', which only exists inside the extension host —
// mock the surface it touches at test time.
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: () => undefined,
    withProgress: (_opts: unknown, fn: () => Promise<unknown>) => fn(),
    setStatusBarMessage: () => undefined,
  },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Beside: 2 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  commands: { executeCommand: () => undefined },
}));

// @ts-expect-error — accessing private members through a typed-any handle
import { BoardViewerPanel } from '../viewer.js';

type PanelHandle = any;

/**
 * retainContextWhenHidden keeps an open Board panel alive while its tab is
 * backgrounded — but nothing is watching it there, and the full export
 * pipeline (~20-30s) would run for an empty room on every build. A hidden
 * panel must DEFER the refresh and run it the moment the tab is shown.
 */

interface StubPanel {
  visible: boolean;
  webview: { postMessage: () => Promise<boolean>; options?: unknown };
  onDidDispose: () => void;
  onDidChangeViewState: (cb: (e: { webviewPanel: StubPanel }) => void) => void;
}

describe('viewer hidden-panel refresh gating', () => {
  let root: string;
  let runCalls: number;
  let panel: PanelHandle;
  let stub: StubPanel;
  let stateChanged: ((e: { webviewPanel: StubPanel }) => void) | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-hidden-'));
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    const board = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb)');
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(board, past, past);

    runCalls = 0;
    const run = async (): Promise<string> => {
      runCalls++;
      fs.mkdirSync(path.join(root, 'build', 'serve'), { recursive: true });
      fs.writeFileSync(path.join(root, 'build', 'serve', 'viewer.html'), '<html><head></head><body></body></html>');
      return '';
    };
    panel = new BoardViewerPanel(() => root, {
      components: async () => [],
      netSources: async () => [],
    } as never, run, { appendLine: () => undefined });

    stub = {
      visible: false,
      webview: {
        postMessage: async () => true,
        onDidReceiveMessage: () => undefined,
      },
      onDidDispose: () => undefined,
      onDidChangeViewState: (cb) => {
        stateChanged = cb;
      },
    };
    // bindPanel wires the state-change hook that later replays the owed
    // refresh; assigning the stub field directly would skip it
    panel.bindPanel(stub);
    panel.generated = null;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('a hidden panel defers the refresh; showing the tab runs it', async () => {
    await panel.doRefresh();
    expect(runCalls).toBe(0); // deferred — no pipeline for an empty room

    stub.visible = true;
    stateChanged!({ webviewPanel: stub });
    await vi.waitFor(() => expect(runCalls).toBeGreaterThan(0));
  });

  it('the debounced watcher path defers too, and the owed flag fires once', async () => {
    vi.useFakeTimers();
    try {
      void panel.refreshIfVisible();
      await vi.advanceTimersByTimeAsync(1_600); // debounce fires while hidden
      expect(runCalls).toBe(0);

      stub.visible = true;
      stateChanged!({ webviewPanel: stub });
      await vi.advanceTimersByTimeAsync(0);
      await vi.waitFor(() => expect(runCalls).toBeGreaterThan(0));
      const afterFirstRun = runCalls;

      // the owed flag is consumed — a later hide/show cycle with no board
      // change must not re-run the export pipeline
      stub.visible = false;
      stateChanged!({ webviewPanel: stub });
      stub.visible = true;
      stateChanged!({ webviewPanel: stub });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(runCalls).toBe(afterFirstRun);
    } finally {
      vi.useRealTimers();
    }
  });
});
