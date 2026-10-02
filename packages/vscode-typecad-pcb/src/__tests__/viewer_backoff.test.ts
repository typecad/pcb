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
    createWebviewPanel: () => ({
      webview: { postMessage: () => undefined },
      onDidDispose: () => ({ dispose: () => undefined }),
    }),
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
 * Regression: a generate() that always throws (a board state the exporter
 * chokes on) used to retry every 4s forever; each retry re-ran the ~30s
 * export pipeline whose kicad-cli board resave re-fired every watcher in
 * the workspace — including a running `import --watch` — producing the
 * "exporting gerbers… / viewer refresh failed" storm. The failure ladder
 * must back off exponentially, and watcher events against the unchanged
 * failed board must not re-run the export at all.
 */

describe('viewer failure backoff', () => {
  let root: string;
  let logs: string[];
  let runCalls: number;
  let panel: PanelHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-backoff-'));
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    // board older than the 3s settle window
    const board = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb)');
    // explicit timestamps: fake timers freeze Date.now(), so "now - Ns"
    // expressions would collide between writes
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(board, past, past);

    logs = [];
    runCalls = 0;
    const output = { appendLine: (line: string) => logs.push(line) };
    // run() would spawn npx; count invocations, never succeed
    const run = async () => {
      runCalls++;
      throw new Error("Cannot read properties of null (reading 'raw')");
    };
    // minimal panel state: a stub webview panel so doRefresh's is-visible
    // gate passes; postStatus/adoptNewerDiskViewer become no-ops against it
    panel = new BoardViewerPanel(() => root, {} as never, run, output);
    panel.panel = { webview: { postMessage: async () => undefined }, visible: true };
    panel.generated = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('backs off exponentially and stops re-running the export', async () => {
    // first refresh: generate throws, ladder schedules a 30s retry
    await panel.doRefresh();
    expect(runCalls).toBe(1);
    expect(logs.some((l) => l.includes('viewer refresh failed'))).toBe(true);
    expect(logs.some((l) => l.includes('retrying in 30s'))).toBe(true);

    // watcher events against the SAME board must not re-run the export
    await panel.doRefresh();
    await panel.doRefresh();
    await panel.doRefresh();
    expect(runCalls).toBe(1);

    // the ladder's own retry (forced) runs the export again, then backs off
    await vi.advanceTimersByTimeAsync(31_000);
    expect(runCalls).toBe(2);
    expect(logs.some((l) => l.includes('retrying in 60s'))).toBe(true);

    await vi.advanceTimersByTimeAsync(61_000);
    expect(runCalls).toBe(3);
    expect(logs.some((l) => l.includes('retrying in 300s'))).toBe(true);

    // capped at 5min: still one run per scheduled retry, never a storm
    await vi.advanceTimersByTimeAsync(301_000);
    expect(runCalls).toBe(4);

    // 12 "watcher events" between retries never add extra runs
    for (let i = 0; i < 12; i++) await panel.doRefresh();
    expect(runCalls).toBe(4);
  });

  it('retries immediately when the board genuinely changes', async () => {
    await panel.doRefresh();
    expect(runCalls).toBe(1);

    // a real board save: new mtime, past the settle window
    const board = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb (version 2))');
    const newer = new Date(Date.now() - 60_000);
    fs.utimesSync(board, newer, newer);

    await panel.doRefresh();
    expect(runCalls).toBe(2); // retried despite the failure ladder
  });

  it('clears the ladder after a successful generate', async () => {
    // first run fails
    await panel.doRefresh();
    expect(runCalls).toBe(1);
    expect(panel.consecutiveFailures).toBe(1);

    // a succeeding run: writes the viewer page generate() expects to read,
    // and the service provides component/net metadata
    (panel as PanelHandle).run = async () => {
      fs.mkdirSync(path.join(root, 'build', 'serve'), { recursive: true });
      fs.writeFileSync(path.join(root, 'build', 'serve', 'viewer.html'), '<html><head></head><body></body></html>');
      return '';
    };
    (panel as PanelHandle).service = {
      components: async () => [],
      netSources: async () => [],
    };
    const board = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb (version 3))');
    const newest = new Date(Date.now() - 30_000);
    fs.utimesSync(board, newest, newest);
    await panel.doRefresh();
    expect(panel.consecutiveFailures).toBe(0);
    expect(panel.lastFailedBoardMtime).toBeUndefined();
    expect(panel.generated).not.toBeNull();
  });
});
