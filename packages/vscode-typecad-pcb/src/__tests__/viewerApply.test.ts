import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// viewerApply.ts imports 'vscode', which only exists inside the extension
// host — mock the surface the apply bridge touches at test time. Documents
// read as empty text (the only file the bridge opens here is the _sync.ts
// sidecar it is about to create), so no disk state has to exist.
vi.mock('vscode', () => {
  const applyEdits: unknown[] = [];
  const documents = new Map<string, string>();
  class WorkspaceEdit {
    readonly edits: unknown[] = [];
    replace(uri: { fsPath: string }, _range: unknown, text: string): void {
      this.edits.push(arguments);
      documents.set(uri.fsPath, text);
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
        getText: () => documents.get(uri.fsPath) ?? (fs.existsSync(uri.fsPath) ? fs.readFileSync(uri.fsPath, 'utf8') : ''),
        save: async () => true,
        positionAt: () => ({ line: 0, character: 0 }),
      }),
      asRelativePath: (uri: { fsPath: string }) => uri.fsPath,
      // every WorkspaceEdit is recorded so a test can assert WHAT the
      // pipeline wrote (and rolled back) without touching disk
      applyEdit: async (edit: unknown) => {
        applyEdits.push(edit);
        return true;
      },
      fs: { writeFile: async () => undefined, delete: async () => undefined },
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, toString: () => `file:///${p.replace(/\\/g, '/')}` }),
      parse: (s: string) => ({ fsPath: String(s).replace(/^file:\/\/\//, '') }),
    },
    RelativePattern: class RelativePattern {},
    Range: class Range {},
    WorkspaceEdit,
    __applyEdits: applyEdits,
  };
});

import * as vscode from 'vscode';
import { BUILD_COMMAND, LayoutApplyBridge, type ViewerHost } from '../viewerApply.js';
import { sync } from '../syncState.js';
import { boardIdentity } from '../boardFile.js';

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
  let commands: string[];
  let layoutStatus: Array<string | undefined>;
  let statuses: string[];
  let refreshes: number;
  let builds: number;
  let busyAtRefresh: boolean | undefined;
  let busyAtGenerate: boolean | undefined;
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
    commands = [];
    layoutStatus = [];
    statuses = [];
    refreshes = 0;
    builds = 0;
    busyAtRefresh = undefined;
    busyAtGenerate = undefined;
    replays = 0;
    generates = 0;
    const host: ViewerHost = {
      hwFolder: () => root,
      service: {
        components: async () => [],
        netSources: async () => [],
      } as never,
      run: async (_cwd: string, command: string) => {
        commands.push(command);
        if (command.includes('build')) builds++;
        return '';
      },
      output: { appendLine: (line: string) => logs.push(line) },
      postStatus: (text: string) => statuses.push(text),
      postLayoutStatus: (error: string | undefined) => layoutStatus.push(error),
      postImagePicked: () => undefined,
      doRefresh: async () => {
        refreshes++;
        busyAtRefresh = sync.applyBusy;
      },
      generate: async () => {
        generates++;
        busyAtGenerate = sync.applyBusy;
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
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
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
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
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

  // Rebase: a build ran since the view rendered, but the edits are
  // part-relative and every part they touch is where the view showed it.
  const setRebase = (fn: (stamp: string, refs: string[]) => Promise<{ ok: boolean; reason?: string }>): string[][] => {
    const calls: string[][] = [];
    (bridge as unknown as { host: ViewerHost }).host.rebaseCheck = async (stamp, refs) => {
      calls.push([stamp, ...refs]);
      return fn(stamp, refs);
    };
    return calls;
  };

  it('rebases a moves-only edit onto a rebuilt board when its parts are unchanged', async () => {
    seedSidecarPlacement();
    const calls = setRebase(async () => ({ ok: true }));
    await bridge.onLayoutRebuild({ board: 'older-render', moves: [{ ref: 'R1', dx: 1, dy: 0 }] });
    expect(calls).toEqual([['older-render', 'R1']]);
    expect(refreshes).toBe(0); // not refused → no regeneration detour
    expect(builds).toBe(1); // the edit was applied and rebuilt
    expect(logs.some((l) => l.includes('rebasing the edit onto the new board'))).toBe(true);
  });

  it('still refuses when a touched part changed in the rebuild', async () => {
    seedSidecarPlacement();
    setRebase(async () => ({ ok: false, reason: 'R1 moved in the rebuild' }));
    await bridge.onLayoutRebuild({ board: 'older-render', moves: [{ ref: 'R1', dx: 1, dy: 0 }] });
    expect(layoutStatus[0]).toMatch(/board was rebuilt since this view rendered/);
    expect(builds).toBe(0);
    expect(refreshes).toBe(1);
    expect(logs.some((l) => l.includes('not rebasing — R1 moved in the rebuild'))).toBe(true);
  });

  it('never rebases edits that carry absolute geometry — a drawn route must be redone', async () => {
    seedSidecarPlacement();
    const calls = setRebase(async () => ({ ok: true }));
    await bridge.onLayoutRebuild({ board: 'older-render', ...routePayload });
    expect(calls).toEqual([]); // not even asked
    expect(layoutStatus[0]).toMatch(/board was rebuilt since this view rendered/);
    expect(builds).toBe(0);
  });

  it('the final render runs after the pipeline is released — its drift check is not deferred', async () => {
    // rendered while the apply still held the pipeline, the render's drift
    // check saw pipelineBusy() and deferred to a "settled state" nothing
    // ever checked
    seedSidecarPlacement();
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
    await bridge.onLayoutRebuild({ board: stamp, ...routePayload });
    expect(generates).toBe(1);
    expect(busyAtGenerate).toBe(false);
    expect(sync.applyBusy).toBe(false);
  });

  it('a refused stale view regenerates after the release, not while the apply holds the pipeline', async () => {
    await bridge.onLayoutRebuild({ board: 'superseded', moves: [] });
    expect(refreshes).toBe(1);
    // while held, doRefresh would only have queued itself as "owed"
    expect(busyAtRefresh).toBe(false);
    // the refresh replaces the replay — not both
    expect(replays).toBe(0);
  });

  it('an apply builds with the same command auto-build uses', async () => {
    seedSidecarPlacement();
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
    await bridge.onLayoutRebuild({ board: stamp, ...routePayload });
    expect(commands).toContain(BUILD_COMMAND);
  });

  it('a route-adding apply builds and renders once — nothing reconciles', async () => {
    seedSidecarPlacement();
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
    await bridge.onLayoutRebuild({ board: stamp, ...routePayload });

    expect(builds).toBe(1); // the apply's own rebuild
    expect(generates).toBe(1); // ONE render — no reconciliation step exists
    expect(replays).toBe(1); // the deferred-watcher replay ran
    expect(layoutStatus.at(-1)).toBeUndefined(); // the apply answered success
  });

  it('a non-route apply renders the same way', async () => {
    seedSidecarPlacement();
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
    await bridge.onLayoutRebuild({ board: stamp, moves: [{ ref: 'R1', dx: 1, dy: 0 }] });

    expect(builds).toBe(1);
    expect(generates).toBe(1);
    expect(replays).toBe(1);
  });


  it('a successful apply builds and re-renders but never spawns the DRC check', async () => {
    // the apply used to re-run `typecad-pcb drc` after every rebuild so the
    // page carried fresh markers; DRC is a palette request now — the apply
    // pipeline builds, verifies, and re-renders, nothing more
    seedSidecarPlacement();
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
    await bridge.onLayoutRebuild({ board: stamp, ...routePayload });
    expect(builds).toBe(1);
    expect(commands.some((c) => c.includes('typecad-pcb drc'))).toBe(false);
    expect(statuses.some((t) => t === 'checking rules…')).toBe(false);
  });


  it('the tree stays green and the gesture stays pending', async () => {
    const sidecar = path.join(root, 'src', '_sync.ts');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(sidecar, 'export function syncBoard(typecad, parts) {\n  parts.r1.pcb = { x: 10, y: 10 };\n}\n');
    (bridge as unknown as { host: ViewerHost }).host.service.components = async () => [
      { reference: 'R1', variable: 'r1' },
    ] as never;
    const origRun = (bridge as unknown as { host: ViewerHost }).host.run;
    (bridge as unknown as { host: ViewerHost }).host.run = async (_cwd: string, command: string) => {
      if (command === 'npm run build') throw new Error('esbuild: duplicate symbol');
      return origRun(_cwd, command);
    };
    const stamp = boardIdentity(path.join(root, 'build', 'b.kicad_pcb'));
    await bridge.onLayoutRebuild({ board: stamp, ...routePayload });
    // the failure is answered (the page keeps its gesture), the rebuild
    // never generated a page, and the last write to the touched file put
    // the PRE-APPLY text back
    expect(layoutStatus[0]).toMatch(/build failed — source restored/);
    expect(generates).toBe(0);
    // the recorded WorkspaceEdits prove the rollback: an earlier edit wrote
    // the sidecar WITH the new route, and the LAST edit for that file put
    // the pre-apply text back
    const edits = ((vscode as unknown as { __applyEdits: Array<{ edits: unknown[][] }> }).__applyEdits)
      .flatMap((e) => e.edits)
      .map((args) => ({ fsPath: String(args[0]?.fsPath ?? ''), text: String(args[2] ?? '') }));
    const sidecarEdits = edits.filter((e) => e.fsPath.endsWith('_sync.ts'));
    expect(sidecarEdits.length).toBeGreaterThanOrEqual(2);
    expect(sidecarEdits.at(-1)!.text).toBe(fs.readFileSync(sidecar, 'utf8')); // the pre-apply text
    expect(sidecarEdits[0]!.text).not.toBe(sidecarEdits.at(-1)!.text); // a real write preceded the rollback
    expect(logs.some((l) => l.includes('restored to its pre-apply state'))).toBe(true);
  });
});
