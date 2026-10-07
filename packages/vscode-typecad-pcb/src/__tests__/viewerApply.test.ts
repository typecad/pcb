import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// viewerApply.ts imports 'vscode', which only exists inside the extension
// host — mock the surface the apply bridge touches at test time. Documents
// read as empty text (the only file the bridge opens here is the _sync.ts
// sidecar it is about to create), so no disk state has to exist.
vi.mock('vscode', () => {
  class WorkspaceEdit {
    readonly edits: unknown[] = [];
    replace(): void {
      this.edits.push(arguments);
    }
    get size(): number {
      return this.edits.length;
    }
  }
  return {
    window: {
      showInformationMessage: () => undefined,
      showErrorMessage: () => undefined,
      showOpenDialog: async () => undefined,
      setStatusBarMessage: () => undefined,
    },
    workspace: {
      findFiles: async () => [],
      openTextDocument: async (uri: { fsPath: string }) => ({
        uri,
        // the real file on disk (the sidecar the apply plans against) —
        // documents that exist must read their actual text or the
        // changed-while-planning guard refuses everything
        getText: () => (fs.existsSync(uri.fsPath) ? fs.readFileSync(uri.fsPath, 'utf8') : ''),
        save: async () => undefined,
        positionAt: () => ({ line: 0, character: 0 }),
      }),
      asRelativePath: (uri: { fsPath: string }) => uri.fsPath,
      applyEdit: async () => true,
      fs: { writeFile: async () => undefined, delete: async () => undefined },
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, toString: () => `file:///${p.replace(/\\/g, '/')}` }),
      parse: (s: string) => ({ fsPath: String(s).replace(/^file:\/\/\//, '') }),
    },
    RelativePattern: class RelativePattern {},
    Range: class Range {},
    WorkspaceEdit,
  };
});

import { LayoutApplyBridge, type ViewerHost } from '../viewerApply.js';

/**
 * The apply bridge's contract at the refactor seam: the page's whole gesture
 * arrives as ONE payload object, and the panel is reached only through the
 * ViewerHost surface. A stale board stamp must refuse before any source is
 * read; a current stamp with an empty gesture must answer success without
 * running the build.
 */

describe('LayoutApplyBridge', () => {
  let root: string;
  let logs: string[];
  let layoutStatus: Array<string | undefined>;
  let statuses: string[];
  let refreshes: number;
  let builds: number;
  let replays: number;
  let generates: number;
  let bridge: LayoutApplyBridge;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-apply-'));
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    // board comfortably past the 3s settle window
    const board = path.join(root, 'build', 'b.kicad_pcb');
    fs.writeFileSync(board, '(kicad_pcb)');
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(board, past, past);

    logs = [];
    layoutStatus = [];
    statuses = [];
    refreshes = 0;
    builds = 0;
    replays = 0;
    generates = 0;
    const host: ViewerHost = {
      hwFolder: () => root,
      service: {
        components: async () => [],
        netSources: async () => [],
      } as never,
      run: async (_cwd: string, command: string) => {
        if (command.includes('build')) builds++;
        return '';
      },
      output: { appendLine: (line: string) => logs.push(line) },
      postStatus: (text: string) => statuses.push(text),
      postLayoutStatus: (error: string | undefined) => layoutStatus.push(error),
      postImagePicked: () => undefined,
      doRefresh: async () => {
        refreshes++;
      },
      generate: async () => {
        generates++;
        return true;
      },
      replayOwedRefresh: async () => {
        replays++;
      },
    };
    bridge = new LayoutApplyBridge(host);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses a payload stamped against a superseded board', async () => {    await bridge.onLayoutRebuild({ board: '12345', moves: [] });
    expect(layoutStatus).toHaveLength(1);
    expect(layoutStatus[0]).toMatch(/board was rebuilt since this view rendered/);
    expect(refreshes).toBe(1);
    // refused before planning anything — no apply-side output at all
    expect(logs.some((l) => l.includes('layout apply:'))).toBe(false);
  });

  it('answers success for a current stamp and an empty gesture', async () => {
    const stamp = String(fs.statSync(path.join(root, 'build', 'b.kicad_pcb')).mtimeMs);
    await bridge.onLayoutRebuild({ board: stamp, moves: [] });
    expect(layoutStatus).toEqual([undefined]);
    // nothing applied → the rebuild never runs
    expect(builds).toBe(0);
    // the completion still replays any watcher refresh the apply deferred
    expect(replays).toBe(1);
  });

  it('an all-skipped gesture reports failure so the page keeps it pending', async () => {
    // live session: deleting a board-side zone (no source literal) applied
    // nothing, yet the success answer made the page drop the pending
    // gesture against a board that never rebuilt — the delete silently
    // un-did itself on the next render
    const stamp = String(fs.statSync(path.join(root, 'build', 'b.kicad_pcb')).mtimeMs);
    await bridge.onLayoutRebuild({
      board: stamp,
      moves: [],
      zoneDeletes: [{ x: 144.236, y: 78.875, w: 3, h: 2.242, layer: 'F.Cu' }],
    });
    expect(layoutStatus).toHaveLength(1);
    expect(layoutStatus[0]).toMatch(/^nothing was applied — zone delete: no removable literal/);
    // and no rebuild ran for a gesture that changed nothing
    expect(builds).toBe(0);
  });

  it('refuses a second apply while the first is still running', async () => {
    // hold the first apply mid-pipeline: components() resolves only when
    // the test says so
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = (bridge as unknown as { host: ViewerHost }).host;
    const realComponents = first.service.components.bind(first.service);
    first.service.components = () =>
      gate.then(() => realComponents()) as never;

    const inFlight = bridge.onLayoutRebuild({ moves: [] });
    // while it hangs, a second gesture must be refused without touching
    // the pipeline — its snapshots would capture half-written sources
    await bridge.onLayoutRebuild({ moves: [] });
    expect(layoutStatus).toEqual(['an apply is already running — wait for it to finish, then apply again']);

    release();
    await inFlight;
    // the refusal did not disturb the first apply's own answer
    expect(layoutStatus).toEqual([
      'an apply is already running — wait for it to finish, then apply again',
      undefined,
    ]);
  });

  // The apply tail under the source-of-truth model: the apply writes source
  // in the canonical grammar, rebuilds, renders — ONE render, no
  // reconciliation step at all (the .kicad_pcb is a build artifact, and
  // nothing writes source from the board). The completion replays any
  // watcher refresh the apply deferred.
  const routePayload = {
    moves: [{ ref: 'R1', dx: 1, dy: 0 }],
    routes: [
      {
        net: 'VCC',
        w: 0.2,
        pieces: [{ layer: 'F.Cu', pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }],
        vias: [],
        from: { ref: 'R1', pin: '1' },
        to: null,
      },
    ],
  } as const;

  const seedSidecarPlacement = (): void => {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', '_sync.ts'),
      'export function syncBoard(typecad, parts) {\n  parts.r1.pcb = { x: 10, y: 10 };\n}\n',
    );
    (bridge as unknown as { host: ViewerHost }).host.service.components = async () => [
      { reference: 'R1', variable: 'r1' },
    ] as never;
  };

  it('a route-adding apply builds and renders once — nothing reconciles', async () => {
    seedSidecarPlacement();
    const stamp = String(fs.statSync(path.join(root, 'build', 'b.kicad_pcb')).mtimeMs);
    await bridge.onLayoutRebuild({ board: stamp, ...routePayload });

    expect(builds).toBe(1); // the apply's own rebuild
    expect(generates).toBe(1); // ONE render — no reconciliation step exists
    expect(replays).toBe(1); // the deferred-watcher replay ran
    expect(layoutStatus.at(-1)).toBeUndefined(); // the apply answered success
  });

  it('a non-route apply renders the same way', async () => {
    seedSidecarPlacement();
    const stamp = String(fs.statSync(path.join(root, 'build', 'b.kicad_pcb')).mtimeMs);
    await bridge.onLayoutRebuild({ board: stamp, moves: [{ ref: 'R1', dx: 1, dy: 0 }] });

    expect(builds).toBe(1);
    expect(generates).toBe(1);
    expect(replays).toBe(1);
  });
});
